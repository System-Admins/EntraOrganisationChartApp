import type { ProgressListener } from '@/application/abstractions/employeeDirectory';
import type { Employee } from '@/domain/employees/employee';

export interface LoadedEmployees {
  readonly employees: readonly Employee[];
  /** Returns only what changed since this load; null when the source can't track changes. */
  readonly changesLink: string | null;
}

/** How far a full read got: the people read so far, the page to go on from, and what the read started with. */
export interface ReadPosition {
  readonly employees: readonly Employee[];
  readonly nextLink: string;
  readonly changesLink: string | null;
  /** About how many people there are in all, where the source could tell. */
  readonly total: number | null;
}

/** A full read's place between attempts, which only ever lives in memory: half a directory is never a chart. */
export interface ReadCheckpoint {
  /** Where to go on from, null to read from the start; an attempt that fails leaves it where that attempt stopped. */
  position: ReadPosition | null;
}

/** Where employees come from (Graph, demo data); caching is layered on top by CachedEmployeeDirectory. */
export interface EmployeeSource {
  loadAll(onProgress?: ProgressListener, checkpoint?: ReadCheckpoint): Promise<LoadedEmployees>;
  /** Null when the source asks for a full load instead, for example because the link expired. */
  loadChanges?(employees: readonly Employee[], changesLink: string): Promise<LoadedEmployees | null>;
}
