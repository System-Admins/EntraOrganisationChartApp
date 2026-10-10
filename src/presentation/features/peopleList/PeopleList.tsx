import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { Employee } from '@/domain/employees/employee';
import { fold } from '@/domain/text/fold';
import { classNames } from '../../shared/classNames';
import { formatPeople } from '../../shared/formatPeople';
import { useLanguage, useStrings } from '../../shared/languageContext';
import { Avatar } from '../photos/Avatar';
import { describePresence, presenceTone } from '../presence/describePresence';
import { usePresence } from '../presence/presenceContext';
import styles from './PeopleList.module.css';
import { PEOPLE_LIST_STRINGS } from './strings';

/** Rows with a small photo, or a board of large photos. */
export const PEOPLE_LAYOUTS = ['list', 'board'] as const;

export type PeopleLayout = (typeof PEOPLE_LAYOUTS)[number];

/** The most people a list shows at once: more would slow the page down, and the field narrows down the rest. */
export const PEOPLE_LIST_CAP = 300;

/** A list this short is read at a glance, without a field to narrow it. */
const NARROW_ABOVE = 10;

const AVATAR_SIZES: Readonly<Record<PeopleLayout, number>> = { list: 32, board: 64 };

export interface PeopleListEntry {
  readonly employee: Employee;
  /** Under the name: the job title, say, or what a search found the person by. */
  readonly detail: string | null;
}

interface PeopleListProps {
  /** Everyone in the list, in its order. */
  readonly people: readonly PeopleListEntry[];
  /** The list's name for assistive technology. */
  readonly label: string;
  readonly layout?: PeopleLayout;
  /** What a press does, at the end of each row and in its description, where the list's place doesn't make it plain. */
  readonly action?: string;
  readonly onOpen: (entry: PeopleListEntry) => void;
}

/** People beside the chart, each a button that opens them, with a field to narrow down a long list. */
export function PeopleList({ people, label, layout = 'list', action, onOpen }: PeopleListProps) {
  const t = useStrings(PEOPLE_LIST_STRINGS);
  const language = useLanguage();
  const [text, setText] = useState('');
  const hintId = useId();
  // Folded once per list, as the search folds what it compares: case, accents and letters such as ø aside.
  const searchable = useMemo(
    () =>
      people.map((entry) => {
        const { displayName, jobTitle, department } = entry.employee;
        return { entry, text: fold([displayName, jobTitle, department].filter(Boolean).join(' ')) };
      }),
    [people],
  );
  const narrowable = people.length > NARROW_ABOVE;
  // Text left in the field of a list that has since become short, as after a refresh, narrows nothing.
  const words = narrowable ? fold(text).split(/\s+/).filter(Boolean) : [];
  const matching =
    words.length === 0
      ? people
      : searchable.filter((item) => words.every((word) => item.text.includes(word))).map(({ entry }) => entry);
  const shown = matching.slice(0, PEOPLE_LIST_CAP);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape' || !text) return;
    // Clearing the text is what the key does here; it must not also close the panel around the list.
    event.preventDefault();
    setText('');
  };

  return (
    <>
      {narrowable && (
        <>
          <input
            type="search"
            className={styles.field}
            aria-label={t.narrow}
            aria-describedby={hintId}
            placeholder={t.narrow}
            autoComplete="off"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
            onKeyDown={handleKeyDown}
          />
          {/* Read only through aria-describedby, which also reaches hidden text. */}
          <span id={hintId} hidden>
            {t.narrowHint}
          </span>
          {/* Mounted before its text appears: screen readers only announce changes to a live region that exists. */}
          <p role="status" className={styles.count}>
            {words.length === 0
              ? ''
              : matching.length === 0
                ? t.noneMatch
                : t.narrowed(matching.length, formatPeople(people.length, language))}
          </p>
        </>
      )}
      {matching.length > shown.length && (
        <p className={styles.note}>{t.capped(shown.length, formatPeople(matching.length, language))}</p>
      )}
      {shown.length > 0 && (
        <ul className={styles[layout]} aria-label={label}>
          {shown.map((entry) => (
            <PersonButton key={entry.employee.id} entry={entry} size={AVATAR_SIZES[layout]} action={action} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </>
  );
}

interface PersonButtonProps {
  readonly entry: PeopleListEntry;
  readonly size: number;
  readonly action: string | undefined;
  readonly onOpen: (entry: PeopleListEntry) => void;
}

/** Named by the name alone, as the cards are: a status in the name would rename the focused row with every poll. */
function PersonButton({ entry, size, action, onOpen }: PersonButtonProps) {
  const { employee, detail } = entry;
  const presence = usePresence(employee.id, false);
  const language = useLanguage();
  const id = useId();
  // The avatar shows the status, but hides it from assistive technology, so the row describes it.
  const status = presence && presenceTone(presence) ? describePresence(presence, language) : null;
  const describedBy = [detail && `${id}-detail`, status && `${id}-presence`, action && `${id}-action`].filter(Boolean).join(' ');
  return (
    <li>
      <button
        type="button"
        className={classNames(styles.person, action !== undefined && styles.withAction)}
        aria-labelledby={`${id}-name`}
        aria-describedby={describedBy || undefined}
        onClick={() => {
          onOpen(entry);
        }}
      >
        <Avatar employee={employee} size={size} />
        <span id={`${id}-name`} className={styles.name}>
          {employee.displayName}
        </span>
        {detail && (
          <span id={`${id}-detail`} className={styles.detail}>
            {detail}
          </span>
        )}
        {status && (
          <span id={`${id}-presence`} className="visually-hidden">
            {status}
          </span>
        )}
        {action && (
          <span id={`${id}-action`} className={styles.action}>
            {action}
          </span>
        )}
      </button>
    </li>
  );
}
