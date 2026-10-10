import { isRecord } from '../config/browserStorage';
import { openDatabase, PHOTO_STORE, PHOTOS_BY_USE } from './browserDatabase';

/** How long a kept photo is shown before it is read again, so that a changed photo shows at most a day late. */
export const PHOTO_MAX_AGE_MS = 24 * 60 * 60_000;
/** The most photos kept, a few megabytes as data URLs; the least recently shown go first. */
export const PHOTO_LIMIT = 1000;

/** Photos kept between visits: a data URL, or null for someone without a photo, which saves asking again too. */
export interface PhotoStore {
  /** What is kept for these people and no older than PHOTO_MAX_AGE_MS; anyone else is left out. */
  read(employeeIds: readonly string[]): Promise<ReadonlyMap<string, string | null>>;
  write(photos: ReadonlyMap<string, string | null>): Promise<void>;
  /** Deletes every photo kept, whichever sign-in read it. */
  clear(): Promise<void>;
}

interface PhotoRecord {
  readonly photo: string | null;
  readonly savedAt: number;
  /** When it was last shown, by which the least recently used go first. */
  readonly usedAt: number;
}

/** In the chart's database, keyed by tenant, client and person, as the directory's copy is by tenant and client. */
export class IndexedDbPhotoStore implements PhotoStore {
  constructor(
    /** The tenant and the client. */
    private readonly scope: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async read(employeeIds: readonly string[]): Promise<ReadonlyMap<string, string | null>> {
    const now = this.now();
    const kept = new Map<string, string | null>();
    await this.transact((photos) => {
      for (const employeeId of employeeIds) {
        const key = this.keyOf(employeeId);
        const request = photos.get(key);
        request.onsuccess = () => {
          const record = photoRecordOf(request.result);
          // A clock that ran back can't tell an age, so the photo counts as old.
          if (!record || record.savedAt > now || now - record.savedAt > PHOTO_MAX_AGE_MS) return;
          kept.set(employeeId, record.photo);
          photos.put({ ...record, usedAt: now } satisfies PhotoRecord, key);
        };
      }
    });
    return kept;
  }

  write(photos: ReadonlyMap<string, string | null>): Promise<void> {
    const now = this.now();
    return this.transact((store) => {
      for (const [employeeId, photo] of photos) {
        store.put({ photo, savedAt: now, usedAt: now } satisfies PhotoRecord, this.keyOf(employeeId));
      }
      // In the same transaction, so that tabs writing at once can't leave more than the limit between them.
      const counted = store.count();
      counted.onsuccess = () => {
        let excess = counted.result - PHOTO_LIMIT;
        const byUse = store.index(PHOTOS_BY_USE).openKeyCursor();
        byUse.onsuccess = () => {
          const cursor = byUse.result;
          // Least recently shown first: what is over the limit goes, and so does what nobody saw for longer than it may be shown.
          if (!cursor || (excess <= 0 && now - Number(cursor.key) <= PHOTO_MAX_AGE_MS)) return;
          store.delete(cursor.primaryKey);
          excess--;
          cursor.continue();
        };
      };
    });
  }

  /** Runs after any write asked before it: IndexedDB opens a database for each request in turn, and runs their transactions in that order. */
  clear(): Promise<void> {
    return this.transact((store) => {
      store.clear();
    });
  }

  private keyOf(employeeId: string): string {
    return `${this.scope}/${employeeId}`;
  }

  /** Settles once the transaction has committed, so that nothing counts as kept or deleted before it is. */
  private async transact(work: (store: IDBObjectStore) => void): Promise<void> {
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(PHOTO_STORE, 'readwrite');
        transaction.oncomplete = () => {
          resolve();
        };
        // A failed request aborts the transaction, with the request's error; so does a full disk as it commits.
        transaction.onabort = () => {
          reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
        };
        work(transaction.objectStore(PHOTO_STORE));
      });
    } finally {
      database.close();
    }
  }
}

/** Another version may have written something else, and only an image's data URL may become an <img> source. */
function photoRecordOf(value: unknown): PhotoRecord | null {
  if (!isRecord(value)) return null;
  const { photo, savedAt, usedAt } = value;
  if (photo !== null && !(typeof photo === 'string' && photo.startsWith('data:image/'))) return null;
  return typeof savedAt === 'number' && typeof usedAt === 'number' ? { photo, savedAt, usedAt } : null;
}
