import type { BrowserCopy } from './browserCopy';

/** The most people Search lists as opened lately. */
export const RECENT_PEOPLE_LIMIT = 8;

/** The people a person opened lately in this browser, by directory id only: their names and details come from the chart. */
export interface RecentPeopleStore extends BrowserCopy {
  /** Newest first, at most RECENT_PEOPLE_LIMIT; empty where the browser stores nothing. */
  list(): readonly string[];
  /** Puts the person first, once. */
  remember(employeeId: string): void;
  clear(): void;
}
