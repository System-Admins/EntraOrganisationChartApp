// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserSettings } from '@/application/settings/userSettings';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { readStoredUserSettings, StorageUserSettingsStore } from './storageUserSettingsStore';

const KEY = 'orgapp.userSettings';
const defaults: UserSettings = {
  hide: SHOW_EVERYONE,
  showLevels: true,
  language: 'auto',
  team: null,
  startAt: 'top',
  theme: 'auto',
  textSize: 'standard',
};
const refused = () => {
  throw new DOMException('The operation is insecure.', 'SecurityError');
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('readStoredUserSettings', () => {
  it('finds nothing in a browser that stored no choice', () => {
    expect(readStoredUserSettings()).toEqual({});
  });

  it('reads the choices a person made', () => {
    localStorage.setItem(KEY, '{"showLevels":false,"language":"en","startAt":"lastView","theme":"contrast","textSize":"larger"}');

    expect(readStoredUserSettings()).toEqual({
      showLevels: false,
      language: 'en',
      startAt: 'lastView',
      theme: 'contrast',
      textSize: 'larger',
    });
  });

  it.each([
    '{"showLevels":',
    '{"showLevels":"no"}',
    '{"showLevels":null}',
    '{"language":"de"}',
    // A language an earlier version of the chart spoke.
    '{"language":"nb"}',
    '{"language":"EN"}',
    '{"language":true}',
    '{"startAt":"home"}',
    '{"startAt":"ME"}',
    '{"startAt":2}',
    '{"theme":"blue"}',
    '{"theme":"Dark"}',
    '{"theme":"high-contrast"}',
    '{"theme":1}',
    '{"textSize":"huge"}',
    '{"textSize":"Large"}',
    '{"textSize":1.25}',
    '{"density":"compact"}',
    '[false]',
    'false',
    'null',
    '',
  ])('ignores a value it cannot use: %s', (value) => {
    localStorage.setItem(KEY, value);

    expect(readStoredUserSettings()).toEqual({});
  });

  it('checks each setting on its own, keeping the ones that can be used', () => {
    localStorage.setItem(KEY, '{"showLevels":"yes","language":"en","theme":"sepia","textSize":"large"}');

    expect(readStoredUserSettings()).toEqual({ language: 'en', textSize: 'large' });
  });

  it('keeps the settings it knows from a value that holds others too', () => {
    localStorage.setItem(KEY, '{"density":"compact","showLevels":false,"theme":"dark"}');

    expect(readStoredUserSettings()).toEqual({ showLevels: false, theme: 'dark' });
  });

  it('finds nothing where the browser has switched storage off or refuses the page', () => {
    vi.stubGlobal('localStorage', null);
    expect(readStoredUserSettings()).toEqual({});
    vi.unstubAllGlobals();

    localStorage.setItem(KEY, '{"showLevels":false}');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refused);
    expect(readStoredUserSettings()).toEqual({});
  });
});

describe('StorageUserSettingsStore', () => {
  const hidden = { ...defaults, showLevels: false };

  it('stores only what differs from config.json, and nothing once the settings are config.json\'s again', () => {
    const store = new StorageUserSettingsStore(defaults, defaults);

    store.save(hidden);
    expect(localStorage.getItem(KEY)).toBe('{"showLevels":false}');
    expect(readStoredUserSettings()).toEqual({ showLevels: false });

    store.save(defaults);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('measures against config.json\'s value, whichever that is', () => {
    const store = new StorageUserSettingsStore(hidden, hidden);

    store.save(defaults);
    expect(localStorage.getItem(KEY)).toBe('{"showLevels":true}');

    store.save(hidden);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('forgets a stored choice when the person goes back to config.json\'s', () => {
    localStorage.setItem(KEY, '{"showLevels":false}');
    const store = new StorageUserSettingsStore(defaults, hidden);

    store.save(defaults);

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('leaves alone what another tab stored when a save is about something else', () => {
    const store = new StorageUserSettingsStore(defaults, defaults);
    localStorage.setItem(KEY, '{"showLevels":false}');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    store.save({ ...defaults, hide: { ...SHOW_EVERYONE, guests: true } });
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBe('{"showLevels":false}');

    store.save(hidden);
    store.save(defaults);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('keeps what else the key holds, which a newer version may have stored', () => {
    localStorage.setItem(KEY, '{"density":"compact"}');
    const store = new StorageUserSettingsStore(defaults, defaults);

    store.save(hidden);
    expect(localStorage.getItem(KEY)).toBe('{"density":"compact","showLevels":false}');

    store.save(defaults);
    expect(localStorage.getItem(KEY)).toBe('{"density":"compact"}');
  });

  it('writes over a value it cannot use', () => {
    localStorage.setItem(KEY, '[false]');
    const store = new StorageUserSettingsStore(defaults, defaults);

    store.save(hidden);
    expect(localStorage.getItem(KEY)).toBe('{"showLevels":false}');

    localStorage.setItem(KEY, '{"showLevels":');
    store.save(defaults);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('stores a language chosen in Settings, and nothing once the person is back on Automatic', () => {
    const store = new StorageUserSettingsStore(defaults, defaults);

    store.save({ ...defaults, language: 'en' });
    expect(localStorage.getItem(KEY)).toBe('{"language":"en"}');
    store.save({ ...hidden, language: 'en' });
    expect(readStoredUserSettings()).toEqual({ showLevels: false, language: 'en' });

    store.save({ ...hidden, language: 'auto' });
    expect(localStorage.getItem(KEY)).toBe('{"showLevels":false}');
  });

  it('stores where the chart opens while it differs from config.json\'s, which a filter change leaves alone', () => {
    const store = new StorageUserSettingsStore(defaults, defaults);

    store.save({ ...defaults, startAt: 'me' });
    expect(localStorage.getItem(KEY)).toBe('{"startAt":"me"}');
    store.save({ ...defaults, startAt: 'me', hide: { ...SHOW_EVERYONE, guests: true } });
    expect(readStoredUserSettings()).toEqual({ startAt: 'me' });

    store.save(defaults);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('stores a theme and a text size chosen in Settings, and nothing once the person is back on Automatic and Standard', () => {
    const store = new StorageUserSettingsStore(defaults, defaults);

    store.save({ ...defaults, theme: 'dark' });
    expect(localStorage.getItem(KEY)).toBe('{"theme":"dark"}');
    store.save({ ...defaults, theme: 'dark', textSize: 'larger' });
    expect(readStoredUserSettings()).toEqual({ theme: 'dark', textSize: 'larger' });

    store.save({ ...defaults, textSize: 'larger' });
    expect(localStorage.getItem(KEY)).toBe('{"textSize":"larger"}');
    store.save(defaults);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('carries on where the browser stores nothing, and stores the choice with the next save that gets through', () => {
    const store = new StorageUserSettingsStore(defaults, defaults);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refused);
    expect(() => {
      store.save(hidden);
    }).not.toThrow();
    vi.restoreAllMocks();
    vi.stubGlobal('localStorage', null);
    expect(() => {
      store.save(hidden);
    }).not.toThrow();
    vi.unstubAllGlobals();

    store.save({ ...hidden, hide: { ...SHOW_EVERYONE, guests: true } });

    expect(localStorage.getItem(KEY)).toBe('{"showLevels":false}');
  });
});
