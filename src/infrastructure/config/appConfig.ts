import {
  MAX_EXPAND_DEPTH,
  MICROSOFT_ACCOUNT_URL,
  START_POSITIONS,
  THEME_PREFERENCES,
  type AppSettings,
  type SupportDesk,
} from '@/application/settings/appSettings';
import { BRAND_COLOR_KEYS, type BrandColors, type BrandColorKey } from '@/application/settings/branding';
import { EXTRA_FIELD_PROPERTIES, type ExtraField } from '@/application/settings/extraFields';
import { LANGUAGE_PREFERENCES, resolveLanguage } from '@/application/settings/language';
import { HIDE_CATEGORIES, type HideCategory, type HideRules } from '@/domain/orgChart/hideRules';
import { ConfigError, ConfigSection, parseCssColor } from './configReader';
import { parseAllowedSites } from './embedding';
import type { StoredUserSettings } from './storageUserSettingsStore';
import { applyUrlOverrides } from './urlOverrides';

export const DATA_SOURCES = ['graph', 'demo'] as const;

export type DataSource = (typeof DATA_SOURCES)[number];

export interface AuthConfig {
  readonly tenantId: string;
  readonly clientId: string;
}

export const EMAIL_CLIENTS = ['mailto', 'outlookWeb'] as const;

/** mailto opens the user's default mail app; outlookWeb opens a compose window in Outlook on the web. */
export type EmailClient = (typeof EMAIL_CLIENTS)[number];

export const CSV_SEPARATORS = [',', ';'] as const;

/** Excel splits CSV on the Windows list separator, which is ';' where the decimal separator is a comma. */
export type CsvSeparator = (typeof CSV_SEPARATORS)[number];

interface CommonConfig {
  readonly cacheInBrowser: boolean;
  readonly emailClient: EmailClient;
  readonly csvSeparator: CsvSeparator;
  readonly settings: AppSettings;
}

export type AppConfig =
  | (CommonConfig & { readonly dataSource: 'graph'; readonly auth: AuthConfig })
  | (CommonConfig & { readonly dataSource: 'demo'; readonly auth: null });

const DEFAULT_HIDE: HideRules = {
  withoutManager: true,
  withHiddenManager: true,
  inManagerCycle: true,
  disabledAccounts: true,
  guests: true,
  unlicensed: true,
  withoutJobTitle: false,
  hiddenFromAddressList: true,
  unattached: false,
};

/** config.json as it stands; parseAppConfig reads it once the host's language is known too. */
export async function fetchAppConfig(): Promise<unknown> {
  const response = await fetch('/config.json', { cache: 'no-cache' });
  if (!response.ok) throw new ConfigError(`Could not load config.json (HTTP ${response.status}).`);
  try {
    const json: unknown = await response.json();
    return json;
  } catch {
    throw new ConfigError('config.json is not valid JSON.');
  }
}

/** `stored` is what this browser remembers of the person's settings, which wins; `languages` are the host's and browser's tags. */
export function parseAppConfig(
  json: unknown,
  search: string,
  stored: StoredUserSettings = {},
  languages: readonly string[] = [],
): AppConfig {
  const root = ConfigSection.root(json);
  root.assertKnownKeys([
    'dataSource',
    'auth',
    'chart',
    'directory',
    'contact',
    'account',
    'support',
    'export',
    'reports',
    'embedding',
    'theme',
    'language',
    'branding',
  ]);
  const dataSource = root.oneOf('dataSource', DATA_SOURCES, 'graph');
  const chart = root.section('chart');
  chart.assertKnownKeys([
    'topPersons',
    'hide',
    'expandDepth',
    'showPhotos',
    'showPresence',
    'showWorkLocation',
    'showWorkingHours',
    'showLevels',
    'startAt',
  ]);
  const directory = root.section('directory');
  directory.assertKnownKeys(['cacheInBrowser', 'refreshAfterMinutes', 'extraFields']);
  const contact = root.section('contact');
  contact.assertKnownKeys(['emailClient']);
  const account = root.section('account');
  account.assertKnownKeys(['changePhotoUrl']);
  const exporting = root.section('export');
  exporting.assertKnownKeys(['enabled', 'csvSeparator']);
  const reports = root.section('reports');
  reports.assertKnownKeys(['enabled']);
  const embedding = root.section('embedding');
  embedding.assertKnownKeys(['allowedSites']);
  // Used by the build (the CSP header); checked here too, so a mistake shows on screen.
  parseAllowedSites(embedding.raw('allowedSites'), embedding.pathOf('allowedSites'));
  const auth = root.section('auth');
  auth.assertKnownKeys(['tenantId', 'clientId']);

  const hide = parseHideRules(chart.section('hide'));
  const showLevels = chart.boolean('showLevels', false);
  const startAt = chart.oneOf('startAt', START_POSITIONS, 'top');
  const changePhotoUrl = parseChangePhotoUrl(account);
  const settings: AppSettings = {
    // Someone who made no choice of language or theme has Automatic, which config.json's feeds.
    defaults: { hide, showLevels, language: 'auto', team: null, startAt, theme: 'auto', textSize: 'standard' },
    chart: {
      options: {
        topPersons: chart.stringArray('topPersons'),
        hide,
      },
      team: null,
      expandDepth: chart.integer('expandDepth', 1, 0, MAX_EXPAND_DEPTH),
      showPhotos: chart.boolean('showPhotos', true),
      showPresence: chart.boolean('showPresence', true),
      showWorkLocation: chart.boolean('showWorkLocation', true),
      showWorkingHours: chart.boolean('showWorkingHours', true),
      showLevels: stored.showLevels ?? showLevels,
      startAt: stored.startAt ?? startAt,
    },
    refreshAfterMinutes: directory.integer('refreshAfterMinutes', 60, 0, 60 * 24 * 7),
    theme: { chosen: stored.theme ?? 'auto', automatic: root.oneOf('theme', THEME_PREFERENCES, 'auto') },
    textSize: stored.textSize ?? 'standard',
    language: {
      chosen: stored.language ?? 'auto',
      automatic: resolveLanguage(root.oneOf('language', LANGUAGE_PREFERENCES, 'auto'), languages),
    },
    branding: parseBranding(root.section('branding')),
    pageColors: {},
    without: [],
    initialPerson: null,
    allowExport: exporting.boolean('enabled', true),
    allowReports: reports.boolean('enabled', true),
    // The demo's people have no Microsoft account whose photo could change; the address is checked all the same.
    changePhotoUrl: dataSource === 'demo' ? null : changePhotoUrl,
    support: parseSupportDesk(root.section('support')),
    extraFields: parseExtraFields(directory),
  };

  const common: CommonConfig = {
    cacheInBrowser: directory.boolean('cacheInBrowser', true),
    emailClient: contact.oneOf('emailClient', EMAIL_CLIENTS, 'mailto'),
    csvSeparator: exporting.oneOf('csvSeparator', CSV_SEPARATORS, ','),
    settings: applyUrlOverrides(settings, search, languages),
  };
  return dataSource === 'graph'
    ? { ...common, dataSource, auth: parseAuth(auth) }
    : { ...common, dataSource, auth: null };
}

function parseAuth(auth: ConfigSection): AuthConfig {
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const read = (key: string): string => {
    const value = auth.optionalString(key);
    if (!value || !guid.test(value) || /^[0-]+$/.test(value)) {
      throw new ConfigError(`${auth.pathOf(key)} must be the GUID from your Entra ID app registration.`);
    }
    return value;
  };
  return { tenantId: read('tenantId'), clientId: read('clientId') };
}

/** Microsoft's page unless config.json names another; an empty value there means no link at all. */
function parseChangePhotoUrl(account: ConfigSection): string | null {
  const key = 'changePhotoUrl';
  const value = account.optionalString(key);
  if (value === null) return account.keys().includes(key) ? null : MICROSOFT_ACCOUNT_URL;
  // It becomes a link's address, where anything but a web address (javascript:, say) must never arrive.
  if (!/^https:\/\/[^\s/]+/i.test(value)) {
    throw new ConfigError(`${account.pathOf(key)} must be an https:// address, or "" to offer no link (got "${value}").`);
  }
  return value;
}

/** For the error screen: config.json can be wrong elsewhere and still name its support desk. */
export function supportDeskIn(json: unknown): SupportDesk | null {
  try {
    return parseSupportDesk(ConfigSection.root(json).section('support'));
  } catch {
    return null;
  }
}

/** No desk unless config.json names one; an empty address links nothing. */
function parseSupportDesk(support: ConfigSection): SupportDesk | null {
  support.assertKnownKeys(['label', 'url']);
  const label = support.optionalString('label');
  const url = support.optionalString('url');
  if (url === null) {
    if (label !== null) throw new ConfigError(`${support.pathOf('label')} needs ${support.pathOf('url')}, the address it links to.`);
    return null;
  }
  // It becomes a link's address, where anything but a web page or a mail address (javascript:, say) must never arrive.
  if (!/^(?:https:\/\/[^\s/]+|mailto:[^\s@]+@[^\s@]+)/i.test(url)) {
    throw new ConfigError(`${support.pathOf('url')} must be an https:// or mailto: address, or "" to link nothing (got "${url}").`);
  }
  return { label, url };
}

/** Each property at most once, under a label of its own, which also heads its column and names it in the search's description. */
function parseExtraFields(directory: ConfigSection): ExtraField[] {
  const fields: ExtraField[] = [];
  for (const entry of directory.sections('extraFields')) {
    entry.assertKnownKeys(['property', 'label', 'search', 'export']);
    const value = entry.optionalString('property');
    const property = EXTRA_FIELD_PROPERTIES.find((allowed) => allowed === value);
    if (property === undefined) {
      const got = value === null ? '' : ` (got "${value}")`;
      throw new ConfigError(`${entry.pathOf('property')} must be one of: ${describeExtraFieldProperties()}${got}.`);
    }
    const label = entry.optionalString('label');
    if (label === null) throw new ConfigError(`${entry.pathOf('label')} must name the field for people, for example "Cost centre".`);
    if (fields.some((field) => field.property === property)) {
      throw new ConfigError(`${entry.pathOf('property')} names "${property}" a second time; list each property once.`);
    }
    // Two rows, or two columns, of the same name could not be told apart.
    if (fields.some((field) => field.label.toLowerCase() === label.toLowerCase())) {
      throw new ConfigError(`${entry.pathOf('label')} "${label}" is another field's label too; give each field a label of its own.`);
    }
    fields.push({ property, label, search: entry.boolean('search', false), export: entry.boolean('export', false) });
  }
  return fields;
}

/** The properties as an administrator reads them on the error screen: a numbered run, such as the 15 extension attributes, as its first to its last. */
function describeExtraFieldProperties(): string {
  const runs = new Map<string, { readonly first: string; last: string }>();
  for (const property of EXTRA_FIELD_PROPERTIES) {
    const stem = property.replace(/\d+$/, '');
    const run = runs.get(stem);
    if (run) run.last = property;
    else runs.set(stem, { first: property, last: property });
  }
  return [...runs.values()].map(({ first, last }) => (first === last ? `"${first}"` : `"${first}" to "${last}"`)).join(', ');
}

function parseHideRules(hide: ConfigSection): HideRules {
  hide.assertKnownKeys(HIDE_CATEGORIES);
  return Object.fromEntries(
    HIDE_CATEGORIES.map((category) => [category, hide.boolean(category, DEFAULT_HIDE[category])]),
  ) as Record<HideCategory, boolean>;
}

function parseBranding(branding: ConfigSection): AppSettings['branding'] {
  branding.assertKnownKeys(['title', 'logoUrl', 'logoUrlDark', 'logoAlt', 'faviconUrl', 'fontFamily', 'colors', 'darkColors']);
  return {
    title: branding.optionalString('title') ?? (branding.keys().includes('title') ? '' : null),
    logoUrl: branding.optionalString('logoUrl'),
    logoUrlDark: branding.optionalString('logoUrlDark'),
    logoAlt: branding.optionalString('logoAlt'),
    faviconUrl: branding.optionalString('faviconUrl'),
    fontFamily: branding.optionalString('fontFamily'),
    colors: parseColors(branding.section('colors')),
    darkColors: parseColors(branding.section('darkColors')),
  };
}

function parseColors(colors: ConfigSection): BrandColors {
  colors.assertKnownKeys(BRAND_COLOR_KEYS);
  const result: Partial<Record<BrandColorKey, string>> = {};
  for (const key of BRAND_COLOR_KEYS) {
    const value = colors.optionalString(key);
    if (value) result[key] = parseCssColor(value, colors.pathOf(key));
  }
  return result;
}
