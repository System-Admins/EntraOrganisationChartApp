import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeIndexedDb, type FakeIndexedDb } from '@/testing/fakeIndexedDb';
import { makeEmployee } from '@/testing/makeEmployee';
import { IndexedDbPhotoStore } from './photoStore';
import { IndexedDbSnapshotStore, toRecord, type StoredDirectory } from './snapshotStore';

const SCOPE = '11111111-2222-3333-4444-555555555555/66666666-7777-8888-9999-000000000000';
const PHOTO = 'data:image/jpeg;base64,QUJD';

const directory: StoredDirectory = {
  employees: [makeEmployee('ceo'), makeEmployee('lead', 'ceo')],
  loadedAt: new Date(2026, 9, 1, 9, 5),
  changesLink: 'https://graph.microsoft.com/v1.0/users/delta?$deltatoken=abc',
  fullReadAt: new Date(2026, 8, 30, 14, 3),
};

/** The database as version 1 of the chart left it, with its connection closed: the snapshots alone, with a copy of the directory. */
function leaveVersionOne(fake: FakeIndexedDb): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = fake.open('orgapp', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('snapshots');
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('snapshots', 'readwrite');
      transaction.objectStore('snapshots').put(toRecord(directory), SCOPE);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
    };
    request.onerror = () => {
      reject(request.error ?? new Error('The fake did not open.'));
    };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the browser database', () => {
  it('keeps the copy of the directory that version 1 left as it moves to version 2, which adds the photos beside it', async () => {
    const fake = installFakeIndexedDb();
    await leaveVersionOne(fake);

    await expect(new IndexedDbSnapshotStore(SCOPE).read()).resolves.toEqual(directory);

    expect(fake.versionOf('orgapp')).toBe(2);
    expect(fake.storeNames('orgapp')).toEqual(['photos', 'snapshots']);
    const photos = new IndexedDbPhotoStore(SCOPE);
    await photos.write(new Map([['ceo', PHOTO]]));
    await expect(photos.read(['ceo'])).resolves.toEqual(new Map([['ceo', PHOTO]]));
    await expect(new IndexedDbSnapshotStore(SCOPE).read()).resolves.toEqual(directory);
  });

  it('starts with both stores where the browser has no database yet, whichever store asks first', async () => {
    const fake = installFakeIndexedDb();

    await new IndexedDbPhotoStore(SCOPE).write(new Map([['ceo', null]]));
    await new IndexedDbSnapshotStore(SCOPE).write(directory);

    expect(fake.versionOf('orgapp')).toBe(2);
    expect(fake.storeNames('orgapp')).toEqual(['photos', 'snapshots']);
    await expect(new IndexedDbSnapshotStore(SCOPE).read()).resolves.toEqual(directory);
  });
});
