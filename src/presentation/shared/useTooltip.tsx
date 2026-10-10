import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import styles from './Tooltip.module.css';

/** Space kept between a tooltip and the sides of the page. */
const EDGE_MARGIN = 8;

const HIDDEN = { hover: false, focus: false } as const;

export interface TooltipHostProps {
  readonly onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerLeave: () => void;
  readonly onPointerDown: () => void;
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
  readonly onBlur: () => void;
}

export interface Tooltip {
  /** For the button, which must be positioned: the tooltip is placed against it. */
  readonly hostProps: TooltipHostProps;
  /** Render it as the button's last child. */
  readonly tooltip: ReactNode;
}

/** Shown on hover and keyboard focus, hidden by Escape (WCAG 1.4.13). Assistive technology doesn't get it. */
export function useTooltip(text: string, disabled = false): Tooltip {
  const [shownBy, setShownBy] = useState<{ hover: boolean; focus: boolean }>(HIDDEN);
  const tip = useRef<HTMLSpanElement>(null);
  const visible = shownBy.hover || shownBy.focus;
  if (disabled && visible) setShownBy(HIDDEN);

  useEffect(() => {
    if (!visible) return;
    const hideOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // The key has done its work: it must not also close the details panel or clear the search box.
      event.preventDefault();
      event.stopPropagation();
      setShownBy(HIDDEN);
    };
    // Captured on the window, so it runs before any other listener for the key.
    window.addEventListener('keydown', hideOnEscape, true);
    return () => {
      window.removeEventListener('keydown', hideOnEscape, true);
    };
  }, [visible]);

  // Centred below the button, or as close to that as the page's sides allow.
  useLayoutEffect(() => {
    const element = tip.current;
    const host = element?.parentElement;
    if (!element || !host) return;
    const button = host.getBoundingClientRect();
    const width = element.offsetWidth;
    const centred = button.left + (button.width - width) / 2;
    const left = Math.max(EDGE_MARGIN, Math.min(centred, document.documentElement.clientWidth - EDGE_MARGIN - width));
    element.style.setProperty('left', `${String(left - button.left)}px`);
  }, [visible, text]);

  return {
    hostProps: {
      onPointerEnter: (event) => {
        if (event.pointerType !== 'touch') setShownBy((current) => ({ ...current, hover: true }));
      },
      onPointerLeave: () => {
        setShownBy((current) => ({ ...current, hover: false }));
      },
      // A press that opens a dialog sends no pointerleave, so the tooltip would stay and take the first Escape.
      onPointerDown: () => {
        setShownBy(HIDDEN);
      },
      onFocus: (event) => {
        if (event.currentTarget.matches(':focus-visible')) setShownBy((current) => ({ ...current, focus: true }));
      },
      onBlur: () => {
        setShownBy((current) => ({ ...current, focus: false }));
      },
    },
    tooltip: visible && !disabled && (
      <span ref={tip} className={styles.tip} aria-hidden="true" onClick={ignoreClick}>
        {text}
      </span>
    ),
  };
}

/** The tooltip lies inside the button, where a click on it would press the button. */
function ignoreClick(event: MouseEvent): void {
  event.stopPropagation();
}
