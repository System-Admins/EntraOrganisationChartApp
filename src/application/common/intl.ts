import type { Language } from '../settings/language';

/** One formatter per language and kind: making one costs more than using it many times. */
const numberFormats = new Map<string, Intl.NumberFormat>();
const listFormats = new Map<string, Intl.ListFormat>();
const pluralRules = new Map<string, Intl.PluralRules>();

/** Thousands grouped as the language groups them: 1,234 in English. */
export function formatNumber(language: Language, value: number): string {
  return cached(numberFormats, language, () => new Intl.NumberFormat(language)).format(value);
}

/** "a, b, and c", or "a, b, or c" as a disjunction, the way the language lists things. */
export function formatList(language: Language, items: readonly string[], type: 'conjunction' | 'disjunction'): string {
  return cached(listFormats, `${language} ${type}`, () => new Intl.ListFormat(language, { style: 'long', type })).format(items);
}

/** The form of a word for `count` things: English has one form for exactly one and another for the rest. */
export function plural(language: Language, count: number, forms: { readonly one: string; readonly other: string }): string {
  return cached(pluralRules, language, () => new Intl.PluralRules(language)).select(count) === 'one' ? forms.one : forms.other;
}

function cached<T>(cache: Map<string, T>, key: string, make: () => T): T {
  const found = cache.get(key);
  if (found !== undefined) return found;
  const made = make();
  cache.set(key, made);
  return made;
}
