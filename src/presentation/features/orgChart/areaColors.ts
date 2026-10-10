import type { CSSProperties } from 'react';

/** The --area-1 ... --area-8 colours in global.css. */
const AREA_COLOR_COUNT = 8;

/** One style object per colour, so a branch's style prop keeps its identity between renders. */
const AREA_STYLES: readonly CSSProperties[] = Array.from(
  { length: AREA_COLOR_COUNT },
  (_, index) => ({ '--area-accent': `var(--area-${String(index + 1)})`, '--area-on-accent': 'var(--on-area)' }) as CSSProperties,
);

/** None with a single top person. A colour follows from the person's id and moves on when it is taken. */
export function areaStyles(topPersonIds: readonly string[]): ReadonlyMap<string, CSSProperties> {
  const styles = new Map<string, CSSProperties>();
  if (topPersonIds.length < 2) return styles;
  const taken = new Set<number>();
  for (const id of topPersonIds) {
    let slot = hash(id) % AREA_COLOR_COUNT;
    // With more than eight areas every colour is taken, and they repeat.
    for (let tries = 0; taken.has(slot) && tries < AREA_COLOR_COUNT; tries++) slot = (slot + 1) % AREA_COLOR_COUNT;
    taken.add(slot);
    styles.set(id, AREA_STYLES[slot] ?? {});
  }
  return styles;
}

/** FNV-1a: cheap, and spreads similar ids over different colours. */
function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193) >>> 0;
  }
  return result;
}
