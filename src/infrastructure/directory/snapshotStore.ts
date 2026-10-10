import type { DirectorySnapshot } from '@/application/abstractions/employeeDirectory';
import type { ExtraFieldProperty } from '@/application/settings/extraFields';
import { openDatabase, SNAPSHOT_STORE } from './browserDatabase';

/** A snapshot as kept between visits, with the source's link for loading only what changed since. */
export interface StoredDirectory extends DirectorySnapshot {
  readonly changesLink: string | null;
  /** When everything was last read; later refreshes may have read only what changed. */
  readonly fullReadAt: Date | null;
}

export interface SnapshotStore {
  read(): Promise<StoredDirectory | null>;
  write(directory: StoredDirectory): Promise<void>;
  clear(): Promise<void>;
}

/** Bump when Employee changes shape so stale records are ignored instead of misread. */
const SCHEMA_VERSION = 5;

/** Records written before change tracking have no changesLink, and older ones no fullReadAt; they are read with none. */
export interface StoredSnapshot extends DirectorySnapshot {
  readonly schemaVersion: number;
  /** The organization's own fields that the people were read with (signatureOf). */
  readonly extraFields: string;
  readonly changesLink?: string | null;
  readonly fullReadAt?: Date | null;
}

/** `extraFields` are the organization's own fields that the people were read with. */
export function toRecord(directory: StoredDirectory, extraFields: readonly ExtraFieldProperty[] = []): StoredSnapshot {
  return { ...directory, schemaVersion: SCHEMA_VERSION, extraFields: signatureOf(extraFields) };
}

/** Null for no record, one of another schema version, or one read with other fields of the organization's own: its people lack those named now, and its changes link keeps the $select it started with. What an older record lacks reads as null, without a schema bump. */
export function fromRecord(record: StoredSnapshot | undefined, extraFields: readonly ExtraFieldProperty[] = []): StoredDirectory | null {
  if (record?.schemaVersion !== SCHEMA_VERSION || record.extraFields !== signatureOf(extraFields)) return null;
  return {
    employees: record.employees,
    loadedAt: record.loadedAt,
    changesLink: record.changesLink ?? null,
    fullReadAt: record.fullReadAt ?? null,
  };
}

/** The same in any order, as the order config.json lists the fields in changes nothing that is read. */
function signatureOf(extraFields: readonly ExtraFieldProperty[]): string {
  return [...extraFields].sort().join(',');
}

/** Persists the directory between visits, in the chart's database (openDatabase). */
export class IndexedDbSnapshotStore implements SnapshotStore {
  /** `extraFields` are the organization's own fields that config.json names: a copy read with others starts over. */
  constructor(
    private readonly key: string,
    private readonly extraFields: readonly ExtraFieldProperty[] = [],
  ) {}

  async read(): Promise<StoredDirectory | null> {
    return fromRecord(await this.run<StoredSnapshot | undefined>('readonly', (store) => store.get(this.key)), this.extraFields);
  }

  async write(directory: StoredDirectory): Promise<void> {
    const record = toRecord(directory, this.extraFields);
    await this.run('readwrite', (store) => store.put(record, this.key));
  }

  async clear(): Promise<void> {
    await this.run('readwrite', (store) => store.delete(this.key));
  }

  private async run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    const database = await openDatabase();
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = operation(database.transaction(SNAPSHOT_STORE, mode).objectStore(SNAPSHOT_STORE));
        request.onsuccess = () => {
          resolve(request.result as T);
        };
        request.onerror = () => {
          reject(request.error ?? new Error('IndexedDB request failed.'));
        };
      });
    } finally {
      database.close();
    }
  }
}
