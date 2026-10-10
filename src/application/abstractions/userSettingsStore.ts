import type { UserSettings } from '../settings/userSettings';

export interface UserSettingsStore {
  /** Remembers the settings this store is the place for, so that the chart opens the same way next time. */
  save(settings: UserSettings): void;
}
