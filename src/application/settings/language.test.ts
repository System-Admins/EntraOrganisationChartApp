import { describe, expect, it } from 'vitest';
import { defineStrings, LANGUAGES, resolveLanguage } from './language';

describe('resolveLanguage', () => {
  it('keeps a language that was chosen, whatever the candidates say', () => {
    expect(resolveLanguage('en', ['de-DE'])).toBe('en');
  });

  it('otherwise takes the first candidate in a language the chart speaks', () => {
    expect(resolveLanguage('auto', ['de-DE', 'en-GB', 'fr'])).toBe('en');
  });

  it.each(['en', 'en-GB', 'EN-us', 'en_US', ' en '])('reads %j as English, whatever its region, letter case or separator', (tag) => {
    expect(resolveLanguage('auto', [tag])).toBe('en');
  });

  it('falls back to English where no candidate is a language the chart speaks', () => {
    expect(resolveLanguage('auto', [])).toBe('en');
    expect(resolveLanguage('auto', ['de', 'sv-SE', '', 'constructor'])).toBe('en');
  });
});

describe('defineStrings', () => {
  it('keeps one set of texts per language, and type-checking refuses a language the chart does not speak', () => {
    const catalog = defineStrings({
      en: { hello: 'Hello', people: (count: number) => `${String(count)} people` },
    });

    expect(Object.keys(catalog)).toEqual([...LANGUAGES]);
    expect(catalog.en.people(2)).toBe('2 people');
    // @ts-expect-error -- texts in a language the chart does not speak
    defineStrings({ en: { hello: 'Hello' }, xx: { hello: 'Hallo' } });
    // @ts-expect-error -- English is the source, which no catalogue leaves out
    defineStrings({});
  });
});
