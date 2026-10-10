import type { DepartmentTree } from '@/domain/orgChart/departmentTree';
import { NO_DEPARTMENT } from './departmentsOf';

/** The departments opened one from another, the one on screen last. Opening one already in it goes back to it, which keeps Back's steps few. */
export function nextTrail(trail: readonly string[], id: string): readonly string[] {
  const index = trail.indexOf(id);
  return index === -1 ? [...trail, id] : trail.slice(0, index + 1);
}

/** The trail as far as the tree still has its departments, as a refresh or other filters can take them away. */
export function keptTrail(tree: DepartmentTree, trail: readonly string[]): readonly string[] {
  const gone = trail.findIndex((id) => (id === NO_DEPARTMENT ? tree.withoutDepartment.length === 0 : !tree.nodes.has(id)));
  return gone === -1 ? trail : trail.slice(0, gone);
}
