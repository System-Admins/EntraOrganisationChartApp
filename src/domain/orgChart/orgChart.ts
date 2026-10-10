import type { Employee } from '../employees/employee';
import type { HideRules } from './hideRules';

export interface OrgChartOptions {
  /** Object ids, UPNs or e-mail addresses of the people placed side by side at the top. */
  readonly topPersons: readonly string[];
  readonly hide: HideRules;
  /** The chart these options narrow: only people shown there can appear, so its hide rules still apply. */
  readonly within?: OrgChartOptions;
}

/** The hide rules of the chart as a whole: those of the chart that `within` narrows, when there is one. */
export function chartHideRules(options: OrgChartOptions): HideRules {
  return (options.within ?? options).hide;
}

/** The same chart under other hide rules. One narrowed by its own top persons keeps to their teams. */
export function withHideRules(options: OrgChartOptions, hide: HideRules): OrgChartOptions {
  return options.within
    ? { ...options, hide: { ...hide, unattached: true }, within: { ...options.within, hide } }
    : { ...options, hide };
}

/** One person's organization alone. It narrows the chart that `options` narrow, if any, so it is never two levels deep. */
export function narrowTo(options: OrgChartOptions, employeeId: string): OrgChartOptions {
  const outer = options.within ?? options;
  return { ...options, topPersons: [employeeId], hide: { ...outer.hide, unattached: true }, within: outer };
}

/** Why a person who is not a configured top person ended up as a root. */
export const ROOT_FLAGS = ['noManager', 'managerNotShown', 'managerCycle'] as const;

export type RootFlag = (typeof ROOT_FLAGS)[number];

export interface OrgNode {
  /** For an unlisted node, a stand-in that holds the person's id and links alone: nothing that names, describes or reaches them. */
  readonly employee: Employee;
  /** Whether the node only holds the place of someone the rules keep unlisted (isUnlisted), over people below who are shown. */
  readonly unlisted: boolean;
  readonly parentId: string | null;
  /** Sorted by display name, the unlisted last. */
  readonly childIds: readonly string[];
  /** The people the chart names below this node, at every level; an unlisted person's place is a card, never one of them. */
  readonly teamSize: number;
  readonly depth: number;
  readonly flag: RootFlag | null;
}

export interface OrgChart {
  /** Configured top persons first, in configured order, then other roots by name, the unlisted last. */
  readonly rootIds: readonly string[];
  /** The configured top persons that were found, without duplicates: the first entries of rootIds. */
  readonly topPersonIds: readonly string[];
  /** Only the people that are visible in the chart, and the places of unlisted people above some of them. */
  readonly nodes: ReadonlyMap<string, OrgNode>;
  /** The people the chart names: its nodes but the places of the unlisted. */
  readonly peopleCount: number;
  readonly unresolvedTopPersons: readonly string[];
}

export function getNode(chart: OrgChart, id: string): OrgNode {
  const node = chart.nodes.get(id);
  if (!node) throw new Error(`Employee ${id} is not part of the chart.`);
  return node;
}

/** The person where the chart names them, which anything that opens, lists or names a person needs; undefined where it leaves them out or only holds their place. */
export function namedEmployee(chart: OrgChart, id: string): Employee | undefined {
  const node = chart.nodes.get(id);
  return node && !node.unlisted ? node.employee : undefined;
}

/** Whether narrowing to the person (narrowTo) leaves anyone out: they head a team smaller than the chart. Nobody narrows to an unlisted person's place. */
export function narrowsChart(chart: OrgChart, id: string): boolean {
  const node = chart.nodes.get(id);
  return node !== undefined && !node.unlisted && node.childIds.length > 0 && node.teamSize + 1 < chart.peopleCount;
}

/** Ids from the root down to the direct manager. */
export function ancestorIds(chart: OrgChart, id: string): string[] {
  const path: string[] = [];
  for (let parent = getNode(chart, id).parentId; parent !== null; parent = getNode(chart, parent).parentId) {
    path.unshift(parent);
  }
  return path;
}

/** Ids of everyone below the person, at every level, in the order the outline lists them: each report before their team. */
export function descendantIds(chart: OrgChart, id: string): string[] {
  const ids: string[] = [];
  // A stack rather than recursion, which a deep chain of managers could take past the call stack's limit.
  const stack = getNode(chart, id).childIds.toReversed();
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    ids.push(next);
    stack.push(...getNode(chart, next).childIds.toReversed());
  }
  return ids;
}
