import { RECENT_PEOPLE_LIMIT, type RecentPeopleStore } from '@/application/abstractions/recentPeopleStore';
import { readStoredJson, removeStored, writeStoredJson } from './browserStorage';

const STORAGE_KEY = 'orgapp.recentPeople';

/** In localStorage, ids only: anything else about a person comes from the directory, which Sign out deletes. */
export class StorageRecentPeopleStore implements RecentPeopleStore {
  /** Set by Sign out and Forget this browser's copy, after which this page keeps nobody, whatever is opened before it leaves. */
  private forgotten = false;

  list(): string[] {
    const stored = readStoredJson(STORAGE_KEY);
    // Another version may have written something else; what can't be an id is skipped, and a list too long is cut.
    const ids = Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string' && id !== '') : [];
    return [...new Set(ids)].slice(0, RECENT_PEOPLE_LIMIT);
  }

  remember(employeeId: string): void {
    if (this.forgotten) return;
    // Without storage, Search offers nobody as recent.
    writeStoredJson(STORAGE_KEY, [employeeId, ...this.list().filter((id) => id !== employeeId)].slice(0, RECENT_PEOPLE_LIMIT));
  }

  clear(): void {
    removeStored(STORAGE_KEY);
  }

  forget(): Promise<void> {
    this.forgotten = true;
    if (!removeStored(STORAGE_KEY)) console.warn('Could not delete the recent people.');
    return Promise.resolve();
  }
}
