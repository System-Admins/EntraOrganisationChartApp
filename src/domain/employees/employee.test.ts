import { describe, expect, it } from 'vitest';
import { makeEmployee } from '@/testing/makeEmployee';
import { accountStateOf, missingDetailsOf } from './employee';

describe('accountStateOf', () => {
  it('says nothing about an enabled, licensed member', () => {
    expect(accountStateOf(makeEmployee('a'))).toBeNull();
  });

  it('puts a disabled account first, whatever else applies', () => {
    expect(accountStateOf(makeEmployee('a', null, { accountEnabled: false, isGuest: true, isLicensed: false }))).toBe('disabled');
  });

  it('calls a guest a guest, never unlicensed, as their license is their own organization\'s', () => {
    expect(accountStateOf(makeEmployee('a', null, { isGuest: true, isLicensed: false }))).toBe('guest');
    expect(accountStateOf(makeEmployee('a', null, { isGuest: true }))).toBe('guest');
  });

  it('marks a member without any license', () => {
    expect(accountStateOf(makeEmployee('a', null, { isLicensed: false }))).toBe('unlicensed');
  });
});

describe('missingDetailsOf', () => {
  it('lists every empty detail in a fixed order, a blank one included', () => {
    const bare = makeEmployee('a', null, { jobTitle: '  ', department: null, mail: null });

    expect(missingDetailsOf(bare, false)).toEqual(['jobTitle', 'department', 'officeLocation', 'mail', 'phone', 'photo']);
  });

  it('counts the phone as missing only where there is neither a work phone nor a mobile', () => {
    const withOffice = { officeLocation: 'Oslo HQ' };

    expect(missingDetailsOf(makeEmployee('a', null, { ...withOffice, mobilePhone: '+47 400 00 000' }), true)).toEqual([]);
    expect(missingDetailsOf(makeEmployee('a', null, { ...withOffice, businessPhone: '+47 22 00 00 00' }), true)).toEqual([]);
    expect(missingDetailsOf(makeEmployee('a', null, withOffice), true)).toEqual(['phone']);
  });

  it('counts the photo as missing only where the photo source said so, not where it gave no answer', () => {
    const complete = makeEmployee('a', null, { officeLocation: 'Oslo HQ', mobilePhone: '+47 400 00 000' });

    expect(missingDetailsOf(complete, false)).toEqual(['photo']);
    expect(missingDetailsOf(complete, undefined)).toEqual([]);
  });
});
