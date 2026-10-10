import { describe, expect, it } from 'vitest';
import { areaStyles } from './areaColors';

const colorOf = (styles: ReadonlyMap<string, object>, id: string) => (styles.get(id) as Record<string, string> | undefined)?.['--area-accent'];

describe('areaStyles', () => {
  it('leaves a single top person to the brand colour', () => {
    expect(areaStyles(['ceo']).size).toBe(0);
  });

  it('gives up to eight top persons different colours', () => {
    const ids = ['ingrid', 'erik', 'maria', 'jonas', 'anna', 'ola', 'kari', 'per'];

    const styles = areaStyles(ids);

    expect(new Set(ids.map((id) => colorOf(styles, id))).size).toBe(8);
    expect(colorOf(styles, 'ingrid')).toMatch(/^var\(--area-[1-8]\)$/);
    expect(styles.get('ingrid')).toHaveProperty('--area-on-accent', 'var(--on-area)');
  });

  it('keeps each area its colour from visit to visit', () => {
    const ids = ['4a1b', '9f3c', '77e0', 'c0de'];

    expect(ids.map((id) => colorOf(areaStyles(ids), id))).toEqual(ids.map((id) => colorOf(areaStyles(ids), id)));
  });

  it('repeats colours beyond eight top persons instead of leaving areas uncoloured', () => {
    const ids = Array.from({ length: 11 }, (_, index) => `person-${String(index)}`);

    expect(ids.every((id) => colorOf(areaStyles(ids), id) !== undefined)).toBe(true);
  });
});
