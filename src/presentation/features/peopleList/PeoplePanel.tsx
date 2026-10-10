import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../shared/Icon';
import { useStrings } from '../../shared/languageContext';
import { SidePanel } from '../employeeDetails/SidePanel';
import styles from './PeopleList.module.css';
import { PEOPLE_LIST_STRINGS } from './strings';

interface PeoplePanelProps {
  /** The heading, which also names the landmark. */
  readonly title: string;
  /** The line under the heading, such as how many people the list holds; none while there is nothing to say. */
  readonly summary: string | null;
  /** The Close button's name, which says what it closes. */
  readonly closeLabel: string;
  readonly onClose: () => void;
  /** For a list opened from the details: Back's name, which says where it goes, and what it does. */
  readonly back?: { readonly label: string; readonly onBack: () => void };
  /** What takes the focus as the panel opens, such as the row that Back returns to; the heading where it finds nothing. */
  readonly initialFocus?: () => HTMLElement | null;
  /** False where the panel opens from what keeps the focus, as a card picked in a chart does. */
  readonly takesFocus?: boolean;
  readonly children: ReactNode;
}

/** A list in the side panel, in the details' place. Key it by what it lists, so that each list starts afresh. */
export function PeoplePanel({ title, summary, closeLabel, onClose, back, initialFocus, takesFocus = true, children }: PeoplePanelProps) {
  const t = useStrings(PEOPLE_LIST_STRINGS);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Only what the panel opened with counts.
  const [opening] = useState(() => ({ initialFocus, takesFocus }));

  // The button that opened the list is gone with the details, or far away in the header, so the list takes the focus.
  useEffect(() => {
    if (opening.takesFocus) (opening.initialFocus?.() ?? headingRef.current)?.focus({ preventScroll: true });
  }, [opening]);

  return (
    <SidePanel label={title} closeLabel={closeLabel} onClose={onClose}>
      {back && (
        <button type="button" className={styles.back} aria-label={back.label} onClick={back.onBack}>
          <Icon name="chevronLeft" size={16} />
          {t.back}
        </button>
      )}
      <h2 ref={headingRef} tabIndex={-1} className={styles.heading}>
        {title}
      </h2>
      {summary !== null && <p className={styles.summary}>{summary}</p>}
      {children}
    </SidePanel>
  );
}
