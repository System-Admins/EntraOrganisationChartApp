import { MAX_EXPAND_DEPTH, THEME_PREFERENCES, type AppSettings } from '@/application/settings/appSettings';
import { PAGE_COLOR_KEYS, type PageColors } from '@/application/settings/branding';
import { CHART_PARTS } from '@/application/settings/chartParts';
import { LANGUAGE_PREFERENCES, resolveLanguage, type Language } from '@/application/settings/language';
import { HIDE_CATEGORIES, type HideCategory, type HideRules } from '@/domain/orgChart/hideRules';
import { withHideRules } from '@/domain/orgChart/orgChart';
import { splitList } from '@/domain/text/splitList';
import { ConfigError, parseCssColor, parseInteger, parseOneOf } from './configReader';

/** Per-embedding overrides: ?top= ?depth= ?theme= ?lang= ?person= ?without= ?background= ?accent=, and ?show= ?hide= ?team= as the chart writes them. */
export function applyUrlOverrides(settings: AppSettings, search: string, languages: readonly string[]): AppSettings {
  const params = new URLSearchParams(search);
  const topPersons = splitList(params.get('top') ?? '');
  const team = params.get('team')?.trim();
  const depth = params.get('depth');
  const theme = params.get('theme');
  const language = params.get('lang');
  const person = params.get('person')?.trim();
  const show = parseNames(params.get('show'), HIDE_CATEGORIES, '?show');
  const hide = parseNames(params.get('hide'), HIDE_CATEGORIES, '?hide');
  const contradiction = show.find((category) => hide.includes(category));
  if (contradiction) throw new ConfigError(`?show and ?hide both name "${contradiction}".`);
  const configured = settings.chart.options;
  const options = withHideRules(configured, { ...configured.hide, ...switched(show, false), ...switched(hide, true) });

  return {
    ...settings,
    chart: {
      ...settings.chart,
      // An embedding with its own top persons shows only their teams. A blank ?top= keeps the configured chart.
      options: topPersons.length === 0 ? options : withHideRules({ topPersons, hide: options.hide, within: options }, options.hide),
      // Apart from the options, which are what Show everyone goes back to.
      team: team || settings.chart.team,
      expandDepth: depth === null ? settings.chart.expandDepth : parseInteger(depth, 0, MAX_EXPAND_DEPTH, '?depth'),
    },
    // What Automatic stands for on this page: a theme the person chose in Settings still wins.
    theme: theme === null ? settings.theme : { ...settings.theme, automatic: parseOneOf(theme, THEME_PREFERENCES, '?theme', false) },
    language: language === null ? settings.language : { ...settings.language, automatic: pageLanguage(language, languages) },
    pageColors: parsePageColors(params),
    without: parseNames(params.get('without'), CHART_PARTS, '?without'),
    initialPerson: person || settings.initialPerson,
  };
}

/** The ?show= and ?hide= values that turn `defaults` into `hide`; null where nothing is switched. */
export function hideRuleParameters(defaults: HideRules, hide: HideRules): Readonly<Record<'show' | 'hide', string | null>> {
  const switchedTo = (hidden: boolean) =>
    HIDE_CATEGORIES.filter((category) => hide[category] === hidden && defaults[category] !== hidden).join(',') || null;
  return { show: switchedTo(false), hide: switchedTo(true) };
}

/** What Automatic stands for on this page. The person's own choice in Settings still wins; tags ignore letter case (BCP 47). */
function pageLanguage(value: string, languages: readonly string[]): Language {
  return resolveLanguage(parseOneOf(value.toLowerCase(), LANGUAGE_PREFERENCES, '?lang', false), languages);
}

/** Names as config.json and README.md spell them, in any letter case: these are also typed into an address bar by hand. */
function parseNames<T extends string>(value: string | null, allowed: readonly T[], label: string): T[] {
  const names = splitList(value ?? '').map(
    (item) => allowed.find((name) => name.toLowerCase() === item.toLowerCase()) ?? parseOneOf(item, allowed, label, false),
  );
  return [...new Set(names)];
}

/** Hex digits may come without the #, which an address carries only encoded. */
function parsePageColors(params: URLSearchParams): PageColors {
  const colors: Partial<Record<keyof PageColors, string>> = {};
  for (const key of PAGE_COLOR_KEYS) {
    const value = params.get(key)?.trim();
    if (value) colors[key] = parseCssColor(/^[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value) ? `#${value}` : value, `?${key}`, false);
  }
  return colors;
}

function switched(categories: readonly HideCategory[], hidden: boolean): Partial<Record<HideCategory, boolean>> {
  return Object.fromEntries(categories.map((category) => [category, hidden]));
}
