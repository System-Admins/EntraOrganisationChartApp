import { mostUsedSpellings, nameKey } from '../text/nameKey';
import { getNode, ROOT_FLAGS, type OrgChart, type RootFlag } from './orgChart';

/** A department where the chart places it: under the department its leaders report into. One that people report into from several places is in each. */
export interface DepartmentNode {
  /** The keys from the top department down to this one, joined by '/', after the flag and ':' in a flagged branch; no key holds either. */
  readonly id: string;
  readonly key: string;
  /** The spelling most of the chart's people use. */
  readonly name: string;
  readonly parentId: string | null;
  /** By name, as the chart sorts people. */
  readonly childIds: readonly string[];
  /** In the outline's order. */
  readonly memberIds: readonly string[];
  /** The members whose nearest manager with a department is in another one, or who have no such manager. */
  readonly leaderIds: readonly string[];
  readonly depth: number;
  /** Its people and those of every department below it. */
  readonly total: number;
  /** Whether the same department also comes higher up its path: a loop of departments in the directory. */
  readonly insideItself: boolean;
  /** The flag of the branch it is in, which the people chart gathers under a heading; null outside flagged branches. */
  readonly flag: RootFlag | null;
}

export interface DepartmentTree {
  /** The top persons' departments first, in their order, then the rest by name, then those of flagged branches by flag, in ROOT_FLAGS' order. */
  readonly rootIds: readonly string[];
  readonly nodes: ReadonlyMap<string, DepartmentNode>;
  /** Each person's department, for everyone with one. */
  readonly departmentIdOf: ReadonlyMap<string, string>;
  /** The people without a department, in the outline's order; not the unlisted, whose places only pass the department above on. */
  readonly withoutDepartment: readonly string[];
}

interface Building {
  readonly id: string;
  readonly key: string;
  readonly parent: Building | null;
  readonly depth: number;
  readonly flag: RootFlag | null;
  /** The position in the chart's roots of the branch that reached it first. */
  readonly branch: number;
  readonly children: Map<string, Building>;
  readonly memberIds: string[];
  readonly leaderIds: string[];
  total: number;
  insideItself: boolean;
}

/** The departments of the chart on screen, nested as their people report to each other: a tree, as the chart is, so no loop of departments can make it go round. */
export function departmentTree(chart: OrgChart): DepartmentTree {
  const keys = new Map<string, string>();
  const keyOf = (department: string | null): string => {
    if (department === null) return '';
    let key = keys.get(department);
    if (key === undefined) {
      key = nameKey(department);
      keys.set(department, key);
    }
    return key;
  };
  const roots = new Map<RootFlag | null, Map<string, Building>>();
  const made: Building[] = [];
  const departmentIdOf = new Map<string, string>();
  const withoutDepartment: string[] = [];

  const childOf = (parent: Building | null, key: string, flag: RootFlag | null, branch: number): Building => {
    const siblings = parent?.children ?? roots.get(flag) ?? new Map<string, Building>();
    if (parent === null) roots.set(flag, siblings);
    const known = siblings.get(key);
    if (known !== undefined) return known;
    const id = parent !== null ? `${parent.id}/${key}` : flag === null ? key : `${flag}:${key}`;
    const department: Building = {
      id,
      key,
      parent,
      depth: parent === null ? 0 : parent.depth + 1,
      flag: parent === null ? flag : parent.flag,
      branch: parent === null ? branch : parent.branch,
      children: new Map(),
      memberIds: [],
      leaderIds: [],
      total: 0,
      insideItself: false,
    };
    siblings.set(key, department);
    made.push(department);
    return department;
  };

  chart.rootIds.forEach((rootId, branch) => {
    const { flag } = getNode(chart, rootId);
    // A stack rather than recursion, which a deep chain of managers could take past the call stack's limit.
    const stack: (readonly [string, Building | null])[] = [[rootId, null]];
    for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
      const [id, carried] = next;
      const node = getNode(chart, id);
      const key = keyOf(node.employee.department);
      let own = carried;
      if (key === '') {
        if (!node.unlisted) withoutDepartment.push(id);
      } else {
        own = carried !== null && carried.key === key ? carried : childOf(carried, key, flag, branch);
        if (own !== carried) own.leaderIds.push(id);
        own.memberIds.push(id);
        departmentIdOf.set(id, own.id);
      }
      for (const childId of node.childIds.toReversed()) stack.push([childId, own]);
    }
  });

  markPathsAndTotals([...roots.values()].flatMap((siblings) => [...siblings.values()]));

  const names = mostUsedSpellings(Array.from(chart.nodes.values(), ({ employee }) => employee.department));
  const nameOf = (department: Building): string => names.get(department.key) ?? department.key;
  // In the browser's own order of names, as the chart sorts people; the id settles names the collator finds equal.
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  const byName = (a: Building, b: Building) => collator.compare(nameOf(a), nameOf(b)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const nodes = new Map<string, DepartmentNode>();
  for (const department of made) {
    nodes.set(department.id, {
      id: department.id,
      key: department.key,
      name: nameOf(department),
      parentId: department.parent?.id ?? null,
      childIds: [...department.children.values()].sort(byName).map(({ id }) => id),
      memberIds: department.memberIds,
      leaderIds: department.leaderIds,
      depth: department.depth,
      total: department.total,
      insideItself: department.insideItself,
      flag: department.flag,
    });
  }

  const tops = chart.topPersonIds.length;
  const rootIds = [null, ...ROOT_FLAGS].flatMap((flag) =>
    [...(roots.get(flag)?.values() ?? [])]
      .sort((a, b) => {
        // The top persons' departments keep their order; any other comes after them, by name.
        const ofTops = Number(b.branch < tops) - Number(a.branch < tops);
        return ofTops || (a.branch < tops ? a.branch - b.branch : 0) || byName(a, b);
      })
      .map(({ id }) => id),
  );
  return { rootIds, nodes, departmentIdOf, withoutDepartment };
}

export function getDepartment(tree: DepartmentTree, id: string): DepartmentNode {
  const department = tree.nodes.get(id);
  if (!department) throw new Error(`Department ${id} is not part of the tree.`);
  return department;
}

/** The departments from the top down to this one, itself included. */
export function departmentPath(tree: DepartmentTree, id: string): DepartmentNode[] {
  const path: DepartmentNode[] = [];
  for (let next: string | null = id; next !== null; next = getDepartment(tree, next).parentId) path.push(getDepartment(tree, next));
  return path.reverse();
}

/** One walk down every department, which counts the keys on the way so that a department nested in itself is found without walking up again. */
function markPathsAndTotals(roots: readonly Building[]): void {
  const onPath = new Map<string, number>();
  const stack: (readonly [Building, boolean])[] = roots.map((root) => [root, false] as const);
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    const [department, done] = next;
    const seen = onPath.get(department.key) ?? 0;
    if (done) {
      onPath.set(department.key, seen - 1);
      department.total += department.memberIds.length;
      if (department.parent !== null) department.parent.total += department.total;
      continue;
    }
    department.insideItself = seen > 0;
    onPath.set(department.key, seen + 1);
    stack.push([department, true]);
    for (const child of department.children.values()) stack.push([child, false]);
  }
}
