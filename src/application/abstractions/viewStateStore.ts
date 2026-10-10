import type { BrowserCopy } from './browserCopy';

/** The most teams a saved view keeps folded or unfolded by hand, the latest ones; Expand all needs none of them. */
export const SAVED_TOGGLES_LIMIT = 200;

/** Where a person was in a chart: what was unfolded, whose details were open and which card was in the tab order. */
export interface ChartView {
  /** Levels unfolded throughout, as the chart opened or as Expand all or Collapse all left it. */
  readonly depth: number;
  /** Teams unfolded (true) or folded (false) by hand since, against `depth`; the latest last. */
  readonly toggled: readonly (readonly [string, boolean])[];
  readonly selectedId: string | null;
  readonly currentId: string | null;
}

export interface SavedView extends ChartView {
  readonly savedAt: Date;
}

/** One saved view per chart (`scope`, see viewScope) in this browser, kept apart for each host the chart runs in. */
export interface ViewStateStore extends BrowserCopy {
  /** Null where none was saved, or the browser stores nothing. */
  get(scope: string): SavedView | null;
  save(scope: string, view: SavedView): void;
  /** Forgets one chart's view, the others staying. */
  remove(scope: string): void;
}
