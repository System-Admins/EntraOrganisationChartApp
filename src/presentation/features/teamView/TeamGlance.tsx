import { useId, useMemo, useState } from 'react';
import { formatNumber, plural } from '@/application/common/intl';
import type { OrgChart } from '@/domain/orgChart/orgChart';
import { summarizeTeam, type TeamShareField, type TeamShareFilter, type TeamShares } from '@/domain/orgChart/teamSummary';
import { classNames } from '../../shared/classNames';
import { useLanguage, useStrings } from '../../shared/languageContext';
import { SHARED_STRINGS } from '../../shared/strings';
import { TEAM_GLANCE_STRINGS } from './strings';
import styles from './TeamGlance.module.css';

interface TeamGlanceProps {
  readonly chart: OrgChart;
  /** The manager, whose team is everyone below them. */
  readonly employeeId: string;
  /** Lists the team's people in a department or city, from its row; without it the rows can't be pressed. */
  readonly onShowPeople?: (filter: TeamShareFilter) => void;
  /** A value whose row must show from the start: its list opens unfolded where the value is among the rest. */
  readonly expandFor?: TeamShareFilter | null;
}

/** Everyone below a person at a glance: the team's numbers as tiles, then its largest departments and cities with their shares of it. */
export function TeamGlance({ chart, employeeId, onShowPeople, expandFor = null }: TeamGlanceProps) {
  const language = useLanguage();
  const shared = useStrings(SHARED_STRINGS);
  const t = useStrings(TEAM_GLANCE_STRINGS);
  // It walks the whole team, so once per chart and person rather than on every render of the panel.
  const { size, levels, managers, departments, cities } = useMemo(() => summarizeTeam(chart, employeeId), [chart, employeeId]);
  if (size === 0) return null;
  const numbers = [
    { kind: 'people', count: size, unit: shared.people },
    // A team of direct reports alone has one level and no managers, which the list of them says already.
    levels > 1 && { kind: 'levels', count: levels, unit: t.levels },
    managers > 0 && { kind: 'managers', count: managers, unit: t.managers },
  ].filter((number) => number !== false);
  return (
    <>
      <ul className={styles.numbers} aria-label={t.numbers}>
        {numbers.map(({ kind, count, unit }) => (
          <li key={kind} className={styles.number}>
            <span className={styles.value}>{formatNumber(language, count)}</span>{' '}
            <span className={styles.unit}>{plural(language, count, unit)}</span>
          </li>
        ))}
      </ul>
      <ShareList
        field="department"
        title={t.departments}
        shares={departments}
        teamSize={size}
        words={{ more: t.moreDepartments, fewer: t.fewerDepartments }}
        onShowPeople={onShowPeople}
        expandFor={expandFor}
      />
      <ShareList
        field="city"
        title={t.cities}
        shares={cities}
        teamSize={size}
        words={{ more: t.moreCities, fewer: t.fewerCities }}
        onShowPeople={onShowPeople}
        expandFor={expandFor}
      />
    </>
  );
}

interface ShareListProps {
  readonly field: TeamShareField;
  readonly title: string;
  readonly shares: TeamShares;
  /** Everyone below the person, of whom a bar shows each share. */
  readonly teamSize: number;
  /** The button under the list: the rest on request, and back. */
  readonly words: { readonly more: (count: number) => string; readonly fewer: string };
  readonly onShowPeople?: (filter: TeamShareFilter) => void;
  readonly expandFor: TeamShareFilter | null;
}

/** The largest departments or cities, each with its number of people and a bar of its share of the team, the rest on request; nothing without any. */
function ShareList({ field, title, shares: { top, rest }, teamSize, words, onShowPeople, expandFor }: ShareListProps) {
  const language = useLanguage();
  const shared = useStrings(SHARED_STRINGS);
  const titleId = useId();
  const listId = useId();
  // One button that changes its words, so that the focus stays on it; TeamGlance is keyed by the person, which folds the list again.
  const [expanded, setExpanded] = useState(() => expandFor !== null && expandFor.field === field && rest.some(({ name }) => name === expandFor.name));
  if (top.length === 0) return null;
  const rows = expanded ? [...top, ...rest] : top;
  return (
    <div>
      <h4 id={titleId} className={styles.heading}>
        {title}
      </h4>
      <ul id={listId} className={classNames(styles.shares, onShowPeople && styles.pressable)} aria-labelledby={titleId}>
        {rows.map(({ name, count }) => {
          const content = (
            <>
              {/* The space keeps the name and the count apart in a button's name; the grid ignores it. */}
              <span className={styles.name}>{name}</span>{' '}
              <span className={styles.count}>
                {formatNumber(language, count)} <span className="visually-hidden">{plural(language, count, shared.people)}</span>
              </span>
              {/* The count says it in words; the bar only shows how much of the team that is. */}
              <span className={styles.bar} aria-hidden="true">
                <span className={styles.fill} style={{ width: `${String((count / teamSize) * 100)}%` }} />
              </span>
            </>
          );
          return (
            <li key={name}>
              {onShowPeople ? (
                <button
                  type="button"
                  className={classNames(styles.share, styles.shareButton)}
                  // The page hands the focus back to the row as Back leaves the list it opened.
                  data-share-field={field}
                  data-share-name={name}
                  onClick={() => { onShowPeople({ field, name }); }}
                >
                  {content}
                </button>
              ) : (
                <div className={styles.share}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
      {rest.length > 0 && (
        <button
          type="button"
          className={styles.more}
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => {
            setExpanded((shown) => !shown);
          }}
        >
          {expanded ? words.fewer : words.more(rest.length)}
        </button>
      )}
    </div>
  );
}
