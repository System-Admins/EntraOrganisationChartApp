import { describe, expect, it } from 'vitest';
import { mostUsedSpellings, nameKey } from './nameKey';

describe('nameKey', () => {
  it('keeps the letters and digits of a name as people type them', () => {
    expect(nameKey('Retail-Marketing')).toBe('retailmarketing');
    expect(nameKey(' retail  marketing ')).toBe('retailmarketing');
    expect(nameKey('Økonomi')).toBe('okonomi');
    expect(nameKey('Strategy M&A')).toBe('strategyma');
    expect(nameKey('IT 2')).toBe('it2');
  });

  it('finds no name in nothing, in spaces or in punctuation alone', () => {
    expect(nameKey(null)).toBe('');
    expect(nameKey('   ')).toBe('');
    expect(nameKey('-')).toBe('');
  });
});

describe('mostUsedSpellings', () => {
  it('names each key by the spelling most used for it, trimmed', () => {
    const spellings = mostUsedSpellings(['Energy Facilities', 'energy facilities', ' Energy Facilities ', 'Sales', null, '-']);

    expect(spellings).toEqual(
      new Map([
        ['energyfacilities', 'Energy Facilities'],
        ['sales', 'Sales'],
      ]),
    );
  });

  it('takes the first in code point order of spellings used as often, the same on every load', () => {
    expect(mostUsedSpellings(['Økonomi', 'Okonomi']).get('okonomi')).toBe('Okonomi');
    expect(mostUsedSpellings(['retail marketing', 'Retail Marketing']).get('retailmarketing')).toBe('Retail Marketing');
  });
});
