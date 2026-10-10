import { ancestorIds, getNode, ROOT_FLAGS, type OrgChart, type RootFlag } from '@/domain/orgChart/orgChart';

/** A list of people shows this many at a time, a manager's reports or the people under a heading; Show more adds as many again. */
export const PAGE_SIZE = 50;

const HEADING_PREFIX = 'flag:';
const SHOW_MORE_PREFIX = 'more:';

/** People with the same flag, each heading a branch of their own, under one heading at the top of the tree. */
export interface FlagGroup {
  readonly flag: RootFlag;
  /** The heading's key, beside the people's ids in ChartViewStore. */
  readonly key: string;
  /** In name order, as rootIds lists them. */
  readonly ids: readonly string[];
}

/** The top of the tree: the people at the top without a flag, then a heading per flag over the people with it. */
export interface TreeRoots {
  readonly people: readonly string[];
  /** In ROOT_FLAGS' order, without the flags that nobody has. */
  readonly groups: readonly FlagGroup[];
}

/** What decides which items the tree renders: ChartViewStore, or the tree as it opens. */
export interface TreeState {
  isExpanded(id: string, depth: number): boolean;
  isGroupExpanded(key: string, size: number): boolean;
  /** How many people of a list show, by the list's key: a manager's id, or a heading's key. */
  shownCount(listKey: string): number;
}

/** A person to show, with what must open to get there. */
export interface RevealTarget {
  readonly id: string;
  /** The managers above, from the top down, which are unfolded. */
  readonly ancestorIds: readonly string[];
  /** The heading over a flagged branch, which is unfolded too. */
  readonly heading?: string;
  /** The page each list on the way must show, by the list's key, where its first page doesn't reach the person. */
  readonly pages?: readonly (readonly [string, number])[];
}

export function headingKey(flag: RootFlag): string {
  return `${HEADING_PREFIX}${flag}`;
}

/** Whether the key is a heading's rather than a person's or a Show more item's. */
export function isHeadingKey(key: string): boolean {
  return key.startsWith(HEADING_PREFIX);
}

/** The key of the Show more item at the end of a list. */
export function showMoreKey(listKey: string): string {
  return `${SHOW_MORE_PREFIX}${listKey}`;
}

/** The list whose Show more item has the key; null for a person's or a heading's key. */
export function listOfShowMore(key: string): string | null {
  return key.startsWith(SHOW_MORE_PREFIX) ? key.slice(SHOW_MORE_PREFIX.length) : null;
}

/** Whether a heading is folded or unfolded by default: unfolded where its first page holds the whole group, so a clean-up sees the flagged cards at once. */
export function opensUnfolded(size: number): boolean {
  return size <= PAGE_SIZE;
}

/** The tree as it opens, before anyone folds, unfolds or shows more: what the plans of the first chart count. */
export const OPENING_TREE: Pick<TreeState, 'isGroupExpanded' | 'shownCount'> = {
  isGroupExpanded: (_key, size) => opensUnfolded(size),
  shownCount: () => PAGE_SIZE,
};

const rootsOfCharts = new WeakMap<OrgChart, TreeRoots>();

/** Kept per chart, as every heading and key press asks. */
export function treeRoots(chart: OrgChart): TreeRoots {
  const known = rootsOfCharts.get(chart);
  if (known) return known;
  const people: string[] = [];
  const flagged = new Map<RootFlag, string[]>();
  for (const id of chart.rootIds) {
    const { flag } = getNode(chart, id);
    if (flag === null) {
      people.push(id);
      continue;
    }
    const ids = flagged.get(flag) ?? [];
    ids.push(id);
    flagged.set(flag, ids);
  }
  const groups = ROOT_FLAGS.flatMap((flag) => {
    const ids = flagged.get(flag);
    return ids ? [{ flag, key: headingKey(flag), ids }] : [];
  });
  const roots = { people, groups };
  rootsOfCharts.set(chart, roots);
  return roots;
}

/** The group under the heading with the key; undefined for any other key, and for a flag nobody in the chart has. */
export function groupOf(chart: OrgChart, key: string): FlagGroup | undefined {
  return treeRoots(chart).groups.find((group) => group.key === key);
}

/** The tree's first item, which is in the tab order until another one is. */
export function firstTreeItem(chart: OrgChart): string | undefined {
  const { people, groups } = treeRoots(chart);
  return people[0] ?? groups[0]?.key;
}

/** Whether the key is a person in the chart or a heading over people in it, which a saved view may name. */
export function hasTreeItem(chart: OrgChart, key: string): boolean {
  return chart.nodes.has(key) || groupOf(chart, key) !== undefined;
}

/** The people of a list in name order: a manager's reports, or the people under a heading. */
export function listMembers(chart: OrgChart, listKey: string): readonly string[] {
  return groupOf(chart, listKey)?.ids ?? getNode(chart, listKey).childIds;
}

/** The list that holds the person: their manager's reports or their flag's heading; null for the people at the top without a flag, who are never paged. */
export function listOf(chart: OrgChart, id: string): string | null {
  const { parentId, flag } = getNode(chart, id);
  if (parentId !== null) return parentId;
  return flag === null ? null : headingKey(flag);
}

/** The people of a list that the tree renders, laid out as it lays them out: those without a team stacked first, then those with one side by side. */
export interface ShownPage {
  readonly individuals: readonly string[];
  readonly managers: readonly string[];
  /** The people at the end of the list that the page leaves out. */
  readonly hidden: number;
}

/** Pages follow the list's name order, so managers come on every page, not only after everyone without a team. */
export function shownPage(chart: OrgChart, ids: readonly string[], shown: number): ShownPage {
  const individuals: string[] = [];
  const managers: string[] = [];
  for (const id of ids.slice(0, shown)) (getNode(chart, id).childIds.length > 0 ? managers : individuals).push(id);
  return { individuals, managers, hidden: Math.max(0, ids.length - shown) };
}

/** The first person the next page adds in the tree's order, where the focus goes: people without a team come first. */
export function firstAdded(chart: OrgChart, ids: readonly string[], shown: number): string | undefined {
  const added = ids.slice(shown, shown + PAGE_SIZE);
  return added.find((id) => getNode(chart, id).childIds.length === 0) ?? added[0];
}

/** The shortest whole number of pages that shows the person at `index` of a list. */
export function pageShowing(index: number): number {
  return (Math.floor(index / PAGE_SIZE) + 1) * PAGE_SIZE;
}

/** What must open to show the person: the managers above, the heading over a flagged branch, and the pages on the way. */
export function revealTargetOf(chart: OrgChart, id: string): RevealTarget {
  const managers = ancestorIds(chart, id);
  let heading: string | undefined;
  const pages: (readonly [string, number])[] = [];
  for (const person of [...managers, id]) {
    const list = listOf(chart, person);
    if (list === null) continue;
    if (groupOf(chart, list)) heading = list;
    const page = pageShowing(listMembers(chart, list).indexOf(person));
    if (page > PAGE_SIZE) pages.push([list, page]);
  }
  return { id, ancestorIds: managers, heading, pages };
}

/** Whether the tree renders the item: every list above it open and showing the way, a heading always, a Show more item where its list goes on. */
export function isShown(chart: OrgChart, state: TreeState, key: string): boolean {
  const moreOf = listOfShowMore(key);
  if (moreOf !== null) return isOpen(chart, state, moreOf) && listMembers(chart, moreOf).length > state.shownCount(moreOf);
  return groupOf(chart, key) !== undefined || (chart.nodes.has(key) && isReached(chart, state, key));
}

/** Whether a list's people render: its heading unfolded, or its manager rendered and unfolded. */
function isOpen(chart: OrgChart, state: TreeState, listKey: string): boolean {
  const group = groupOf(chart, listKey);
  if (group) return state.isGroupExpanded(group.key, group.ids.length);
  const manager = chart.nodes.get(listKey);
  return manager !== undefined && state.isExpanded(listKey, manager.depth) && isReached(chart, state, listKey);
}

/** Up from the person a list at a time, rather than by recursion, which a long chain of managers could take past the call stack's limit. */
function isReached(chart: OrgChart, state: TreeState, id: string): boolean {
  for (let person = id; ; ) {
    const list = listOf(chart, person);
    if (list === null) return true;
    if (listMembers(chart, list).indexOf(person) >= state.shownCount(list)) return false;
    const group = groupOf(chart, list);
    if (group) return state.isGroupExpanded(group.key, group.ids.length);
    if (!state.isExpanded(list, getNode(chart, list).depth)) return false;
    person = list;
  }
}

/** The rendered item of a person, a heading or a Show more item, by its key. */
export function findTreeItem(container: ParentNode, key: string): HTMLElement | null {
  const value = CSS.escape(key);
  return container.querySelector<HTMLElement>(`[data-employee-id="${value}"], [data-tree-key="${value}"]`);
}
