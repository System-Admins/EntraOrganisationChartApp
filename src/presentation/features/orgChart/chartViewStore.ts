import { SAVED_TOGGLES_LIMIT, type ChartView } from '@/application/abstractions/viewStateStore';
import { namedEmployee, type OrgChart } from '@/domain/orgChart/orgChart';
import {
  firstAdded,
  hasTreeItem,
  isHeadingKey,
  isShown,
  listMembers,
  opensUnfolded,
  PAGE_SIZE,
  revealTargetOf,
  type RevealTarget,
  type TreeState,
} from './treeItems';

/** 'reveal' comes from search or the details panel, 'expandMany' from the '*' key, 'showMore' from a list's Show more; the others from a click on the item itself. */
export type FocusReason = 'expand' | 'collapse' | 'select' | 'reveal' | 'expandMany' | 'showMore';

/** `sequence` grows with every request, so asking again for the same person still scrolls to them. */
export type FocusRequest =
  | { readonly reason: FocusReason; readonly id: string; readonly sequence: number }
  /** Back to the top persons, after the whole chart was folded or unfolded. */
  | { readonly reason: 'overview'; readonly id: null; readonly sequence: number };

/** Read per item through useSyncExternalStore. Nodes above `defaultDepth` start expanded, headings by their size; toggles override that. */
export class ChartViewStore implements TreeState {
  private defaultDepth: number;
  private started = false;
  /** By a person's id, or a heading's key (treeItems.ts). */
  private readonly overrides = new Map<string, boolean>();
  /** How many people a list shows where that is more than its first page, by its manager's id or its heading's key. */
  private readonly pages = new Map<string, number>();
  private selected: string | null = null;
  private current: string | null = null;
  private focus: FocusRequest | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(defaultDepth: number) {
    this.defaultDepth = defaultDepth;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  isExpanded(id: string, depth: number): boolean {
    return this.overrides.get(id) ?? depth < this.defaultDepth;
  }

  isGroupExpanded(key: string, size: number): boolean {
    return this.overrides.get(key) ?? opensUnfolded(size);
  }

  shownCount(listKey: string): number {
    return this.pages.get(listKey) ?? PAGE_SIZE;
  }

  get hasStarted(): boolean {
    return this.started;
  }

  get selectedId(): string | null {
    return this.selected;
  }

  get focusRequest(): FocusRequest | null {
    return this.focus;
  }

  /** The item in the tab order (a roving tabindex): a person, a heading or a Show more item; null means the tree's first item. */
  get currentId(): string | null {
    return this.current;
  }

  setCurrent(id: string | null): void {
    if (this.current === id) return;
    this.current = id;
    this.emit();
  }

  /** Emits nothing, so it is safe to call while rendering the first chart. */
  startFrom(depth: number, reveal: RevealTarget | null = null): void {
    if (this.started) return;
    this.started = true;
    this.defaultDepth = depth;
    if (reveal) this.markRevealed(reveal);
  }

  /** Starts as a saved view left the chart, as far as its people are still in it; like startFrom, it emits nothing. */
  restore(view: ChartView, chart: OrgChart): void {
    if (this.started) return;
    this.started = true;
    this.defaultDepth = view.depth;
    for (const [key, expanded] of view.toggled) if (hasTreeItem(chart, key)) this.overrides.set(key, expanded);
    // Pages aren't saved: those that the item in the tab order needs open again, where nothing folded keeps it out of the tree.
    const currentId = view.currentId;
    const pages = new Map(currentId !== null && chart.nodes.has(currentId) ? revealTargetOf(chart, currentId).pages : []);
    const widened: TreeState = {
      isExpanded: (id, depth) => this.isExpanded(id, depth),
      isGroupExpanded: (key, size) => this.isGroupExpanded(key, size),
      shownCount: (list) => Math.max(this.shownCount(list), pages.get(list) ?? 0),
    };
    if (currentId !== null && isShown(chart, widened, currentId)) {
      this.widen(pages);
      this.current = currentId;
    }
    // The managers above are unfolded as well, in case the person has moved since.
    if (view.selectedId !== null && namedEmployee(chart, view.selectedId)) this.markRevealed(revealTargetOf(chart, view.selectedId));
  }

  /** What restore() takes, for the next visit. */
  toSnapshot(): ChartView {
    return {
      depth: this.defaultDepth,
      toggled: [...this.overrides].slice(-SAVED_TOGGLES_LIMIT),
      selectedId: this.selected,
      currentId: this.current,
    };
  }

  /** Expands every node shallower than `depth`, collapses the rest and forgets teams' toggles and pages; a heading, no team, stays as it was. */
  expandToDepth(depth: number): void {
    this.started = true;
    this.defaultDepth = depth;
    for (const key of this.overrides.keys()) if (!isHeadingKey(key)) this.overrides.delete(key);
    for (const key of this.pages.keys()) if (!isHeadingKey(key)) this.pages.delete(key);
    // The current card may now be folded away, which would leave nothing in the tab order.
    this.current = null;
    this.focus = { reason: 'overview', id: null, sequence: this.nextSequence() };
    this.emit();
  }

  select(id: string | null): void {
    this.selected = id;
    this.emit();
  }

  /** A click on a card: folds or unfolds the person's reports, selects them and centres their card. */
  activate(id: string, depth: number, hasReports: boolean): void {
    this.selected = id;
    if (hasReports) this.toggle(id, depth);
    else {
      this.current = id;
      this.requestFocus(id, 'select');
    }
  }

  /** Folds or unfolds and frames the result like a click on the card, but selects nobody. */
  toggle(id: string, depth: number): void {
    const expand = !this.isExpanded(id, depth);
    this.override(id, expand);
    this.current = id;
    this.requestFocus(id, expand ? 'expand' : 'collapse');
  }

  /** A heading, which only folds and unfolds the people under it: it is nobody to select. */
  toggleGroup(key: string, size: number): void {
    const expand = !this.isGroupExpanded(key, size);
    this.override(key, expand);
    this.current = key;
    this.requestFocus(key, expand ? 'expand' : 'collapse');
  }

  /** The next page of a list, a manager's reports or a heading's group. The focus goes to the first person it adds, as its Show more item may be gone. */
  showMore(chart: OrgChart, listKey: string): void {
    const shown = this.shownCount(listKey);
    const first = firstAdded(chart, listMembers(chart, listKey), shown);
    if (first === undefined) return;
    this.pages.set(listKey, shown + PAGE_SIZE);
    this.current = first;
    this.requestFocus(first, 'showMore');
  }

  /** Unfolds several teams or headings at once and keeps `currentId`, whose item they may push aside, in view. Selects nobody. */
  expandMany(ids: readonly string[], currentId: string): void {
    if (ids.length === 0) return;
    for (const id of ids) this.override(id, true);
    this.current = currentId;
    this.requestFocus(currentId, 'expandMany');
  }

  /** Back to how the chart opened: folded to `depth`, headings and pages as they start, the top persons centred, and only `selectedId`'s details open. */
  restart(depth: number, selectedId: string | null = null): void {
    this.selected = selectedId;
    this.overrides.clear();
    this.pages.clear();
    this.expandToDepth(depth);
  }

  /** Forgets a selected person whom the chart no longer names, e.g. after a refresh or other filters, and an item in the tab order that the tree no longer renders. */
  retain(chart: OrgChart): void {
    this.retainWhere(
      (id) => namedEmployee(chart, id) !== undefined,
      (id) => isShown(chart, this, id),
    );
  }

  /** As retain, for a tree of other items, such as the departments: `keeps` the selected one, `renders` the one in the tab order. */
  retainWhere(keeps: (id: string) => boolean, renders: (id: string) => boolean): void {
    const selected = this.selected !== null && keeps(this.selected) ? this.selected : null;
    const current = this.current !== null && renders(this.current) ? this.current : null;
    if (selected === this.selected && current === this.current) return;
    this.selected = selected;
    this.current = current;
    this.emit();
  }

  /** Expands the ancestors and the heading, shows the pages on the way, selects the person, and centres and marks their card. */
  revealEmployee(target: RevealTarget): void {
    this.markRevealed(target);
    this.emit();
  }

  private markRevealed({ id, ancestorIds: managers, heading, pages = [] }: RevealTarget): void {
    if (heading !== undefined) this.override(heading, true);
    for (const managerId of managers) this.override(managerId, true);
    this.widen(new Map(pages));
    this.selected = id;
    this.current = id;
    this.focus = { id, reason: 'reveal', sequence: this.nextSequence() };
  }

  /** Never narrows a page that someone showed more of. */
  private widen(pages: ReadonlyMap<string, number>): void {
    for (const [list, shown] of pages) this.pages.set(list, Math.max(this.shownCount(list), shown));
  }

  /** Kept in the order of the latest change, so that a saved view keeps the latest when it can't keep them all. */
  private override(id: string, expanded: boolean): void {
    this.overrides.delete(id);
    this.overrides.set(id, expanded);
  }

  private requestFocus(id: string, reason: FocusReason): void {
    this.focus = { id, reason, sequence: this.nextSequence() };
    this.emit();
  }

  private nextSequence(): number {
    return (this.focus?.sequence ?? 0) + 1;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
