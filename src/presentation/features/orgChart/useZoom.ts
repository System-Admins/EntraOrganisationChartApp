import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
const STEP = 1.2;
/** One mouse-wheel notch (100 px) zooms by about 18%. */
const WHEEL_SENSITIVITY = 0.002;
/** Space kept between a focused element and the edges of the visible area. */
const FOCUS_MARGIN = 24;
/** How long zooming must pause before a burst of steps is applied as CSS zoom. */
const BURST_MS = 150;

export interface FocusOptions {
  /** Zoom so the element fits. Ignored once the user has set the zoom, until they press Fit to screen. */
  readonly fit: boolean;
  /** Bounds for the resulting zoom, applied whether or not the element is fitted. */
  readonly minZoom?: number;
  readonly maxZoom?: number;
  /** 'start': top near the top. 'centre': centred when it fits. 'nearest': scroll only as far as needed. */
  readonly align: 'centre' | 'start' | 'nearest';
}

export interface ZoomControls {
  readonly zoom: number;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly reset: () => void;
  /** Back to how the chart opens: 100%, and unfolding fits teams again. */
  readonly restart: () => void;
  readonly fit: () => void;
  /** Brings an element into the part of the viewport that no overlaid panel covers. */
  readonly focus: (element: HTMLElement, options: FocusOptions) => void;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Box extends Size {
  /** Relative to the scrolled content, in current (zoomed) pixels. */
  readonly left: number;
  readonly top: number;
}

interface Anchor {
  readonly kind: 'anchor';
  readonly x: number;
  readonly y: number;
  readonly alignTop: boolean;
}

type Pending = Anchor | { readonly kind: 'element'; readonly element: HTMLElement; readonly align: FocusOptions['align'] };

/** Relative to the viewport's visible top-left corner, in current (zoomed) pixels. */
interface ViewportBox extends Size {
  readonly left: number;
  readonly top: number;
}

interface Burst {
  /** Unrounded, so many small pinch steps add up. */
  readonly target: number;
  /** The point kept in place and the canvas's box, both taken before a preview transform could skew them. */
  readonly anchor: Anchor;
  readonly base: ViewportBox;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** CSS zoom keeps scrollbars correct and 1px connectors visible. A burst of steps previews as a transform first. */
export function useZoom(viewport: HTMLElement | null): ZoomControls {
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  const pending = useRef<Pending | null>(null);
  const burst = useRef<Burst | null>(null);
  /** Set by zooming in or out, pinching and resetting; cleared by Fit to screen. */
  const userZoomed = useRef(false);

  useLayoutEffect(() => {
    zoomRef.current = zoom;
    // In the same commit as the zoom that replaces it, so the chart never shows the old size in between.
    if (!burst.current) clearPreview(viewport);
    const target = pending.current;
    if (!viewport || !target) return;
    pending.current = null;
    if (target.kind === 'element') {
      scrollToElement(viewport, target.element, target.align, 'auto');
      return;
    }
    viewport.scrollTo({
      left: target.x * viewport.scrollWidth - viewport.clientWidth / 2,
      top: target.alignTop ? 0 : target.y * viewport.scrollHeight - viewport.clientHeight / 2,
    });
  }, [zoom, viewport]);

  /** Stops a burst without applying it. Its preview stays until the next zoom renders, so nothing flashes back. */
  const endBurst = useCallback((): Burst | null => {
    const current = burst.current;
    if (current) clearTimeout(current.timer);
    burst.current = null;
    return current;
  }, []);

  /** False when the zoom doesn't change: there is nothing to render, so a preview is removed at once. */
  const commit = useCallback(
    (next: number, target: Pending, synchronously = false): boolean => {
      if (next === zoomRef.current) {
        clearPreview(viewport);
        return false;
      }
      pending.current = target;
      if (synchronously) {
        flushSync(() => {
          setZoom(next);
        });
      } else {
        setZoom(next);
      }
      return true;
    },
    [viewport],
  );

  /** Zooms around the viewport's centre, or with `fitted` around the chart's top middle. */
  const change = useCallback(
    (next: (current: number) => number, fitted = false) => {
      if (!viewport) return;
      const running = endBurst();
      // A preview transform skews the scroll size; a burst's own anchor was taken before it.
      const anchor = fitted ? anchorOf(viewport, true) : (running?.anchor ?? anchorOf(viewport, false));
      commit(roundZoom(clamp(next(zoomRef.current), MIN_ZOOM, MAX_ZOOM)), anchor);
    },
    [viewport, endBurst, commit],
  );

  // Rendered before the timer task ends: an input handled before a deferred render would start from the old zoom.
  const applyBurst = useCallback(() => {
    const current = endBurst();
    if (current) commit(roundZoom(current.target), current.anchor, true);
  }, [endBurst, commit]);

  /** One zoom step of a burst: previewed as a transform, applied as zoom once zooming pauses. */
  const step = useCallback(
    (next: (current: number) => number) => {
      const canvas = canvasOf(viewport);
      if (!viewport || !canvas) return;
      userZoomed.current = true;
      const previous = burst.current;
      if (previous) clearTimeout(previous.timer);
      const anchor = previous?.anchor ?? anchorOf(viewport, false);
      const base = previous?.base ?? boxInViewport(viewport, canvas);
      const target = clamp(next(previous?.target ?? zoomRef.current), MIN_ZOOM, MAX_ZOOM);
      showPreview(viewport, canvas, base, anchor, roundZoom(target) / zoomRef.current, zoomRef.current);
      burst.current = { target, anchor, base, timer: setTimeout(applyBurst, BURST_MS) };
    },
    [viewport, applyBurst],
  );

  const focus = useCallback(
    (element: HTMLElement, options: FocusOptions) => {
      if (!viewport) return;
      const applied = zoomRef.current;
      // A card clicked right after a pinch keeps the pinched zoom, and is measured as the preview draws it.
      const running = endBurst();
      const current = running ? roundZoom(running.target) : applied;
      const { width, height } = element.getBoundingClientRect();
      const next =
        options.fit && userZoomed.current ? current : focusZoom({ width, height }, current, visibleArea(viewport), options);
      if (next === applied) {
        clearPreview(viewport);
        scrollToElement(viewport, element, options.align, scrollBehavior());
        return;
      }
      commit(next, { kind: 'element', element, align: options.align });
    },
    [viewport, endBurst, commit],
  );

  useEffect(
    () => () => {
      endBurst();
      clearPreview(viewport);
    },
    [viewport, endBurst],
  );

  useEffect(() => {
    if (!viewport) return;
    // Scrolling or dragging during a burst applies it first; the burst's anchor would otherwise undo the move.
    const applyBeforeMoving = () => {
      if (burst.current) applyBurst();
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        applyBeforeMoving();
        return;
      }
      event.preventDefault();
      // Pinches arrive as many small deltas, wheels as large ones, so the zoom follows the distance, not the count.
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 800 : 1;
      step((current) => current * Math.exp(-event.deltaY * unit * WHEEL_SENSITIVITY));
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('pointerdown', applyBeforeMoving);
    return () => {
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('pointerdown', applyBeforeMoving);
    };
  }, [viewport, step, applyBurst]);

  return {
    zoom,
    zoomIn: () => {
      step((current) => current * STEP);
    },
    zoomOut: () => {
      step((current) => current / STEP);
    },
    reset: () => {
      userZoomed.current = true;
      change(() => 1);
    },
    restart: () => {
      userZoomed.current = false;
      change(() => 1);
    },
    fit: () => {
      const content = canvasOf(viewport);
      if (!viewport || !content) return;
      userZoomed.current = false;
      // As laid out: a preview transform would make the canvas measure as already zoomed.
      const { width, height } = burst.current?.base ?? content.getBoundingClientRect();
      const area = visibleArea(viewport);
      change((current) => Math.min(1, area.width / (width / current), area.height / (height / current)), true);
    },
    focus,
  };
}

function canvasOf(viewport: HTMLElement | null): HTMLElement | null {
  const canvas = viewport?.firstElementChild?.firstElementChild;
  return canvas instanceof HTMLElement ? canvas : null;
}

/** The content point at the viewport's centre, or with `fitted` the chart's top middle, as fractions of its size. */
function anchorOf(viewport: HTMLElement, fitted: boolean): Anchor {
  return {
    kind: 'anchor',
    x: fitted ? 0.5 : fraction(viewport.scrollLeft + viewport.clientWidth / 2, viewport.scrollWidth),
    y: fitted ? 0 : fraction(viewport.scrollTop + viewport.clientHeight / 2, viewport.scrollHeight),
    alignTop: fitted,
  };
}

function boxInViewport(viewport: HTMLElement, element: HTMLElement): ViewportBox {
  const view = viewport.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left - view.left - viewport.clientLeft,
    top: rect.top - view.top - viewport.clientTop,
    width: rect.width,
    height: rect.height,
  };
}

/** Draws the canvas where applying the zoom will put it. `ratio` is the new zoom over the applied one. */
function showPreview(
  viewport: HTMLElement,
  canvas: HTMLElement,
  base: ViewportBox,
  anchor: Anchor,
  ratio: number,
  zoom: number,
): void {
  const { clientWidth, clientHeight } = viewport;
  const width = base.width * ratio;
  const height = base.height * ratio;
  const scrollWidth = Math.max(clientWidth, width);
  const scrollHeight = Math.max(clientHeight, height);
  const scrollLeft = clamp(anchor.x * scrollWidth - clientWidth / 2, 0, scrollWidth - clientWidth);
  const scrollTop = clamp(anchor.y * scrollHeight - clientHeight / 2, 0, scrollHeight - clientHeight);
  const left = (width < clientWidth ? (clientWidth - width) / 2 : 0) - scrollLeft;
  const top = -scrollTop;
  // The canvas's CSS zoom multiplies transform lengths, so the shift is given in unzoomed pixels.
  const shiftX = (left - base.left) / zoom;
  const shiftY = (top - base.top) / zoom;
  canvas.style.setProperty('transform-origin', '0 0');
  canvas.style.setProperty('transform', `translate(${String(shiftX)}px, ${String(shiftY)}px) scale(${String(ratio)})`);
}

function clearPreview(viewport: HTMLElement | null): void {
  const canvas = canvasOf(viewport);
  canvas?.style.removeProperty('transform');
  canvas?.style.removeProperty('transform-origin');
}

/** The zoom at which an element, measured at the `current` zoom, satisfies the focus options. */
export function focusZoom(measured: Size, current: number, area: Size, options: FocusOptions): number {
  const bounded = (value: number) =>
    roundZoom(clamp(value, options.minZoom ?? MIN_ZOOM, options.maxZoom ?? MAX_ZOOM));
  if (!options.fit || measured.width === 0 || measured.height === 0) return bounded(current);
  return bounded(
    Math.min(
      (area.width - 2 * FOCUS_MARGIN) / (measured.width / current),
      (area.height - 2 * FOCUS_MARGIN) / (measured.height / current),
    ),
  );
}

/** Offsets that put `box` in view: centred, or top-aligned when it doesn't fit. 'nearest' keeps what is visible. */
export function scrollTarget(
  box: Box,
  area: Size,
  align: FocusOptions['align'],
  scroll: { left: number; top: number },
): { left: number; top: number } {
  if (align === 'nearest') {
    return { left: nearest(box.left, box.width, scroll.left, area.width), top: nearest(box.top, box.height, scroll.top, area.height) };
  }
  const centreVertically = align === 'centre' && box.height + 2 * FOCUS_MARGIN <= area.height;
  return {
    left: box.left + box.width / 2 - area.width / 2,
    top: centreVertically ? box.top + box.height / 2 - area.height / 2 : box.top - FOCUS_MARGIN,
  };
}

function nearest(start: number, size: number, scrolled: number, visible: number): number {
  if (start - FOCUS_MARGIN < scrolled) return start - FOCUS_MARGIN;
  if (start + size + FOCUS_MARGIN > scrolled + visible) return start + size + FOCUS_MARGIN - visible;
  return scrolled;
}

/** The viewport minus what an overlaid panel covers, which the page declares as scroll-padding. */
function visibleArea(viewport: HTMLElement): Size {
  const style = getComputedStyle(viewport);
  return {
    width: viewport.clientWidth - (parseFloat(style.scrollPaddingRight) || 0),
    height: viewport.clientHeight - (parseFloat(style.scrollPaddingBottom) || 0),
  };
}

/** Scrolls only the viewport; Element.scrollIntoView would also scroll a page that embeds the app. */
function scrollToElement(
  viewport: HTMLElement,
  element: HTMLElement,
  align: FocusOptions['align'],
  behavior: ScrollBehavior,
): void {
  const view = viewport.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const box = {
    left: rect.left - view.left + viewport.scrollLeft,
    top: rect.top - view.top + viewport.scrollTop,
    width: rect.width,
    height: rect.height,
  };
  const scroll = { left: viewport.scrollLeft, top: viewport.scrollTop };
  viewport.scrollTo({ ...scrollTarget(box, visibleArea(viewport), align, scroll), behavior });
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function roundZoom(zoom: number): number {
  return Math.round(zoom * 100) / 100;
}

/** A viewport that isn't laid out (hidden, or not rendered yet) has no size to divide by. */
function fraction(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0.5;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
