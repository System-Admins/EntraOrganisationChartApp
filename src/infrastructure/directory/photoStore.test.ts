import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeIndexedDb, type FakeIndexedDb } from '@/testing/fakeIndexedDb';
import { IndexedDbPhotoStore, PHOTO_LIMIT, PHOTO_MAX_AGE_MS } from './photoStore';

const SCOPE = 'tenant/client';
const HOUR = 60 * 60_000;

const photoOf = (name: string) => `data:image/jpeg;base64,${btoa(name)}`;

/** A clock the test moves, as time after the start. */
function clock() {
  const start = Date.UTC(2026, 9, 1, 9);
  let now = start;
  return {
    now: () => now,
    setTo: (sinceStart: number) => {
      now = start + sinceStart;
    },
  };
}

let fake: FakeIndexedDb;

beforeEach(() => {
  fake = installFakeIndexedDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('IndexedDbPhotoStore', () => {
  it('keeps a photo, and the answer that someone has none, for a day, and nothing from a clock that ran back', async () => {
    const time = clock();
    const store = new IndexedDbPhotoStore(SCOPE, time.now);
    await store.write(
      new Map([
        ['anna', photoOf('anna')],
        ['erik', null],
      ]),
    );

    time.setTo(23 * HOUR);
    await expect(store.read(['anna', 'erik', 'nobody'])).resolves.toEqual(
      new Map([
        ['anna', photoOf('anna')],
        ['erik', null],
      ]),
    );

    time.setTo(PHOTO_MAX_AGE_MS + 1);
    await expect(store.read(['anna', 'erik'])).resolves.toEqual(new Map());

    time.setTo(-HOUR);
    await expect(store.read(['anna', 'erik'])).resolves.toEqual(new Map());
  });

  it('keeps the photos of another tenant or client apart', async () => {
    await new IndexedDbPhotoStore(SCOPE).write(new Map([['anna', photoOf('anna')]]));

    await expect(new IndexedDbPhotoStore('tenant/another client').read(['anna'])).resolves.toEqual(new Map());
  });

  it('keeps at most 1,000 photos, and lets the least recently shown go first', async () => {
    const time = clock();
    const store = new IndexedDbPhotoStore(SCOPE, time.now);
    const ids = Array.from({ length: PHOTO_LIMIT }, (_, index) => `person${String(index).padStart(4, '0')}`);
    const [first = '', second = ''] = ids;
    await store.write(new Map(ids.map((id) => [id, photoOf(id)])));
    // Among photos shown as long ago, the first would go first; this one is shown again.
    time.setTo(HOUR);
    await store.read([first]);

    time.setTo(2 * HOUR);
    await store.write(new Map([['newcomer', null]]));

    expect(fake.records('orgapp', 'photos').size).toBe(PHOTO_LIMIT);
    expect([...(await store.read([first, second, 'newcomer'])).keys()]).toEqual([first, 'newcomer']);
  });

  it('lets a photo nobody was shown for a day go as it keeps others, as it could not be shown again anyway', async () => {
    const time = clock();
    const store = new IndexedDbPhotoStore(SCOPE, time.now);
    await store.write(new Map([['anna', photoOf('anna')]]));

    time.setTo(PHOTO_MAX_AGE_MS + HOUR);
    await store.write(new Map([['erik', photoOf('erik')]]));

    expect([...fake.records('orgapp', 'photos').keys()]).toEqual([`${SCOPE}/erik`]);
  });

  it('deletes every photo it keeps, whichever tenant and client they were kept for', async () => {
    await new IndexedDbPhotoStore(SCOPE).write(new Map([['anna', photoOf('anna')]]));
    await new IndexedDbPhotoStore('tenant/former client').write(new Map([['erik', null]]));

    await new IndexedDbPhotoStore(SCOPE).clear();

    expect(fake.records('orgapp', 'photos').size).toBe(0);
  });

  it('serves nothing but an image\'s data URL, whatever another version left', async () => {
    const time = clock();
    const store = new IndexedDbPhotoStore(SCOPE, time.now);
    await store.write(new Map([['anna', photoOf('anna')]]));
    fake.seed('orgapp', 'photos', `${SCOPE}/pixel`, { photo: 'https://tracker.example/pixel.gif', savedAt: time.now(), usedAt: time.now() });
    fake.seed('orgapp', 'photos', `${SCOPE}/undated`, { photo: photoOf('undated') });

    await expect(store.read(['anna', 'pixel', 'undated'])).resolves.toEqual(new Map([['anna', photoOf('anna')]]));
  });

  it('rejects a write that the browser refuses, and keeps nothing of it', async () => {
    const store = new IndexedDbPhotoStore(SCOPE);
    await store.write(new Map([['anna', photoOf('anna')]]));
    const full = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    fake.refuseNextWrite(full);

    await expect(store.write(new Map([['erik', photoOf('erik')]]))).rejects.toBe(full);

    await expect(store.read(['anna', 'erik'])).resolves.toEqual(new Map([['anna', photoOf('anna')]]));
  });
});
