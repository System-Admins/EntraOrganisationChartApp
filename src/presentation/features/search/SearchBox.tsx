import {
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
} from 'react';
import { ClearRecentPeopleCommand } from '@/application/features/employeeSearch/clearRecentPeople';
import { GetRecentPeopleQuery } from '@/application/features/employeeSearch/getRecentPeople';
import { SearchEmployeesQuery, type EmployeeSearchHit } from '@/application/features/employeeSearch/searchEmployees';
import type { ExtraField } from '@/application/settings/extraFields';
import type { OrgChartOptions } from '@/domain/orgChart/orgChart';
import { classNames } from '../../shared/classNames';
import { Icon } from '../../shared/Icon';
import { useLanguage, useStrings } from '../../shared/languageContext';
import { useMediator } from '../../shared/mediatorContext';
import { useDebouncedValue } from '../../shared/useDebouncedValue';
import { useQuery } from '../../shared/useQuery';
import { Avatar } from '../photos/Avatar';
import { hitDetails } from './hitDetails';
import styles from './SearchBox.module.css';
import { searchHint } from './searchHint';
import { SEARCH_STRINGS } from './strings';

const DEBOUNCE_MS = 150;

/** How long typing pauses before the count of matches is said: a search settles in every short pause, and would talk over the typing. */
export const COUNT_PAUSE_MS = 1000;

/** One id per person, not per position. Ids may not contain whitespace; the underscore is encoded to stay unique. */
function optionId(listId: string, employeeId: string): string {
  return `${listId}-${employeeId.replace(/[^A-Za-z0-9-]/g, (char) => `_${char.charCodeAt(0).toString(16)}_`)}`;
}

/** Keeps focus in the input, whose blur would close the list before a click arrives. */
const keepFocus = (event: MouseEvent) => {
  event.preventDefault();
};

/** One empty list for every render without hits, which keeps the scrolling effect from running for nothing. */
const NO_HITS: readonly EmployeeSearchHit[] = [];

/** What the page asks of the field. */
export interface SearchBoxHandle {
  /** Focuses the field, which opens its list as any focus does: the chart's '/' key. */
  readonly focus: () => void;
  /** Focuses the field with its list closed: the search results, which the person has just closed, hand the focus back. */
  readonly returnFocus: () => void;
}

interface SearchBoxProps {
  /** The chart's current options, so hits are always people visible in the chart. */
  readonly options: OrgChartOptions;
  /** config.json's directory.extraFields, which the field's description names where search looks in them. */
  readonly extraFields: readonly ExtraField[];
  readonly disabled: boolean;
  readonly onSelect: (hit: EmployeeSearchHit) => void;
  /** Show all: every match of what was typed, listed beside the chart. */
  readonly onShowAll: (term: string) => void;
  readonly handleRef?: Ref<SearchBoxHandle>;
}

export function SearchBox({ options, extraFields, disabled, onSelect, onShowAll, handleRef }: SearchBoxProps) {
  const mediator = useMediator();
  const language = useLanguage();
  const t = useStrings(SEARCH_STRINGS);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // True only while returnFocus focuses the field: React calls onFocus within focus().
  const returningFocus = useRef(false);
  // -1 for none: before anything is typed no option is active, so that Enter on an empty field opens nobody.
  const [active, setActive] = useState(0);
  // Said once Clear recent has done its work, until the field changes or gets the focus again.
  const [cleared, setCleared] = useState(false);
  const listId = useId();

  const term = text.trim();
  const searching = term !== '';
  const debouncedTerm = useDebouncedValue(term, DEBOUNCE_MS);
  const query = useMemo(
    () => (debouncedTerm ? new SearchEmployeesQuery(options, debouncedTerm) : null),
    [options, debouncedTerm],
  );
  const { data, isLoading } = useQuery(query);
  const hits = data?.hits ?? NO_HITS;
  const total = data?.total ?? 0;
  const isSettled = !isLoading && debouncedTerm === term;
  // The last option lists every match beside the chart, where more match than are suggested.
  const offersAll = total > hits.length;
  const allIndex = hits.length;
  const showMatches = open && searching && (hits.length > 0 || isSettled);
  const noMatches = showMatches && hits.length === 0;
  // The count with the term it is for, so that only a pause after the latest term counts; null until the list shows it.
  const settled = showMatches && isSettled ? `${String(total)} ${term}` : null;
  const paused = useDebouncedValue(settled, COUNT_PAUSE_MS);
  // The count the live region says, kept while the list stays open: a region whose text stays the same says nothing again.
  const [saidTotal, setSaidTotal] = useState<number | null>(null);
  if (!(open && searching)) {
    if (saidTotal !== null) setSaidTotal(null);
  } else if (paused !== null && paused === settled && total !== saidTotal) {
    setSaidTotal(total);
  }

  // Asked again each time the empty field opens its list: the people opened lately change in the meantime.
  const recentQuery = useMemo(() => (open && !searching ? new GetRecentPeopleQuery(options) : null), [open, searching, options]);
  const { data: recent, reload: reloadRecent } = useQuery(recentQuery);
  const own = [recent?.you, recent?.yourManager].filter((hit) => hit != null);
  const lately = recent?.recent ?? NO_HITS;
  // The people in the order the arrow keys go through them, Clear recent after them.
  const people = [...own, ...lately];
  const offersClear = lately.length > 0;
  const clearIndex = people.length;
  const showRecent = open && !searching && people.length > 0;

  const lastIndex = searching ? (offersAll ? allIndex : hits.length - 1) : offersClear ? clearIndex : people.length - 1;
  const activeIndex = Math.min(active, lastIndex);
  const activeHit = showMatches ? hits[activeIndex] : showRecent ? people[activeIndex] : undefined;
  const allActive = showMatches && offersAll && activeIndex === allIndex;
  const clearActive = showRecent && offersClear && activeIndex === clearIndex;
  // Never optionIds: those always have a hyphen right after the list's id.
  const allId = `${listId}_all`;
  const clearId = `${listId}_clear`;
  const expanded = (showMatches && !noMatches) || showRecent;
  const hintId = useId();

  useImperativeHandle(
    handleRef,
    () => ({
      focus: () => {
        input.current?.focus();
      },
      returnFocus: () => {
        returningFocus.current = true;
        try {
          input.current?.focus();
        } finally {
          returningFocus.current = false;
        }
      },
    }),
    [],
  );

  // DOM focus stays in the input, so the list is scrolled here. scrollIntoView would also scroll an embedding page.
  useLayoutEffect(() => {
    const list = document.getElementById(listId);
    const option = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !option) return;
    if (option.offsetTop < list.scrollTop) list.scrollTo({ top: option.offsetTop });
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: option.offsetTop + option.offsetHeight - list.clientHeight });
    }
  }, [listId, activeIndex, expanded, hits, recent]);

  const choose = (hit: EmployeeSearchHit) => {
    onSelect(hit);
    setOpen(false);
  };

  const showAll = () => {
    onShowAll(term);
    setOpen(false);
  };

  // The list stays open with the signed-in user and their manager, if the chart shows them.
  const clearRecent = () => {
    mediator.send(new ClearRecentPeopleCommand()).then(
      () => {
        setCleared(true);
        reloadRecent();
      },
      () => undefined,
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setOpen(true);
        setActive(Math.max(0, Math.min(activeIndex + 1, lastIndex)));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive(Math.max(activeIndex - 1, 0));
        break;
      case 'Enter': {
        if (!searching) {
          if (!activeHit && !clearActive) break;
          event.preventDefault();
          if (activeHit) choose(activeHit);
          else clearRecent();
          break;
        }
        event.preventDefault();
        // The results view searches again for exactly what was typed, so it needs no settled list.
        if (allActive) {
          showAll();
          break;
        }
        if (isSettled) {
          const hit = hits[activeIndex];
          if (hit) choose(hit);
          break;
        }
        // The listed hits still belong to an earlier term; look up exactly what was typed.
        void mediator.send(new SearchEmployeesQuery(options, term, 1)).then(({ hits: [first] }) => {
          if (first) choose(first);
        });
        break;
      }
      case 'Escape':
        if (showMatches || showRecent) {
          // Keeps the key from also closing the details panel, and Firefox from clearing the text.
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        } else if (text) {
          // Clearing the text is what the key does here; it must not also close the panel and move focus.
          event.preventDefault();
          setText('');
        }
        break;
    }
  };

  const personOption = (hit: EmployeeSearchHit, index: number, lead: string | null = null) => (
    <li
      key={hit.employee.id}
      id={optionId(listId, hit.employee.id)}
      role="option"
      aria-selected={index === activeIndex}
      className={styles.option}
      onMouseDown={keepFocus}
      onClick={() => {
        choose(hit);
      }}
      onMouseEnter={() => {
        setActive(index);
      }}
    >
      {/* Without the status ring: presence stays out of the option's name, so only those who see it would learn it. */}
      <Avatar employee={hit.employee} size={24} showPresence={false} />
      <span className={styles.name}>{hit.employee.displayName}</span>
      <span className={styles.detail}>{hitDetails(hit, t, lead)}</span>
    </li>
  );

  return (
    <div className={styles.search}>
      {/* A label, so a press anywhere in the field, its icon and edges included, lands in the input. */}
      <label className={styles.field}>
        <Icon name="search" size={16} />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-label={t.label}
          aria-describedby={hintId}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={
            activeHit ? optionId(listId, activeHit.employee.id) : allActive ? allId : clearActive ? clearId : undefined
          }
          placeholder={t.label}
          autoComplete="off"
          value={text}
          disabled={disabled}
          onChange={(event) => {
            setText(event.target.value);
            // The first match is active as soon as there is one; the empty field's list waits for the arrows, as on a focus.
            setActive(event.target.value.trim() === '' ? -1 : 0);
            setOpen(true);
            setCleared(false);
          }}
          onFocus={() => {
            // Opening the list again would undo the closing of the results that handed the focus back.
            if (returningFocus.current) return;
            setOpen(true);
            setCleared(false);
            if (!searching) setActive(-1);
          }}
          onBlur={() => {
            setOpen(false);
          }}
          onKeyDown={handleKeyDown}
        />
      </label>
      {/* Read only through aria-describedby, which also reaches hidden text. */}
      <span id={hintId} hidden>
        {searchHint(language, extraFields)}
      </span>
      {/* Mounted before its text appears: screen readers only announce changes to a live region that exists. */}
      <div role="status" className="visually-hidden">
        {saidTotal === null ? (cleared ? t.recentCleared : '') : saidTotal === 0 ? t.noMatches : t.matches(saidTotal)}
      </div>
      {/* The live region above says the same, so screen readers hear it once. */}
      {noMatches && (
        <p className={`${styles.results} ${styles.empty}`} aria-hidden="true">
          {t.noMatches}
        </p>
      )}
      {showMatches && !noMatches && (
        <div className={styles.results}>
          {/* The live region above says the same, so screen readers hear it once. */}
          <p className={styles.count} aria-hidden="true" onMouseDown={keepFocus}>
            {t.matches(total)}
          </p>
          {/* Out of the Tab order: Firefox makes an overflowing list a Tab stop, and focusing it would close it. */}
          <ul id={listId} role="listbox" aria-label={t.people} tabIndex={-1} className={styles.options}>
            {hits.map((hit, index) => personOption(hit, index))}
            {offersAll && (
              <li
                id={allId}
                role="option"
                aria-selected={allActive}
                className={classNames(styles.option, styles.all)}
                onMouseDown={keepFocus}
                onClick={showAll}
                onMouseEnter={() => {
                  setActive(allIndex);
                }}
              >
                {t.showAll(total)}
              </li>
            )}
          </ul>
        </div>
      )}
      {showRecent && (
        <div className={styles.results}>
          {/* Each group is named by its first item, which is no option (the grouped listbox pattern); out of the Tab order as above. */}
          <div id={listId} role="listbox" aria-label={t.people} tabIndex={-1} className={styles.options} onMouseDown={keepFocus}>
            {own.length > 0 && (
              <ul role="group" aria-labelledby={`${listId}_own`} className={styles.group}>
                <li role="presentation" id={`${listId}_own`} className={styles.groupName}>
                  {recent?.you ? (recent.yourManager ? t.youAndYourManager : t.you) : t.yourManager}
                </li>
                {own.map((hit, index) => personOption(hit, index, hit === recent?.you ? t.you : t.yourManager))}
              </ul>
            )}
            {lately.length > 0 && (
              <ul role="group" aria-labelledby={`${listId}_recent`} className={styles.group}>
                <li role="presentation" id={`${listId}_recent`} className={styles.groupName}>
                  {t.recent}
                </li>
                {lately.map((hit, index) => personOption(hit, own.length + index))}
              </ul>
            )}
            {offersClear && (
              <div
                id={clearId}
                role="option"
                aria-selected={clearActive}
                className={classNames(styles.option, styles.all)}
                onClick={clearRecent}
                onMouseEnter={() => {
                  setActive(clearIndex);
                }}
              >
                {t.clearRecent}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
