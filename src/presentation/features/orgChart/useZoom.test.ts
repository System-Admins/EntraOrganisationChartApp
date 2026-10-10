import { describe, expect, it } from 'vitest';
import { focusZoom, scrollTarget } from './useZoom';

const area = { width: 1000, height: 600 };

describe('focusZoom', () => {
  it('fits a branch into the visible area within the given bounds', () => {
    const fit = { fit: true, minZoom: 0.5, maxZoom: 1, align: 'centre' } as const;

    // 1904 px wide at zoom 1 needs (1000 - 48) / 1904 = 0.5.
    expect(focusZoom({ width: 1904, height: 300 }, 1, area, fit)).toBe(0.5);
    // Measured at zoom 0.25, a 100 px-wide branch is 400 px wide: it fits at 100%, not beyond.
    expect(focusZoom({ width: 100, height: 50 }, 0.25, area, fit)).toBe(1);
    // Far too wide: stays readable at the lower bound.
    expect(focusZoom({ width: 9000, height: 300 }, 1, area, fit)).toBe(0.5);
  });

  it('keeps the current zoom when not fitting, except to respect the bounds', () => {
    expect(focusZoom({ width: 272, height: 90 }, 0.8, area, { fit: false, align: 'centre' })).toBe(0.8);
    expect(focusZoom({ width: 272, height: 90 }, 0.3, area, { fit: false, minZoom: 0.75, align: 'centre' })).toBe(0.75);
  });
});

describe('scrollTarget', () => {
  const origin = { left: 0, top: 0 };

  it('centres an element that fits', () => {
    expect(scrollTarget({ left: 1500, top: 700, width: 200, height: 100 }, area, 'centre', origin)).toEqual({
      left: 1100,
      top: 450,
    });
  });

  it('puts the top of an element just below the top edge when it is too tall or start is asked for', () => {
    expect(scrollTarget({ left: 0, top: 700, width: 200, height: 900 }, area, 'centre', origin).top).toBe(676);
    expect(scrollTarget({ left: 0, top: 700, width: 200, height: 100 }, area, 'start', origin).top).toBe(676);
  });

  it('scrolls only as far as needed for nearest', () => {
    const scrolled = { left: 500, top: 500 };

    expect(scrollTarget({ left: 700, top: 700, width: 200, height: 100 }, area, 'nearest', scrolled)).toEqual(scrolled);
    expect(scrollTarget({ left: 1400, top: 1150, width: 200, height: 100 }, area, 'nearest', scrolled)).toEqual({
      left: 624,
      top: 674,
    });
    expect(scrollTarget({ left: 300, top: 300, width: 200, height: 100 }, area, 'nearest', scrolled)).toEqual({
      left: 276,
      top: 276,
    });
  });
});
