import { useCallback, useId, useMemo } from 'react';
import { formatList, formatNumber, plural } from '@/application/common/intl';
import { departmentPath, getDepartment, type DepartmentTree } from '@/domain/orgChart/departmentTree';
import { getNode, type OrgChart } from '@/domain/orgChart/orgChart';
import { formatPeople } from '../../shared/formatPeople';
import { Icon } from '../../shared/Icon';
import { useLanguage, useStrings } from '../../shared/languageContext';
import { FLAG_LABELS, SHARED_STRINGS } from '../../shared/strings';
import { TeamContact } from '../contact/TeamContact';
import { DETAILS_PANEL_ID } from '../employeeDetails/detailsPanelId';
import { LayoutChoice } from '../peopleList/LayoutChoice';
import { PeopleList, type PeopleLayout, type PeopleListEntry } from '../peopleList/PeopleList';
import { PeoplePanel } from '../peopleList/PeoplePanel';
import { DepartmentPath } from './DepartmentPath';
import { departmentRowIn, NO_DEPARTMENT } from './departmentsOf';
import styles from './DepartmentView.module.css';
import { DEPARTMENT_STRINGS } from './strings';

/** Most leaders named; more are counted, as a line of names would push the people down. */
const LEADERS_NAMED = 3;

/** Where Back goes: the department before, the panel, or the details of the person the view was opened from. */
export type DepartmentBack =
  | { readonly to: 'department'; readonly id: string }
  | { readonly to: 'departments' }
  | { readonly to: 'details'; readonly name: string };

interface DepartmentViewProps {
  readonly chart: OrgChart;
  /** The chart's departments (departmentsOf). */
  readonly tree: DepartmentTree;
  /** A department of the tree, or NO_DEPARTMENT for the people without one. */
  readonly departmentId: string;
  readonly layout: PeopleLayout;
  readonly onLayoutChange: (layout: PeopleLayout) => void;
  /** Opens another department, from the path or the departments below. */
  readonly onOpenDepartment: (id: string) => void;
  /** Opens one of its people in the chart, with their details. */
  readonly onOpen: (employeeId: string) => void;
  /** None where the view stands for a card picked in the chart of departments, as the details do for a person's. */
  readonly back?: DepartmentBack;
  readonly onBack?: () => void;
  /** The department's row or part that takes the focus as the view opens, as Back returns to it. */
  readonly returnTo: string | null;
  /** False where the card that opened it keeps the focus. */
  readonly takesFocus?: boolean;
  readonly onClose: () => void;
}

/** A department's own people where the department tree places it, its leaders first, with the departments above and below it. Key it by the department. */
export function DepartmentView({
  chart,
  tree,
  departmentId,
  layout,
  onLayoutChange,
  onOpenDepartment,
  onOpen,
  back,
  onBack,
  returnTo,
  takesFocus = true,
  onClose,
}: DepartmentViewProps) {
  const t = useStrings(DEPARTMENT_STRINGS);
  const flagLabels = useStrings(FLAG_LABELS);
  const shared = useStrings(SHARED_STRINGS);
  const language = useLanguage();
  const belowId = useId();
  const department = departmentId === NO_DEPARTMENT ? null : getDepartment(tree, departmentId);
  // Built again for every tree, as a refresh or other filters change who is in it.
  const people = useMemo(() => {
    const leaders = new Set(department?.leaderIds);
    const ids = department ? [...department.leaderIds, ...department.memberIds.filter((id) => !leaders.has(id))] : tree.withoutDepartment;
    return ids.map((id): PeopleListEntry => {
      const { employee } = getNode(chart, id);
      return { employee, detail: employee.jobTitle };
    });
  }, [chart, tree, department]);
  const employees = useMemo(() => people.map(({ employee }) => employee), [people]);
  const open = useCallback(
    ({ employee }: PeopleListEntry) => {
      onOpen(employee.id);
    },
    [onOpen],
  );
  const name = department?.name ?? t.noDepartment;
  const own = formatPeople(people.length, language);
  const leaders = department?.leaderIds.map((id) => getNode(chart, id).employee.displayName) ?? [];
  const backLabel =
    back === undefined
      ? null
      : back.to === 'department'
        ? t.backTo(back.id === NO_DEPARTMENT ? t.noDepartment : getDepartment(tree, back.id).name)
        : back.to === 'departments'
          ? t.backToDepartments
          : t.backToDetails(back.name);

  return (
    <PeoplePanel
      title={name}
      summary={department && department.total > people.length ? t.withBelow(own, department.total) : own}
      closeLabel={t.closeDepartment}
      onClose={onClose}
      back={backLabel === null || onBack === undefined ? undefined : { label: backLabel, onBack }}
      initialFocus={() => (returnTo === null ? null : departmentRowIn(document.getElementById(DETAILS_PANEL_ID), returnTo))}
      takesFocus={takesFocus}
    >
      {department && (department.depth > 0 || department.flag !== null) && (
        <div className={styles.path}>
          <DepartmentPath
            path={departmentPath(tree, department.id)}
            label={t.path}
            lastOpens={false}
            lead={department.flag === null ? null : flagLabels[department.flag]}
            onOpen={onOpenDepartment}
          />
        </div>
      )}
      {leaders.length > 0 && (
        <p className={styles.leaders}>
          {leaders.length > LEADERS_NAMED ? t.ledByCount(leaders.length) : t.ledBy(formatList(language, leaders, 'conjunction'))}
        </p>
      )}
      {department?.insideItself && (
        <p className={styles.note}>
          <Icon name="warning" size={14} />
          {t.insideItself}
        </p>
      )}
      {department && department.childIds.length > 0 && (
        <section className={styles.below} aria-labelledby={belowId}>
          <h3 id={belowId} className={styles.heading}>
            {t.below}
          </h3>
          <ul className={styles.rows}>
            {department.childIds.map((id) => {
              const { name: childName, total, insideItself } = getDepartment(tree, id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={styles.row}
                    // The page hands the focus back to the row as Back leaves the department it opened.
                    data-department-id={id}
                    onClick={() => {
                      onOpenDepartment(id);
                    }}
                  >
                    {/* The space keeps the name and the count apart in the button's name; the grid ignores it. */}
                    <span className={styles.name}>
                      {childName}
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
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {department && (
        <div className={styles.contact}>
          <TeamContact people={employees} group={{ kind: 'department', department: name }} headingLevel={3} />
        </div>
      )}
      <LayoutChoice layout={layout} onChange={onLayoutChange} />
      <PeopleList people={people} label={department ? t.people(name) : t.peopleWithout} layout={layout} onOpen={open} />
    </PeoplePanel>
  );
}
