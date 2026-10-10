import type { DirectorySnapshot, DirectoryStatus, EmployeeDirectory } from '@/application/abstractions/employeeDirectory';

/** Kept nowhere and read without change tracking, as with demo data. */
const NOTHING_KEPT: DirectoryStatus = { fullReadAt: null, tracksChanges: false, browserCopy: 'off' };

/** Test fixture: a directory whose snapshot is whatever `current` returns. */
export function directoryOf(current: () => DirectorySnapshot, status: DirectoryStatus = NOTHING_KEPT): EmployeeDirectory {
  return {
    getSnapshot: () => Promise.resolve(current()),
    refresh: () => Promise.resolve(current()),
    forget: () => Promise.resolve(),
    status: () => status,
  };
}
