import { describe, expect, it } from 'vitest';
import { makeEmployee } from '@/testing/makeEmployee';
import { canIdentify, resolveEmployees } from './resolveEmployees';

describe('canIdentify', () => {
  it('takes an e-mail address or UPN, and an object id in either letter case', () => {
    expect(canIdentify('anna@contoso.com')).toBe(true);
    expect(canIdentify(' anna.lund@contoso.onmicrosoft.com ')).toBe(true);
    expect(canIdentify('00000000-0000-4000-8000-00000000003A')).toBe(true);
  });

  it('refuses a name, an address cut short and anything with spaces, which no one in the directory is found by', () => {
    expect(canIdentify('Anna Lund')).toBe(false);
    expect(canIdentify('anna@contoso')).toBe(false);
    expect(canIdentify('anna lund@contoso.com')).toBe(false);
    expect(canIdentify('00000000-0000-4000-8000')).toBe(false);
  });
});

describe('resolveEmployees', () => {
  it('finds people by object id, UPN or mail in any letter case, once each, and lists the rest as unresolved', () => {
    const anna = makeEmployee('anna', null, { userPrincipalName: 'anna.lund@contoso.onmicrosoft.com' });

    const resolved = resolveEmployees([anna], ['ANNA@contoso.com', 'anna', 'anna.lund@contoso.onmicrosoft.com', 'Anna Lund']);

    expect(resolved.found).toEqual([anna]);
    expect(resolved.unresolved).toEqual(['Anna Lund']);
  });
});
