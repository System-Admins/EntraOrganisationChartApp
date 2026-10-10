import { useCallback, useEffect, useRef, type RefObject } from 'react';

export interface Announcer {
  /** An empty `role="status"` element rendered from the start: screen readers skip a region inserted with its text. */
  readonly region: RefObject<HTMLElement | null>;
  readonly announce: (message: string) => void;
}

/** One polite live region, emptied for a frame before each message so that a repeated message is read again. */
export function useAnnouncer(): Announcer {
  const region = useRef<HTMLElement | null>(null);
  const frame = useRef(0);

  const announce = useCallback((message: string) => {
    const element = region.current;
    if (!element) return;
    cancelAnimationFrame(frame.current);
    element.textContent = '';
    frame.current = requestAnimationFrame(() => {
      element.textContent = message;
    });
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
    },
    [],
  );

  return { region, announce };
}
