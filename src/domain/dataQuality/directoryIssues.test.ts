import { describe, expect, it } from 'vitest';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import type { Employee } from '../employees/employee';
import { buildOrgChart } from '../orgChart/buildOrgChart';
import type { HideRules } from '../orgChart/hideRules';
import { chartHideRules, narrowTo, type OrgChartOptions } from '../orgChart/orgChart';
import { directoryIssues, ISSUES, reportScope, type Issue } from './directoryIssues';

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

/** Someone whose entry lacks nothing the report looks for. */
const complete = (id: string, managerId: string | null, overrides: Partial<Employee> = {}) =>
  makeEmployee(id, managerId, { officeLocation: 'Oslo HQ', businessPhone: '+47 22 00 00 00', ...overrides });

/** What the report finds for the chart that `options` set up, as its handler asks: over the chart that reportScope sets up. */
function issuesIn(directory: readonly Employee[], options: OrgChartOptions, photos: ReadonlyMap<string, boolean> = new Map()) {
  const scope = buildOrgChart(directory, reportScope(options));
  return directoryIssues(directory, scope, chartHideRules(options), photos);
}

const idsOf = (people: readonly Employee[]) => people.map(({ id }) => id);

describe('directoryIssues', () => {
  it('finds the people without a manager, whose manager is disabled or missing, and the disabled accounts that still manage people', () => {
    const directory = [
      complete('ceo', null),
      complete('former', 'ceo', { accountEnabled: false }),
      complete('analyst', 'former'),
      complete('orphan', 'deleted'),
      complete('stray', null),
      // Disabled with nobody but a disabled account below: nobody it manages is a person.
      complete('closed', 'ceo', { accountEnabled: false }),
      complete('archive', 'closed', { accountEnabled: false }),
    ];

    const { people } = issuesIn(directory, { topPersons: ['ceo'], hide: DEFAULT_RULES });

    expect(idsOf(people.noManager)).toEqual(['stray']);
    expect(idsOf(people.managerGone)).toEqual(['analyst', 'orphan']);
    expect(idsOf(people.disabledManager)).toEqual(['former']);
  });

  it('finds every member of a circular manager chain, whichever of them the filters hide, but not the people below it', () => {
    const directory = [
      complete('ceo', null),
      complete('loopA', 'loopB'),
      complete('loopB', 'loopC'),
      complete('loopC', 'loopA', { isGuest: true }),
      complete('member', 'loopB'),
    ];

    const { people } = issuesIn(directory, { topPersons: ['ceo'], hide: DEFAULT_RULES });

    // The guest is in the loop, but the filters don't count guests as people.
    expect(idsOf(people.managerCycle)).toEqual(['loopA', 'loopB']);
  });

  it('lists what entries lack, the photo only where the photo check said there is none', () => {
    const directory = [
      complete('ceo', null),
      complete('anna', 'ceo', { jobTitle: ' ', department: null }),
      complete('erik', 'ceo', { officeLocation: null, mail: null }),
      complete('ola', 'ceo', { businessPhone: null }),
      complete('nora', 'ceo', { businessPhone: null, mobilePhone: '+47 400 00 000' }),
    ];
    const photos = new Map([
      ['ceo', true],
      ['anna', false],
    ]);

    const { people } = issuesIn(directory, { topPersons: ['ceo'], hide: DEFAULT_RULES }, photos);

    expect(idsOf(people.jobTitle)).toEqual(['anna']);
    expect(idsOf(people.department)).toEqual(['anna']);
    expect(idsOf(people.officeLocation)).toEqual(['erik']);
    expect(idsOf(people.mail)).toEqual(['erik']);
    // A mobile is a phone too.
    expect(idsOf(people.phone)).toEqual(['ola']);
    // Erik, Ola and Nora have no answer yet, which is no missing photo.
    expect(idsOf(people.photo)).toEqual(['anna']);
  });

  it('checks the accounts the filters count as people, and never leaves out anyone for lacking a job title', () => {
    const directory = [
      complete('ceo', null),
      complete('guest', 'ceo', { isGuest: true, officeLocation: null }),
      complete('room', null, { accountEnabled: false, isLicensed: false, jobTitle: null, department: null }),
      complete('untitled', 'ceo', { jobTitle: null }),
    ];
    const hidingUntitled = { ...DEFAULT_RULES, withoutJobTitle: true };

    const hiding = issuesIn(directory, { topPersons: ['ceo'], hide: hidingUntitled });
    expect(idsOf(hiding.checked).sort()).toEqual(['ceo', 'untitled']);
    expect(idsOf(hiding.people.jobTitle)).toEqual(['untitled']);
    expect(hiding.people.officeLocation).toEqual([]);

    const showingGuests = issuesIn(directory, { topPersons: ['ceo'], hide: { ...hidingUntitled, guests: false } });
    expect(idsOf(showingGuests.checked).sort()).toEqual(['ceo', 'guest', 'untitled']);
    expect(idsOf(showingGuests.people.officeLocation)).toEqual(['guest']);
  });

  it('names nobody the address list hides while its rule is on, a top person or a disabled manager included, and checks them while it is off', () => {
    const directory = [
      complete('ceo', null, { hiddenFromAddressList: true, officeLocation: null }),
      complete('former', 'ceo', { accountEnabled: false, hiddenFromAddressList: true }),
      complete('analyst', 'former'),
      complete('advisor', 'ceo', { hiddenFromAddressList: true, jobTitle: null }),
    ];

    const hiding = issuesIn(directory, { topPersons: ['ceo'], hide: DEFAULT_RULES });
    expect(idsOf(hiding.checked)).toEqual(['analyst']);
    expect(Object.values(hiding.people).flat().map(({ id }) => id)).toEqual(['analyst']);
    // The analyst's manager is still a disabled account, which the report words without a name.
    expect(hiding.issuesOf.get('analyst')).toEqual(['managerGone']);

    const showing = issuesIn(directory, { topPersons: ['ceo'], hide: { ...DEFAULT_RULES, hiddenFromAddressList: false } });
    expect(idsOf(showing.checked).sort()).toEqual(['advisor', 'analyst', 'ceo']);
    expect(idsOf(showing.people.disabledManager)).toEqual(['former']);
    expect(idsOf(showing.people.officeLocation)).toEqual(['ceo']);
  });

  it('checks a top person whatever account rule would hide them, as the chart shows them', () => {
    const directory = [complete('ceo', null, { isLicensed: false, officeLocation: null }), complete('dev', 'ceo')];

    const { checked, people } = issuesIn(directory, { topPersons: ['ceo'], hide: DEFAULT_RULES });

    expect(idsOf(checked).sort()).toEqual(['ceo', 'dev']);
    expect(idsOf(people.officeLocation)).toEqual(['ceo']);
  });

  it('counts no top person as without a manager, nor, without top persons, anyone at the top who heads a team', () => {
    const directory = [complete('ceo', null), complete('dev', 'ceo'), complete('chair', null)];

    expect(idsOf(issuesIn(directory, { topPersons: ['ceo'], hide: DEFAULT_RULES }).people.noManager)).toEqual(['chair']);
    expect(idsOf(issuesIn(directory, { topPersons: [], hide: DEFAULT_RULES }).people.noManager)).toEqual(['chair']);
    // With top persons, someone without a manager heads a flagged branch, team or not.
    const withTeam = [...directory, complete('aide', 'chair')];
    expect(idsOf(issuesIn(withTeam, { topPersons: ['ceo'], hide: DEFAULT_RULES }).people.noManager)).toEqual(['chair']);
    expect(issuesIn(withTeam, { topPersons: [], hide: DEFAULT_RULES }).people.noManager).toEqual([]);
  });

  it('finds a department spelled several ways, and lists those who spell it otherwise than most, with the usual spelling', () => {
    const directory = [
      complete('ceo', null, { department: 'Management' }),
      complete('anna', 'ceo', { department: 'Retail Marketing' }),
      complete('erik', 'ceo', { department: 'Retail Marketing' }),
      complete('ola', 'ceo', { department: 'retail marketing' }),
      complete('nora', 'ceo', { department: 'Retail-Marketing ' }),
      complete('ida', 'ceo', { department: 'Økonomi' }),
      complete('mats', 'ceo', { department: 'Okonomi' }),
      // Spelled the same, a trailing space aside, and a department of punctuation alone.
      complete('lars', 'ceo', { department: 'Management ' }),
      complete('liv', 'ceo', { department: '-' }),
    ];

    const { people, usualSpellings } = issuesIn(directory, { topPersons: ['ceo'], hide: DEFAULT_RULES });

    expect(idsOf(people.departmentSpelling)).toEqual(['ida', 'nora', 'ola']);
    expect(usualSpellings.get('ola')).toBe('Retail Marketing');
    expect(usualSpellings.get('nora')).toBe('Retail Marketing');
    // As many use each: the first in code point order is taken as the usual one, the same on every load.
    expect(usualSpellings.get('ida')).toBe('Okonomi');
    expect(usualSpellings.has('mats')).toBe(false);
  });

  it('covers only the people of the teams a narrowed chart shows, as the chart has them', () => {
    const directory = [
      complete('ceo', null),
      complete('lead', 'ceo'),
      complete('dev', 'lead', { officeLocation: null }),
      complete('aide', 'ceo', { officeLocation: null }),
      complete('stray', null),
    ];
    const everyone: OrgChartOptions = { topPersons: ['ceo'], hide: DEFAULT_RULES };

    const { checked, people } = issuesIn(directory, narrowTo(everyone, 'lead'));

    expect(idsOf(checked).sort()).toEqual(['dev', 'lead']);
    expect(idsOf(people.officeLocation)).toEqual(['dev']);
    expect(people.noManager).toEqual([]);
  });

  it('gives each person their issues in the report\'s order, and lists each issue\'s people by name', () => {
    const directory = [
      complete('ceo', null),
      complete('zoe', 'gone', { displayName: 'Zoe', jobTitle: null, officeLocation: null }),
      complete('ada', 'gone', { displayName: 'Ada' }),
    ];

    const { people, issuesOf } = issuesIn(directory, { topPersons: ['ceo'], hide: DEFAULT_RULES }, new Map([['zoe', false]]));

    expect(issuesOf.get('zoe')).toEqual(['managerGone', 'jobTitle', 'officeLocation', 'photo'] satisfies Issue[]);
    expect(issuesOf.has('ceo')).toBe(false);
    expect(idsOf(people.managerGone)).toEqual(['ada', 'zoe']);
    expect(Object.keys(people)).toEqual([...ISSUES]);
  });

  it('counts, by manager, the people checked whom the directory names them the manager of', () => {
    const directory = [
      complete('ceo', null),
      complete('former', 'ceo', { accountEnabled: false }),
      complete('analyst', 'former'),
      complete('guest', 'former', { isGuest: true }),
    ];

    const { reportCounts } = issuesIn(directory, { topPersons: ['ceo'], hide: DEFAULT_RULES });

    // The disabled director isn't counted as a person, and the guest isn't one of the director's people.
    expect([...reportCounts]).toEqual([['former', 1]]);
  });

  describe('departments in an odd place', () => {
    const options: OrgChartOptions = { topPersons: ['ceo'], hide: DEFAULT_RULES };
    const inDepartment = (id: string, managerId: string | null, department: string, overrides: Partial<Employee> = {}) =>
      complete(id, managerId, { department, ...overrides });

    it('finds the people of a department that comes again below itself, with its path', () => {
      const directory = [inDepartment('ceo', null, 'Management'), inDepartment('head', 'ceo', 'Strategy'), inDepartment('aide', 'head', 'Management')];

      const { people, departmentPlaces } = issuesIn(directory, options);

      expect(idsOf(people.departmentInItself)).toEqual(['aide']);
      expect(departmentPlaces.get('aide')).toEqual({ path: ['Management', 'Strategy', 'Management'], main: null });
      expect(people.departmentElsewhere).toEqual([]);
    });

    it('finds the people of a small place of a department that most of its people are elsewhere from, with where that is', () => {
      const directory = [
        inDepartment('ceo', null, 'Management'),
        inDepartment('head', 'ceo', 'Strategy'),
        inDepartment('lead', 'head', 'Sales'),
        inDepartment('rep', 'lead', 'Sales'),
        inDepartment('seller', 'ceo', 'Sales'),
      ];

      const { people, departmentPlaces } = issuesIn(directory, options);

      expect(idsOf(people.departmentElsewhere)).toEqual(['seller']);
      expect(departmentPlaces.get('seller')).toEqual({ path: ['Management', 'Sales'], main: { parent: 'Strategy', people: 2 } });
    });

    it('leaves out a second place too large, or with departments below it, to be a stray: more likely a department of its own', () => {
      const directory = [
        inDepartment('ceo', null, 'Management'),
        inDepartment('retail', 'ceo', 'Retail'),
        ...['r1', 'r2', 'r3', 'r4', 'r5'].map((id) => inDepartment(id, 'retail', 'Finance')),
        inDepartment('energy', 'ceo', 'Energy'),
        ...['e1', 'e2', 'e3', 'e4'].map((id) => inDepartment(id, 'energy', 'Finance')),
        inDepartment('digital', 'ceo', 'Digital'),
        inDepartment('d1', 'digital', 'Finance'),
        inDepartment('d2', 'd1', 'Payroll'),
      ];

      expect(issuesIn(directory, options).people.departmentElsewhere).toEqual([]);
    });

    it('takes the place highest up as the main one of places as large, and the first in the outline of places as high up', () => {
      const directory = [
        inDepartment('ceo', null, 'Management'),
        inDepartment('alpha', 'ceo', 'Alpha'),
        inDepartment('a1', 'alpha', 'Sales'),
        inDepartment('beta', 'ceo', 'Beta'),
        inDepartment('b1', 'beta', 'Sales'),
        inDepartment('high', 'ceo', 'Support'),
        inDepartment('deep', 'beta', 'Support'),
      ];

      const { people } = issuesIn(directory, options);

      expect(idsOf(people.departmentElsewhere)).toEqual(['b1', 'deep']);
    });

    it('leaves the places of flagged branches to the issues about managers, and counts only the people checked', () => {
      const directory = [
        inDepartment('ceo', null, 'Management'),
        inDepartment('head', 'ceo', 'Strategy'),
        inDepartment('lead', 'ceo', 'Sales'),
        inDepartment('rep', 'lead', 'Sales'),
        inDepartment('loner', null, 'Sales'),
        inDepartment('gone', 'head', 'Sales', { accountEnabled: false }),
      ];

      const { people } = issuesIn(directory, options);

      expect(people.departmentElsewhere).toEqual([]);
      expect(idsOf(people.noManager)).toEqual(['loner']);
    });
  });
});
