import { memo, useCallback, useId, useSyncExternalStore, type CSSProperties } from 'react';
import { getNode, type OrgChart } from '@/domain/orgChart/orgChart';
import { formatPeople } from '../../shared/formatPeople';
import { Icon } from '../../shared/Icon';
import { useLanguage, useStrings } from '../../shared/languageContext';
import { FLAG_LABELS } from '../../shared/strings';
import type { ChartViewStore } from './chartViewStore';
import { EmployeeCard, UnlistedCard } from './EmployeeCard';
import styles from './OrgChart.module.css';
import { TREE_STRINGS } from './strings';
import { firstTreeItem, PAGE_SIZE, shownPage, showMoreKey, type FlagGroup } from './treeItems';

interface BranchProps {
  readonly chart: OrgChart;
  readonly id: string;
  readonly store: ChartViewStore;
  /** The card's level in the tree: the person's level, and one more under a heading. */
  readonly level: number;
  /** The card's place among the people of its list, and their number, those a page leaves out included. */
  readonly position: number;
  readonly setSize: number;
  /** A top person's area colour, which every card below inherits (areaColors.ts). */
  readonly areaStyle?: CSSProperties;
}

export const OrgBranch = memo(function OrgBranch({ chart, id, store, level, position, setSize, areaStyle }: BranchProps) {
  const node = getNode(chart, id);
  const expanded = useSyncExternalStore(store.subscribe, () => store.isExpanded(id, node.depth));
  const selected = useSyncExternalStore(store.subscribe, () => store.selectedId === id);
  const highlight = useSyncExternalStore(store.subscribe, () => {
    const focus = store.focusRequest;
    return focus?.reason === 'reveal' && focus.id === id ? focus.sequence : 0;
  });
  const isFirst = firstTreeItem(chart) === id;
  const tabbable = useSyncExternalStore(
    store.subscribe,
    () => store.currentId === id || (store.currentId === null && isFirst),
  );
  const groupId = useId();
  const hasReports = node.childIds.length > 0;
  const showReports = hasReports && expanded;
  const activate = useCallback(() => {
    store.activate(id, node.depth, hasReports);
  }, [store, id, node.depth, hasReports]);
  const toggle = useCallback(() => {
    store.toggle(id, node.depth);
  }, [store, id, node.depth]);
  const makeCurrent = useCallback(() => {
    store.setCurrent(id);
  }, [store, id]);

  return (
    <li role="none" className={styles.branch} style={areaStyle}>
      {node.unlisted ? (
        <UnlistedCard
          node={node}
          level={level}
          position={position}
          setSize={setSize}
          expanded={expanded}
          tabbable={tabbable}
          groupId={showReports ? groupId : undefined}
          onToggle={toggle}
          onFocus={makeCurrent}
        />
      ) : (
        <EmployeeCard
          node={node}
          level={level}
          position={position}
          setSize={setSize}
          expanded={expanded}
          selected={selected}
          highlight={highlight}
          tabbable={tabbable}
          groupId={showReports ? groupId : undefined}
          onActivate={activate}
          onToggle={toggle}
          onFocus={makeCurrent}
        />
      )}
      {showReports && (
        <PeopleGroup chart={chart} listKey={id} ids={node.childIds} store={store} groupId={groupId} level={level + 1} />
      )}
    </li>
  );
});

interface FlagHeadingProps {
  readonly chart: OrgChart;
  readonly group: FlagGroup;
  readonly store: ChartViewStore;
  /** The heading's place at the top of the tree, after the people there, and the number of items there. */
  readonly position: number;
  readonly setSize: number;
}

/** A tree item over the people with one flag, each heading a branch of their own. It is nobody: it only folds and unfolds them. */
export const FlagHeading = memo(function FlagHeading({ chart, group, store, position, setSize }: FlagHeadingProps) {
  const { flag, key, ids } = group;
  const t = useStrings(TREE_STRINGS);
  const flagLabels = useStrings(FLAG_LABELS);
  const language = useLanguage();
  const expanded = useSyncExternalStore(store.subscribe, () => store.isGroupExpanded(key, ids.length));
  const isFirst = firstTreeItem(chart) === key;
  const tabbable = useSyncExternalStore(
    store.subscribe,
    () => store.currentId === key || (store.currentId === null && isFirst),
  );
  const groupId = useId();
  const labelId = useId();

  return (
    <li role="none" className={styles.branch}>
      {/* Named by its words alone, as a name from its content would take in the people it owns. */}
      <div
        role="treeitem"
        tabIndex={tabbable ? 0 : -1}
        aria-labelledby={labelId}
        aria-level={1}
        aria-posinset={position}
        aria-setsize={setSize}
        aria-expanded={expanded}
        aria-owns={expanded ? groupId : undefined}
        data-tree-key={key}
        className={styles.heading}
        onClick={() => {
          store.toggleGroup(key, ids.length);
        }}
        onFocus={() => {
          store.setCurrent(key);
        }}
      >
        <Icon name="warning" size={14} />
        <span id={labelId} className={styles.headingText}>
          {t.heading(flagLabels[flag], formatPeople(ids.length, language))}
        </span>
        <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={14} />
      </div>
      {expanded && <PeopleGroup chart={chart} listKey={key} ids={ids} store={store} groupId={groupId} level={2} />}
    </li>
  );
});

interface PeopleGroupProps {
  readonly chart: OrgChart;
  /** The manager's id, or the heading's key. */
  readonly listKey: string;
  /** Everyone in the list, in name order. */
  readonly ids: readonly string[];
  readonly store: ChartViewStore;
  readonly groupId: string;
  /** The tree's level of the people in the list. */
  readonly level: number;
}

/** A page of a list: people without teams stacked in two columns, those with teams side by side, then Show more where it goes on. */
function PeopleGroup({ chart, listKey, ids, store, groupId, level }: PeopleGroupProps) {
  const shown = useSyncExternalStore(store.subscribe, () => store.shownCount(listKey));
  const { individuals, managers, hidden } = shownPage(chart, ids, shown);
  // Numbered in the order the tree lists them, which the arrow keys follow: the stacked people come first.
  const branch = (childId: string, position: number) => (
    <OrgBranch key={childId} chart={chart} id={childId} store={store} level={level} position={position} setSize={ids.length} />
  );
  const stacked = individuals.map((childId, index) => branch(childId, index + 1));
  const sideBySide = managers.map((childId, index) => branch(childId, individuals.length + index + 1));
  const more = hidden > 0 && <ShowMore chart={chart} listKey={listKey} ids={ids} shown={shown} store={store} level={level} />;

  if (managers.length === 0 && individuals.length > 1) {
    return (
      <ul role="group" id={groupId} className={styles.stack}>
        {stacked}
        {more}
      </ul>
    );
  }

  return (
    <ul role="group" id={groupId} className={styles.row}>
      {individuals.length > 1 ? (
        <li role="none" className={styles.stackColumn}>
          <ul role="none" className={styles.stack}>
            {stacked}
          </ul>
        </li>
      ) : (
        stacked
      )}
      {sideBySide}
      {more}
    </ul>
  );
}

interface ShowMoreProps {
  readonly chart: OrgChart;
  readonly listKey: string;
  readonly ids: readonly string[];
  readonly shown: number;
  readonly store: ChartViewStore;
  readonly level: number;
}

/** Ends the page of a list that goes on, standing in for the people not shown yet, and numbered as the first of them. */
function ShowMore({ chart, listKey, ids, shown, store, level }: ShowMoreProps) {
  const t = useStrings(TREE_STRINGS);
  const key = showMoreKey(listKey);
  const tabbable = useSyncExternalStore(store.subscribe, () => store.currentId === key);
  const hidden = ids.length - shown;

  return (
    <li role="none" className={styles.moreItem}>
      <div
        role="treeitem"
        tabIndex={tabbable ? 0 : -1}
        aria-level={level}
        aria-posinset={shown + 1}
        aria-setsize={ids.length}
        data-tree-key={key}
        className={styles.more}
        onClick={() => {
          store.showMore(chart, listKey);
        }}
        onFocus={() => {
          store.setCurrent(key);
        }}
      >
        <span className={styles.moreOnScreen}>{t.showMore(Math.min(PAGE_SIZE, hidden), hidden)}</span>
        {/* Paper can't show more, so it says how many people it leaves out; the screen's words name the item. */}
        <span className={styles.moreOnPaper} aria-hidden="true">
          {t.notShown(hidden)}
        </span>
      </div>
    </li>
  );
}
