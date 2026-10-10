import { getDepartment, type DepartmentNode, type DepartmentTree } from '@/domain/orgChart/departmentTree';
import { EXPAND_ALL_CARD_BUDGET } from '../orgChart/expansionPlan';

/** What Expand all unfolds in the chart of departments, as planExpandAll does for people. */
export interface DepartmentExpansion {
  /** For ChartViewStore.expandToDepth: departments shallower than this show the departments below them. */
  readonly depth: number;
  readonly visibleLevels: number;
  readonly totalLevels: number;
  readonly complete: boolean;
}

/** Every level of departments whose cards fit the budget, the departments at the top whatever their number. */
export function planDepartmentExpandAll(tree: DepartmentTree, budget = EXPAND_ALL_CARD_BUDGET): DepartmentExpansion {
  const perLevel: number[] = [];
  for (const { depth } of tree.nodes.values()) perLevel[depth] = (perLevel[depth] ?? 0) + 1;
  const totalLevels = perLevel.length;
  let cards = 0;
  let visibleLevels = 0;
  for (const count of perLevel) {
    if (visibleLevels > 0 && cards + count > budget) break;
    cards += count;
    visibleLevels++;
  }
  const complete = visibleLevels === totalLevels;
  return { depth: complete ? totalLevels : visibleLevels - 1, visibleLevels, totalLevels, complete };
}

/** Whether the chart of departments shows the department: every department above it is unfolded. */
export function isDepartmentShown(tree: DepartmentTree, isUnfolded: (department: DepartmentNode) => boolean, id: string): boolean {
  const department = tree.nodes.get(id);
  if (!department) return false;
  for (let above = department.parentId; above !== null; ) {
    const parent = getDepartment(tree, above);
    if (!isUnfolded(parent)) return false;
    above = parent.parentId;
  }
  return true;
}

/** The folded departments among `siblings` that '*' unfolds, as far as the departments they show fit beside the `shownCards` on screen. */
export function planDepartmentUnfold(
  tree: DepartmentTree,
  siblings: readonly string[],
  isUnfolded: (department: DepartmentNode) => boolean,
  shownCards: number,
  budget = EXPAND_ALL_CARD_BUDGET,
): { readonly ids: readonly string[]; readonly folded: number } {
  const folded = siblings.map((id) => getDepartment(tree, id)).filter((department) => department.childIds.length > 0 && !isUnfolded(department));
  const ids: string[] = [];
  let cards = shownCards;
  for (const department of folded) {
    if (cards + department.childIds.length > budget) break;
    cards += department.childIds.length;
    ids.push(department.id);
  }
  return { ids, folded: folded.length };
}
