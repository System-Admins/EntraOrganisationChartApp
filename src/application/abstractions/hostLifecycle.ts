/** What a host tells the chart about its page beyond the browser's own events: Teams suspends a page it may resume as it was. */
export interface HostLifecycle {
  /** Before the host suspends the page or ends it. Returns what stops listening. */
  onSuspend(listener: () => void): () => void;
  /** After the host resumed a suspended page as it was, which may be hours later. Returns what stops listening. */
  onResume(listener: () => void): () => void;
}
