import { vi } from 'vitest';

type Key = string | number;

interface StoreData {
  readonly records: Map<Key, unknown>;
  /** Each index's key path, by name. */
  readonly indexes: Map<string, string>;
}

interface DatabaseData {
  version: number;
  readonly stores: Map<string, StoreData>;
}

type Handler = ((event: Event) => void) | null;

/** An IndexedDB in memory, as far as the app's stores use one; what it doesn't model throws instead of passing quietly. */
export class FakeIndexedDb {
  private readonly databases = new Map<string, DatabaseData>();
  private readonly connections = new Set<FakeDatabase>();
  /** Transactions run one after another, as those over the same store do in a browser. */
  private running: Promise<void> = Promise.resolve();
  private refusal: DOMException | null = null;

  open(name: string, version?: number): IDBOpenDBRequest {
    const request = new FakeRequest();
    setTimeout(() => {
      this.openNow(request, name, version);
    }, 0);
    return request as unknown as IDBOpenDBRequest;
  }

  /** The version of a database, or null where there is none. */
  versionOf(name: string): number | null {
    return this.databases.get(name)?.version ?? null;
  }

  storeNames(name: string): string[] {
    return [...(this.databases.get(name)?.stores.keys() ?? [])].sort();
  }

  /** What a store holds, as another version of the app could have left it. */
  seed(name: string, store: string, key: Key, value: unknown): void {
    this.storeData(name, store).records.set(key, structuredClone(value));
  }

  records(name: string, store: string): ReadonlyMap<Key, unknown> {
    return new Map(this.storeData(name, store).records);
  }

  /** The next transaction that writes aborts as it commits, as a full disk makes it, and undoes what it did. */
  refuseNextWrite(error: DOMException): void {
    this.refusal = error;
  }

  closed(connection: FakeDatabase): void {
    this.connections.delete(connection);
  }

  enqueue(transaction: FakeTransaction): void {
    this.running = this.running.then(() => transaction.run(transaction.mode === 'readwrite' ? this.takeRefusal() : null));
  }

  private takeRefusal(): DOMException | null {
    const { refusal } = this;
    this.refusal = null;
    return refusal;
  }

  private storeData(name: string, store: string): StoreData {
    const data = this.databases.get(name)?.stores.get(store);
    if (!data) throw new Error(`The fake has no store ${store} in ${name}.`);
    return data;
  }

  private openNow(request: FakeRequest, name: string, version: number | undefined): void {
    const existing = this.databases.get(name);
    const requested = version ?? existing?.version ?? 1;
    if (existing && requested < existing.version) {
      request.fail(new DOMException(`The requested version (${requested}) is less than the existing version.`, 'VersionError'));
      return;
    }
    const data = existing ?? { version: 0, stores: new Map<string, StoreData>() };
    this.databases.set(name, data);
    const connection = new FakeDatabase(this, data);
    if (requested > data.version) {
      if ([...this.connections].some((open) => open.data === data)) {
        throw new Error('The fake does not model an upgrade that an open connection blocks.');
      }
      const oldVersion = data.version;
      data.version = requested;
      connection.upgrading = true;
      request.result = connection;
      request.onupgradeneeded?.({ oldVersion, newVersion: requested, target: request } as unknown as Event);
      connection.upgrading = false;
    }
    this.connections.add(connection);
    request.succeed(connection);
  }
}

/** Installs a fake as the page's indexedDB until the stubs are undone (vi.unstubAllGlobals). */
export function installFakeIndexedDb(): FakeIndexedDb {
  const fake = new FakeIndexedDb();
  vi.stubGlobal('indexedDB', fake);
  return fake;
}

class FakeRequest {
  result: unknown = undefined;
  error: DOMException | null = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  onupgradeneeded: Handler = null;

  succeed(result: unknown): void {
    this.result = result;
    this.onsuccess?.({ target: this } as unknown as Event);
  }

  fail(error: DOMException): void {
    this.error = error;
    this.onerror?.({ target: this } as unknown as Event);
  }
}

class FakeDatabase {
  upgrading = false;
  private isClosed = false;

  constructor(
    private readonly factory: FakeIndexedDb,
    readonly data: DatabaseData,
  ) {}

  get version(): number {
    return this.data.version;
  }

  get objectStoreNames(): Pick<DOMStringList, 'contains' | 'length'> {
    return { contains: (name) => this.data.stores.has(name), length: this.data.stores.size };
  }

  createObjectStore(name: string, options?: IDBObjectStoreParameters): FakeObjectStore {
    if (!this.upgrading) throw new DOMException('Stores are made only while upgrading.', 'InvalidStateError');
    if (options?.keyPath !== undefined || options?.autoIncrement) throw new Error('The fake keeps out-of-line keys only.');
    if (this.data.stores.has(name)) throw new DOMException(`The store ${name} exists already.`, 'ConstraintError');
    const store: StoreData = { records: new Map(), indexes: new Map() };
    this.data.stores.set(name, store);
    return new FakeObjectStore(store, null);
  }

  transaction(storeNames: string | readonly string[], mode: IDBTransactionMode = 'readonly'): FakeTransaction {
    if (this.isClosed) throw new DOMException('The connection is closed.', 'InvalidStateError');
    const names = typeof storeNames === 'string' ? [storeNames] : [...storeNames];
    for (const name of names) {
      if (!this.data.stores.has(name)) throw new DOMException(`There is no store ${name}.`, 'NotFoundError');
    }
    const transaction = new FakeTransaction(this.data, names, mode);
    this.factory.enqueue(transaction);
    return transaction;
  }

  close(): void {
    this.isClosed = true;
    this.factory.closed(this);
  }
}

class FakeTransaction {
  oncomplete: Handler = null;
  onabort: Handler = null;
  error: DOMException | null = null;
  private readonly queue: (() => void)[] = [];
  private finished = false;

  constructor(
    private readonly data: DatabaseData,
    private readonly names: readonly string[],
    readonly mode: IDBTransactionMode,
  ) {}

  objectStore(name: string): FakeObjectStore {
    const store = this.data.stores.get(name);
    if (!store || !this.names.includes(name)) throw new DOMException(`The store ${name} is not in the transaction.`, 'NotFoundError');
    return new FakeObjectStore(store, this);
  }

  request(operation: () => unknown, writes: boolean): FakeRequest {
    if (writes && this.mode === 'readonly') throw new DOMException('The transaction is read-only.', 'ReadOnlyError');
    const request = new FakeRequest();
    this.later(() => {
      request.succeed(operation());
    });
    return request;
  }

  /** Runs `step` after what is queued already, as a request made in a callback runs after that callback. */
  later(step: () => void): void {
    if (this.finished) throw new DOMException('The transaction has finished.', 'TransactionInactiveError');
    this.queue.push(step);
  }

  /** Runs the requests in order, then commits once a task passes without more, or aborts with `refusal`, undoing them. */
  run(refusal: DOMException | null): Promise<void> {
    const before = this.names.map((name) => [name, new Map(this.data.stores.get(name)?.records)] as const);
    return new Promise((resolve) => {
      const settle = () => {
        if (this.queue.length > 0) {
          for (let step = this.queue.shift(); step; step = this.queue.shift()) step();
          setTimeout(settle, 0);
          return;
        }
        this.finished = true;
        if (refusal) {
          for (const [name, records] of before) {
            const store = this.data.stores.get(name)?.records;
            store?.clear();
            for (const [key, value] of records) store?.set(key, value);
          }
          this.error = refusal;
          this.onabort?.({ target: this } as unknown as Event);
        } else {
          this.oncomplete?.({ target: this } as unknown as Event);
        }
        resolve();
      };
      setTimeout(settle, 0);
    });
  }
}

class FakeObjectStore {
  constructor(
    private readonly data: StoreData,
    private readonly transaction: FakeTransaction | null,
  ) {}

  get(key: Key): FakeRequest {
    return this.inTransaction().request(() => structuredClone(this.data.records.get(key)), false);
  }

  put(value: unknown, key: Key): FakeRequest {
    const stored = structuredClone(value);
    return this.inTransaction().request(() => {
      this.data.records.set(key, stored);
      return key;
    }, true);
  }

  delete(key: Key): FakeRequest {
    return this.inTransaction().request(() => {
      this.data.records.delete(key);
      return undefined;
    }, true);
  }

  clear(): FakeRequest {
    return this.inTransaction().request(() => {
      this.data.records.clear();
      return undefined;
    }, true);
  }

  count(): FakeRequest {
    return this.inTransaction().request(() => this.data.records.size, false);
  }

  createIndex(name: string, keyPath: string): object {
    if (this.transaction) throw new DOMException('Indexes are made only while upgrading.', 'InvalidStateError');
    this.data.indexes.set(name, keyPath);
    return {};
  }

  index(name: string): FakeIndex {
    const keyPath = this.data.indexes.get(name);
    if (keyPath === undefined) throw new DOMException(`There is no index ${name}.`, 'NotFoundError');
    return new FakeIndex(this.data, keyPath, this.inTransaction());
  }

  private inTransaction(): FakeTransaction {
    if (!this.transaction) throw new Error('The fake runs requests in transactions only, never while upgrading.');
    return this.transaction;
  }
}

interface IndexEntry {
  readonly key: Key;
  readonly primaryKey: Key;
}

class FakeIndex {
  constructor(
    private readonly data: StoreData,
    private readonly keyPath: string,
    private readonly transaction: FakeTransaction,
  ) {}

  /** Walks the index's entries in order over the store as it is at each step, as a browser's cursor does. */
  openKeyCursor(): FakeRequest {
    let position: IndexEntry | null = null;
    const advance = () => {
      position = this.entries().find((entry) => position === null || compareEntries(entry, position) > 0) ?? null;
      if (!position) return null;
      return {
        key: position.key,
        primaryKey: position.primaryKey,
        continue: () => {
          this.transaction.later(() => {
            request.succeed(advance());
          });
        },
      };
    };
    const request = this.transaction.request(advance, false);
    return request;
  }

  private entries(): IndexEntry[] {
    return [...this.data.records]
      .flatMap(([primaryKey, value]) => {
        const key = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[this.keyPath] : undefined;
        return typeof key === 'number' || typeof key === 'string' ? [{ key, primaryKey }] : [];
      })
      .sort(compareEntries);
  }
}

function compareEntries(a: IndexEntry, b: IndexEntry): number {
  return compareKeys(a.key, b.key) || compareKeys(a.primaryKey, b.primaryKey);
}

/** IndexedDB's order: numbers before strings, each in their own order. */
function compareKeys(a: Key, b: Key): number {
  if (typeof a !== typeof b) return typeof a === 'number' ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}
