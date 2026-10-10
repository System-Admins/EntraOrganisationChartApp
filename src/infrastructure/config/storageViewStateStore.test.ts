// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAVED_TOGGLES_LIMIT, type SavedView } from '@/application/abstractions/viewStateStore';
import type { HostKind } from '@/application/settings/hostKind';
import { SAVED_SCOPES_PER_HOST, StorageViewStateStore } from './storageViewStateStore';

const KEY = 'orgapp.savedViews';
const VIEW: SavedView = {
  depth: 1,
  toggled: [
    ['lead', true],
    ['ceo', false],
  ],
  selectedId: 'dev',
  currentId: 'dev',
  savedAt: new Date(2026, 9, 1, 9, 30),
};
const refused = () => {
  throw new DOMException('The operation is insecure.', 'SecurityError');
};

const stores: StorageViewStateStore[] = [];
const storeFor = (host: HostKind = 'standalone') => {
  const store = new StorageViewStateStore(host);
  stores.push(store);
  return store;
};

afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('StorageViewStateStore', () => {
  it('reads back the view saved for a chart, and none for another chart', () => {
    storeFor().save('everyone', VIEW);

    expect(storeFor().get('everyone')).toEqual(VIEW);
    expect(storeFor().get('sales')).toBeNull();
  });

  it('keeps the views of Teams, embedding pages and the chart\'s own site apart', () => {
    storeFor('teams').save('everyone', VIEW);
    storeFor('standalone').save('everyone', { ...VIEW, selectedId: null });

    expect(storeFor('teams').get('everyone')?.selectedId).toBe('dev');
    expect(storeFor('standalone').get('everyone')?.selectedId).toBeNull();
    expect(storeFor('embedded').get('everyone')).toBeNull();
  });

  it(`keeps the views of the ${String(SAVED_SCOPES_PER_HOST)} charts saved last in a host`, () => {
    const store = storeFor();
    const count = SAVED_SCOPES_PER_HOST + 2;

    for (let chart = 0; chart < count; chart++) store.save(`chart${String(chart)}`, { ...VIEW, savedAt: new Date(2026, 9, 1, 9, chart) });

    expect(store.get('chart0')).toBeNull();
    expect(store.get('chart1')).toBeNull();
    expect(store.get(`chart${String(count - 1)}`)).not.toBeNull();
    expect(Object.keys((JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, object>).standalone ?? {})).toHaveLength(
      SAVED_SCOPES_PER_HOST,
    );
  });

  it.each([
    '{"standalone":',
    '[]',
    '{"standalone":[]}',
    '{"standalone":{"everyone":{"depth":-1,"toggled":[],"selectedId":null,"currentId":null,"savedAt":0}}}',
    '{"standalone":{"everyone":{"depth":1,"toggled":{},"selectedId":null,"currentId":null,"savedAt":0}}}',
    '{"standalone":{"everyone":{"depth":1,"toggled":[],"selectedId":7,"currentId":null,"savedAt":0}}}',
    '{"standalone":{"everyone":{"depth":1,"toggled":[],"selectedId":null,"currentId":null,"savedAt":"today"}}}',
  ])('finds no view in a value it cannot use: %s', (value) => {
    localStorage.setItem(KEY, value);

    expect(storeFor().get('everyone')).toBeNull();
  });

  it('keeps what it can use of the teams another version folded or unfolded, the latest when there are too many', () => {
    const latest = Array.from({ length: SAVED_TOGGLES_LIMIT }, (_, index) => [`t${String(index)}`, true]);
    const toggled = [['lead', true], ['bad'], [7, true], ['dev', 'yes'], ...latest];
    localStorage.setItem(KEY, JSON.stringify({ standalone: { everyone: { ...VIEW, toggled, savedAt: VIEW.savedAt.getTime() } } }));

    const view = storeFor().get('everyone');

    expect(view?.toggled).toHaveLength(SAVED_TOGGLES_LIMIT);
    expect(view?.toggled.at(-1)).toEqual([`t${String(SAVED_TOGGLES_LIMIT - 1)}`, true]);
    expect(view?.toggled.some(([id]) => id === 'lead')).toBe(false);
  });

  it('forgets the view of one chart, and keeps the others', () => {
    const store = storeFor();
    store.save('everyone', VIEW);
    store.save('sales', VIEW);
    storeFor('teams').save('everyone', VIEW);

    store.remove('everyone');
    store.remove('nothing saved');

    expect(store.get('everyone')).toBeNull();
    expect(store.get('sales')).toEqual(VIEW);
    expect(storeFor('teams').get('everyone')).toEqual(VIEW);
  });

  it('leaves the views of the other hosts as they are when it saves', () => {
    localStorage.setItem(KEY, JSON.stringify({ teams: { everyone: 'from a newer version' } }));

    storeFor().save('everyone', VIEW);

    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toMatchObject({ teams: { everyone: 'from a newer version' } });
  });

  it('finds nothing and saves nothing where the browser stores nothing, without an error', () => {
    const store = storeFor();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refused);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refused);
    expect(store.get('everyone')).toBeNull();
    expect(() => {
      store.save('everyone', VIEW);
    }).not.toThrow();
    vi.restoreAllMocks();

    vi.stubGlobal('localStorage', null);
    expect(store.get('everyone')).toBeNull();
    expect(() => {
      store.save('everyone', VIEW);
    }).not.toThrow();
  });

  it('forgets every view for Sign out, and saves none that the page makes before it leaves', async () => {
    const store = storeFor();
    store.save('everyone', VIEW);

    await store.forget();
    store.save('everyone', VIEW);

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('saves nothing more once another tab forgot the views, as that tab reloads this one through the sign-out channel', () => {
    const store = storeFor();
    store.save('everyone', VIEW);
    const other = storeFor();
    other.save('sales', VIEW);

    // Another tab's forget(), as this tab's storage event reports it.
    localStorage.removeItem(KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: null }));
    store.save('everyone', VIEW);
    other.save('sales', VIEW);

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('saves nothing more once another tab cleared the whole storage, which its storage event reports without a key', () => {
    const store = storeFor();
    store.save('everyone', VIEW);

    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    store.save('everyone', VIEW);

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('carries on saving when another tab saved a view of its own', () => {
    const store = storeFor();

    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: '{}' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'orgapp.recentPeople', newValue: null }));
    store.save('everyone', VIEW);

    expect(store.get('everyone')).toEqual(VIEW);
  });

  it('never rejects when the browser refuses to forget, and says so on the console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(refused);

    await expect(storeFor().forget()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });
});
