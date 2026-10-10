import { useEffect, type FocusEvent, type ReactNode, type Ref } from 'react';
import { Icon } from '../../shared/Icon';
import { useStrings } from '../../shared/languageContext';
import { DETAILS_PANEL_ID } from './detailsPanelId';
import styles from './SidePanel.module.css';
import { DETAILS_STRINGS } from './strings';

interface SidePanelProps {
  /** The landmark's name. */
  readonly label: string;
  /** The Close button's name, which says what it closes; its tooltip only says Close. */
  readonly closeLabel: string;
  /** The Close button and Escape. */
  readonly onClose: () => void;
  readonly ref?: Ref<HTMLElement>;
  readonly children: ReactNode;
}

/** The column beside the chart, a bottom sheet on phones: a person's details, or a list that takes their place. */
export function SidePanel({ label, closeLabel, onClose, ref, children }: SidePanelProps) {
  const { closeTooltip } = useStrings(DETAILS_STRINGS);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      // A control that used the key marks it handled. A modal dialog can't, as the browser closes it on the key.
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('dialog[open]')) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  return (
    <aside ref={ref} id={DETAILS_PANEL_ID} className={styles.panel} aria-label={label} onFocus={keepRingInView}>
      <button type="button" className={styles.close} onClick={onClose} aria-label={closeLabel} title={closeTooltip}>
        <Icon name="close" size={18} />
      </button>
      {children}
    </aside>
  );
}

/** Firefox only scrolls a focused control into view when none of it shows, which would leave a cut-off ring. */
function keepRingInView({ currentTarget: panel, target }: FocusEvent<HTMLElement>) {
  if (target === panel || !target.matches(':focus-visible')) return;
  const style = getComputedStyle(panel);
  const top = panel.getBoundingClientRect().top + panel.clientTop;
  const box = target.getBoundingClientRect();
  const above = box.top - top - (parseFloat(style.scrollPaddingTop) || 0);
  const below = box.bottom - top - panel.clientHeight + (parseFloat(style.scrollPaddingBottom) || 0);
  if (above < 0) panel.scrollTo({ top: panel.scrollTop + above });
  else if (below > 0) panel.scrollTo({ top: panel.scrollTop + Math.min(below, above) });
}
