import type { ChartEmbedding } from '@/application/abstractions/chartEmbedding';
import type { UserSettings } from '@/application/settings/userSettings';
import { withUserSettings } from '../config/urlUserSettingsStore';
import { embedLink } from './personLinks';

/** The page's address as UrlUserSettingsStore writes it for the settings, so the embed code keeps what the Link button keeps. */
export class BrowserChartEmbedding implements ChartEmbedding {
  /** config.json's settings, which the address leaves out. */
  constructor(private readonly defaults: UserSettings) {}

  address(settings: UserSettings): string {
    return embedLink(withUserSettings(new URL(window.location.href), this.defaults, settings));
  }
}
