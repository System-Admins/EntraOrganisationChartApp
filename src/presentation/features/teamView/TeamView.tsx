import { useCallback, useMemo } from 'react';
import { descendantIds, getNode, namedEmployee, type OrgChart } from '@/domain/orgChart/orgChart';
import { teamMembersIn, type TeamShareFilter } from '@/domain/orgChart/teamSummary';
import { formatPeople } from '../../shared/formatPeople';
import { useLanguage, useStrings } from '../../shared/languageContext';
import { TeamContact } from '../contact/TeamContact';
import { LayoutChoice } from '../peopleList/LayoutChoice';
import { PeopleList, type PeopleLayout, type PeopleListEntry } from '../peopleList/PeopleList';
import { PeoplePanel } from '../peopleList/PeoplePanel';
import { TEAM_VIEW_STRINGS } from './strings';
import styles from './TeamView.module.css';

interface TeamViewProps {
  readonly chart: OrgChart;
  /** The manager whose team is listed, who must be in the chart. */
  readonly managerId: string;
  /** Lists only the team's people in one department or city, as its row in the Team section counts them. */
  readonly filter: TeamShareFilter | null;
  readonly layout: PeopleLayout;
  readonly onLayoutChange: (layout: PeopleLayout) => void;
  /** Opens one of the team in the chart, with their details. */
  readonly onOpen: (employeeId: string) => void;
  /** Lists the whole team in place of a department or a city. */
  readonly onShowWholeTeam: () => void;
  /** Back to the manager's details, which the view was opened from. */
  readonly onBack: () => void;
  readonly onClose: () => void;
}

/** Everyone the chart names below a manager, at every level and in the outline's order, as a list or a photo board, with a way to reach them all. Key it by the manager and the filter. */
export function TeamView({ chart, managerId, filter, layout, onLayoutChange, onOpen, onShowWholeTeam, onBack, onClose }: TeamViewProps) {
  const t = useStrings(TEAM_VIEW_STRINGS);
  const language = useLanguage();
  const manager = getNode(chart, managerId).employee;
  // Built again for every chart: a refresh or other filters change who is in the team. An unlisted person's place is nobody to list.
  const people = useMemo(
    () =>
      (filter ? teamMembersIn(chart, managerId, filter) : descendantIds(chart, managerId)).flatMap((id): PeopleListEntry[] => {
        const employee = namedEmployee(chart, id);
        return employee ? [{ employee, detail: employee.jobTitle ?? employee.department }] : [];
      }),
    [chart, managerId, filter],
  );
  const employees = useMemo(() => people.map(({ employee }) => employee), [people]);
  const open = useCallback(
    ({ employee }: PeopleListEntry) => {
      onOpen(employee.id);
    },
    [onOpen],
  );
  const { displayName } = manager;

  return (
    <PeoplePanel
      title={filter ? t.titleIn(displayName, filter.name) : t.title(displayName)}
      summary={formatPeople(people.length, language)}
      closeLabel={t.close}
      onClose={onClose}
      back={{ label: t.backTo(displayName), onBack }}
    >
      {filter && (
        <button type="button" className={styles.wholeTeam} onClick={onShowWholeTeam}>
          {t.seeWholeTeam}
        </button>
      )}
      <div className={styles.contact}>
        <TeamContact
          people={employees}
          group={filter ? { kind: 'place', manager: displayName, place: filter.name } : { kind: 'wholeTeam', manager: displayName }}
          headingLevel={3}
        />
      </div>
      <LayoutChoice layout={layout} onChange={onLayoutChange} />
      <PeopleList
        people={people}
        label={filter ? t.peopleIn(displayName, filter.name) : t.people(displayName)}
        layout={layout}
        onOpen={open}
      />
    </PeoplePanel>
  );
}
