import { describe, expect, it } from 'vitest';
import type { HideRules } from '@/domain/orgChart/hideRules';
import type { OrgChartOptions } from '@/domain/orgChart/orgChart';
import { directoryOf } from '@/testing/directory';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { OrgChartProvider } from '../../common/orgChartProvider';
import { GetRulesShowingHandler, GetRulesShowingQuery } from './getRulesShowing';

const RULES: HideRules = { ...SHOW_EVERYONE, withoutManager: true, disabledAccounts: true };
const OPTIONS: OrgChartOptions = { topPersons: ['ceo'], hide: RULES };
const EMPLOYEES = [makeEmployee('ceo'), makeEmployee('dev', 'ceo'), makeEmployee('stray'), makeEmployee('former', 'ceo', { accountEnabled: false })];

function rulesShowing(employeeId: string, employees = EMPLOYEES, options = OPTIONS) {
  const snapshot = { employees, loadedAt: new Date(2026, 9, 1) };
  return new GetRulesShowingHandler(new OrgChartProvider(directoryOf(() => snapshot))).handle(new GetRulesShowingQuery(options, employeeId));
}

describe('GetRulesShowingHandler', () => {
  it('keeps the rules for someone the page\'s chart shows', async () => {
    expect(await rulesShowing('dev')).toBe(RULES);
  });

  it('switches off the rules that hide someone, and only those', async () => {
    expect(await rulesShowing('stray')).toEqual({ ...RULES, withoutManager: false });
    expect(await rulesShowing('former')).toEqual({ ...RULES, disabledAccounts: false });
  });

  it('finds no rules that show someone the address list keeps unnamed, whose place the chart holds or not', async () => {
    const hidden = [
      ...EMPLOYEES,
      makeEmployee('auditHead', 'ceo', { hiddenFromAddressList: true }),
      makeEmployee('auditor', 'auditHead'),
      makeEmployee('advisor', 'ceo', { hiddenFromAddressList: true }),
    ];
    const hiding: OrgChartOptions = { ...OPTIONS, hide: { ...RULES, hiddenFromAddressList: true } };

    expect(await rulesShowing('auditHead', hidden, hiding)).toBeNull();
    expect(await rulesShowing('advisor', hidden, hiding)).toBeNull();
    expect(await rulesShowing('auditor', hidden, hiding)).toBe(hiding.hide);
  });

  it('finds no rules for someone who has left the directory since the report was made', async () => {
    expect(await rulesShowing('gone')).toBeNull();
  });
});
