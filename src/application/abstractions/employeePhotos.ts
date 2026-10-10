import type { BrowserCopy } from './browserCopy';

/** forget() drops the photos kept in memory and in the browser. */
export interface EmployeePhotos extends BrowserCopy {
  /** A URL usable as <img src> (typically a data: URL), or null when the person has no photo. */
  getPhotoUrl(employeeId: string): Promise<string | null>;
  /** Asks without loading the photos. People the source has no answer for are left out, and so are those not asked yet as `signal` aborts. Rejects at the first request that fails, and reports no progress after that. */
  havePhotos(
    employeeIds: readonly string[],
    onProgress?: (askedCount: number) => void,
    signal?: AbortSignal,
  ): Promise<ReadonlyMap<string, boolean>>;
}
