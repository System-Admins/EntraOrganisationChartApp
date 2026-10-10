import { departmentTree, type DepartmentTree } from '@/domain/orgChart/departmentTree';
import type { OrgChart } from '@/domain/orgChart/orgChart';

/** The list of the people without a department, which no department's id can be: every key has a letter or a digit. */
export const NO_DEPARTMENT = '';

// Kept per chart, as the panel, the details and the department chart all ask on every render.
const trees = new WeakMap<OrgChart, DepartmentTree>();

/** The chart's departments, worked out once per chart. */
export function departmentsOf(chart: OrgChart): DepartmentTree {
  let tree = trees.get(chart);
  if (tree === undefined) {
    tree = departmentTree(chart);
    trees.set(chart, tree);
  }
  return tree;
}

/** The element in `container` that opens the department, a row or a part of a path; compared by value, as ids hold '/' and ':'. */
export function departmentRowIn(container: ParentNode | null, id: string): HTMLElement | null {
  const rows = container?.querySelectorAll<HTMLElement>('[data-department-id]') ?? [];
  return Array.from(rows).find((row) => row.dataset.departmentId === id) ?? null;
}
