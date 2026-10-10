import { memo, useCallback, useId, useMemo, useSyncExternalStore } from 'react';
import { getDepartment, type DepartmentTree } from '@/domain/orgChart/departmentTree';
import { getNode, type OrgChart } from '@/domain/orgChart/orgChart';
import type { ChartViewStore } from '../orgChart/chartViewStore';
import chartStyles from '../orgChart/OrgChart.module.css';
import { DepartmentCard } from './DepartmentCard';

interface DepartmentBranchProps {
  readonly chart: OrgChart;
  readonly tree: DepartmentTree;
  readonly id: string;
  /** Departments by id, the people chart's store over another tree. */
  readonly store: ChartViewStore;
  readonly level: number;
  readonly position: number;
  readonly setSize: number;
}

export const DepartmentBranch = memo(function DepartmentBranch({ chart, tree, id, store, level, position, setSize }: DepartmentBranchProps) {
  const department = getDepartment(tree, id);
  const { depth, childIds, leaderIds } = department;
  const expanded = useSyncExternalStore(store.subscribe, () => store.isExpanded(id, depth));
  const selected = useSyncExternalStore(store.subscribe, () => store.selectedId === id);
  const highlight = useSyncExternalStore(store.subscribe, () => {
    const focus = store.focusRequest;
    return focus?.reason === 'reveal' && focus.id === id ? focus.sequence : 0;
  });
  const isFirst = tree.rootIds[0] === id;
  const tabbable = useSyncExternalStore(store.subscribe, () => store.currentId === id || (store.currentId === null && isFirst));
  const groupId = useId();
  const hasBelow = childIds.length > 0;
  const showBelow = hasBelow && expanded;
  const leaders = useMemo(() => leaderIds.map((leaderId) => getNode(chart, leaderId).employee.displayName), [chart, leaderIds]);
  const activate = useCallback(() => {
    store.activate(id, depth, hasBelow);
  }, [store, id, depth, hasBelow]);
  const toggle = useCallback(() => {
    store.toggle(id, depth);
  }, [store, id, depth]);
  const makeCurrent = useCallback(() => {
    store.setCurrent(id);
  }, [store, id]);

  return (
    <li role="none" className={chartStyles.branch}>
      <DepartmentCard
        department={department}
        leaders={leaders}
        level={level}
        position={position}
        setSize={setSize}
        expanded={expanded}
        selected={selected}
        highlight={highlight}
        tabbable={tabbable}
        groupId={showBelow ? groupId : undefined}
        onActivate={activate}
        onToggle={toggle}
        onFocus={makeCurrent}
      />
      {showBelow && <DepartmentGroup chart={chart} tree={tree} ids={childIds} store={store} groupId={groupId} level={level + 1} />}
    </li>
  );
});

interface DepartmentGroupProps {
  readonly chart: OrgChart;
  readonly tree: DepartmentTree;
  readonly ids: readonly string[];
  readonly store: ChartViewStore;
  readonly groupId: string;
  readonly level: number;
}

/** The departments below one, laid out as the people chart lays out a page: those with nothing below stacked in two columns, the others side by side. */
function DepartmentGroup({ chart, tree, ids, store, groupId, level }: DepartmentGroupProps) {
  const leaves = ids.filter((id) => getDepartment(tree, id).childIds.length === 0);
  const branches = ids.filter((id) => getDepartment(tree, id).childIds.length > 0);
  // Numbered in the order the tree lists them, which the arrow keys follow: the stacked departments come first.
  const branch = (id: string, position: number) => (
    <DepartmentBranch key={id} chart={chart} tree={tree} id={id} store={store} level={level} position={position} setSize={ids.length} />
  );
  const stacked = leaves.map((id, index) => branch(id, index + 1));
  const sideBySide = branches.map((id, index) => branch(id, leaves.length + index + 1));

  if (branches.length === 0 && leaves.length > 1) {
    return (
      <ul role="group" id={groupId} className={chartStyles.stack}>
        {stacked}
      </ul>
    );
  }
  return (
    <ul role="group" id={groupId} className={chartStyles.row}>
      {leaves.length > 1 ? (
        <li role="none" className={chartStyles.stackColumn}>
          <ul role="none" className={chartStyles.stack}>
            {stacked}
          </ul>
        </li>
      ) : (
        stacked
      )}
      {sideBySide}
    </ul>
  );
}
