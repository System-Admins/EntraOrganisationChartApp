import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { PeoplePicker, PickedPerson } from '@/application/abstractions/peoplePicker';
import { formatList, formatNumber } from '@/application/common/intl';
import { MAX_EXPAND_DEPTH } from '@/application/settings/appSettings';
import type { TabSetup } from '@/application/settings/tabSetup';
import { canIdentify } from '@/domain/employees/resolveEmployees';
import { splitList } from '@/domain/text/splitList';
import { useLanguage, useStrings } from '../../shared/languageContext';
import { TAB_CONFIG_STRINGS } from './strings';
import styles from './TabConfigPage.module.css';

interface TabConfigPageProps {
  readonly title: string;
  /** What the tab shows now, when its settings are reopened; a new tab's shows everyone. */
  readonly initialSetup: TabSetup;
  /** The levels the chart unfolds where the tab names none: config.json's chart.expandDepth. */
  readonly defaultDepth: number;
  /** Teams' own; null where the host has none (Outlook, microsoft365.com), which leaves the field to type addresses in. */
  readonly peoplePicker: PeoplePicker | null;
  /** Teams reads the setup as the person presses Save, so every change is reported; null withholds Save. */
  readonly onSetupChange: (setup: TabSetup | null) => void;
}

/** A top person in the list the picker fills. */
interface ChosenPerson {
  /** What the tab's address names them by (TabSetup.topPersons). */
  readonly identifier: string;
  /** Null for those the tab's address named before, whom the picker can't show as chosen: it takes object ids only. */
  readonly id: string | null;
  readonly name: string;
}

/** Every number of levels the chart accepts (applyUrlOverrides), from the top alone up. */
const DEPTHS = Array.from({ length: MAX_EXPAND_DEPTH + 1 }, (_, levels) => levels);

/** Shown by Teams when the app is added as a tab to a channel, chat or meeting, and when the tab's settings are reopened. */
export function TabConfigPage({ title, initialSetup, defaultDepth, peoplePicker, onSetupChange }: TabConfigPageProps) {
  const t = useStrings(TAB_CONFIG_STRINGS);
  const language = useLanguage();
  const [people, setPeople] = useState(() => chosenFrom(initialSetup.topPersons));
  const [typed, setTyped] = useState(() => initialSetup.topPersons.join(', '));
  const [depth, setDepth] = useState(initialSetup.depth);
  // A picker that failed leaves the field to type addresses in, as in a host without one.
  const [pickerFailed, setPickerFailed] = useState(false);
  // Typed entries are checked once the person leaves the field, not while an address is half typed.
  const [typedChecked, setTypedChecked] = useState(false);
  // The top persons after the person's latest pick or removal, read out by the live region; null before either.
  const [announced, setAnnounced] = useState<readonly string[] | null>(null);
  const picking = useRef(false);
  const list = useRef<HTMLUListElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const id = useId();
  const picker = pickerFailed ? null : peoplePicker;
  const topPersons = useMemo(() => (picker ? people.map((person) => person.identifier) : splitList(typed)), [picker, people, typed]);
  // Names, half-typed addresses and the like, which would leave the tab saying that it found nobody by them.
  const unknown = topPersons.filter((identifier) => !canIdentify(identifier));
  const valid = unknown.length === 0;
  if (typedChecked && valid) setTypedChecked(false);
  const showUnknown = !valid && (picker !== null || typedChecked);
  const setup = useMemo(() => (valid ? { topPersons, depth } : null), [valid, topPersons, depth]);

  // Teams keeps what was last reported, and offers Save only for a setup that can be saved.
  useEffect(() => {
    onSetupChange(setup);
  }, [onSetupChange, setup]);

  const choose = () => {
    if (!peoplePicker || picking.current) return;
    picking.current = true;
    peoplePicker.pick(people.flatMap((person) => (person.id === null ? [] : [person.id]))).then(
      (picked) => {
        picking.current = false;
        if (picked === null) return;
        const next = afterPicking(people, picked);
        setPeople(next);
        setAnnounced(next.map((person) => person.name));
      },
      (error: unknown) => {
        picking.current = false;
        console.warn('Teams could not show its people picker; offering the field to type addresses in instead.', error);
        flushSync(() => {
          setTyped(people.map((person) => person.identifier).join(', '));
          setPickerFailed(true);
        });
        // Choose people went with the list, and the field says why it is there instead.
        field.current?.focus();
      },
    );
  };

  const remove = (index: number) => {
    const next = people.filter((_, at) => at !== index);
    flushSync(() => {
      setPeople(next);
      setAnnounced(next.map((person) => person.name));
    });
    // The button pressed is gone: the next person's takes the focus, else the previous one's, else Choose people.
    const buttons = list.current?.querySelectorAll('button');
    (buttons?.[index] ?? buttons?.[index - 1] ?? chooseButton.current)?.focus();
  };

  const unknownText = showUnknown ? t.notAddresses(formatList(language, unknown, 'conjunction'), unknown.length) : null;
  const intro = topPersons.length === 0 ? t.intro : t.onlyTheirTeams;
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{t.heading(title)}</h1>
      {picker ? (
        <>
          <p id={`${id}-intro`}>{intro}</p>
          {people.length > 0 && (
            <ul
              ref={list}
              className={styles.people}
              aria-labelledby={`${id}-intro`}
              aria-describedby={unknownText === null ? undefined : `${id}-unknown`}
            >
              {people.map((person, index) => (
                <li key={person.identifier.toLowerCase()} className={styles.person}>
                  <span className={styles.names}>
                    <span className={styles.name}>{person.name}</span>
                    {person.name !== person.identifier && <span className={styles.identifier}>{person.identifier}</span>}
                  </span>
                  <button
                    type="button"
                    className={styles.button}
                    aria-label={t.removePerson(person.name)}
                    onClick={() => {
                      remove(index);
                    }}
                  >
                    {t.remove}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {unknownText !== null && (
            <p id={`${id}-unknown`} className={styles.error}>
              {unknownText}
            </p>
          )}
          <button ref={chooseButton} type="button" className={styles.button} aria-describedby={`${id}-hint`} onClick={choose}>
            {t.choose}
          </button>
          <p id={`${id}-hint`} className={styles.hint}>
            {t.pickerHint}
          </p>
        </>
      ) : (
        <>
          <p>{intro}</p>
          {pickerFailed && <p id={`${id}-failed`}>{t.pickerFailed}</p>}
          <label htmlFor={`${id}-field`} className={styles.label}>
            {t.topPersons}
          </label>
          <input
            ref={field}
            id={`${id}-field`}
            className={styles.input}
            aria-describedby={[pickerFailed && `${id}-failed`, `${id}-hint`, unknownText !== null && `${id}-unknown`]
              .filter(Boolean)
              .join(' ')}
            aria-invalid={showUnknown || undefined}
            placeholder={t.placeholder}
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
            onBlur={() => {
              setTypedChecked(true);
            }}
          />
          <p id={`${id}-hint`} className={styles.hint}>
            {t.hint}
          </p>
          {unknownText !== null && (
            <p id={`${id}-unknown`} className={styles.error}>
              {unknownText}
            </p>
          )}
        </>
      )}
      <label htmlFor={`${id}-depth`} className={`${styles.label} ${styles.depth}`}>
        {t.depth}
      </label>
      <select
        id={`${id}-depth`}
        className={styles.input}
        aria-describedby={`${id}-depthHint`}
        value={depth ?? ''}
        onChange={(event) => {
          setDepth(event.target.value === '' ? null : Number(event.target.value));
        }}
      >
        <option value="">{t.defaultDepth(defaultDepth)}</option>
        {DEPTHS.map((levels) => (
          <option key={levels} value={levels}>
            {formatNumber(language, levels)}
          </option>
        ))}
      </select>
      <p id={`${id}-depthHint`} className={styles.hint}>
        {t.depthHint}
      </p>
      {/* Live regions exist from the first render, because screen readers skip text inserted along with one. */}
      <span className="visually-hidden" role="status">
        {announced === null ? '' : announced.length === 0 ? t.intro : t.showsTeamsOf(formatList(language, announced, 'conjunction'))}
      </span>
    </main>
  );
}

/** As the tab's address names them; the picker can show none of them as chosen. */
function chosenFrom(topPersons: readonly string[]): ChosenPerson[] {
  return onceEach(topPersons.map((identifier) => ({ identifier, id: null, name: identifier })));
}

/** The picker answers for everyone it showed as chosen; those it couldn't show stay. Everyone keeps their place, the newly chosen come last. */
function afterPicking(chosen: readonly ChosenPerson[], picked: readonly PickedPerson[]): ChosenPerson[] {
  const answers = picked.map(({ id, identifier, displayName }) => ({ identifier, id, name: displayName ?? identifier }));
  const kept = chosen.flatMap((person) => {
    const answer = answers.find((other) => isSame(other, person));
    if (answer) return [answer];
    return person.id === null ? [person] : [];
  });
  return onceEach([...kept, ...answers]);
}

/** The first of each person, where a tab saved by hand may name one twice. */
function onceEach(people: readonly ChosenPerson[]): ChosenPerson[] {
  return people.filter((person, index) => people.findIndex((other) => isSame(other, person)) === index);
}

/** The same person where any identifier or object id of theirs matches, in any letter case: a tab saved before may name by object id someone the picker gives by e-mail address. */
function isSame(one: ChosenPerson, other: ChosenPerson): boolean {
  const keys = (person: ChosenPerson) => [person.identifier, person.id ?? ''].filter(Boolean).map((key) => key.toLowerCase());
  const otherKeys = keys(other);
  return keys(one).some((key) => otherKeys.includes(key));
}
