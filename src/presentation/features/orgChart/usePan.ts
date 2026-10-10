import { useEffect } from 'react';

const DRAG_THRESHOLD_PX = 4;

interface Drag {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  moved: boolean;
}

/** Mouse drag-to-pan; touch and pens keep native scrolling. A drag suppresses the click that follows it. */
export function usePan(viewport: HTMLElement | null, panningClassName: string): void {
  useEffect(() => {
    if (!viewport) return;
    let drag: Drag | null = null;

    const swallowClick = (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest('a, button, input, label')) return;
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        moved: false,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (drag?.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add(panningClassName);
      }
      viewport.scrollLeft = drag.scrollLeft - dx;
      viewport.scrollTop = drag.scrollTop - dy;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (drag?.pointerId !== event.pointerId) return;
      if (drag.moved) {
        viewport.classList.remove(panningClassName);
        // The click, if any, is dispatched in the same task as pointerup.
        viewport.addEventListener('click', swallowClick, { capture: true, once: true });
        setTimeout(() => {
          viewport.removeEventListener('click', swallowClick, { capture: true });
        }, 0);
      }
      drag = null;
    };

    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('pointercancel', onPointerUp);
    return () => {
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('pointermove', onPointerMove);
      viewport.removeEventListener('pointerup', onPointerUp);
      viewport.removeEventListener('pointercancel', onPointerUp);
    };
  }, [viewport, panningClassName]);
}
