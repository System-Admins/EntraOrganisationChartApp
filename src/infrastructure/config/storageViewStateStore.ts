import { SAVED_TOGGLES_LIMIT, type SavedView, type ViewStateStore } from '@/application/abstractions/viewStateStore';
import type { HostKind } from '@/application/settings/hostKind';
import { isRecord, readStoredJson, removeStored, writeStoredJson } from './browserStorage';

const STORAGE_KEY = 'orgapp.savedViews';

/** The most charts a host keeps a view of, the latest saved: a person may use several Teams tabs or department pages. */
export const SAVED_SCOPES_PER_HOST = 10;

/** In localStorage as { [host]: { [scope]: view } }: Teams, embedding pages and the chart's own site each keep their own. */
export class StorageViewStateStore implements ViewStateStore {
  /** Set by Sign out and Forget this browser's copy, here or in another tab, after which this page saves nothing as it goes. */
  private forgotten = false;

  constructor(private readonly host: HostKind) {
    window.addEventListener('storage', this.removedElsewhere);
  }

  get(scope: string): SavedView | null {
    return this.viewsOfHost().get(scope) ?? null;
  }

  save(scope: string, view: SavedView): void {
    if (this.forgotten) return;
    const views = this.viewsOfHost();
    views.set(scope, view);
    this.write([...views].sort(([, a], [, b]) => b.savedAt.getTime() - a.savedAt.getTime()).slice(0, SAVED_SCOPES_PER_HOST));
  }

  remove(scope: string): void {
    const views = this.viewsOfHost();
    if (views.delete(scope)) this.write([...views]);
  }

  forget(): Promise<void> {
    this.forgotten = true;
    if (!removeStored(STORAGE_KEY)) console.warn('Could not delete the saved views of the chart.');
    return Promise.resolve();
  }

  /** Stops listening to the other tabs; the page never needs to, its tests do. */
  dispose(): void {
    window.removeEventListener('storage', this.removedElsewhere);
  }

  /** The other hosts' views stay as they are; without storage, the chart opens as the start choice says. */
  private write(views: readonly (readonly [string, SavedView])[]): void {
    const stored = readStoredJson(STORAGE_KEY);
    writeStoredJson(STORAGE_KEY, {
      ...(isRecord(stored) ? stored : {}),
      [this.host]: Object.fromEntries(views.map(([scope, view]) => [scope, { ...view, savedAt: view.savedAt.getTime() }])),
    });
  }

  /** The views this host saved that can still be read: another version may have written others. */
  private viewsOfHost(): Map<string, SavedView> {
    const stored = readStoredJson(STORAGE_KEY);
    const views = isRecord(stored) ? stored[this.host] : undefined;
    if (!isRecord(views)) return new Map();
    const readable = Object.entries(views).flatMap(([scope, value]) => {
      const view = viewOf(value);
      return view ? [[scope, view] as const] : [];
    });
    return new Map(readable);
  }

  /** Sign out in another tab reloads this one through the sign-out channel, and a view saved on the way out would outlive it. */
  private readonly removedElsewhere = (event: StorageEvent): void => {
    // A key of null: the other tab cleared the whole storage.
    if (event.key === null || (event.key === STORAGE_KEY && event.newValue === null)) this.forgotten = true;
  };
}

function viewOf(value: unknown): SavedView | null {
  if (!isRecord(value)) return null;
  const { depth, toggled, selectedId, currentId, savedAt } = value;
  const valid =
    typeof depth === 'number' &&
    Number.isInteger(depth) &&
    depth >= 0 &&
    Array.isArray(toggled) &&
    isIdOrNull(selectedId) &&
    isIdOrNull(currentId) &&
    typeof savedAt === 'number' &&
    Number.isFinite(savedAt);
  if (!valid) return null;
  return { depth, toggled: toggled.filter(isToggle).slice(-SAVED_TOGGLES_LIMIT), selectedId, currentId, savedAt: new Date(savedAt) };
}

function isIdOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value !== '');
}

function isToggle(value: unknown): value is readonly [string, boolean] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'boolean';
}
