import { describe, expect, it } from 'vitest';
import type { DirectorySnapshot } from '@/application/abstractions/employeeDirectory';
import type { Employee } from '@/domain/employees/employee';
import type { HideRules } from '@/domain/orgChart/hideRules';
import type { OrgChartOptions } from '@/domain/orgChart/orgChart';
import { directoryOf } from '@/testing/directory';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { OrgChartProvider } from '../../common/orgChartProvider';
import { GetDirectoryHealthHandler, GetDirectoryHealthQuery } from './getDirectoryHealth';
import { PhotoAnswers } from './photoAnswers';

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

const complete = (id: string, managerId: string | null, overrides: Partial<Employee> = {}) =>
  makeEmployee(id, managerId, { officeLocation: 'Oslo HQ', businessPhone: '+47 22 00 00 00', ...overrides });

const COMPANY = [
  complete('ceo', null),
  complete('former', 'ceo', { displayName: 'Former Director', accountEnabled: false }),
  complete('analyst', 'former', { officeLocation: null }),
  complete('stray', null, { department: 'Engineering ' }),
  complete('dev', 'ceo', { department: 'engineering' }),
];

const OPTIONS: OrgChartOptions = { topPersons: ['ceo'], hide: DEFAULT_RULES };

function handlerFor(employees: readonly Employee[], photos = new PhotoAnswers()) {
  let snapshot: DirectorySnapshot = { employees, loadedAt: new Date(2026, 9, 1, 8, 30) };
  const provider = new OrgChartProvider(directoryOf(() => snapshot));
  const handler = new GetDirectoryHealthHandler(provider, photos);
  const refresh = (refreshed: readonly Employee[]) => {
    snapshot = { employees: refreshed, loadedAt: new Date(2026, 9, 1, 9, 30) };
  };
  return { health: (options = OPTIONS) => handler.handle(new GetDirectoryHealthQuery(options)), provider, refresh };
}

describe('GetDirectoryHealthHandler', () => {
  it('lists the people with each issue, with their manager, their issues, their spelling and their reports beside them', async () => {
    const { health } = handlerFor(COMPANY);

    const { loadedAt, checkedIds, people } = await health();

    expect(loadedAt).toEqual(new Date(2026, 9, 1, 8, 30));
    expect([...checkedIds].sort()).toEqual(['analyst', 'ceo', 'dev', 'stray']);
    const [analyst] = people.managerGone;
    expect(analyst?.employee.id).toBe('analyst');
    expect(analyst?.manager?.displayName).toBe('Former Director');
    expect(analyst?.issues).toEqual(['managerGone', 'officeLocation']);
    expect(analyst?.hasPhoto).toBeUndefined();
    // One object per person, whichever lists they are in.
    expect(people.officeLocation[0]).toBe(analyst);
    expect(people.disabledManager.map(({ employee, reports }) => [employee.id, reports])).toEqual([['former', 1]]);
    expect(people.departmentSpelling.map(({ employee, usualSpelling }) => [employee.id, usualSpelling])).toEqual([
      ['dev', 'Engineering'],
    ]);
    expect(people.noManager.map(({ employee, manager }) => [employee.id, manager])).toEqual([['stray', null]]);
  });

  it('names no manager the address list hides while its rule is on, but says there is one, and names them while it is off', async () => {
    const company = COMPANY.map((employee) => (employee.id === 'former' ? { ...employee, hiddenFromAddressList: true } : employee));
    const { health } = handlerFor(company);

    const [hiding] = (await health()).people.managerGone;
    const [showing] = (await health({ ...OPTIONS, hide: { ...DEFAULT_RULES, hiddenFromAddressList: false } })).people.managerGone;

    expect([hiding?.employee.id, hiding?.manager, hiding?.managerUnlisted]).toEqual(['analyst', null, true]);
    expect([showing?.manager?.displayName, showing?.managerUnlisted]).toEqual(['Former Director', false]);
    expect((await health()).people.disabledManager).toEqual([]);
  });

  it('builds the chart it checks from the snapshot, leaving the page\'s chart in the provider as it was', async () => {
    const { health, provider } = handlerFor(COMPANY);
    const { chart } = await provider.get(OPTIONS);

    const { people } = await health();

    // The page's chart hides the people without a manager; the report finds them all the same.
    expect(chart.nodes.has('stray')).toBe(false);
    expect(people.noManager.map(({ employee }) => employee.id)).toEqual(['stray']);
    expect((await provider.get(OPTIONS)).chart).toBe(chart);
  });

  it('says how many of the people checked have an answer about their photo, and lists those without one', async () => {
    const photos = new PhotoAnswers();
    photos.keep(
      new Map([
        ['ceo', true],
        ['dev', false],
        ['former', false],
      ]),
    );
    const { health } = handlerFor(COMPANY, photos);

    const { photosAnswered, people } = await health();

    // The disabled director isn't checked, so their answer doesn't count.
    expect(photosAnswered).toBe(2);
    expect(people.photo.map(({ employee, hasPhoto }) => [employee.id, hasPhoto])).toEqual([['dev', false]]);
  });

  it('checks the directory as it is after a refresh', async () => {
    const { health, refresh } = handlerFor(COMPANY);
    expect((await health()).people.noManager).toHaveLength(1);

    refresh([...COMPANY, complete('chair', null)]);

    const { loadedAt, people } = await health();
    expect(loadedAt).toEqual(new Date(2026, 9, 1, 9, 30));
    expect(people.noManager.map(({ employee }) => employee.id)).toEqual(['chair', 'stray']);
  });
});
