import { accountStateOf, MISSING_DETAILS, missingDetailsOf, type Employee } from '../employees/employee';
import { managerCycles } from '../orgChart/buildOrgChart';
import { departmentPath, departmentTree, getDepartment, type DepartmentNode } from '../orgChart/departmentTree';
import { hiddenBecause, tidyingOff, type HideRules } from '../orgChart/hideRules';
import { chartHideRules, withHideRules, type OrgChart, type OrgChartOptions } from '../orgChart/orgChart';
import { mostUsedSpellings, nameKey } from '../text/nameKey';

/** What the directory health report looks for, in the order it lists them: the links to managers first, as they make the chart's tree. */
export const ISSUES = [
  'noManager',
  'managerGone',
  'disabledManager',
  'managerCycle',
  ...MISSING_DETAILS,
  'departmentSpelling',
  'departmentInItself',
  'departmentElsewhere',
] as const;

export type Issue = (typeof ISSUES)[number];

/** Where the department tree places a person's department, for a department inside itself or in more than one place. */
export interface DepartmentPlace {
  /** The names of the departments from the top down to the person's. */
  readonly path: readonly string[];
  /** Where most of a department in more than one place is: the department above it there, null at the top, and how many of its people are checked; null for a department inside itself. */
  readonly main: { readonly parent: string | null; readonly people: number } | null;
}

/** The most people a second place of a department may hold, without departments below it, to be listed: a larger one is more likely a department of its own that shares the name. */
const STRAY_PEOPLE = 3;

export interface DirectoryIssues {
  /** The people checked: everyone the scope names, but for the accounts the account filters leave out. */
  readonly checked: readonly Employee[];
  /** The people with each issue, in name order. */
  readonly people: Readonly<Record<Issue, readonly Employee[]>>;
  /** Each person's issues, in ISSUES' order; people without any are missing. */
  readonly issuesOf: ReadonlyMap<string, readonly Issue[]>;
  /** For each person who spells their department otherwise than most of its people do, the spelling most of them use. */
  readonly usualSpellings: ReadonlyMap<string, string>;
  /** How many of the people checked the directory names each manager for, by the manager's id. */
  readonly reportCounts: ReadonlyMap<string, number>;
  /** For each person in a department inside itself, or in a small stray place of a department, where that is. */
  readonly departmentPlaces: ReadonlyMap<string, DepartmentPlace>;
}

/** The chart the report covers: the one `options` set up, with every filter that tidies the chart off. */
export function reportScope(options: OrgChartOptions): OrgChartOptions {
  return withHideRules(options, tidyingOff(chartHideRules(options)));
}

/** What is wrong with the entries of `scope`, the chart that reportScope sets up; `rules` say which accounts count, `photos` are the photo check's answers. */
export function directoryIssues(
  directory: readonly Employee[],
  scope: OrgChart,
  rules: HideRules,
  photos: ReadonlyMap<string, boolean>,
): DirectoryIssues {
  const byId = new Map(directory.map((employee) => [employee.id, employee]));
  const tops = new Set(scope.topPersonIds);
  // An unlisted person's place names nobody, so it is no one to report, whatever is wrong with the entry.
  const inScope = Array.from(scope.nodes.values()).flatMap((node) => (node.unlisted ? [] : [node.employee]));
  // The account rules say who counts as a person; a missing job title is one of the problems looked for, so it keeps nobody out.
  const accounts: HideRules = { ...rules, withoutJobTitle: false };
  const checked = inScope.filter((employee) => tops.has(employee.id) || hiddenBecause(employee, accounts) === null);
  const counted = new Set(checked.map(({ id }) => id));
  const reportCounts = new Map<string, number>();
  for (const { managerId } of checked) if (managerId !== null) reportCounts.set(managerId, (reportCounts.get(managerId) ?? 0) + 1);
  // The directory's own links, in which a loop is a loop whichever of its members the filters hide.
  const inLoops = new Set(managerCycles(new Map(directory.map((employee) => [employee.id, employee.managerId]))).flat());
  const usualSpellings = usualSpellingsOf(checked);
  const departmentPlaces = departmentPlacesOf(scope, counted);

  const issuesOfPerson = (employee: Employee): Issue[] => {
    const { id, managerId } = employee;
    // A disabled account that still manages people is found whether or not the filters count disabled accounts.
    const managesPeople = accountStateOf(employee) === 'disabled' && reportCounts.has(id);
    if (!counted.has(id)) return managesPeople ? ['disabledManager'] : [];
    const manager = managerId === null ? undefined : byId.get(managerId);
    const issues: Issue[] = [];
    // Without top persons, the people without a manager who head a team are the top of the chart.
    if (managerId === null && !tops.has(id) && (tops.size > 0 || !reportCounts.has(id))) issues.push('noManager');
    if (managerId !== null && (manager === undefined || accountStateOf(manager) === 'disabled')) issues.push('managerGone');
    if (managesPeople) issues.push('disabledManager');
    if (inLoops.has(id)) issues.push('managerCycle');
    issues.push(...missingDetailsOf(employee, photos.get(id)));
    if (usualSpellings.has(id)) issues.push('departmentSpelling');
    const place = departmentPlaces.get(id);
    if (place) issues.push(place.main === null ? 'departmentInItself' : 'departmentElsewhere');
    return issues;
  };

  const people = {} as Record<Issue, Employee[]>;
  for (const issue of ISSUES) people[issue] = [];
  const issuesOf = new Map<string, readonly Issue[]>();
  for (const employee of inScope) {
    const issues = issuesOfPerson(employee);
    if (issues.length === 0) continue;
    issuesOf.set(employee.id, issues);
    for (const issue of issues) people[issue].push(employee);
  }
  // In the browser's own order of names, as the chart sorts them.
  const names = new Intl.Collator(undefined, { sensitivity: 'base' });
  for (const list of Object.values(people)) list.sort((a, b) => names.compare(a.displayName, b.displayName));
  return { checked, people, issuesOf, usualSpellings, reportCounts, departmentPlaces };
}

/** The people checked in a department that comes again below itself, or in a small place of a department that most of its people are elsewhere from. */
function departmentPlacesOf(scope: OrgChart, counted: ReadonlySet<string>): Map<string, DepartmentPlace> {
  // Over everyone in the scope, so that the accounts the filters leave out still pass their departments on, as the chart's tree does.
  const tree = departmentTree(scope);
  const checkedIn = new Map(Array.from(tree.nodes.values(), (node) => [node.id, node.memberIds.filter((id) => counted.has(id))] as const));
  const peopleIn = (node: DepartmentNode) => checkedIn.get(node.id) ?? [];
  const pathOf = (node: DepartmentNode) => departmentPath(tree, node.id).map(({ name }) => name);
  const places = new Map<string, DepartmentPlace>();
  // In the tree's order, which is the outline's: of places as large and as high up, the first is taken as the main one.
  const byKey = new Map<string, DepartmentNode[]>();
  for (const node of tree.nodes.values()) {
    if (peopleIn(node).length === 0) continue;
    if (node.insideItself) {
      const path = pathOf(node);
      for (const id of peopleIn(node)) places.set(id, { path, main: null });
    } else if (node.flag === null) {
      byKey.set(node.key, [...(byKey.get(node.key) ?? []), node]);
    }
  }
  for (const nodes of byKey.values()) {
    if (nodes.length < 2) continue;
    const main = nodes.reduce((best, node) => {
      const people = peopleIn(node).length;
      const most = peopleIn(best).length;
      return people > most || (people === most && node.depth < best.depth) ? node : best;
    });
    const mainPlace = { parent: main.parentId === null ? null : getDepartment(tree, main.parentId).name, people: peopleIn(main).length };
    for (const node of nodes) {
      if (node === main || peopleIn(node).length > STRAY_PEOPLE || node.childIds.length > 0) continue;
      const path = pathOf(node);
      for (const id of peopleIn(node)) places.set(id, { path, main: mainPlace });
    }
  }
  return places;
}

function usualSpellingsOf(people: readonly Employee[]): Map<string, string> {
  const usual = mostUsedSpellings(people.map(({ department }) => department));
  const found = new Map<string, string>();
  for (const { id, department } of people) {
    const spelling = department?.trim() ?? '';
    const most = usual.get(nameKey(spelling));
    if (most !== undefined && most !== spelling) found.set(id, most);
  }
  return found;
}
