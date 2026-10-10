import { useEffect, type RefObject } from 'react';
import type { FocusReason } from './chartViewStore';
import { findTreeItem } from './treeItems';
import type { FocusOptions } from './useZoom';

/** Printable width of A4 and Letter in landscape with 10 mm margins (see @page in global.css), in CSS px. */
const PRINT_WIDTH = 960;

/** Scales a wide tree to the page width as printing starts. From the outline, the tree is laid out briefly ([data-measure]) to measure. */
export function usePrintZoom(viewport: HTMLElement | null, canvasRef: RefObject<HTMLElement | null>, zoom: number): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !viewport) return;
    const beforePrint = () => {
      canvas.style.setProperty('--print-zoom', String(Math.min(1, PRINT_WIDTH / treeWidth(viewport, canvas, zoom))));
    };
    const afterPrint = () => {
      canvas.style.removeProperty('--print-zoom');
    };
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
    };
  }, [viewport, canvasRef, zoom]);
}

/** The tree's width at zoom 1. From the outline, the tree is laid out for a moment to be measured, as it prints. */
function treeWidth(viewport: HTMLElement, canvas: HTMLElement, zoom: number): number {
  if (!isOutline(viewport)) return canvas.getBoundingClientRect().width / zoom;
  // The tree is far shorter than the outline, so measuring it would clamp the outline's scroll position.
  const { scrollLeft, scrollTop } = viewport;
  viewport.setAttribute('data-measure', '');
  const width = canvas.getBoundingClientRect().width / zoom;
  viewport.removeAttribute('data-measure');
  viewport.scrollTo(scrollLeft, scrollTop);
  return width;
}

/** Unfolding fits the branch between 50% and 100% until the user sets the zoom. The outline only scrolls. Show more scrolls no further than to the first person it adds. */
export function focusOptions(reason: FocusReason, outline: boolean): FocusOptions {
  if (reason === 'showMore') return { fit: false, align: 'nearest' };
  if (outline) return { fit: false, align: reason === 'expand' ? 'start' : 'centre' };
  switch (reason) {
    case 'expand':
      return { fit: true, minZoom: 0.5, maxZoom: 1, align: 'centre' };
    case 'reveal':
      return { fit: false, minZoom: 0.75, align: 'centre' };
    case 'collapse':
    case 'select':
    case 'expandMany':
      return { fit: false, align: 'centre' };
  }
}

/** Centres the items at the top, or the first of them when they are wider than the viewport. */
export function centreOn(viewport: HTMLElement, keys: readonly string[]): void {
  const items = keys.map((key) => findTreeItem(viewport, key));
  const first = items[0]?.getBoundingClientRect();
  const last = items.at(-1)?.getBoundingClientRect();
  if (!first || !last) return;
  const [left, right] = last.right - first.left <= viewport.clientWidth ? [first.left, last.right] : [first.left, first.right];
  const middle = (left + right) / 2 - viewport.getBoundingClientRect().left + viewport.scrollLeft;
  viewport.scrollTo({ left: middle - viewport.clientWidth / 2, top: 0 });
}

/** Whether the viewport shows the outline, which only scrolls; JS reads the layout from --layout, never from a media query. */
export function isOutline(viewport: HTMLElement): boolean {
  return getComputedStyle(viewport).getPropertyValue('--layout').trim() === 'outline';
}
