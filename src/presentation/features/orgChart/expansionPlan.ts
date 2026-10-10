import { getNode, type OrgChart } from '@/domain/orgChart/orgChart';
import { groupOf, listMembers, OPENING_TREE, PAGE_SIZE, treeRoots, type TreeState } from './treeItems';

/** Rendering more cards than this at once makes large organizations sluggish to expand and pan. */
export const EXPAND_ALL_CARD_BUDGET = 2000;

/** The headings' part of the tree's state, which Expand all leaves as it is. */
type Headings = Pick<TreeState, 'isGroupExpanded' | 'shownCount'>;

export interface ExpansionPlan {
  /** Pass to ChartViewStore.expandToDepth. */
  readonly depth: number;
  /** False when the budget stopped expansion before the deepest level. */
  readonly complete: boolean;
  readonly visibleLevels: number;
  readonly totalLevels: number;
}

/** Deepest expansion whose rendered cards stay within the budget: a page of each team, as expandToDepth leaves them, under the headings as they are. */
export function planExpandAll(chart: OrgChart, headings: Headings = OPENING_TREE, budget = EXPAND_ALL_CARD_BUDGET): ExpansionPlan {
  let totalLevels = 0;
  for (const { depth } of chart.nodes.values()) totalLevels = Math.max(totalLevels, depth + 1);
  const countPerDepth: number[] = [];
  // Down from the people the top of the tree shows, a page of reports at a time: people beyond a page or under a folded heading never render.
  const stack = [...rootsShown(chart, headings)];
  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    const { depth, childIds } = getNode(chart, id);
    countPerDepth[depth] = (countPerDepth[depth] ?? 0) + 1;
    stack.push(...childIds.slice(0, PAGE_SIZE));
  }

  let visible = 0;
  for (let depth = 0; depth < totalLevels; depth++) {
    visible += countPerDepth[depth] ?? 0;
    // Showing level `depth` requires expanding everything above it, i.e. expandToDepth(depth).
    if (visible > budget) {
      const allowed = Math.max(0, depth - 1);
      return { depth: allowed, complete: false, visibleLevels: allowed + 1, totalLevels };
    }
  }
  return { depth: totalLevels, complete: true, visibleLevels: totalLevels, totalLevels };
}

/** Several top persons start folded. Otherwise the configured depth, limited to what Expand all would show. */
export function initialExpandDepth(chart: OrgChart, expandDepth: number): number {
  return chart.topPersonIds.length > 1 ? 0 : Math.min(expandDepth, planExpandAll(chart).depth);
}

export interface UnfoldPlan {
  /** Pass to ChartViewStore.expandMany. */
  readonly ids: readonly string[];
  /** The folded teams or headings among those asked about; more than `ids` holds where the budget kept some folded. */
  readonly folded: number;
}

/** The folded teams or headings among `keys`, in order, leaving out any that would take the cards on screen past the budget. */
export function planUnfold(
  chart: OrgChart,
  keys: readonly string[],
  state: TreeState,
  shownCards: number,
  budget = EXPAND_ALL_CARD_BUDGET,
): UnfoldPlan {
  const folded = keys.filter((key) => isFolded(chart, state, key));
  const unfold: string[] = [];
  let cards = shownCards;
  for (const key of folded) {
    const added = cardsBelow(chart, state, key);
    if (cards + added > budget) continue;
    cards += added;
    unfold.push(key);
  }
  return { ids: unfold, folded: folded.length };
}

/** The people at the top: those without a flag, and a page of each unfolded heading's. */
function rootsShown(chart: OrgChart, headings: Headings): string[] {
  const { people, groups } = treeRoots(chart);
  const flagged = groups.flatMap(({ key, ids }) =>
    headings.isGroupExpanded(key, ids.length) ? ids.slice(0, headings.shownCount(key)) : [],
  );
  return [...people, ...flagged];
}

function isFolded(chart: OrgChart, state: TreeState, key: string): boolean {
  const group = groupOf(chart, key);
  if (group) return !state.isGroupExpanded(key, group.ids.length);
  const { childIds, depth } = getNode(chart, key);
  return childIds.length > 0 && !state.isExpanded(key, depth);
}

/** The cards that unfolding a team or a heading puts on screen: the page of it shown, and the teams below that are unfolded already. */
function cardsBelow(chart: OrgChart, state: TreeState, listKey: string): number {
  let cards = 0;
  const lists = [listKey];
  for (let list = lists.pop(); list !== undefined; list = lists.pop()) {
    for (const id of listMembers(chart, list).slice(0, state.shownCount(list))) {
      const { childIds, depth } = getNode(chart, id);
      cards += 1;
      if (childIds.length > 0 && state.isExpanded(id, depth)) lists.push(id);
    }
  }
  return cards;
}
