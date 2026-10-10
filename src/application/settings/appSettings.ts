import { chartHideRules, type OrgChartOptions } from '@/domain/orgChart/orgChart';
import type { Branding, PageColors } from './branding';
import type { ChartPart } from './chartParts';
import type { ExtraField } from './extraFields';
import type { LanguageSettings } from './language';
import type { UserSettings } from './userSettings';

/** 'auto' follows the operating system between light and dark; the others name a theme. */
export const THEME_PREFERENCES = ['auto', 'light', 'dark', 'contrast'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export type ThemeName = Exclude<ThemePreference, 'auto'>;

export interface ThemeSettings {
  /** As the chart opens: the choice in Settings > Display that this browser remembers, else 'auto'. */
  readonly chosen: ThemePreference;
  /** What 'auto' stands for: ?theme=, else config.json's theme, whose own 'auto' follows the system. */
  readonly automatic: ThemePreference;
}

/** The person's choice unless it is 'auto', else the page's; a host that sets the theme (Teams) still wins over both. */
export function resolveTheme(chosen: ThemePreference, automatic: ThemePreference): ThemePreference {
  return chosen === 'auto' ? automatic : chosen;
}

/** The text sizes a person can choose in Settings > Display; the stylesheets scale every font size by the one chosen. */
export const TEXT_SIZES = ['standard', 'large', 'larger'] as const;

export type TextSize = (typeof TEXT_SIZES)[number];

export const MAX_EXPAND_DEPTH = 10;

/** Where the chart opens: at the top persons, at the signed-in person's own card, or as they left it ('lastView'). */
export const START_POSITIONS = ['top', 'me', 'lastView'] as const;

export type StartPosition = (typeof START_POSITIONS)[number];

/** Microsoft's My Account page, where a work or school account changes its profile photo. */
export const MICROSOFT_ACCOUNT_URL = 'https://myaccount.microsoft.com/';

/** config.json's support desk, which messages that send people to their IT support link to. */
export interface SupportDesk {
  /** The link's text, such as "Contoso Service Desk"; null words it in the page's language. */
  readonly label: string | null;
  /** An https:// page or a mailto: address. */
  readonly url: string;
}

export interface ChartSettings {
  /** As the chart opens: config.json's options with what the address changed. */
  readonly options: OrgChartOptions;
  /** As the chart opens: the person whose organization alone it shows (?team=), on top of `options`; null for everyone. */
  readonly team: string | null;
  /** Levels expanded on first load; 0 shows only the roots. Several top persons always start folded. */
  readonly expandDepth: number;
  readonly showPhotos: boolean;
  readonly showPresence: boolean;
  /** Whether a person's details say where they work today, which comes with their Teams presence. */
  readonly showWorkLocation: boolean;
  /** Whether a person's details show their local time and working hours from their calendar, or Turn on where that needs consent. */
  readonly showWorkingHours: boolean;
  /** As the chart opens: the choice this browser remembers, else config.json's. */
  readonly showLevels: boolean;
  /** As the chart opens: the choice this browser remembers, else config.json's. A link to a person and a recent view come first. */
  readonly startAt: StartPosition;
}

export interface AppSettings {
  readonly chart: ChartSettings;
  /** config.json's values for what people may change themselves: what the settings dialog resets to. */
  readonly defaults: UserSettings;
  /** Older snapshots are shown immediately and then refreshed in the background. */
  readonly refreshAfterMinutes: number;
  /** The theme shown is resolveTheme(chosen, automatic), unless the host sets one (Teams). */
  readonly theme: ThemeSettings;
  /** As the chart opens: the choice this browser remembers, else the standard size. */
  readonly textSize: TextSize;
  /** The language the chart speaks is resolveLanguage(chosen, [automatic]). */
  readonly language: LanguageSettings;
  readonly branding: Branding;
  /** The embedding page's own colours, which the chart takes in each theme only where they keep its contrast. */
  readonly pageColors: PageColors;
  /** What the embedding page leaves out of the chart's page. */
  readonly without: readonly ChartPart[];
  /** Id, UPN or e-mail of the person a shared link opens the chart on. */
  readonly initialPerson: string | null;
  /** Shows the CSV export, which hands anyone who can open the chart everyone's contact details at once. */
  readonly allowExport: boolean;
  /** Offers the directory health report in Settings: who is missing what, with lists to copy addresses from and export. */
  readonly allowReports: boolean;
  /** Where the settings dialog sends people, in a new tab, to change their profile photo; null offers no link. */
  readonly changePhotoUrl: string | null;
  /** Where people get help, linked after every message that sends them to their IT support; null links nothing. */
  readonly support: SupportDesk | null;
  /** The organization's own fields that config.json names, in its order: rows in the details, and where it says so, search and export columns. */
  readonly extraFields: readonly ExtraField[];
}

/** The person's settings as the chart opens: the address's filters and team, and what this browser remembers, else config.json's. */
export function openingUserSettings(settings: AppSettings): UserSettings {
  return {
    hide: chartHideRules(settings.chart.options),
    showLevels: settings.chart.showLevels,
    language: settings.language.chosen,
    team: settings.chart.team,
    startAt: settings.chart.startAt,
    theme: settings.theme.chosen,
    textSize: settings.textSize,
  };
}
