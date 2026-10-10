const DATABASE = 'orgapp';
/** 1 held the directory's snapshots; 2 added the photos. */
const VERSION = 2;
export const SNAPSHOT_STORE = 'snapshots';
export const PHOTO_STORE = 'photos';
/** The photos by when each was last shown, which the least recently used leave by first. */
export const PHOTOS_BY_USE = 'usedAt';

/** The chart's database in this browser; embedded frames get one per host site, as storage is partitioned. */
export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      // Only what is missing: an upgrade from version 1 keeps the directory that is kept there.
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) database.createObjectStore(SNAPSHOT_STORE);
      if (!database.objectStoreNames.contains(PHOTO_STORE)) {
        database.createObjectStore(PHOTO_STORE).createIndex(PHOTOS_BY_USE, 'usedAt');
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('Could not open IndexedDB.'));
    };
  });
}
