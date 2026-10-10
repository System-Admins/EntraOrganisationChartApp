import type { Employee } from '../employees/employee';
import { resolveEmployees } from '../employees/resolveEmployees';
import { isHiddenByAttributes, isUnlisted } from './hideRules';
import { namedEmployee, type OrgChart, type OrgChartOptions, type OrgNode, type RootFlag } from './orgChart';

export function buildOrgChart(directory: readonly Employee[], options: OrgChartOptions): OrgChart {
  const outer = options.within && buildOrgChart(directory, options.within);
  const employees = outer ? directory.filter((employee) => outer.nodes.has(employee.id)) : directory;
  // A link or a team picks only people the chart it narrows names, or it would put a name to an unlisted person's place.
  const pickable = outer ? employees.filter((employee) => namedEmployee(outer, employee.id) !== undefined) : employees;
  const { found: topPersons, unresolved } = resolveEmployees(pickable, options.topPersons);
  // Without them, the chart it narrows would come back as its roots by name, losing its top persons' order and colours.
  if (outer && topPersons.length === 0) return { ...outer, unresolvedTopPersons: unresolved };
  const topIds = new Set(topPersons.map((employee) => employee.id));
  const candidates = new Map(
    employees
      .filter((employee) => topIds.has(employee.id) || !isHiddenByAttributes(employee, options.hide))
      .map((employee) => [employee.id, employee]),
  );

  // Top persons stay roots even when they report to someone in the chart, so co-leaders sit side by side.
  const parentIds = new Map<string, string | null>();
  for (const employee of candidates.values()) {
    const { managerId } = employee;
    const hasVisibleManager = managerId !== null && candidates.has(managerId) && !topIds.has(employee.id);
    parentIds.set(employee.id, hasVisibleManager ? managerId : null);
  }
  // One member heads each loop, whose members would otherwise be unreachable from any root.
  const cycleBreakers = new Set(managerCycles(parentIds).flatMap((cycle) => cycle.slice(0, 1)));
  for (const id of cycleBreakers) parentIds.set(id, null);

  const unlisted = (employee: Employee) => isUnlisted(employee, options.hide);
  // An unlisted person stays only to hold the place of people shown below them; a top person always stays.
  const kept = new Set<string>();
  for (const employee of candidates.values()) {
    if (unlisted(employee) && !topIds.has(employee.id)) continue;
    for (let id: string | null = employee.id; id !== null && !kept.has(id); id = parentIds.get(id) ?? null) kept.add(id);
  }

  const children = new Map<string, Employee[]>();
  for (const employee of candidates.values()) {
    const parentId = parentIds.get(employee.id);
    if (parentId && kept.has(employee.id)) {
      const siblings = children.get(parentId);
      if (siblings) siblings.push(employee);
      else children.set(parentId, [employee]);
    }
  }
  // One collator per build, in the browser's own order: localeCompare with options makes one per call, about 300 ms per 50,000 people.
  const names = new Intl.Collator(undefined, { sensitivity: 'base' });
  // Unlisted people come after the people named beside them, by id: where their names sort would give the names away.
  const byName = (a: Employee, b: Employee) => {
    const [aUnlisted, bUnlisted] = [unlisted(a), unlisted(b)];
    if (!aUnlisted && !bUnlisted) return names.compare(a.displayName, b.displayName);
    if (aUnlisted !== bUnlisted) return aUnlisted ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
  for (const siblings of children.values()) siblings.sort(byName);

  const hasTopPersons = topPersons.length > 0;
  const rootFlag = (employee: Employee): RootFlag | null => {
    if (cycleBreakers.has(employee.id)) return 'managerCycle';
    if (employee.managerId !== null) return 'managerNotShown';
    return hasTopPersons ? 'noManager' : null;
  };
  // Leaving out a root leaves out its whole branch, because nodes are only placed by walking down from roots.
  const isHiddenRoot = (employee: Employee): boolean => {
    switch (rootFlag(employee)) {
      case 'noManager':
        return options.hide.withoutManager;
      case 'managerNotShown':
        return options.hide.withHiddenManager;
      case 'managerCycle':
        return options.hide.inManagerCycle;
      case null:
        return options.hide.withoutManager && !children.has(employee.id);
    }
  };
  const otherRoots =
    hasTopPersons && options.hide.unattached
      ? []
      : [...candidates.values()]
          .filter((employee) => !topIds.has(employee.id) && parentIds.get(employee.id) === null && kept.has(employee.id))
          .filter((employee) => !isHiddenRoot(employee))
          .sort(byName);

  const nodes = new Map<string, OrgNode>();
  // Gives the people the branch names, the person at its top included.
  const place = (employee: Employee, parentId: string | null, depth: number, flag: RootFlag | null): number => {
    const reports = children.get(employee.id) ?? [];
    let teamSize = 0;
    for (const report of reports) teamSize += place(report, employee.id, depth + 1, null);
    const holdsPlace = unlisted(employee);
    nodes.set(employee.id, {
      employee: holdsPlace ? standIn(employee) : employee,
      unlisted: holdsPlace,
      parentId,
      childIds: reports.map((report) => report.id),
      teamSize,
      depth,
      flag,
    });
    return teamSize + (holdsPlace ? 0 : 1);
  };
  let peopleCount = 0;
  for (const top of topPersons) peopleCount += place(top, null, 0, null);
  for (const root of otherRoots) peopleCount += place(root, null, 0, rootFlag(root));

  return {
    rootIds: [...topPersons, ...otherRoots].map((employee) => employee.id),
    topPersonIds: topPersons.map((employee) => employee.id),
    nodes,
    peopleCount,
    unresolvedTopPersons: unresolved,
  };
}

/** What an unlisted person's node holds of them: the id and the links that place them, and nothing that names, describes or reaches them. */
function standIn({ id, managerId }: Employee): Employee {
  return {
    id,
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
    managerId,
    accountEnabled: true,
    isGuest: false,
    isLicensed: true,
    hiddenFromAddressList: true,
    extra: {},
  };
}

/** Each loop in the links to managers, from the member where a walk up the links came back to it; a link to no one in the map ends a walk. */
export function managerCycles(managerIds: ReadonlyMap<string, string | null>): (readonly string[])[] {
  const settled = new Set<string>();
  const cycles: (readonly string[])[] = [];
  for (const start of managerIds.keys()) {
    const trail: string[] = [];
    const onTrail = new Set<string>();
    let current: string | null = start;
    while (current !== null && !settled.has(current) && !onTrail.has(current)) {
      trail.push(current);
      onTrail.add(current);
      current = managerIds.get(current) ?? null;
    }
    if (current !== null && onTrail.has(current)) cycles.push(trail.slice(trail.indexOf(current)));
    for (const id of trail) settled.add(id);
  }
  return cycles;
}
