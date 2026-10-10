import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubBrowserLocale } from '@/testing/browserLocale';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import type { Employee } from '../employees/employee';
import { buildOrgChart } from './buildOrgChart';
import { departmentPath, departmentTree, getDepartment, type DepartmentTree } from './departmentTree';
import { narrowTo, type OrgChartOptions } from './orgChart';

afterEach(() => {
  vi.restoreAllMocks();
});

const inDepartment = (id: string, managerId: string | null, department: string | null) => makeEmployee(id, managerId, { department });

const treeOf = (employees: readonly Employee[], options: Partial<OrgChartOptions> = {}) =>
  departmentTree(buildOrgChart(employees, { topPersons: ['ceo'], hide: SHOW_EVERYONE, ...options }));

const namesOf = (tree: DepartmentTree, ids: readonly string[]) => ids.map((id) => getDepartment(tree, id).name);

describe('departmentTree', () => {
  it('nests each department under the department its leaders report into', () => {
    const tree = treeOf([
      inDepartment('ceo', null, 'Management'),
      inDepartment('cfo', 'ceo', 'Management'),
      inDepartment('head', 'ceo', 'Strategy M&A'),
      inDepartment('lead', 'head', 'Business Development'),
      inDepartment('dev', 'lead', 'Business Development'),
    ]);

    expect(tree.rootIds).toEqual(['management']);
    expect(getDepartment(tree, 'management')).toMatchObject({
      name: 'Management',
      parentId: null,
      childIds: ['management/strategyma'],
      memberIds: ['ceo', 'cfo'],
      leaderIds: ['ceo'],
      depth: 0,
      total: 5,
      insideItself: false,
      flag: null,
    });
    expect(getDepartment(tree, 'management/strategyma/businessdevelopment')).toMatchObject({
      name: 'Business Development',
      parentId: 'management/strategyma',
      memberIds: ['lead', 'dev'],
      leaderIds: ['lead'],
      depth: 2,
      total: 2,
    });
    expect(namesOf(tree, departmentPath(tree, 'management/strategyma/businessdevelopment').map(({ id }) => id))).toEqual([
      'Management',
      'Strategy M&A',
      'Business Development',
    ]);
    expect(tree.departmentIdOf.get('dev')).toBe('management/strategyma/businessdevelopment');
  });

  it('takes the same department under the same department as one, whoever leads each part of it', () => {
    const tree = treeOf([
      inDepartment('ceo', null, 'Management'),
      inDepartment('anna', 'ceo', 'Logistics'),
      inDepartment('bo', 'ceo', 'Logistics'),
      inDepartment('cy', 'bo', 'Logistics'),
    ]);

    expect(getDepartment(tree, 'management').childIds).toEqual(['management/logistics']);
    expect(getDepartment(tree, 'management/logistics')).toMatchObject({ memberIds: ['anna', 'bo', 'cy'], leaderIds: ['anna', 'bo'], total: 3 });
  });

  it('shows a department wherever its people report into, and marks one that comes again below itself', () => {
    const tree = treeOf([
      inDepartment('ceo', null, 'Management'),
      inDepartment('head', 'ceo', 'Strategy'),
      inDepartment('aide', 'head', 'Management'),
      inDepartment('rep', 'head', 'Sales'),
      inDepartment('stray', 'ceo', 'Sales'),
    ]);

    expect(getDepartment(tree, 'management/strategy').childIds).toEqual(['management/strategy/management', 'management/strategy/sales']);
    expect(getDepartment(tree, 'management/strategy/management')).toMatchObject({ name: 'Management', memberIds: ['aide'], insideItself: true });
    expect(getDepartment(tree, 'management').insideItself).toBe(false);
    expect(getDepartment(tree, 'management/strategy/sales').memberIds).toEqual(['rep']);
    expect(getDepartment(tree, 'management/sales')).toMatchObject({ memberIds: ['stray'], insideItself: false });
    expect(getDepartment(tree, 'management').total).toBe(5);
  });

  it('passes a department on through the people who have none, and lists them', () => {
    const tree = treeOf([
      inDepartment('ceo', null, 'Management'),
      inDepartment('aide', 'ceo', null),
      inDepartment('dev', 'aide', 'Management'),
      inDepartment('rep', 'aide', 'Sales'),
      inDepartment('temp', 'ceo', ' - '),
    ]);

    expect(getDepartment(tree, 'management').memberIds).toEqual(['ceo', 'dev']);
    expect(getDepartment(tree, 'management/sales').leaderIds).toEqual(['rep']);
    expect(tree.withoutDepartment).toEqual(['aide', 'temp']);
    expect(tree.departmentIdOf.has('aide')).toBe(false);
  });

  it('passes a department on through the place of someone unlisted, whose own department it keeps to itself, and lists that place nowhere', () => {
    const tree = treeOf(
      [
        inDepartment('ceo', null, 'Management'),
        makeEmployee('auditHead', 'ceo', { department: 'Internal Audit', hiddenFromAddressList: true }),
        inDepartment('auditor', 'auditHead', 'Internal Audit'),
        inDepartment('clerk', 'auditHead', 'Management'),
      ],
      { hide: { ...SHOW_EVERYONE, hiddenFromAddressList: true } },
    );

    expect(getDepartment(tree, 'management').memberIds).toEqual(['ceo', 'clerk']);
    expect(getDepartment(tree, 'management/internalaudit').leaderIds).toEqual(['auditor']);
    expect(tree.withoutDepartment).toEqual([]);
    expect(tree.departmentIdOf.has('auditHead')).toBe(false);
  });

  it('takes a department\'s spellings as one, under the spelling most of the chart uses', () => {
    const tree = treeOf([
      inDepartment('ceo', null, 'Management'),
      inDepartment('lead', 'ceo', 'Energy Facilities'),
      inDepartment('dev', 'lead', 'energy facilities'),
      inDepartment('ops', 'lead', 'Energy-Facilities'),
      inDepartment('rep', 'lead', 'Energy Facilities'),
    ]);

    expect(getDepartment(tree, 'management').childIds).toEqual(['management/energyfacilities']);
    expect(getDepartment(tree, 'management/energyfacilities')).toMatchObject({
      name: 'Energy Facilities',
      memberIds: ['lead', 'dev', 'ops', 'rep'],
      leaderIds: ['lead'],
    });
  });

  it('starts at the departments below a top person who has none', () => {
    const tree = treeOf([inDepartment('ceo', null, null), inDepartment('bo', 'ceo', 'Sales'), inDepartment('anna', 'ceo', 'Finance')]);

    expect(tree.rootIds).toEqual(['finance', 'sales']);
    expect(getDepartment(tree, 'sales').leaderIds).toEqual(['bo']);
    expect(tree.withoutDepartment).toEqual(['ceo']);
  });

  it('puts the top persons\' departments first, in their order, and those of flagged branches last, by flag', () => {
    const tree = treeOf(
      [inDepartment('zed', null, 'Zeta'), inDepartment('amy', null, 'Alpha'), inDepartment('solo', null, 'Beta'), inDepartment('orphan', 'gone', 'Alpha')],
      { topPersons: ['zed', 'amy'] },
    );

    expect(tree.rootIds).toEqual(['zeta', 'alpha', 'noManager:beta', 'managerNotShown:alpha']);
    expect(getDepartment(tree, 'noManager:beta').flag).toBe('noManager');
    expect(getDepartment(tree, 'managerNotShown:alpha')).toMatchObject({ name: 'Alpha', memberIds: ['orphan'], flag: 'managerNotShown' });
  });

  it('orders the departments by name where no top person comes first', () => {
    const tree = treeOf([inDepartment('bo', null, 'Sales'), inDepartment('anna', null, 'Finance')], { topPersons: [] });

    expect(tree.rootIds).toEqual(['finance', 'sales']);
  });

  it('sorts departments in the browser\'s own order of names', () => {
    stubBrowserLocale('sv');

    const tree = treeOf([inDepartment('ceo', null, 'Management'), inDepartment('a', 'ceo', 'Östra'), inDepartment('b', 'ceo', 'Zeta')]);

    expect(namesOf(tree, getDepartment(tree, 'management').childIds)).toEqual(['Zeta', 'Östra']);
  });

  it('starts the departments of a narrowed chart at its top person', () => {
    const employees = [inDepartment('ceo', null, 'Management'), inDepartment('head', 'ceo', 'Strategy'), inDepartment('lead', 'head', 'Business Development')];
    const everyone: OrgChartOptions = { topPersons: ['ceo'], hide: SHOW_EVERYONE };

    const tree = departmentTree(buildOrgChart(employees, narrowTo(everyone, 'head')));

    expect(tree.rootIds).toEqual(['strategy']);
    expect(getDepartment(tree, 'strategy').childIds).toEqual(['strategy/businessdevelopment']);
  });

  it('walks a long chain of managers and departments that keep coming back', () => {
    const chain = Array.from({ length: 3_000 }, (_, index) =>
      inDepartment(`p${String(index)}`, index === 0 ? null : `p${String(index - 1)}`, Math.floor(index / 100) % 2 === 0 ? 'Even' : 'Odd'),
    );

    const tree = treeOf(chain, { topPersons: ['p0'] });

    expect(tree.nodes.size).toBe(30);
    expect(tree.nodes.get('even')?.total).toBe(3_000);
    expect([...tree.nodes.values()].filter(({ insideItself }) => insideItself)).toHaveLength(28);
  });
});
