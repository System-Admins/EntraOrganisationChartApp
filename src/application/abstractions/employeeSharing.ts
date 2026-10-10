import type { Employee } from '@/domain/employees/employee';

/** 'manual': neither a share sheet nor the clipboard took the link, so the user has to copy it. */
export type ShareResult =
  | { readonly outcome: 'shared' | 'copied' | 'cancelled' }
  | { readonly outcome: 'manual'; readonly url: string };

/** 'share': a share sheet or the host's share dialog comes first; 'copy': the link goes straight to the clipboard. */
export type ShareMethod = 'share' | 'copy';

export interface EmployeeSharing {
  /** Call from a click handler: share sheets and the clipboard need a user gesture. */
  share(employee: Employee): Promise<ShareResult>;
  /** What `share` will try first, so its button can be named for it. */
  method(): ShareMethod;
}
