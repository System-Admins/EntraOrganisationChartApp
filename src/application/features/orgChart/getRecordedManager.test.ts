import { describe, expect, it } from 'vitest';
import type { DirectorySnapshot } from '@/application/abstractions/employeeDirectory';
import type { Employee } from '@/domain/employees/employee';
import type { HideRules } from '@/domain/orgChart/hideRules';
import type { OrgChartOptions } from '@/domain/orgChart/orgChart';
import { directoryOf } from '@/testing/directory';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { OrgChartProvider } from '../../common/orgChartProvider';
import { GetRecordedManagerHandler, GetRecordedManagerQuery } from './getRecordedManager';

function handlerFor(employees: readonly Employee[]) {
  const snapshot: DirectorySnapshot = { employees, loadedAt: new Date(2026, 8, 30) };
  const provider = new OrgChartProvider(directoryOf(() => snapshot));
  const handler = new GetRecordedManagerHandler(provider);
  return (options: OrgChartOptions, employeeId: string) => handler.handle(new GetRecordedManagerQuery(options, employeeId));
}

describe('GetRecordedManagerHandler', () => {
  const former = makeEmployee('former', 'ceo', { accountEnabled: false });
  const employees = [
    makeEmployee('ceo'),
    former,
    makeEmployee('analyst', 'former'),
    makeEmployee('consultant', 'ceo', { isGuest: true }),
    makeEmployee('assistant', 'consultant'),
    makeEmployee('service', 'ceo', { isLicensed: false }),
    makeEmployee('operator', 'service'),
    makeEmployee('untitled', 'ceo', { jobTitle: null }),
    makeEmployee('helper', 'untitled'),
    makeEmployee('contractor', 'deleted'),
    makeEmployee('dev', 'ceo'),
  ];
  const ask = handlerFor(employees);
  const hideAll: HideRules = { ...SHOW_EVERYONE, disabledAccounts: true, guests: true, unlicensed: true, withoutJobTitle: true };
  const options: OrgChartOptions = { topPersons: ['ceo'], hide: hideAll };

  it('names the manager with the hide rule that leaves them out', async () => {
    expect(await ask(options, 'analyst')).toEqual({ manager: former, reason: 'disabledAccounts' });
    expect((await ask(options, 'assistant'))?.reason).toBe('guests');
    expect((await ask(options, 'operator'))?.reason).toBe('unlicensed');
    expect((await ask(options, 'helper'))?.reason).toBe('withoutJobTitle');
  });

  it('names the first rule that hides the manager, as Settings lists them', async () => {
    // A disabled guest is hidden as a disabled account first.
    const guest = makeEmployee('guest', 'ceo', { accountEnabled: false, isGuest: true });
    const askGuest = handlerFor([makeEmployee('ceo'), guest, makeEmployee('report', 'guest')]);

    expect(await askGuest(options, 'report')).toEqual({ manager: guest, reason: 'disabledAccounts' });
    expect(await askGuest({ ...options, hide: { ...hideAll, disabledAccounts: false } }, 'report')).toEqual({ manager: guest, reason: 'guests' });
  });

  it('names no manager the address list hides while its rule is on, giving that rule whatever else hides them', async () => {
    const hidden = makeEmployee('hidden', 'ceo', { accountEnabled: false, hiddenFromAddressList: true });
    const askHidden = handlerFor([makeEmployee('ceo'), hidden, makeEmployee('report', 'hidden')]);

    expect(await askHidden({ ...options, hide: { ...hideAll, hiddenFromAddressList: true } }, 'report')).toEqual({
      manager: null,
      reason: 'hiddenFromAddressList',
    });
    expect(await askHidden(options, 'report')).toEqual({ manager: hidden, reason: 'disabledAccounts' });
    // Shown in their place, nameless, the manager needs no explaining.
    expect(await askHidden({ ...options, hide: { ...SHOW_EVERYONE, hiddenFromAddressList: true } }, 'report')).toBeNull();
  });

  it('says so where no user in the directory has the recorded id: deleted, or not a user', async () => {
    expect(await ask(options, 'contractor')).toEqual({ manager: null, reason: 'notInDirectory' });
  });

  it('names a manager whom no rule hides but who is outside the chart that ?top= narrows', async () => {
    // The configured chart hides the board, which has no manager, and shows the CEO as its top person.
    const board = makeEmployee('board');
    const askNarrowed = handlerFor([board, makeEmployee('ceo', 'board'), makeEmployee('dev', 'ceo')]);
    const configured: OrgChartOptions = { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, withoutManager: true } };
    // Nobody the link names is found, so the configured chart's people show, the CEO flagged "Manager not shown".
    const narrowed: OrgChartOptions = { topPersons: ['nobody'], hide: { ...configured.hide, unattached: true }, within: configured };

    expect(await askNarrowed(narrowed, 'ceo')).toEqual({ manager: board, reason: 'notInChart' });
  });

  it('has nothing to explain where the chart shows the manager, there is none, or the person is not in the chart', async () => {
    expect(await ask(options, 'dev')).toBeNull();
    expect(await ask(options, 'ceo')).toBeNull();
    expect(await ask(options, 'former')).toBeNull();
  });
});
