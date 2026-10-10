// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RECENT_PEOPLE_LIMIT } from '@/application/abstractions/recentPeopleStore';
import { StorageRecentPeopleStore } from './storageRecentPeopleStore';

const KEY = 'orgapp.recentPeople';
const refused = () => {
  throw new DOMException('The operation is insecure.', 'SecurityError');
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('StorageRecentPeopleStore', () => {
  it('lists the people opened, the latest first and each once, by id only', () => {
    const store = new StorageRecentPeopleStore();
    expect(store.list()).toEqual([]);

    store.remember('anna');
    store.remember('bo');
    store.remember('anna');

    expect(store.list()).toEqual(['anna', 'bo']);
    expect(localStorage.getItem(KEY)).toBe('["anna","bo"]');
  });

  it(`keeps the latest ${String(RECENT_PEOPLE_LIMIT)}`, () => {
    const store = new StorageRecentPeopleStore();

    for (let person = 1; person <= RECENT_PEOPLE_LIMIT + 2; person++) store.remember(`person${String(person)}`);

    expect(store.list()).toHaveLength(RECENT_PEOPLE_LIMIT);
    expect(store.list()[0]).toBe(`person${String(RECENT_PEOPLE_LIMIT + 2)}`);
    expect(store.list()).not.toContain('person2');
  });

  it.each(['["anna",', '{"anna":true}', '"anna"', 'null', ''])('lists nobody from a value it cannot use: %s', (value) => {
    localStorage.setItem(KEY, value);

    expect(new StorageRecentPeopleStore().list()).toEqual([]);
  });

  it('keeps what can be an id from a list another version wrote, once each and no more than it lists', () => {
    const ids = Array.from({ length: RECENT_PEOPLE_LIMIT + 3 }, (_, index) => `p${String(index)}`);
    localStorage.setItem(KEY, JSON.stringify(['anna', 7, '', null, 'anna', { id: 'bo' }, ...ids]));

    const listed = new StorageRecentPeopleStore().list();

    expect(listed.slice(0, 2)).toEqual(['anna', 'p0']);
    expect(listed).toHaveLength(RECENT_PEOPLE_LIMIT);
  });

  it('lists nobody and remembers nobody where the browser stores nothing, without an error', () => {
    const store = new StorageRecentPeopleStore();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refused);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refused);
    expect(store.list()).toEqual([]);
    expect(() => {
      store.remember('anna');
    }).not.toThrow();
    vi.restoreAllMocks();

    vi.stubGlobal('localStorage', null);
    expect(store.list()).toEqual([]);
    expect(() => {
      store.remember('anna');
      store.clear();
    }).not.toThrow();
  });

  it('clears the list, and remembers people opened after that', () => {
    const store = new StorageRecentPeopleStore();
    store.remember('anna');

    store.clear();
    expect(localStorage.getItem(KEY)).toBeNull();
    store.remember('bo');

    expect(store.list()).toEqual(['bo']);
  });

  it('forgets the list for Sign out, and keeps nobody the page opens before it leaves', async () => {
    const store = new StorageRecentPeopleStore();
    store.remember('anna');

    await store.forget();
    store.remember('bo');

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(store.list()).toEqual([]);
  });

  it('never rejects when the browser refuses to forget, and says so on the console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(refused);

    await expect(new StorageRecentPeopleStore().forget()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });
});
