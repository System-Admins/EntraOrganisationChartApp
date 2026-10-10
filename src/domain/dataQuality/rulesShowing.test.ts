import { describe, expect, it } from 'vitest';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { buildOrgChart } from '../orgChart/buildOrgChart';
import type { HideRules } from '../orgChart/hideRules';
import { narrowTo, withHideRules, type OrgChartOptions } from '../orgChart/orgChart';
import { rulesShowing } from './rulesShowing';

/** The rules config.json starts from when it sets none. */
const DEFAULT_RULES: HideRules = {
  ...SHOW_EVERYONE,
  withoutManager: true,
  withHiddenManager: true,
  inManagerCycle: true,
  disabledAccounts: true,
  guests: true,
  unlicensed: true,
  hiddenFromAddressList: true,
};

const COMPANY = [
  makeEmployee('ceo'),
  makeEmployee('former', 'ceo', { accountEnabled: false, isLicensed: false }),
  makeEmployee('analyst', 'former'),
  makeEmployee('stray'),
  makeEmployee('aide', 'stray'),
  makeEmployee('loopA', 'loopB'),
  makeEmployee('loopB', 'loopA'),
  makeEmployee('dev', 'ceo'),
];

const OPTIONS: OrgChartOptions = { topPersons: ['ceo'], hide: DEFAULT_RULES };

describe('rulesShowing', () => {
  it('switches nothing off for someone the chart shows', () => {
    expect(rulesShowing(COMPANY, OPTIONS, 'dev')).toEqual(DEFAULT_RULES);
  });

  it('switches off the rule over the branch someone heads, or sits in', () => {
    expect(rulesShowing(COMPANY, OPTIONS, 'stray')).toEqual({ ...DEFAULT_RULES, withoutManager: false });
    expect(rulesShowing(COMPANY, OPTIONS, 'aide')).toEqual({ ...DEFAULT_RULES, withoutManager: false });
    expect(rulesShowing(COMPANY, OPTIONS, 'loopA')).toEqual({ ...DEFAULT_RULES, inManagerCycle: false });
  });

  it('shows the report of a disabled manager flagged, rather than with every disabled account', () => {
    const rules = rulesShowing(COMPANY, OPTIONS, 'analyst');

    expect(rules).toEqual({ ...DEFAULT_RULES, withHiddenManager: false });
    expect(buildOrgChart(COMPANY, withHideRules(OPTIONS, rules ?? DEFAULT_RULES)).nodes.get('analyst')?.flag).toBe('managerNotShown');
  });

  it('switches off every account rule that hides someone, not only the first', () => {
    expect(rulesShowing(COMPANY, OPTIONS, 'former')).toEqual({ ...DEFAULT_RULES, disabledAccounts: false, unlicensed: false });
  });

  it('also lets in the people outside the top persons\' teams where the chart keeps to them', () => {
    const keeping: OrgChartOptions = { topPersons: ['ceo'], hide: { ...DEFAULT_RULES, unattached: true } };

    expect(rulesShowing(COMPANY, keeping, 'aide')).toEqual({ ...DEFAULT_RULES, withoutManager: false });
  });

  it('changes the rules of the chart a team narrows, which keeps to the team, and finds none outside it', () => {
    const team = narrowTo(withHideRules(OPTIONS, { ...DEFAULT_RULES, withoutJobTitle: true }), 'ceo');
    const untitled = [...COMPANY, makeEmployee('intern', 'ceo', { jobTitle: null })];

    expect(rulesShowing(untitled, team, 'intern')).toEqual(DEFAULT_RULES);
    expect(rulesShowing(untitled, team, 'stray')).toBeNull();
  });

  it('never switches the address list\'s rule off, which keeps people private rather than tidying the chart', () => {
    const hiddenHead = [...COMPANY, makeEmployee('auditHead', 'ceo', { hiddenFromAddressList: true }), makeEmployee('auditor', 'auditHead')];

    expect(rulesShowing(hiddenHead, OPTIONS, 'auditHead')).toBeNull();
    expect(rulesShowing(hiddenHead, OPTIONS, 'auditor')).toEqual(DEFAULT_RULES);
    // Off already, it lets the head show by name like anyone else.
    const showing: OrgChartOptions = { ...OPTIONS, hide: { ...DEFAULT_RULES, hiddenFromAddressList: false } };
    expect(rulesShowing(hiddenHead, showing, 'auditHead')).toEqual(showing.hide);
  });

  it('finds no rules for someone who is not in the directory at all', () => {
    expect(rulesShowing(COMPANY, OPTIONS, 'gone')).toBeNull();
  });
});
