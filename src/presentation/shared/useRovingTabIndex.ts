import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';

export interface RovingTabIndex {
  readonly ref: RefObject<HTMLDivElement | null>;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
}

/** ARIA toolbar keys: one tab stop, arrows, Home and End. Disabled and hidden buttons are skipped. */
export function useRovingTabIndex(): RovingTabIndex {
  const ref = useRef<HTMLDivElement | null>(null);
  const remembered = useRef<HTMLButtonElement | null>(null);

  const sync = useCallback(() => {
    if (!ref.current) return;
    const buttons = buttonsIn(ref.current);
    const stop = remembered.current && isAvailable(remembered.current) ? remembered.current : buttons.find(isAvailable);
    for (const button of buttons) button.tabIndex = button === stop ? 0 : -1;
  }, []);

  // Without dependencies: any render of the owner can add, remove, disable or enable buttons.
  useLayoutEffect(sync);

  // A layout switch hides and shows buttons without a render; it changes the container's size.
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(sync);
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
    };
  }, [sync]);

  const onFocus = (event: FocusEvent<HTMLElement>) => {
    if (!(event.target instanceof HTMLButtonElement)) return;
    remembered.current = event.target;
    sync();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // With a modifier the arrow keys belong to the browser, e.g. Alt+Left goes back.
    if (!ref.current || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    // The focused button stays in the list even when it was disabled meanwhile, so its neighbours are found.
    const buttons = buttonsIn(ref.current).filter((button) => button === event.target || isAvailable(button));
    const index = buttons.findIndex((button) => button === event.target);
    if (index < 0) return;
    let target: HTMLButtonElement | undefined;
    switch (event.key) {
      case 'ArrowRight':
        target = buttons[(index + 1) % buttons.length];
        break;
      case 'ArrowLeft':
        target = buttons[(index - 1 + buttons.length) % buttons.length];
        break;
      case 'Home':
        target = buttons.find(isAvailable);
        break;
      case 'End':
        target = buttons.findLast(isAvailable);
        break;
      default:
        return;
    }
    event.preventDefault();
    target?.focus();
  };

  return { ref, onKeyDown, onFocus };
}

function buttonsIn(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')];
}

/** A button without boxes is not displayed: display: none on it or around it, which is how a layout hides one. */
function isAvailable(button: HTMLButtonElement): boolean {
  return button.isConnected && !button.disabled && button.getClientRects().length > 0;
}
