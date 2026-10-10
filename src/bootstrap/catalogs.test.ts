import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '@/application/settings/language';

/** Every folder's strings.ts, in every layer; each catalogue in them is an export with a set of texts per language. */
const modules = import.meta.glob<Record<string, unknown>>('/src/**/strings.ts', { eager: true });

const catalogs = Object.entries(modules).flatMap(([path, exports]) =>
  Object.entries(exports)
    .filter(([, value]) => isCatalog(value))
    .map(([name, value]) => [`${path.replace('/src/', '')} ${name}`, value as Readonly<Record<string, unknown>>] as const),
);

/** Plain keyboard punctuation only: no dashes, arrows, ellipses, curly quotes or middle dots. */
const FANCY_PUNCTUATION = /[\u2013\u2014\u2026\u2018\u2019\u201c\u201d\u00b7\u2190-\u21ff]/;

describe('the text catalogues', () => {
  it('are found in the application, the presentation and the pages that open without the app', () => {
    const folders = catalogs.map(([name]) => name.split('/')[0]);

    expect(new Set(folders)).toEqual(new Set(['application', 'infrastructure', 'presentation']));
  });

  it.each(catalogs)('%s has a set of texts for every language the chart speaks, and for no other', (_name, catalog) => {
    expect(Object.keys(catalog).sort()).toEqual([...LANGUAGES].sort());
  });

  it.each(catalogs)('%s has the same texts in every language, with the same parameters', (_name, catalog) => {
    const english = shape(catalog.en);

    for (const language of LANGUAGES) expect(shape(catalog[language]), language).toEqual(english);
  });

  it.each(catalogs)('%s writes no empty text and only plain punctuation, parameterised texts included', (_name, catalog) => {
    for (const language of LANGUAGES) {
      for (const text of textsOf(catalog[language])) {
        expect(text.trim(), language).not.toBe('');
        expect(text, language).not.toMatch(FANCY_PUNCTUATION);
      }
    }
  });
});

/** Found by its English texts, the source every catalogue has, so one that lacks another language is checked all the same. */
function isCatalog(value: unknown): boolean {
  return isObject(value) && isObject(value.en);
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

/** A catalogue's keys, with each fixed text as its type and each function as the number of its parameters. */
function shape(texts: unknown): unknown {
  if (typeof texts === 'function') return `function of ${String(texts.length)}`;
  if (isObject(texts)) return Object.fromEntries(Object.entries(texts).map(([key, value]) => [key, shape(value)]));
  return typeof texts;
}

/** Every text a catalogue can give; a parameterised one as it comes out for 1 and for 2, the singular and the plural. */
function textsOf(texts: unknown): string[] {
  if (typeof texts === 'string') return [texts];
  if (typeof texts === 'function') {
    const text = texts as (...values: number[]) => unknown;
    return [1, 2].flatMap((value) => textsOf(text(...Array.from({ length: text.length }, () => value))));
  }
  return isObject(texts) ? Object.values(texts).flatMap(textsOf) : [];
}
