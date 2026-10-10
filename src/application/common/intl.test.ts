import { describe, expect, it } from 'vitest';
import { formatList, formatNumber, plural } from './intl';

describe('formatNumber', () => {
  it('groups thousands as the language does', () => {
    expect(formatNumber('en', 1234567)).toBe('1,234,567');
  });
});

describe('formatList', () => {
  it('joins the last item with the language\'s own "and" or "or"', () => {
    expect(formatList('en', ['a', 'b', 'c'], 'conjunction')).toBe('a, b, and c');
    expect(formatList('en', ['a', 'b'], 'disjunction')).toBe('a or b');
  });
});

describe('plural', () => {
  it('takes the form for exactly one, and the other form for every other count', () => {
    const forms = { one: 'person', other: 'people' };

    expect([0, 1, 2, 21].map((count) => plural('en', count, forms))).toEqual(['people', 'person', 'people', 'people']);
  });
});
