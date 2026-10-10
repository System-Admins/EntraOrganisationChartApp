import { useId } from 'react';
import { formatNumber, plural } from '@/application/common/intl';
import { getDepartment, type DepartmentNode, type DepartmentTree } from '@/domain/orgChart/departmentTree';
import { ROOT_FLAGS } from '@/domain/orgChart/orgChart';
import { classNames } from '../../shared/classNames';
import { Icon } from '../../shared/Icon';
import { useLanguage, useStrings } from '../../shared/languageContext';
import { FLAG_LABELS, SHARED_STRINGS } from '../../shared/strings';
import { DETAILS_PANEL_ID } from '../employeeDetails/detailsPanelId';
import { PeoplePanel } from '../peopleList/PeoplePanel';
import { departmentRowIn, NO_DEPARTMENT } from './departmentsOf';
import styles from './DepartmentsPanel.module.css';
import { DEPARTMENT_STRINGS } from './strings';

interface DepartmentsPanelProps {
  readonly tree: DepartmentTree;
  /** The departments folded or unfolded by hand; the others follow isUnfolded. */
  readonly folds: ReadonlyMap<string, boolean>;
  readonly onFold: (id: string, unfolded: boolean) => void;
  /** Opens a department's people, or NO_DEPARTMENT's. */
  readonly onOpen: (id: string) => void;
  /** The row that takes the focus as the panel opens, as Back returns to it; the heading where null. */
  readonly returnTo: string | null;
  /** Shows the departments in the chart's place; none where they are there already. */
  readonly onShowAsChart?: () => void;
  readonly onClose: () => void;
}

/** The top departments start unfolded, which shows the next level; the rest wait for a press. */
export function isUnfolded(folds: ReadonlyMap<string, boolean>, department: DepartmentNode): boolean {
  return folds.get(department.id) ?? department.depth === 0;
}

/** The chart's departments beside it, nested as their people report to each other: lists with disclosure buttons, as the chart is the page's only tree. */
export function DepartmentsPanel({ tree, folds, onFold, onOpen, returnTo, onShowAsChart, onClose }: DepartmentsPanelProps) {
  const t = useStrings(DEPARTMENT_STRINGS);
  const flagLabels = useStrings(FLAG_LABELS);
  const shared = useStrings(SHARED_STRINGS);
  const language = useLanguage();
  // As the people chart gathers flagged branches under a heading each, after the people at the top.
  const groups = [null, ...ROOT_FLAGS]
    .map((flag) => ({ flag, ids: tree.rootIds.filter((id) => getDepartment(tree, id).flag === flag) }))
    .filter(({ ids }) => ids.length > 0);
  const without = tree.withoutDepartment.length;

  return (
    <PeoplePanel
      title={t.title}
      summary={t.count(tree.nodes.size)}
      closeLabel={t.close}
      onClose={onClose}
      initialFocus={() => (returnTo === null ? null : departmentRowIn(document.getElementById(DETAILS_PANEL_ID), returnTo))}
    >
      {onShowAsChart && tree.nodes.size > 0 && (
        <button type="button" className={styles.asChart} onClick={onShowAsChart}>
          {t.showAsChart}
        </button>
      )}
      {groups.map(({ flag, ids }) => (
        <div key={flag ?? ''} className={styles.group}>
          {flag !== null && <h3 className={styles.groupHeading}>{flagLabels[flag]}</h3>}
          <DepartmentList tree={tree} ids={ids} folds={folds} onFold={onFold} onOpen={onOpen} />
        </div>
      ))}
      {without > 0 && (
        <div className={classNames(styles.row, styles.without)}>
          <span className={styles.toggle} />
          <button
            type="button"
            className={styles.open}
            data-department-id={NO_DEPARTMENT}
            onClick={() => {
              onOpen(NO_DEPARTMENT);
            }}
          >
            {/* The space keeps the name and the count apart in the button's name; the grid ignores it. */}
            <span className={styles.name}>{t.noDepartment}</span>{' '}
            <span className={styles.count}>
              {formatNumber(language, without)} <span className="visually-hidden">{plural(language, without, shared.people)}</span>
            </span>
          </button>
        </div>
      )}
    </PeoplePanel>
  );
}

interface DepartmentListProps {
  readonly tree: DepartmentTree;
  readonly ids: readonly string[];
  readonly id?: string;
  readonly folds: ReadonlyMap<string, boolean>;
  readonly onFold: (id: string, unfolded: boolean) => void;
  readonly onOpen: (id: string) => void;
}

function DepartmentList({ tree, ids, id, folds, onFold, onOpen }: DepartmentListProps) {
  return (
    <ul id={id} className={styles.list}>
      {ids.map((departmentId) => (
        <DepartmentRow key={departmentId} tree={tree} department={getDepartment(tree, departmentId)} folds={folds} onFold={onFold} onOpen={onOpen} />
      ))}
    </ul>
  );
}

interface DepartmentRowProps extends Omit<DepartmentListProps, 'ids' | 'id'> {
  readonly department: DepartmentNode;
}

function DepartmentRow({ tree, department, folds, onFold, onOpen }: DepartmentRowProps) {
  const t = useStrings(DEPARTMENT_STRINGS);
  const shared = useStrings(SHARED_STRINGS);
  const language = useLanguage();
  const listId = useId();
  const { id, name, total, childIds, insideItself } = department;
  const unfolded = isUnfolded(folds, department);
  const hasBelow = childIds.length > 0;

  return (
    <li>
      <div className={styles.row}>
        {hasBelow ? (
          <button
            type="button"
            className={styles.toggle}
            aria-label={t.departmentsIn(name)}
            aria-expanded={unfolded}
            aria-controls={unfolded ? listId : undefined}
            onClick={() => {
              onFold(id, !unfolded);
            }}
          >
            <Icon name={unfolded ? 'chevronDown' : 'chevronRight'} size={16} />
          </button>
        ) : (
          <span className={styles.toggle} />
        )}
        <button
          type="button"
          className={styles.open}
          // The page hands the focus back to the row as Back leaves the department it opened.
          data-department-id={id}
          onClick={() => {
            onOpen(id);
          }}
        >
          <span className={styles.name}>
            {name}
            {insideItself && <Icon name="warning" size={14} />}
          </span>{' '}
          <span className={styles.count}>
            {formatNumber(language, total)} <span className="visually-hidden">{plural(language, total, shared.people)}</span>
          </span>
          {insideItself && (
            <>
              {' '}
              <span className="visually-hidden">{t.alsoHigherUp}</span>
            </>
          )}
        </button>
      </div>
      {hasBelow && unfolded && <DepartmentList tree={tree} ids={childIds} id={listId} folds={folds} onFold={onFold} onOpen={onOpen} />}
    </li>
  );
}
