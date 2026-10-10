import type { UserSettingsStore } from '@/application/abstractions/userSettingsStore';
import type { UserSettings } from '@/application/settings/userSettings';
import { hideRuleParameters } from './urlOverrides';

/** Keeps who is in the chart in the address, where applyUrlOverrides reads it, so reloads and copied links carry it. */
export class UrlUserSettingsStore implements UserSettingsStore {
  /** What the latest save wrote; null until the person changes a setting. */
  private latest: UserSettings | null = null;

  constructor(private readonly defaults: UserSettings) {}

  save(settings: UserSettings): void {
    this.latest = settings;
    this.write(settings);
  }

  /** Writes the latest settings into the address again: a step back in the history takes the address that entry had before. */
  restore(): void {
    if (this.latest) this.write(this.latest);
  }

  private write(settings: UserSettings): void {
    const url = withUserSettings(new URL(window.location.href), this.defaults, settings);
    // Replaced, not pushed: Back closes what is open over the chart, then leaves it, and never takes back a checkbox.
    window.history.replaceState(window.history.state, '', url);
  }
}

/** `address` with who `settings` put in the chart, as what differs from config.json's `defaults`; the rest of it stays. */
export function withUserSettings(address: URL, defaults: UserSettings, settings: UserSettings): URL {
  const url = new URL(address);
  const parameters = { ...hideRuleParameters(defaults.hide, settings.hide), team: settings.team };
  for (const [name, value] of Object.entries(parameters)) {
    if (value === null) url.searchParams.delete(name);
    else url.searchParams.set(name, value);
  }
  return readable(url);
}

/** URLSearchParams escapes commas and @, which a query may hold as they are; people read these addresses, and type them. */
export function readable(address: URL): URL {
  const url = new URL(address);
  url.search = url.searchParams.toString().replace(/%2C/gi, ',').replace(/%40/g, '@');
  return url;
}
