/** What `key` holds in localStorage as JSON; null where it holds nothing, nothing readable, or the browser refuses the page. */
export function readStoredJson(key: string): unknown {
  // Never throws: storage can be blocked, and what it holds can be broken or written by another version.
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as unknown;
  } catch {
    return null;
  }
}

/** Whether the browser stored it: storage can be blocked or full. */
export function writeStoredJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Whether the browser let the page delete it. */
export function removeStored(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
