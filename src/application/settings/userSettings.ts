import type { HideRules } from '@/domain/orgChart/hideRules';
import type { StartPosition, TextSize, ThemePreference } from './appSettings';
import type { LanguagePreference } from './language';

/** A new setting needs a field here, a default in parseAppConfig, a control in the dialog and a place in a store. */
export interface UserSettings {
  /** Who is left out of the chart. */
  readonly hide: HideRules;
  /** Whether the cards and the details panel say which level a person is on. */
  readonly showLevels: boolean;
  /** The language chosen in Settings > Display; 'auto' follows the page, the host and the browser. */
  readonly language: LanguagePreference;
  /** Id, UPN or e-mail of the person whose organization alone the chart shows (narrowTo); null shows everyone. */
  readonly team: string | null;
  /** Where the chart opens on the next visit, chosen in Settings > Display. */
  readonly startAt: StartPosition;
  /** The theme chosen in Settings > Display; 'auto' follows the page, then the system. Teams' own theme wins over it. */
  readonly theme: ThemePreference;
  /** How large the chart's text is, chosen in Settings > Display. */
  readonly textSize: TextSize;
}
