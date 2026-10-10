import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DirectorySnapshot } from '@/application/abstractions/employeeDirectory';
import type { ExtraField } from '@/application/settings/extraFields';
import type { Employee } from '@/domain/employees/employee';
import { stubBrowserLocale } from '@/testing/browserLocale';
import { directoryOf } from '@/testing/directory';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { OrgChartProvider } from '../../common/orgChartProvider';
import { SearchEmployeesHandler, SearchEmployeesQuery } from './searchEmployees';

/** `extraFields` are the organization's own fields that config.json names. */
function searchIn(employees: Employee[], extraFields: readonly ExtraField[] = []) {
  const snapshot: DirectorySnapshot = { employees, loadedAt: new Date() };
  const handler = new SearchEmployeesHandler(new OrgChartProvider(directoryOf(() => snapshot)), extraFields);
  const find = (text: string, hide = SHOW_EVERYONE) => handler.handle(new SearchEmployeesQuery({ topPersons: ['ceo'], hide }, text));
  const search = async (text: string, hide = SHOW_EVERYONE) => (await find(text, hide)).hits.map((hit) => hit.employee.displayName);
  /** The people found, each with the details the search found them by. */
  const matches = async (text: string) =>
    Object.fromEntries((await find(text)).hits.map((hit) => [hit.employee.displayName, hit.matchedFields]));
  /** The people found, each with the labels of the organization's own fields the search found them by. */
  const extraMatches = async (text: string) =>
    Object.fromEntries((await find(text)).hits.map((hit) => [hit.employee.displayName, hit.matchedExtraFields.map(({ label }) => label)]));
  /** The best `limit` names and how many match in all. */
  const best = async (text: string, limit: number) => {
    const { hits, total } = await handler.handle(new SearchEmployeesQuery({ topPersons: ['ceo'], hide: SHOW_EVERYONE }, text, limit));
    return { names: hits.map((hit) => hit.employee.displayName), total };
  };
  return { search, matches, extraMatches, best };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SearchEmployeesHandler', () => {
  const employees = [
    makeEmployee('ceo', null, { displayName: 'Ingrid Solberg' }),
    makeEmployee('d1', 'ceo', { displayName: 'Daniel Müller', businessPhone: '+47 912 34 567' }),
    makeEmployee('d2', 'ceo', { displayName: 'Anne-Marie Dahl', mobilePhone: '+47 400 00 001', jobTitle: 'CFO' }),
    makeEmployee('d3', 'd2', { displayName: 'Muller Hansen', mail: 'mh@contoso.com' }),
    makeEmployee('g1', 'ceo', { displayName: 'Mulligan Guest', isGuest: true }),
    makeEmployee('n1', 'ceo', { displayName: 'Jørgen Øverland' }),
    makeEmployee('n2', 'ceo', { displayName: 'Ægir Strauß' }),
    makeEmployee('p1', 'ceo', {
      displayName: 'Petra Novak',
      companyName: 'Contoso Česko',
      officeLocation: 'Building 7',
      city: 'Brno',
      country: 'Czechia',
      mail: 'petra.novak@contoso.cz',
      userPrincipalName: 'pnovak@contoso.com',
    }),
  ];
  const { search, matches } = searchIn(employees);

  it('ignores case and accents and ranks name starts above word starts', async () => {
    expect(await search('MULLER')).toEqual(['Muller Hansen', 'Daniel Müller']);
  });

  it('matches letters that have no accent to strip by how people type them', async () => {
    expect(await search('jorgen overland')).toEqual(['Jørgen Øverland']);
    expect(await search('aegir strauss')).toEqual(['Ægir Strauß']);
  });

  it('matches word starts after hyphens and requires every token', async () => {
    expect(await search('marie')).toEqual(['Anne-Marie Dahl']);
    expect(await search('daniel dahl')).toEqual([]);
  });

  it('matches work and mobile numbers by digits', async () => {
    expect(await search('91234')).toEqual(['Daniel Müller']);
    expect(await search('+47912')).toEqual(['Daniel Müller']);
    expect(await search('40000001')).toEqual(['Anne-Marie Dahl']);
  });

  it('matches a number typed in groups, as cards show it', async () => {
    expect(await search('+47 912 34 567')).toEqual(['Daniel Müller']);
    expect(await search('912 34 567')).toEqual(['Daniel Müller']);
    expect(await search('+47.400.00.001')).toEqual(['Anne-Marie Dahl']);
  });

  it('matches a number typed the way it is dialled, which the directory\'s international form lacks', async () => {
    expect(await search('0047 912 34 567')).toEqual(['Daniel Müller']);
    expect(await search('0912 34 567')).toEqual(['Daniel Müller']);
    expect(await search('(0)400 00 001')).toEqual(['Anne-Marie Dahl']);
  });

  it('takes no two digits for a phone number, which half the directory would match', async () => {
    expect(await search('47')).toEqual([]);
    expect(await search('479')).toEqual(['Daniel Müller']);
  });

  it('matches job title and department', async () => {
    expect(await search('cfo')).toEqual(['Anne-Marie Dahl']);
    expect(await search('engineering hansen')).toEqual(['Muller Hansen']);
  });

  it('works as a phone book: company, office, city, country and both addresses find a person', async () => {
    for (const text of ['cesko', 'building 7', 'BRNO', 'czechia', 'petra.novak@contoso.cz', 'pnovak']) {
      expect(await search(text), text).toEqual(['Petra Novak']);
    }
  });

  it('says which details it found a person by, and none for what the name matched', async () => {
    expect(await matches('brno')).toEqual({ 'Petra Novak': ['city'] });
    // In the order of the details, not of the words typed.
    expect(await matches('czechia building contoso.cz')).toEqual({ 'Petra Novak': ['officeLocation', 'country', 'mail'] });
    expect(await matches('petra 7')).toEqual({ 'Petra Novak': ['officeLocation'] });
    expect(await matches('91234')).toEqual({ 'Daniel Müller': ['businessPhone'] });
    expect(await matches('novak')).toEqual({ 'Petra Novak': [] });
  });

  it("lists equally good hits in the browser's own order of names, as the chart has them", async () => {
    const vangs = [
      makeEmployee('ceo', null, { displayName: 'Ingrid Solberg' }),
      makeEmployee('zara', 'ceo', { displayName: 'Zara Vang' }),
      makeEmployee('ase', 'ceo', { displayName: 'Åse Vang' }),
    ];
    const inBrowser = async (browserLocale: string) => {
      stubBrowserLocale(browserLocale);
      return searchIn(vangs).search('vang');
    };

    // A Norwegian browser puts Å after Z; an English one sorts it as A.
    expect(await inBrowser('nb')).toEqual(['Zara Vang', 'Åse Vang']);
    expect(await inBrowser('en')).toEqual(['Åse Vang', 'Zara Vang']);
  });

  it('finds only people visible under the current hide rules', async () => {
    expect(await search('mull')).toContain('Mulligan Guest');
    expect(await search('mull', { ...SHOW_EVERYONE, guests: true })).not.toContain('Mulligan Guest');
  });

  it('finds nobody by the details of someone the address list hides while its rule is on, nor names them as anyone\'s manager', async () => {
    const hiding = { ...SHOW_EVERYONE, hiddenFromAddressList: true };
    const directory = [
      makeEmployee('ceo', null, { displayName: 'Ingrid Solberg' }),
      makeEmployee('audit', 'ceo', { displayName: 'Hanne Hidden', jobTitle: 'Head of Internal Audit', hiddenFromAddressList: true }),
      makeEmployee('auditor', 'audit', { displayName: 'Ida Auditor', jobTitle: 'Internal Auditor' }),
    ];
    const { search: searchHidden } = searchIn(directory);
    const handler = new SearchEmployeesHandler(new OrgChartProvider(directoryOf(() => ({ employees: directory, loadedAt: new Date() }))));

    expect(await searchHidden('hanne', hiding)).toEqual([]);
    expect(await searchHidden('internal audit', hiding)).toEqual(['Ida Auditor']);
    expect(await searchHidden('hanne')).toEqual(['Hanne Hidden']);
    const { hits: [hit] } = await handler.handle(new SearchEmployeesQuery({ topPersons: ['ceo'], hide: hiding }, 'ida'));
    expect([hit?.path, hit?.managerName]).toEqual([['ceo', 'audit'], null]);
  });

  it('returns the path needed to reveal a hit and the manager name', async () => {
    const snapshot = { employees, loadedAt: new Date() };
    const handler = new SearchEmployeesHandler(
      new OrgChartProvider(directoryOf(() => snapshot)),
    );

    const { hits: [hit] } = await handler.handle(new SearchEmployeesQuery({ topPersons: ['ceo'], hide: SHOW_EVERYONE }, 'hansen'));

    expect(hit?.path).toEqual(['ceo', 'd2']);
    expect(hit?.managerName).toBe('Anne-Marie Dahl');
  });

  describe('with the organization\'s own fields', () => {
    const COST_CENTRE: ExtraField = { property: 'employeeOrgData.costCenter', label: 'Cost centre', search: true, export: false };
    const EMPLOYEE_TYPE: ExtraField = { property: 'employeeType', label: 'Employee type', search: false, export: true };
    const BADGE: ExtraField = { property: 'onPremisesExtensionAttributes.extensionAttribute3', label: 'Badge', search: true, export: false };
    const { search, matches, extraMatches } = searchIn(
      [
        makeEmployee('ceo', null, { displayName: 'Ingrid Solberg' }),
        makeEmployee('d1', 'ceo', {
          displayName: 'Daniel Müller',
          businessPhone: '+47 912 34 567',
          extra: { 'employeeOrgData.costCenter': 'CC-4170 Nørd', employeeType: 'Contractor' },
        }),
        makeEmployee('d2', 'ceo', { displayName: 'Anne-Marie Dahl', extra: { 'onPremisesExtensionAttributes.extensionAttribute3': 'B-4170' } }),
      ],
      [COST_CENTRE, EMPLOYEE_TYPE, BADGE],
    );

    it('finds people by those config.json lets search look in, case and accents aside, and by no other', async () => {
      expect(await search('cc-4170 nord')).toEqual(['Daniel Müller']);
      expect(await search('b-4170')).toEqual(['Anne-Marie Dahl']);
      expect(await search('contractor')).toEqual([]);
    });

    it('says which of them it found a person by, apart from the details of every directory', async () => {
      expect(await extraMatches('4170')).toEqual({ 'Anne-Marie Dahl': ['Badge'], 'Daniel Müller': ['Cost centre'] });
      expect(await matches('912 nord')).toEqual({ 'Daniel Müller': ['businessPhone'] });
      expect(await extraMatches('912 nord')).toEqual({ 'Daniel Müller': ['Cost centre'] });
      expect(await extraMatches('daniel')).toEqual({ 'Daniel Müller': [] });
    });
  });

  describe('beyond the limit', () => {
    /** Thirty people named "Lee", in an order that is not the order of their names, and two whose names only contain it. */
    const lees = [
      makeEmployee('ceo', null, { displayName: 'Ingrid Solberg' }),
      ...Array.from({ length: 30 }, (_, index) =>
        makeEmployee(`lee${String(index)}`, 'ceo', { displayName: `Lee ${String((index * 7) % 30).padStart(2, '0')}` }),
      ),
      makeEmployee('k1', 'ceo', { displayName: 'Ashlee Kim' }),
      makeEmployee('k2', 'ceo', { displayName: 'Bo Kleeman' }),
    ];
    const { best: bestOf } = searchIn(lees);

    it('counts every person who matches, however few it returns', async () => {
      expect((await bestOf('lee', 3)).total).toBe(32);
      expect((await bestOf('lee', 50)).total).toBe(32);
      expect(await bestOf('nobody', 3)).toEqual({ names: [], total: 0 });
    });

    it('keeps the best matches within the limit, in the order a longer list has them', async () => {
      const all = (await bestOf('lee', 50)).names;

      expect(all.slice(0, 3)).toEqual(['Lee 00', 'Lee 01', 'Lee 02']);
      expect(all.slice(-2)).toEqual(['Ashlee Kim', 'Bo Kleeman']);
      expect((await bestOf('lee', 3)).names).toEqual(all.slice(0, 3));
      expect((await bestOf('lee', 31)).names).toEqual(all.slice(0, 31));
    });
  });
});
