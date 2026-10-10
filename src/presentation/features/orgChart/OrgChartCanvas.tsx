import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import type { OrgChart } from '@/domain/orgChart/orgChart';
import { useStrings } from '../../shared/languageContext';
import { CardHeightProbe } from './CardHeightProbe';
import type { ChartViewStore } from './chartViewStore';
import { planUnfold } from './expansionPlan';
import { FlagHeading, OrgBranch } from './OrgBranch';
import styles from './OrgChart.module.css';
import { TREE_STRINGS } from './strings';
import { centreOn, focusOptions, isOutline, usePrintZoom } from './treeCanvas';
import { findTreeItem, groupOf, isHeadingKey, listMembers, listOf, listOfShowMore, treeRoots } from './treeItems';
import { usePan } from './usePan';
import { useTreeKeyboard, type ItemKeys } from './useTreeKeyboard';
import { ScrollRootContext } from '../../shared/useInView';
import { areaStyles } from './areaColors';
import type { FocusOptions } from './useZoom';

interface OrgChartCanvasProps {
  readonly chart: OrgChart;
  readonly store: ChartViewStore;
  readonly zoom: number;
  readonly viewport: HTMLDivElement | null;
  readonly viewportRef: (element: HTMLDivElement | null) => void;
  readonly onFocus: (element: HTMLElement, options: FocusOptions) => void;
  readonly label: string;
  /** The '/' key: go to the search field. */
  readonly onSearchShortcut: () => void;
  /** The '*' key unfolded `unfolded` of the `folded` teams beside the item, or with `groups` the headings' groups; fewer where the card budget stopped it. */
  readonly onExpandSiblings: (unfolded: number, folded: number, groups: boolean) => void;
}

export function OrgChartCanvas({
  chart,
  store,
  zoom,
  viewport,
  viewportRef,
  onFocus,
  label,
  onSearchShortcut,
  onExpandSiblings,
}: OrgChartCanvasProps) {
  usePan(viewport, styles.panning ?? '');
  const t = useStrings(TREE_STRINGS);
  const canvasRef = useRef<HTMLDivElement>(null);
  const focusRequest = useSyncExternalStore(store.subscribe, () => store.focusRequest);
  const handledFocus = useRef(0);
  const areas = useMemo(() => areaStyles(chart.topPersonIds), [chart.topPersonIds]);
  const roots = treeRoots(chart);
  // The people at the top and the headings after them are the top level's items, which aria-setsize counts.
  const topItems = roots.people.length + roots.groups.length;

  // Later charts, e.g. after a refresh, keep the user's scroll position.
  const initialChart = useRef(chart);
  useLayoutEffect(() => {
    if (viewport) centreOn(viewport, treeRoots(initialChart.current).people);
  }, [viewport]);

  // Runs after the team and the details panel are laid out. The sequence check avoids repeating a handled request.
  useEffect(() => {
    if (!focusRequest || !viewport || handledFocus.current === focusRequest.sequence) return;
    handledFocus.current = focusRequest.sequence;
    if (focusRequest.reason === 'overview') {
      centreOn(viewport, treeRoots(chart).people);
      return;
    }
    const item = findTreeItem(viewport, focusRequest.id);
    if (!item) return;
    const branch = focusRequest.reason === 'expand' ? item.parentElement : null;
    onFocus(branch ?? item, focusOptions(focusRequest.reason, isOutline(viewport)));
    // Search and the panel leave the focus elsewhere, and Show more may be gone with its last page.
    if (focusRequest.reason === 'reveal' || focusRequest.reason === 'showMore') item.focus({ preventScroll: true });
  }, [focusRequest, viewport, onFocus, chart]);

  usePrintZoom(viewport, canvasRef, zoom);

  // The people of a list that its page shows, which are the items beside one another in the tree.
  const shownOf = (listKey: string) => listMembers(chart, listKey).slice(0, store.shownCount(listKey));

  const keysOf = (key: string): ItemKeys | null => {
    const node = chart.nodes.get(key);
    if (node) {
      const { depth, childIds, unlisted } = node;
      const list = listOf(chart, key);
      const toggle = () => {
        store.toggle(key, depth);
      };
      return {
        expanded: childIds.length > 0 ? store.isExpanded(key, depth) : null,
        toggle,
        // An unlisted person's place is nobody to select, as a click on it shows.
        press: unlisted
          ? () => {
              if (childIds.length > 0) toggle();
            }
          : () => {
              store.activate(key, depth, childIds.length > 0);
            },
        parentKey: list,
        siblings: list === null ? roots.people : shownOf(list),
      };
    }
    const group = groupOf(chart, key);
    if (group) {
      const toggle = () => {
        store.toggleGroup(key, group.ids.length);
      };
      const headings = roots.groups.map((other) => other.key);
      return { expanded: store.isGroupExpanded(key, group.ids.length), toggle, press: toggle, parentKey: null, siblings: headings };
    }
    const list = listOfShowMore(key);
    if (list === null) return null;
    const showMore = () => {
      store.showMore(chart, list);
    };
    return { expanded: null, toggle: () => undefined, press: showMore, parentKey: list, siblings: shownOf(list) };
  };

  const handleTreeKeyDown = useTreeKeyboard({
    viewport,
    keysOf,
    // An unlisted place's stand-in is named '', which no letters match, where null would compare its words.
    nameOf: (key) => chart.nodes.get(key)?.employee.displayName ?? null,
    onFocus,
    onSearchShortcut,
    // The item's own team or group and those beside it, as far as the card budget goes; a heading's are all the headings.
    onExpandSiblings: (key, siblings, shownCards) => {
      const plan = planUnfold(chart, siblings, store, shownCards);
      store.expandMany(plan.ids, key);
      onExpandSiblings(plan.ids.length, plan.folded, isHeadingKey(key));
    },
  });

  return (
    <div ref={viewportRef} className={styles.viewport}>
      <div className={styles.stage}>
        <div ref={canvasRef} className={styles.canvas} style={{ zoom, '--chart-zoom': zoom } as CSSProperties}>
          <ScrollRootContext value={viewport}>
            <ul role="tree" aria-label={label} className={styles.forest} onKeyDown={handleTreeKeyDown}>
              {roots.people.map((id, index) => (
                <OrgBranch
                  key={id}
                  chart={chart}
                  id={id}
                  store={store}
                  level={1}
                  position={index + 1}
                  setSize={topItems}
                  areaStyle={areas.get(id)}
                />
              ))}
              {roots.groups.map((group, index) => (
                <FlagHeading
                  key={group.key}
                  chart={chart}
                  group={group}
                  store={store}
                  position={roots.people.length + index + 1}
                  setSize={topItems}
                />
              ))}
            </ul>
          </ScrollRootContext>
        </div>
      </div>
      {/* On paper only, where a list goes on (OrgChart.module.css); after the stage, which useZoom takes for the chart. */}
      <p className={styles.printNotice}>{t.printNotice}</p>
      <CardHeightProbe chart={chart} canvasRef={canvasRef} />
    </div>
  );
}
