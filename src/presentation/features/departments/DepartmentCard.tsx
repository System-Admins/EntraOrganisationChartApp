import { memo, useId, type MouseEvent } from 'react';
import { formatList } from '@/application/common/intl';
import type { DepartmentNode } from '@/domain/orgChart/departmentTree';
import { classNames } from '../../shared/classNames';
import { formatPeople } from '../../shared/formatPeople';
import { Icon } from '../../shared/Icon';
import { useLanguage, useStrings } from '../../shared/languageContext';
import { FLAG_LABELS } from '../../shared/strings';
import { DETAILS_PANEL_ID } from '../employeeDetails/detailsPanelId';
import cards from '../orgChart/EmployeeCard.module.css';
import styles from './DepartmentCard.module.css';
import { DEPARTMENT_STRINGS } from './strings';

/** Most leaders a card names; more are counted. */
const LEADERS_NAMED = 2;

interface DepartmentCardProps {
  readonly department: DepartmentNode;
  /** The names of its leaders, in its order. */
  readonly leaders: readonly string[];
  /** aria-level, aria-posinset and aria-setsize. */
  readonly level: number;
  readonly position: number;
  readonly setSize: number;
  readonly expanded: boolean;
  readonly selected: boolean;
  /** Changes with every reveal of this department, restarting the highlight; 0 for none. */
  readonly highlight: number;
  readonly tabbable: boolean;
  /** Id of the rendered departments below, for aria-owns. */
  readonly groupId: string | undefined;
  /** A click: folds or unfolds the departments below (if any) and selects it. Enter and Space are tree keys (useTreeKeyboard). */
  readonly onActivate: () => void;
  /** Folds or unfolds without selecting: the badge. */
  readonly onToggle: () => void;
  readonly onFocus: () => void;
}

/** A department in the chart of departments, in the frame of a person's card (EmployeeCard.module.css), which keeps its borders on paper too. */
export const DepartmentCard = memo(function DepartmentCard({
  department,
  leaders,
  level,
  position,
  setSize,
  expanded,
  selected,
  highlight,
  tabbable,
  groupId,
  onActivate,
  onToggle,
  onFocus,
}: DepartmentCardProps) {
  const t = useStrings(DEPARTMENT_STRINGS);
  const flagLabels = useStrings(FLAG_LABELS);
  const language = useLanguage();
  const id = useId();
  const { name, memberIds, total, childIds, flag, insideItself } = department;
  const below = childIds.length;
  const tabIndex = tabbable ? 0 : -1;
  const led = leaders.length > LEADERS_NAMED ? t.ledByCount(leaders.length) : t.ledBy(formatList(language, leaders, 'conjunction'));
  const describedBy = [flag && `${id}-flag`, insideItself && `${id}-loop`, `${id}-people`, leaders.length > 0 && `${id}-leaders`]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      role="treeitem"
      tabIndex={tabIndex}
      aria-labelledby={`${id}-name`}
      aria-describedby={describedBy}
      aria-level={level}
      aria-posinset={position}
      aria-setsize={setSize}
      aria-expanded={below > 0 ? expanded : undefined}
      aria-selected={selected}
      // The side panel shows the selected department's people.
      aria-controls={selected ? DETAILS_PANEL_ID : undefined}
      aria-owns={groupId}
      data-tree-key={department.id}
      className={classNames(cards.card, selected && cards.selected)}
      onClick={onActivate}
      onFocus={onFocus}
    >
      {highlight > 0 && <span key={highlight} className={cards.pulse} aria-hidden="true" />}
      <div className={cards.body}>
        {flag && (
          <span id={`${id}-flag`} className={cards.flag}>
            <Icon name="warning" size={12} />
            {flagLabels[flag]}
          </span>
        )}
        {insideItself && (
          <span id={`${id}-loop`} className={cards.flag}>
            <Icon name="warning" size={12} />
            {t.alsoHigherUpLine}
          </span>
        )}
        <span id={`${id}-name`} className={styles.name} title={name}>
          {name}
        </span>
        <span id={`${id}-people`} className={styles.line}>
          {formatPeople(memberIds.length, language)}
        </span>
        {leaders.length > 0 && (
          <span id={`${id}-leaders`} className={styles.line} title={led}>
            {led}
          </span>
        )}
      </div>
      {below > 0 && (
        <button
          type="button"
          tabIndex={tabIndex}
          className={cards.badge}
          title={t.belowInAll(t.belowCount(below), formatPeople(total, language))}
          aria-label={t.belowCount(below)}
          aria-expanded={expanded}
          aria-controls={groupId}
          onClick={(event: MouseEvent) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          <Icon name="departments" size={12} />
          {below}
          <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={12} />
        </button>
      )}
    </div>
  );
});
