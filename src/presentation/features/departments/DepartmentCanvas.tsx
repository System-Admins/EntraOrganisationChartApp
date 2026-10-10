import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import type { DepartmentTree } from '@/domain/orgChart/departmentTree';
import type { OrgChart } from '@/domain/orgChart/orgChart';
import { ScrollRootContext } from '../../shared/useInView';
import type { ChartViewStore } from '../orgChart/chartViewStore';
import chartStyles from '../orgChart/OrgChart.module.css';
import { centreOn, focusOptions, isOutline, usePrintZoom } from '../orgChart/treeCanvas';
import { findTreeItem } from '../orgChart/treeItems';
import { usePan } from '../orgChart/usePan';
import { useTreeKeyboard, type ItemKeys } from '../orgChart/useTreeKeyboard';
import type { FocusOptions } from '../orgChart/useZoom';
import { DepartmentBranch } from './DepartmentBranch';
import { planDepartmentUnfold } from './departmentPlans';

/** Every card is as tall as one with a name of two lines and both lines under it, so the rows line up; the outline's tick meets the name. */
const CANVAS_STYLE = { '--card-body-height-tree': 'calc(84px * var(--text-scale))', '--tick-y': '23px' } as CSSProperties;

interface DepartmentCanvasProps {
  readonly chart: OrgChart;
  /** The chart's departments (departmentsOf). */
  readonly tree: DepartmentTree;
  /** Departments by id, as the people chart's store keeps people. */
  readonly store: ChartViewStore;
  readonly zoom: number;
  readonly viewport: HTMLDivElement | null;
  readonly viewportRef: (element: HTMLDivElement | null) => void;
  readonly onFocus: (element: HTMLElement, options: FocusOptions) => void;
  readonly label: string;
  /** The '/' key: go to the search field. */
  readonly onSearchShortcut: () => void;
  /** The '*' key unfolded `unfolded` of the `folded` departments beside the card; fewer where the card budget stopped it. */
  readonly onExpandSiblings: (unfolded: number, folded: number) => void;
}

/** The chart's departments in the chart's place, nested as their people report to each other, in the people chart's layout and keys. */
export function DepartmentCanvas({
  chart,
  tree,
  store,
  zoom,
  viewport,
  viewportRef,
  onFocus,
  label,
  onSearchShortcut,
  onExpandSiblings,
}: DepartmentCanvasProps) {
  usePan(viewport, chartStyles.panning ?? '');
  const canvasRef = useRef<HTMLDivElement>(null);
  const focusRequest = useSyncExternalStore(store.subscribe, () => store.focusRequest);
  const handledFocus = useRef(0);
  // The departments at the top, those of flagged branches aside, as the people chart centres its top persons.
  const tops = tree.rootIds.filter((id) => tree.nodes.get(id)?.flag === null);

  const initialTops = useRef(tops);
  useLayoutEffect(() => {
    if (viewport) centreOn(viewport, initialTops.current);
  }, [viewport]);

  // As the people chart's: after the departments are laid out, once per request.
  useEffect(() => {
    if (!focusRequest || !viewport || handledFocus.current === focusRequest.sequence) return;
    handledFocus.current = focusRequest.sequence;
    if (focusRequest.reason === 'overview') {
      centreOn(viewport, tree.rootIds.filter((id) => tree.nodes.get(id)?.flag === null));
      return;
    }
    const item = findTreeItem(viewport, focusRequest.id);
    if (!item) return;
    const branch = focusRequest.reason === 'expand' ? item.parentElement : null;
    onFocus(branch ?? item, focusOptions(focusRequest.reason, isOutline(viewport)));
    if (focusRequest.reason === 'reveal') item.focus({ preventScroll: true });
  }, [focusRequest, viewport, onFocus, tree]);

  usePrintZoom(viewport, canvasRef, zoom);

  const keysOf = (key: string): ItemKeys | null => {
    const department = tree.nodes.get(key);
    if (!department) return null;
    const { depth, childIds, parentId } = department;
    return {
      expanded: childIds.length > 0 ? store.isExpanded(key, depth) : null,
      toggle: () => {
        store.toggle(key, depth);
      },
      press: () => {
        store.activate(key, depth, childIds.length > 0);
      },
      parentKey: parentId,
      siblings: parentId === null ? tree.rootIds : (tree.nodes.get(parentId)?.childIds ?? []),
    };
  };

  const handleTreeKeyDown = useTreeKeyboard({
    viewport,
    keysOf,
    nameOf: (key) => tree.nodes.get(key)?.name ?? null,
    onFocus,
    onSearchShortcut,
    onExpandSiblings: (key, siblings, shownCards) => {
      const plan = planDepartmentUnfold(tree, siblings, ({ id, depth }) => store.isExpanded(id, depth), shownCards);
      store.expandMany(plan.ids, key);
      onExpandSiblings(plan.ids.length, plan.folded);
    },
  });

  return (
    <div ref={viewportRef} className={chartStyles.viewport}>
      <div className={chartStyles.stage}>
        <div ref={canvasRef} className={chartStyles.canvas} style={{ ...CANVAS_STYLE, zoom, '--chart-zoom': zoom } as CSSProperties}>
          <ScrollRootContext value={viewport}>
            <ul role="tree" aria-label={label} className={chartStyles.forest} onKeyDown={handleTreeKeyDown}>
              {tree.rootIds.map((id, index) => (
                <DepartmentBranch
                  key={id}
                  chart={chart}
                  tree={tree}
                  id={id}
                  store={store}
                  level={1}
                  position={index + 1}
                  setSize={tree.rootIds.length}
                />
              ))}
            </ul>
          </ScrollRootContext>
        </div>
      </div>
    </div>
  );
}
