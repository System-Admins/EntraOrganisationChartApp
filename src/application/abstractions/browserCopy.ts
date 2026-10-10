/** Something the chart keeps in this browser between visits, which Sign out and Forget this browser's copy delete. */
export interface BrowserCopy {
  /** Never rejects: a browser that refuses to delete is reported on the console, as there is nothing else to try. */
  forget(): Promise<void>;
}
