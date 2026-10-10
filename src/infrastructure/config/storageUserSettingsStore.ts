import type { UserSettingsStore } from '@/application/abstractions/userSettingsStore';
import { START_POSITIONS, TEXT_SIZES, THEME_PREFERENCES } from '@/application/settings/appSettings';
import { LANGUAGE_PREFERENCES } from '@/application/settings/language';
import type { UserSettings } from '@/application/settings/userSettings';
import { isRecord, readStoredJson, removeStored, writeStoredJson } from './browserStorage';

/** Whether a stored value is one the setting can take: another version of the app may have written it. */
type Validator<T> = (value: unknown) => value is T;

const isBoolean: Validator<boolean> = (value): value is boolean => typeof value === 'boolean';

function isOneOf<T extends string>(allowed: readonly T[]): Validator<T> {
  return (value): value is T => typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/** The settings kept in the browser: how the chart looks, speaks and opens for this person. The filters are kept in the address. */
export const STORED_SETTINGS = {
  showLevels: isBoolean,
  language: isOneOf(LANGUAGE_PREFERENCES),
  startAt: isOneOf(START_POSITIONS),
  theme: isOneOf(THEME_PREFERENCES),
  textSize: isOneOf(TEXT_SIZES),
} as const satisfies { readonly [Setting in keyof UserSettings]?: Validator<UserSettings[Setting]> };

type StoredSetting = keyof typeof STORED_SETTINGS;

const STORED = Object.keys(STORED_SETTINGS) as StoredSetting[];

/** A setting is only stored while it differs from its default (AppSettings.defaults), so one missing here follows that. */
export type StoredUserSettings = Partial<Pick<UserSettings, StoredSetting>>;

const STORAGE_KEY = 'orgapp.userSettings';

export function readStoredUserSettings(): StoredUserSettings {
  const stored = readStored();
  const valid = STORED.filter((setting) => STORED_SETTINGS[setting](stored[setting]));
  // Each value passed its own setting's check.
  return Object.fromEntries(valid.map((setting) => [setting, stored[setting]]));
}

function readStored(): Readonly<Record<string, unknown>> {
  const stored = readStoredJson(STORAGE_KEY);
  return isRecord(stored) ? stored : {};
}

/** In localStorage, not the address: Teams and SharePoint reopen one address, and a link shouldn't carry its sender's taste. */
export class StorageUserSettingsStore implements UserSettingsStore {
  /** `saved` starts as what the page opened with: the stored settings, else config.json's. */
  constructor(
    private readonly defaults: UserSettings,
    private saved: Pick<UserSettings, StoredSetting>,
  ) {}

  save(settings: UserSettings): void {
    const changed = STORED.filter((setting) => settings[setting] !== this.saved[setting]);
    if (changed.length === 0) return;
    // Only these are written: the rest of the key may hold what another tab, or a newer version, stored since.
    const stored = new Map(Object.entries(readStored()));
    for (const setting of changed) {
      if (settings[setting] === this.defaults[setting]) stored.delete(setting);
      else stored.set(setting, settings[setting]);
    }
    const written = stored.size === 0 ? removeStored(STORAGE_KEY) : writeStoredJson(STORAGE_KEY, Object.fromEntries(stored));
    // Without storage the choice holds for this visit only.
    if (written) this.saved = settings;
  }
}
