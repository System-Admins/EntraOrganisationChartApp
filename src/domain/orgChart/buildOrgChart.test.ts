import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubBrowserLocale } from '@/testing/browserLocale';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import type { Employee } from '../employees/employee';
import { buildOrgChart } from './buildOrgChart';
import { ancestorIds, getNode, narrowTo, type OrgChart } from './orgChart';

const childNames = (chart: OrgChart, id: string) =>
  getNode(chart, id).childIds.map((childId) => getNode(chart, childId).employee.displayName);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildOrgChart', () => {
  it('places top persons side by side in configured order, matched by mail, UPN or id', () => {
    const employees = [makeEmployee('bob'), makeEmployee('alice'), makeEmployee('carol')];

    const chart = buildOrgChart(employees, {
      topPersons: ['CAROL@contoso.com', 'alice', 'carol@contoso.com'],
      hide: SHOW_EVERYONE,
    });

    expect(chart.rootIds.slice(0, 2)).toEqual(['carol', 'alice']);
    expect(chart.unresolvedTopPersons).toEqual([]);
  });

  it('keeps a top person as a root even when another top person is their manager', () => {
    const employees = [makeEmployee('ceo1'), makeEmployee('ceo2', 'ceo1'), makeEmployee('dev', 'ceo2')];

    const chart = buildOrgChart(employees, { topPersons: ['ceo1', 'ceo2'], hide: SHOW_EVERYONE });

    expect(chart.rootIds).toEqual(['ceo1', 'ceo2']);
    expect(getNode(chart, 'ceo1').childIds).toEqual([]);
    expect(getNode(chart, 'dev').parentId).toBe('ceo2');
  });

  it('reports top persons that cannot be found', () => {
    const chart = buildOrgChart([makeEmployee('alice')], { topPersons: ['nobody@contoso.com'], hide: SHOW_EVERYONE });

    expect(chart.unresolvedTopPersons).toEqual(['nobody@contoso.com']);
  });

  it('applies attribute rules but never hides top persons', () => {
    const employees = [
      makeEmployee('ceo', null, { isLicensed: false, jobTitle: null }),
      makeEmployee('guest', 'ceo', { isGuest: true }),
      makeEmployee('disabled', 'ceo', { accountEnabled: false }),
      makeEmployee('unlicensed', 'ceo', { isLicensed: false }),
      makeEmployee('untitled', 'ceo', { jobTitle: '  ' }),
      makeEmployee('dev', 'ceo'),
    ];
    const hideAll = { ...SHOW_EVERYONE, guests: true, disabledAccounts: true, unlicensed: true, withoutJobTitle: true };

    const chart = buildOrgChart(employees, { topPersons: ['ceo'], hide: hideAll });

    expect([...chart.nodes.keys()].sort()).toEqual(['ceo', 'dev']);
  });

  it('flags people without a manager, with their teams, while that rule is off', () => {
    const employees = [makeEmployee('ceo'), makeEmployee('researchHead'), makeEmployee('researcher', 'researchHead')];

    const chart = buildOrgChart(employees, { topPersons: ['ceo'], hide: SHOW_EVERYONE });

    expect(chart.rootIds).toEqual(['ceo', 'researchHead']);
    expect(getNode(chart, 'researchHead').flag).toBe('noManager');
    expect(getNode(chart, 'researcher').parentId).toBe('researchHead');
    expect(getNode(chart, 'ceo').flag).toBeNull();
  });

  it('hides people without a manager together with everyone below them', () => {
    const employees = [
      makeEmployee('ceo'),
      makeEmployee('serviceAccount'),
      makeEmployee('researchHead'),
      makeEmployee('researcher', 'researchHead'),
      makeEmployee('assistant', 'researcher'),
    ];

    const chart = buildOrgChart(employees, { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, withoutManager: true } });

    expect(chart.rootIds).toEqual(['ceo']);
    expect([...chart.nodes.keys()]).toEqual(['ceo']);
  });

  it('keeps managerless people with reports when no top person is configured, as they are the roots', () => {
    const employees = [makeEmployee('ceo'), makeEmployee('dev', 'ceo'), makeEmployee('serviceAccount')];

    const chart = buildOrgChart(employees, { topPersons: [], hide: { ...SHOW_EVERYONE, withoutManager: true } });

    expect(chart.rootIds).toEqual(['ceo']);
    expect(getNode(chart, 'ceo').flag).toBeNull();
  });

  it('flags people whose manager is not shown while that rule is off', () => {
    const employees = [
      makeEmployee('ceo'),
      makeEmployee('former', 'ceo', { accountEnabled: false }),
      makeEmployee('analyst', 'former'),
      makeEmployee('contractor', 'deletedManager'),
    ];

    const chart = buildOrgChart(employees, { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, disabledAccounts: true } });

    expect(chart.rootIds).toEqual(['ceo', 'analyst', 'contractor']);
    expect(getNode(chart, 'analyst').flag).toBe('managerNotShown');
    expect(getNode(chart, 'contractor').flag).toBe('managerNotShown');
  });

  it('hides people whose manager is not shown together with everyone below them, with or without top persons', () => {
    const employees = [
      makeEmployee('ceo'),
      makeEmployee('former', 'ceo', { accountEnabled: false }),
      makeEmployee('analyst', 'former'),
      makeEmployee('intern', 'analyst'),
      makeEmployee('contractor', 'deletedManager'),
    ];
    const hide = { ...SHOW_EVERYONE, disabledAccounts: true, withHiddenManager: true };

    for (const topPersons of [['ceo'], []]) {
      const chart = buildOrgChart(employees, { topPersons, hide });

      expect([...chart.nodes.keys()]).toEqual(['ceo']);
    }
  });

  it('hides circular manager chains together with everyone below them, with or without top persons', () => {
    const employees = [makeEmployee('ceo'), makeEmployee('a', 'b'), makeEmployee('b', 'a'), makeEmployee('c', 'b')];

    for (const topPersons of [['ceo'], []]) {
      const shown = buildOrgChart(employees, { topPersons, hide: SHOW_EVERYONE });
      const hidden = buildOrgChart(employees, { topPersons, hide: { ...SHOW_EVERYONE, inManagerCycle: true } });

      expect(shown.nodes.size).toBe(4);
      expect([...hidden.nodes.keys()]).toEqual(['ceo']);
    }
  });

  it('hides every flagged root when only the top persons\' teams are wanted', () => {
    const employees = [makeEmployee('ceo'), makeEmployee('a', 'b'), makeEmployee('b', 'a'), makeEmployee('loner')];

    const chart = buildOrgChart(employees, { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, unattached: true } });

    expect(chart.rootIds).toEqual(['ceo']);
  });

  it('breaks manager cycles so nobody in them disappears', () => {
    const employees = [makeEmployee('a', 'b'), makeEmployee('b', 'a'), makeEmployee('c', 'b')];

    const chart = buildOrgChart(employees, { topPersons: [], hide: SHOW_EVERYONE });

    expect(chart.nodes.size).toBe(3);
    expect(chart.rootIds).toHaveLength(1);
    const [rootId] = chart.rootIds;
    expect(getNode(chart, rootId ?? '').flag).toBe('managerCycle');
  });

  it('shows only the top persons\' hierarchies when unattached people are hidden', () => {
    const employees = [makeEmployee('head'), makeEmployee('member', 'head'), makeEmployee('ceo'), makeEmployee('x', 'ceo')];

    const chart = buildOrgChart(employees, { topPersons: ['head'], hide: { ...SHOW_EVERYONE, unattached: true } });

    expect([...chart.nodes.keys()].sort()).toEqual(['head', 'member']);
  });

  it('ignores the unattached rule when no top person resolves, rather than hiding everyone', () => {
    const employees = [makeEmployee('ceo'), makeEmployee('dev', 'ceo')];

    const chart = buildOrgChart(employees, { topPersons: ['missing'], hide: { ...SHOW_EVERYONE, unattached: true } });

    expect(chart.rootIds).toEqual(['ceo']);
    expect(getNode(chart, 'ceo').flag).toBeNull();
  });

  it('lists the top persons that were found, once each, in configured order', () => {
    const employees = [makeEmployee('bob'), makeEmployee('alice')];

    const chart = buildOrgChart(employees, { topPersons: ['alice', 'nobody', 'bob', 'ALICE@contoso.com'], hide: SHOW_EVERYONE });

    expect(chart.topPersonIds).toEqual(['alice', 'bob']);
  });

  it('only lets narrowing options pick people the outer chart shows', () => {
    const employees = [
      makeEmployee('ceo'),
      makeEmployee('head', 'ceo'),
      makeEmployee('member', 'head'),
      makeEmployee('guest', 'head', { isGuest: true }),
      makeEmployee('loner'),
    ];
    const configured = { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, guests: true, withoutManager: true } };

    const department = buildOrgChart(employees, { topPersons: ['head'], hide: configured.hide, within: configured });
    const bypass = buildOrgChart(employees, { topPersons: ['guest', 'loner'], hide: configured.hide, within: configured });

    expect([...department.nodes.keys()].sort()).toEqual(['head', 'member']);
    // Hidden people can't be picked; with nobody found, the configured chart shows as it would without ?top=.
    expect(bypass.unresolvedTopPersons).toEqual(['guest', 'loner']);
    expect([...bypass.nodes.keys()].sort()).toEqual(['ceo', 'head', 'member']);
  });

  it('keeps the top persons of the chart it narrows, in their order, when the narrowing finds nobody', () => {
    const employees = [makeEmployee('zoe'), makeEmployee('ann'), makeEmployee('mid', 'zoe')];
    const configured = { topPersons: ['zoe', 'ann'], hide: SHOW_EVERYONE };

    const chart = buildOrgChart(employees, { topPersons: ['gone'], hide: { ...SHOW_EVERYONE, unattached: true }, within: configured });

    expect(chart.topPersonIds).toEqual(['zoe', 'ann']);
    expect(chart.rootIds).toEqual(['zoe', 'ann']);
    expect(chart.unresolvedTopPersons).toEqual(['gone']);
  });

  it('sorts reports by name and computes depth, team size and ancestors', () => {
    const employees = [
      makeEmployee('ceo'),
      makeEmployee('zed', 'ceo'),
      makeEmployee('amy', 'ceo'),
      makeEmployee('mia', 'amy'),
      makeEmployee('ola', 'mia'),
    ];

    const chart = buildOrgChart(employees, { topPersons: ['ceo'], hide: SHOW_EVERYONE });

    expect(childNames(chart, 'ceo')).toEqual(['Amy', 'Zed']);
    expect(getNode(chart, 'ceo').teamSize).toBe(4);
    expect(getNode(chart, 'amy').teamSize).toBe(2);
    expect(getNode(chart, 'ola').depth).toBe(3);
    expect(ancestorIds(chart, 'ola')).toEqual(['ceo', 'amy', 'mia']);
  });

  it("sorts names in the browser's own order, reports and flagged roots alike", () => {
    const employees = [
      makeEmployee('ceo'),
      makeEmployee('åse', 'ceo'),
      makeEmployee('zara', 'ceo'),
      makeEmployee('anna', 'ceo'),
      makeEmployee('øyvind'),
      makeEmployee('zoe'),
    ];
    const byName = (browserLocale: string) => {
      stubBrowserLocale(browserLocale);
      const chart = buildOrgChart(employees, { topPersons: ['ceo'], hide: SHOW_EVERYONE });
      return { reports: childNames(chart, 'ceo'), roots: chart.rootIds };
    };

    // A Norwegian browser has Æ, Ø and Å as letters of their own after Z, as its readers expect; an English one sorts them as A and O.
    expect(byName('nb')).toEqual({ reports: ['Anna', 'Zara', 'Åse'], roots: ['ceo', 'zoe', 'øyvind'] });
    expect(byName('en')).toEqual({ reports: ['Anna', 'Åse', 'Zara'], roots: ['ceo', 'øyvind', 'zoe'] });
  });
});

describe('buildOrgChart with the address list\'s rule', () => {
  const unlisted = (id: string, managerId: string | null = null, overrides: Partial<Employee> = {}) =>
    makeEmployee(id, managerId, { hiddenFromAddressList: true, ...overrides });
  const HIDING = { ...SHOW_EVERYONE, hiddenFromAddressList: true };

  it('leaves out someone the address list hides while the rule is on, and names them while it is off', () => {
    const employees = [makeEmployee('ceo'), unlisted('advisor', 'ceo'), makeEmployee('dev', 'ceo')];

    const hiding = buildOrgChart(employees, { topPersons: ['ceo'], hide: HIDING });
    const showing = buildOrgChart(employees, { topPersons: ['ceo'], hide: SHOW_EVERYONE });

    expect([...hiding.nodes.keys()].sort()).toEqual(['ceo', 'dev']);
    expect(getNode(showing, 'advisor')).toMatchObject({ unlisted: false, employee: { displayName: 'Advisor' } });
  });

  it('keeps the place of a hidden manager over the people below who are shown, holding nothing that names, describes or reaches them', () => {
    const employees = [
      makeEmployee('ceo'),
      unlisted('auditHead', 'ceo', {
        jobTitle: 'Head of Internal Audit',
        department: 'Internal Audit',
        mobilePhone: '+47 1',
        accountEnabled: false,
        extra: { employeeType: 'Employee' },
      }),
      makeEmployee('auditor', 'auditHead'),
    ];

    const chart = buildOrgChart(employees, { topPersons: ['ceo'], hide: HIDING });
    const place = getNode(chart, 'auditHead');

    expect(place).toMatchObject({ unlisted: true, parentId: 'ceo', childIds: ['auditor'], teamSize: 1, depth: 1, flag: null });
    expect(place.employee).toEqual({
      id: 'auditHead',
      displayName: '',
      mail: null,
      userPrincipalName: '',
      businessPhone: null,
      mobilePhone: null,
      jobTitle: null,
      department: null,
      companyName: null,
      employeeId: null,
      officeLocation: null,
      city: null,
      country: null,
      managerId: 'ceo',
      accountEnabled: true,
      isGuest: false,
      isLicensed: true,
      hiddenFromAddressList: true,
      extra: {},
    });
    expect(getNode(chart, 'auditor')).toMatchObject({ unlisted: false, parentId: 'auditHead', depth: 2 });
    // The place is a card in the tree, never one of the people counted.
    expect([getNode(chart, 'ceo').teamSize, chart.peopleCount, chart.nodes.size]).toEqual([1, 2, 3]);
  });

  it('keeps every hidden manager above someone shown, and leaves out those with nobody shown below them', () => {
    const employees = [
      makeEmployee('ceo'),
      unlisted('upper', 'ceo'),
      unlisted('lower', 'upper'),
      makeEmployee('analyst', 'lower'),
      unlisted('lonely', 'ceo'),
      unlisted('assistant', 'lonely'),
    ];

    const chart = buildOrgChart(employees, { topPersons: ['ceo'], hide: HIDING });

    expect([...chart.nodes.keys()].sort()).toEqual(['analyst', 'ceo', 'lower', 'upper']);
    expect(ancestorIds(chart, 'analyst')).toEqual(['ceo', 'upper', 'lower']);
  });

  it('puts the unlisted after the people named beside them, by id, as where their names sort would give the names away', () => {
    const employees = [
      makeEmployee('ceo'),
      unlisted('u2', 'ceo', { displayName: 'Aaron' }),
      makeEmployee('r2', 'u2'),
      unlisted('u1', 'ceo', { displayName: 'Zack' }),
      makeEmployee('r1', 'u1'),
      makeEmployee('mia', 'ceo'),
      makeEmployee('bo', 'ceo'),
    ];

    const chart = buildOrgChart(employees, { topPersons: ['ceo'], hide: HIDING });

    expect(getNode(chart, 'ceo').childIds).toEqual(['bo', 'mia', 'u1', 'u2']);
  });

  it('keeps a top person the address list hides at the top, nameless, with a team or without', () => {
    const employees = [unlisted('ceo'), makeEmployee('dev', 'ceo'), unlisted('chair')];

    const chart = buildOrgChart(employees, { topPersons: ['ceo', 'chair'], hide: HIDING });

    expect(chart.topPersonIds).toEqual(['ceo', 'chair']);
    expect(getNode(chart, 'ceo')).toMatchObject({ unlisted: true, childIds: ['dev'] });
    expect(getNode(chart, 'chair')).toMatchObject({ unlisted: true, childIds: [] });
  });

  it('takes a person without a manager whose team is only the hidden for one without a team', () => {
    const employees = [makeEmployee('ceo'), makeEmployee('dev', 'ceo'), makeEmployee('loner'), unlisted('secret', 'loner')];

    const chart = buildOrgChart(employees, { topPersons: [], hide: { ...HIDING, withoutManager: true } });

    expect(chart.rootIds).toEqual(['ceo']);
  });

  it('lets a link or a team pick nobody unlisted, as that would put a name to their place, and keeps the rule within a team', () => {
    const employees = [
      makeEmployee('ceo'),
      unlisted('head', 'ceo'),
      makeEmployee('member', 'head'),
      makeEmployee('lead', 'ceo'),
      unlisted('deputy', 'lead'),
      makeEmployee('analyst', 'deputy'),
    ];
    const configured = { topPersons: ['ceo'], hide: HIDING };

    const picked = buildOrgChart(employees, narrowTo(configured, 'head@contoso.com'));
    const team = buildOrgChart(employees, narrowTo(configured, 'lead'));

    // Found by nobody, as a hidden or unknown address is: the chart it narrows shows, with the address unresolved.
    expect(picked.unresolvedTopPersons).toEqual(['head@contoso.com']);
    expect(picked.topPersonIds).toEqual(['ceo']);
    expect(getNode(picked, 'head').unlisted).toBe(true);
    expect(getNode(team, 'deputy')).toMatchObject({ unlisted: true, childIds: ['analyst'] });
  });
});
