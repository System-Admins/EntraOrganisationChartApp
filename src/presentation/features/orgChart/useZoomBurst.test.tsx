// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useZoom } from './useZoom';

/** The viewport > stage > canvas structure that OrgChartCanvas renders. */
function setup() {
  const viewport = document.body.appendChild(document.createElement('div'));
  const canvas = viewport.appendChild(document.createElement('div')).appendChild(document.createElement('div'));
  const { result } = renderHook(() => useZoom(viewport));
  return { result, canvas };
}

const previewScale = (canvas: HTMLElement) => Number(/scale\(([\d.]+)\)/.exec(canvas.style.transform)?.[1] ?? 1);

const UNFOLD = { fit: true, minZoom: 0.5, maxZoom: 1, align: 'centre' } as const;

/** A 1000 x 600 viewport and a branch in it that is `width` px wide as drawn, which jsdom can't lay out. */
function setupBranch(width: number) {
  const { result, canvas } = setup();
  const viewport = canvas.parentElement?.parentElement as HTMLElement;
  Object.defineProperty(viewport, 'clientWidth', { value: 1000 });
  Object.defineProperty(viewport, 'clientHeight', { value: 600 });
  const branch = canvas.appendChild(document.createElement('div'));
  branch.getBoundingClientRect = () => ({ width, height: 300 }) as DOMRect;
  return { result, branch };
}

const scrollTo = vi.fn();

beforeAll(() => {
  // jsdom lacks element scrolling and media queries.
  HTMLElement.prototype.scrollTo = scrollTo;
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('useZoom bursts', () => {
  it('previews a burst of zoom steps as a transform and applies it as zoom once zooming pauses', () => {
    const { result, canvas } = setup();

    act(() => {
      result.current.zoomIn();
      result.current.zoomIn();
    });

    expect(result.current.zoom).toBe(1);
    expect(previewScale(canvas)).toBeCloseTo(1.44);

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current.zoom).toBe(1.44);
    expect(canvas.style.transform).toBe('');
  });

  it('drops a burst in progress when the zoom is reset', () => {
    const { result, canvas } = setup();

    act(() => {
      result.current.zoomIn();
      result.current.reset();
    });
    act(() => {
      vi.runAllTimers();
    });

    expect(canvas.style.transform).toBe('');
    expect(result.current.zoom).toBe(1);
  });

  it('keeps the previewed zoom when a card is focused right after', () => {
    const { result, canvas } = setup();
    const card = canvas.appendChild(document.createElement('div'));

    act(() => {
      result.current.zoomIn();
      result.current.focus(card, { fit: false, align: 'centre' });
    });

    expect(result.current.zoom).toBe(1.2);
    expect(canvas.style.transform).toBe('');
  });

  it('lands where the burst was anchored, although the preview transform changes the scroll size', () => {
    const { result, canvas } = setup();
    const viewport = canvas.parentElement?.parentElement as HTMLElement;
    // 10,000 px of chart at the start, 12,000 once 1.2 is applied; the preview's overflow reads as 11,000.
    Object.defineProperty(viewport, 'clientWidth', { value: 1000 });
    Object.defineProperty(viewport, 'scrollLeft', { value: 4500 });
    let applied = false;
    Object.defineProperty(viewport, 'scrollWidth', {
      get: () => (applied ? 12000 : canvas.style.transform ? 11000 : 10000),
    });
    scrollTo.mockClear();

    act(() => {
      result.current.zoomIn();
    });
    applied = true;
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 5500 }));
  });

  it('fits an unfolded team until the user sets the zoom, and keeps their zoom from then on', () => {
    const { result, branch } = setupBranch(1904);

    act(() => {
      result.current.focus(branch, UNFOLD);
    });
    expect(result.current.zoom).toBe(0.5);

    act(() => {
      result.current.zoomIn();
      vi.advanceTimersByTime(150);
    });
    expect(result.current.zoom).toBe(0.6);

    act(() => {
      result.current.focus(branch, UNFOLD);
    });
    expect(result.current.zoom).toBe(0.6);
  });

  it('keeps a zoom above 100% when a team is unfolded', () => {
    const { result, branch } = setupBranch(400);

    act(() => {
      result.current.zoomIn();
      result.current.zoomIn();
      vi.advanceTimersByTime(150);
      result.current.focus(branch, UNFOLD);
    });

    expect(result.current.zoom).toBe(1.44);
  });

  it('counts a reset as the user\'s zoom, but not Fit to screen or a restart', () => {
    const { result, branch } = setupBranch(1904);

    act(() => {
      result.current.fit();
      result.current.focus(branch, UNFOLD);
    });
    expect(result.current.zoom).toBe(0.5);

    act(() => {
      result.current.reset();
    });
    act(() => {
      result.current.focus(branch, UNFOLD);
    });
    expect(result.current.zoom).toBe(1);

    act(() => {
      result.current.restart();
      result.current.focus(branch, UNFOLD);
    });
    expect(result.current.zoom).toBe(0.5);
  });

  it('hands the framing back to the chart when the user presses Fit to screen after zooming', () => {
    const { result, branch } = setupBranch(1904);

    act(() => {
      result.current.zoomIn();
      vi.advanceTimersByTime(150);
    });
    act(() => {
      result.current.focus(branch, UNFOLD);
    });
    expect(result.current.zoom).toBe(1.2);

    act(() => {
      result.current.fit();
    });
    act(() => {
      result.current.focus(branch, UNFOLD);
    });
    expect(result.current.zoom).toBe(0.5);
  });

  it('still zooms in to read a revealed card after the user zoomed out', () => {
    const { result, branch } = setupBranch(100);

    act(() => {
      for (let steps = 0; steps < 6; steps++) result.current.zoomOut();
      vi.advanceTimersByTime(150);
    });
    expect(result.current.zoom).toBe(0.33);

    act(() => {
      result.current.focus(branch, { fit: false, minZoom: 0.75, align: 'centre' });
    });
    expect(result.current.zoom).toBe(0.75);
  });

  it('builds on a burst that is applied just as the next zoom step arrives', () => {
    const { result } = setup();

    act(() => {
      result.current.zoomIn();
      result.current.zoomIn();
    });
    act(() => {
      vi.advanceTimersByTime(150);
      result.current.zoomIn();
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current.zoom).toBe(1.73);
  });
});
