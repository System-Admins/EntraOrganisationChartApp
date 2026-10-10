import { describe, expect, it } from 'vitest';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { hiddenBecause, HIDE_CATEGORIES, isHiddenByAttributes, isUnlisted, tidyingOff, type HideRules } from './hideRules';

/** Every mix of the four attributes, each under every mix of the four rules about them: 256 cases. */
const cases = Array.from({ length: 256 }, (_, bits) => {
  const set = (bit: number) => (bits & (1 << bit)) !== 0;
  const employee = makeEmployee('a', null, {
    accountEnabled: !set(0),
    isGuest: set(1),
    isLicensed: !set(2),
    jobTitle: set(3) ? null : 'Engineer',
  });
  const rules: HideRules = { ...SHOW_EVERYONE, disabledAccounts: set(4), guests: set(5), unlicensed: set(6), withoutJobTitle: set(7) };
  return { employee, rules };
});

describe('hiddenBecause', () => {
  it('names the first rule, in the order Settings lists them, that hides the person', () => {
    for (const { employee, rules } of cases) {
      const expected =
        rules.disabledAccounts && !employee.accountEnabled
          ? 'disabledAccounts'
          : rules.guests && employee.isGuest
            ? 'guests'
            : rules.unlicensed && !employee.isLicensed
              ? 'unlicensed'
              : rules.withoutJobTitle && employee.jobTitle === null
                ? 'withoutJobTitle'
                : null;

      expect(hiddenBecause(employee, rules), JSON.stringify({ employee, rules })).toBe(expected);
    }
  });

  it('agrees with isHiddenByAttributes, which hides exactly the people that the rules always hid', () => {
    for (const { employee, rules } of cases) {
      const hidden =
        (rules.disabledAccounts && !employee.accountEnabled) ||
        (rules.guests && employee.isGuest) ||
        (rules.unlicensed && !employee.isLicensed) ||
        (rules.withoutJobTitle && !employee.jobTitle?.trim());

      expect(isHiddenByAttributes(employee, rules)).toBe(hidden);
      expect(hiddenBecause(employee, rules) !== null).toBe(hidden);
    }
  });

  it('takes a blank job title for none, and leaves the rules about a person\'s place in the chart to buildOrgChart', () => {
    const placeRules: HideRules = { ...SHOW_EVERYONE, withoutManager: true, withHiddenManager: true, inManagerCycle: true, unattached: true };

    expect(hiddenBecause(makeEmployee('a', null, { jobTitle: '  ' }), { ...SHOW_EVERYONE, withoutJobTitle: true })).toBe('withoutJobTitle');
    expect(hiddenBecause(makeEmployee('a', null, { jobTitle: null }), placeRules)).toBeNull();
  });
});

describe('isUnlisted', () => {
  it('keeps unnamed only someone the address list hides, and only while its rule is on, which hides nobody by attributes', () => {
    const hiding: HideRules = { ...SHOW_EVERYONE, hiddenFromAddressList: true };
    const hidden = makeEmployee('a', null, { hiddenFromAddressList: true });

    expect(isUnlisted(hidden, hiding)).toBe(true);
    expect(isUnlisted(hidden, SHOW_EVERYONE)).toBe(false);
    expect(isUnlisted(makeEmployee('b'), hiding)).toBe(false);
    expect(isHiddenByAttributes(hidden, hiding)).toBe(false);
  });
});

describe('tidyingOff', () => {
  it('switches every rule off but the address list\'s, which it keeps as it is', () => {
    const every = Object.fromEntries(HIDE_CATEGORIES.map((category) => [category, true])) as Record<keyof HideRules, boolean>;

    expect(tidyingOff(every)).toEqual({ ...SHOW_EVERYONE, hiddenFromAddressList: true });
    expect(tidyingOff({ ...every, hiddenFromAddressList: false })).toEqual(SHOW_EVERYONE);
  });
});
