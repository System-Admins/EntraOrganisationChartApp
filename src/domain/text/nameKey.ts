import { fold } from './fold';

/** Letters and digits as people type them, so that "Retail-Marketing", "retail marketing" and "Retail  Marketing" are one name; '' where there are none. */
export function nameKey(value: string | null): string {
  return value === null ? '' : fold(value).replace(/[^\p{L}\p{N}]+/gu, '');
}

/** The spelling most used for each name, by its key: of spellings used as often, the first in code point order, so that the same one wins on every load. */
export function mostUsedSpellings(values: Iterable<string | null>): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const value of values) {
    const spelling = value?.trim() ?? '';
    const key = nameKey(spelling);
    if (key === '') continue;
    const ofKey = counts.get(key) ?? new Map<string, number>();
    ofKey.set(spelling, (ofKey.get(spelling) ?? 0) + 1);
    counts.set(key, ofKey);
  }
  const most = new Map<string, string>();
  for (const [key, ofKey] of counts) {
    let best: readonly [string, number] | null = null;
    for (const entry of ofKey) if (best === null || entry[1] > best[1] || (entry[1] === best[1] && entry[0] < best[0])) best = entry;
    if (best !== null) most.set(key, best[0]);
  }
  return most;
}
