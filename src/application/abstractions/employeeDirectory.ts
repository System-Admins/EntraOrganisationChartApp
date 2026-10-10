import type { Employee } from '@/domain/employees/employee';
import type { BrowserCopy } from './browserCopy';

export interface DirectorySnapshot {
  readonly employees: readonly Employee[];
  readonly loadedAt: Date;
}

/** `total` is about how many there are in all, where the source can tell: an eventually consistent count can be a little off. */
export type ProgressListener = (loadedCount: number, total?: number | null) => void;

/** 'off': config.json keeps no copy (directory.cacheInBrowser); 'failed': the browser refused the latest one, full or blocked. */
export const BROWSER_COPY_STATES = ['kept', 'off', 'failed'] as const;

export type BrowserCopyState = (typeof BROWSER_COPY_STATES)[number];

/** How the directory was read and is kept, as far as this page knows: what IT asks when changes don't show. */
export interface DirectoryStatus {
  /** When everything was last read rather than only what changed; null where this browser has no record of it. */
  readonly fullReadAt: Date | null;
  /** Whether the next refresh can read only what changed since the last one. */
  readonly tracksChanges: boolean;
  readonly browserCopy: BrowserCopyState;
}

/** Rejects with SignInRequiredError when a sign-in is needed and with ServiceError when the service fails. */
export interface EmployeeDirectory extends BrowserCopy {
  /** The latest snapshot regardless of age; loads from the source only when none exists. */
  getSnapshot(onProgress?: ProgressListener): Promise<DirectorySnapshot>;
  /** Loads only what changed when the source can tell, everything with `full`. Concurrent calls share one load. */
  refresh(onProgress?: ProgressListener, full?: boolean): Promise<DirectorySnapshot>;
  /** Drops the snapshot from memory and from the browser. */
  forget(): Promise<void>;
  status(): DirectoryStatus;
}
