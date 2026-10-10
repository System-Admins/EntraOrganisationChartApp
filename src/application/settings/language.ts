/** The languages the chart speaks: English alone for now, which every text is written in first and which is also the last resort. */
export const LANGUAGES = ['en'] as const;

export type Language = (typeof LANGUAGES)[number];

/** 'auto' leaves the language to what comes after: the page, then the host and the browser. */
export const LANGUAGE_PREFERENCES = ['auto', ...LANGUAGES] as const;

export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

export interface LanguageSettings {
  /** As the chart opens: the choice in Settings > Display that this browser remembers, else 'auto'. */
  readonly chosen: LanguagePreference;
  /** What 'auto' stands for: ?lang=, else config.json's language, else the host's (Teams) or the browser's, else English. */
  readonly automatic: Language;
}

/** Each language by its own primary subtag; one that other subtags should stand for too (such as its macrolanguage's) adds them here. */
const LANGUAGE_OF_TAG = new Map<string, Language>(LANGUAGES.map((language) => [language, language]));

/** The preference unless it is 'auto', else the language of the first candidate tag (such as "en-GB") that the chart speaks. */
export function resolveLanguage(preference: LanguagePreference, candidates: readonly string[]): Language {
  if (preference !== 'auto') return preference;
  for (const candidate of candidates) {
    // Tags ignore letter case (BCP 47); some systems write the region after an underscore.
    const language = LANGUAGE_OF_TAG.get(candidate.trim().toLowerCase().split(/[-_]/)[0] ?? '');
    if (language) return language;
  }
  return 'en';
}

/** Texts in every language the chart speaks; see defineStrings. */
export type Catalog<T> = Readonly<Record<Language, T>>;

/** English is the source: every other language must have exactly its keys, each the same kind of text, or type-checking fails. */
export function defineStrings<T extends Readonly<Record<string, unknown>>>(
  catalog: { readonly en: T } & { readonly [Other in Exclude<Language, 'en'>]: NoInfer<T> },
): Catalog<T> {
  return catalog;
}
