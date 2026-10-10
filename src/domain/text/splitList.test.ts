import { describe, expect, it } from 'vitest';
import { splitList } from './splitList';

describe('splitList', () => {
  it('splits at commas and semicolons, the separators of Outlook and of most address fields', () => {
    expect(splitList('anna@contoso.com, erik@contoso.com;bo@contoso.com')).toEqual([
      'anna@contoso.com',
      'erik@contoso.com',
      'bo@contoso.com',
    ]);
  });

  it('trims each item and drops the blank ones that stray separators leave', () => {
    expect(splitList(' anna@contoso.com ,, ; ')).toEqual(['anna@contoso.com']);
    expect(splitList('')).toEqual([]);
  });
});
