import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { flushSync } from 'react-dom';
import { CONTACT_CHANNELS, type ContactChannel } from '@/application/abstractions/contactLauncher';
import { CalendarConsentRequiredError } from '@/application/abstractions/workingHoursSource';
import { browserOffset } from '@/application/common/timeZones';
import { GetRecordedManagerQuery } from '@/application/features/orgChart/getRecordedManager';
import { ConsentToCalendarCommand } from '@/application/features/workingHours/consentToCalendar';
import { GetWorkingHoursQuery } from '@/application/features/workingHours/getWorkingHours';
import { localTimeOf } from '@/application/features/workingHours/localTime';
import type { ExtraField } from '@/application/settings/extraFields';
import { accountStateOf, type Employee } from '@/domain/employees/employee';
import { departmentPath } from '@/domain/orgChart/departmentTree';
import { ancestorIds, getNode, namedEmployee, narrowsChart, type OrgChart, type OrgChartOptions, type OrgNode } from '@/domain/orgChart/orgChart';
import type { TeamShareFilter } from '@/domain/orgChart/teamSummary';
import tiles from '../../shared/ActionTile.module.css';
import { classNames } from '../../shared/classNames';
import { useDisplayOptions } from '../../shared/displayOptions';
import { describeError, pointsToSupport } from '../../shared/errors';
import { Icon, type IconName } from '../../shared/Icon';
import { useLanguage, useStrings } from '../../shared/languageContext';
import { useMediator } from '../../shared/mediatorContext';
import { ACCOUNT_STATE_LABELS, FLAG_LABELS, SHARED_STRINGS } from '../../shared/strings';
import { SupportLink } from '../../shared/SupportLink';
import { telHref } from '../../shared/telHref';
import { useQuery } from '../../shared/useQuery';
import { describeDestination } from '../contact/describeDestination';
import { TeamContact } from '../contact/TeamContact';
import { useContact } from '../contact/useContact';
import { useContactDestinations } from '../contact/useContactDestinations';
import { DepartmentPath } from '../departments/DepartmentPath';
import { departmentsOf } from '../departments/departmentsOf';
import { Avatar } from '../photos/Avatar';
import { describePresence, presenceTone } from '../presence/describePresence';
import { usePresence } from '../presence/presenceContext';
import { FILTER_LABELS } from '../settings/strings';
import { ShareAction } from '../share/ShareAction';
import { TeamGlance } from '../teamView/TeamGlance';
import { describeLocalTime } from './describeLocalTime';
import styles from './EmployeeDetailsPanel.module.css';
import { SidePanel } from './SidePanel';
import { DETAILS_STRINGS } from './strings';
import { useMinuteClock } from './useMinuteClock';
import { useSheetFocus } from './useSheetFocus';

interface EmployeeDetailsPanelProps {
  readonly chart: OrgChart;
  /** What the chart was built with, which explains a manager it leaves out. */
  readonly options: OrgChartOptions;
  readonly employeeId: string;
  /** config.json's chart.showWorkLocation. */
  readonly showWorkLocation: boolean;
  /** config.json's chart.showWorkingHours. */
  readonly showWorkingHours: boolean;
  /** config.json's directory.extraFields: a row each, under its label, where the person has a value. */
  readonly extraFields: readonly ExtraField[];
  readonly onClose: () => void;
  /** Selects and scrolls to another person in the chart (manager or report). */
  readonly onShowPerson: (employeeId: string) => void;
  /** Narrows the chart to the person's team; offered where that leaves anyone out. */
  readonly onShowOnlyTeam?: (employeeId: string) => void;
  /** Set while the chart shows the person's team alone, to show everyone again. */
  readonly onShowEveryone?: () => void;
  /** Lists everyone below the person in the panel's place, or those in one department or city, from its row. */
  readonly onSeeTeam?: (employeeId: string, filter?: TeamShareFilter) => void;
  /** That button, which the team list's Back gives the focus back to. */
  readonly seeTeamRef?: Ref<HTMLButtonElement>;
  /** The department or city whose row opened the team list, which Back hands the focus back to: its list starts unfolded where the row is among the rest. */
  readonly shownShare?: TeamShareFilter | null;
  /** The person was opened from a list that stood in the panel's place, which is gone now; read as the panel mounts. */
  readonly openedFromList?: boolean;
  /** Lists the people of a department on the person's department path, in the panel's place. */
  readonly onShowDepartment?: (employeeId: string, departmentId: string) => void;
}

/** The direct reports listed before Show all, which keeps the Team section under them within reach. */
const REPORTS_LISTED = 20;

/** Everything known about one person; rows without data are left out. */
export function EmployeeDetailsPanel({
  chart,
  options,
  employeeId,
  showWorkLocation,
  showWorkingHours,
  extraFields,
  onClose,
  onShowPerson,
  onShowOnlyTeam,
  onShowEveryone,
  onSeeTeam,
  seeTeamRef,
  shownShare = null,
  openedFromList = false,
  onShowDepartment,
}: EmployeeDetailsPanelProps) {
  const contact = useContact();
  const destinations = useContactDestinations();
  const destinationId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const askedInPanel = useSheetFocus(panelRef, headingRef, employeeId, openedFromList);
  // A pick from a list made for an earlier chart can select someone this chart leaves out or unnamed, whom nobody watches.
  const presence = usePresence(employeeId, namedEmployee(chart, employeeId) !== undefined);
  const { showLevels } = useDisplayOptions();
  const language = useLanguage();
  const flagLabels = useStrings(FLAG_LABELS);
  const accountStates = useStrings(ACCOUNT_STATE_LABELS);
  const shared = useStrings(SHARED_STRINGS);
  const t = useStrings(DETAILS_STRINGS);

  // A new person starts at the top, not at the previous person's scroll position.
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [employeeId]);

  const node = chart.nodes.get(employeeId);
  // An unlisted person's place has no details to show; the chart never selects it.
  if (!node || node.unlisted) return null;
  const { employee, flag, childIds, depth } = node;
  const manager = node.parentId === null ? null : getNode(chart, node.parentId);
  const managers = ancestorIds(chart, employeeId).map((id) => getNode(chart, id));
  const reports = childIds.map((id) => getNode(chart, id));
  const departments = departmentsOf(chart);
  const departmentId = departments.departmentIdOf.get(employeeId);
  const location = [employee.city, employee.country].filter(Boolean).join(', ');
  const accountState = accountStateOf(employee);
  // Teams reaches no account that can't sign in, nor a member without a license; a guest's license is at home.
  const inTeams = accountState !== 'disabled' && accountState !== 'unlicensed';
  const reply = presence?.outOfOfficeMessage;
  const workLocation = showWorkLocation ? presence?.workLocation : null;

  const showPerson = (id: string) => {
    askedInPanel();
    onShowPerson(id);
  };

  // Where the channel opens, as its button's description and tooltip.
  const opens = (channel: ContactChannel) =>
    destinations && {
      'aria-describedby': `${destinationId}-${channel}`,
      title: describeDestination(destinations[channel], language),
    };

  return (
    <SidePanel ref={panelRef} label={t.detailsFor(employee.displayName)} closeLabel={t.close} onClose={onClose}>
      <header className={styles.header}>
        <Avatar employee={employee} size={72} />
        <div className={styles.identity}>
          <h2 ref={headingRef} tabIndex={-1} className={styles.name}>
            {employee.displayName}
          </h2>
          {employee.jobTitle && <p className={styles.jobTitle}>{employee.jobTitle}</p>}
          {employee.department && <p className={styles.department}>{employee.department}</p>}
          {presence && presenceTone(presence) && <p className={styles.presence}>{describePresence(presence, language)}</p>}
          {presence?.statusMessage && (
            <p className={styles.statusMessage}>
              <Icon name="chat" size={14} />
              <span className="visually-hidden">{t.statusMessage}: </span>
              {presence.statusMessage}
            </p>
          )}
          {/* A line each, as the account and the person's place in the chart are separate matters. */}
          {accountState && (
            <p className={styles.flag}>
              <Icon name="warning" size={14} />
              {accountStates[accountState]}
            </p>
          )}
          {flag && (
            <p className={styles.flag}>
              <Icon name="warning" size={14} />
              {flagLabels[flag]}
            </p>
          )}
        </div>
      </header>

      <div className={styles.actions}>
        <button
          type="button"
          className={tiles.tile}
          aria-label={t.teamsChat}
          disabled={!inTeams}
          {...opens('chat')}
          onClick={() => { contact(employee, 'chat'); }}
        >
          <Icon name="chat" />
          {t.chat}
        </button>
        <button
          type="button"
          className={tiles.tile}
          disabled={!employee.mail}
          {...opens('email')}
          onClick={() => { contact(employee, 'email'); }}
        >
          <Icon name="mail" />
          {t.email}
        </button>
        <button
          type="button"
          className={tiles.tile}
          aria-label={t.teamsCall}
          disabled={!inTeams}
          {...opens('call')}
          onClick={() => { contact(employee, 'call'); }}
        >
          <Icon name="phone" />
          {t.call}
        </button>
        <ShareAction key={employee.id} employee={employee} className={tiles.tile} />
        {/* Read only through aria-describedby, which also reaches hidden text. */}
        {destinations &&
          CONTACT_CHANNELS.map((channel) => (
            <span key={channel} id={`${destinationId}-${channel}`} hidden>
              {describeDestination(destinations[channel], language)}
            </span>
          ))}
      </div>

      <Section title={t.contact}>
        {reply && <AutomaticReply key={`reply-${employee.id}`} text={reply} />}
        {workLocation && (
          <Row icon="work" label={t.workLocationToday}>
            {t.workLocations[workLocation]}
          </Row>
        )}
        {/* A calendar is asked for by its mailbox's address. */}
        {showWorkingHours && employee.mail && <LocalTimeRow key={`time-${employee.id}`} node={node} />}
        {employee.mail && (
          <Row icon="mail" label={t.email}>
            <button
              type="button"
              className={styles.link}
              {...opens('email')}
              onClick={() => { contact(employee, 'email'); }}
            >
              {employee.mail}
            </button>
          </Row>
        )}
        {employee.businessPhone && (
          <Row icon="phone" label={t.workPhone}>
            <PhoneLink number={employee.businessPhone} />
          </Row>
        )}
        {employee.mobilePhone && (
          <Row icon="mobile" label={t.mobile}>
            <PhoneLink number={employee.mobilePhone} />
          </Row>
        )}
        {employee.officeLocation && (
          <Row icon="building" label={t.office}>
            {employee.officeLocation}
          </Row>
        )}
        {location && (
          <Row icon="location" label={t.location}>
            {location}
          </Row>
        )}
      </Section>

      <Section title={t.organization}>
        {employee.companyName && (
          <Row icon="building" label={t.company}>
            {employee.companyName}
          </Row>
        )}
        {employee.employeeId && (
          <Row icon="badge" label={t.employeeId}>
            {employee.employeeId}
          </Row>
        )}
        {extraFields.map(({ property, label }) => {
          const value = employee.extra[property];
          return (
            value && (
              <Row key={property} icon="tag" label={label}>
                {value}
              </Row>
            )
          );
        })}
        {/* Without the level the row keeps the reporting line, and is named after it. */}
        <Row icon="levels" label={showLevels ? shared.level(depth + 1) : t.reportingLine}>
          {managers.length === 0 ? (
            t.topOfChart
          ) : (
            <ol className={styles.line} aria-label={t.reportingLine}>
              {managers.map(({ employee: person, unlisted }) => (
                <li key={person.id}>
                  {unlisted ? (
                    <span className={styles.unlisted}>{shared.unlisted}</span>
                  ) : (
                    <button type="button" className={styles.lineLink} onClick={() => { showPerson(person.id); }}>
                      {person.displayName}
                    </button>
                  )}
                  {/* After the name, so a line that wraps ends with the sign that it goes on. */}
                  <span className={styles.separator} aria-hidden="true">
                    ›
                  </span>
                </li>
              ))}
              <li>{employee.displayName}</li>
            </ol>
          )}
        </Row>
        {departmentId !== undefined && (
          <Row icon="departments" label={t.department}>
            {/* The flagged branch it is in shows under the name already. */}
            <DepartmentPath
              path={departmentPath(departments, departmentId)}
              label={t.department}
              lastOpens
              onOpen={onShowDepartment && ((id) => { onShowDepartment(employee.id, id); })}
            />
          </Row>
        )}
        {manager && (
          <Row icon="person" label={t.manager}>
            {manager.unlisted ? <UnlistedPerson /> : <PersonLink person={manager.employee} onShow={showPerson} />}
          </Row>
        )}
        {flag === 'managerNotShown' && <RecordedManagerRow key={employee.id} node={node} options={options} />}
        {reports.length > 0 && (
          <Row icon="team" label={t.directReports(reports.length)}>
            <ReportList key={employee.id} reports={reports} onShow={showPerson} />
          </Row>
        )}
      </Section>

      {reports.length > 0 && (
        <TeamSection
          chart={chart}
          node={node}
          onShowOnlyTeam={onShowOnlyTeam}
          onShowEveryone={onShowEveryone}
          onSeeTeam={onSeeTeam}
          seeTeamRef={seeTeamRef}
          shownShare={shownShare}
        />
      )}
    </SidePanel>
  );
}

interface TeamSectionProps extends Pick<EmployeeDetailsPanelProps, 'onShowOnlyTeam' | 'onShowEveryone' | 'onSeeTeam' | 'seeTeamRef' | 'shownShare'> {
  readonly chart: OrgChart;
  /** The manager, who has direct reports. */
  readonly node: OrgNode;
}

/** A manager's team beyond the list of direct reports: its numbers and make-up, what the chart shows of it, then how to reach it. */
function TeamSection({ chart, node, onShowOnlyTeam, onShowEveryone, onSeeTeam, seeTeamRef, shownShare }: TeamSectionProps) {
  const t = useStrings(DETAILS_STRINGS);
  const { id, displayName } = node.employee;
  // The same list until the chart changes, as the tiles ask again whom they reach for every new one; nobody reaches an unlisted person through the chart.
  const reports = useMemo(() => node.childIds.flatMap((childId) => namedEmployee(chart, childId) ?? []), [chart, node]);
  // One button that changes its words, so that the focus stays on it as the chart narrows.
  const narrowing = onShowEveryone ? (
    <button type="button" className={styles.viewButton} onClick={onShowEveryone}>
      {t.showEveryone}
    </button>
  ) : (
    onShowOnlyTeam &&
    narrowsChart(chart, id) && (
      <button type="button" className={styles.viewButton} onClick={() => { onShowOnlyTeam(id); }}>
        {t.showOnlyTeam}
      </button>
    )
  );
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t.team}</h3>
      <div className={styles.team}>
        {/* Siblings keyed by the person need distinct keys, or React keeps the old glance beside the new one. */}
        <TeamGlance
          key={`glance-${id}`}
          chart={chart}
          employeeId={id}
          expandFor={shownShare ?? null}
          onShowPeople={
            onSeeTeam &&
            ((filter) => {
              onSeeTeam(id, filter);
            })
          }
        />
        {(narrowing || onSeeTeam) && (
          <div className={styles.viewActions}>
            {narrowing}
            {onSeeTeam && (
              <button ref={seeTeamRef} type="button" className={styles.viewButton} onClick={() => { onSeeTeam(id); }}>
                {t.seeTeam}
              </button>
            )}
          </div>
        )}
        <TeamContact key={id} people={reports} group={{ kind: 'directReports', manager: displayName }} />
      </div>
    </section>
  );
}

/** The first REPORTS_LISTED direct reports, then Show all, which lists the rest with the focus on the first of them. Key it by the manager. */
function ReportList({ reports, onShow }: { reports: readonly OrgNode[]; onShow: (employeeId: string) => void }) {
  const t = useStrings(DETAILS_STRINGS);
  const [all, setAll] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const listed = all ? reports : reports.slice(0, REPORTS_LISTED);

  const showAll = () => {
    // The button goes with the press, and its focus with it, so the first person it brings in takes the focus.
    flushSync(() => {
      setAll(true);
    });
    listRef.current?.children.item(REPORTS_LISTED)?.querySelector<HTMLElement>('button, [tabindex]')?.focus();
  };

  return (
    <>
      <ul ref={listRef} className={styles.people}>
        {listed.map(({ employee: report, unlisted }) => (
          <li key={report.id}>{unlisted ? <UnlistedPerson /> : <PersonLink person={report} onShow={onShow} />}</li>
        ))}
      </ul>
      {listed.length < reports.length && (
        <button type="button" className={styles.showAll} onClick={showAll}>
          {t.showAllReports(reports.length)}
        </button>
      )}
    </>
  );
}

/** The avatar's presence ring and dot are hidden from assistive technology, so the name carries the status. */
function PersonLink({ person, onShow }: { person: Employee; onShow: (employeeId: string) => void }) {
  const presence = usePresence(person.id, false);
  const language = useLanguage();
  return (
    <button type="button" className={styles.person} onClick={() => { onShow(person.id); }}>
      <Avatar employee={person} size={24} />
      <span className={styles.personName}>{person.displayName}</span>
      {person.jobTitle && <span className={styles.personTitle}>{person.jobTitle}</span>}
      {presence && presenceTone(presence) && <span className="visually-hidden">, {describePresence(presence, language)}</span>}
    </button>
  );
}

/** An unlisted person's place among the people around someone, in their card's words: nobody to name, show or open. */
function UnlistedPerson() {
  const shared = useStrings(SHARED_STRINGS);
  // Focusable by script alone, for Show all, which hands the focus to the first person it brings in.
  return (
    <span className={classNames(styles.person, styles.unlistedPerson)} tabIndex={-1}>
      <span className={styles.placeholder}>
        <Icon name="person" size={14} />
      </span>
      <span className={styles.unlisted}>{shared.unlisted}</span>
    </span>
  );
}

/** Three lines until asked for more. The cut is only drawn, so screen readers read the whole reply either way. */
function AutomaticReply({ text }: { text: string }) {
  const t = useStrings(DETAILS_STRINGS);
  const textRef = useRef<HTMLSpanElement>(null);
  const textId = useId();
  const [expanded, setExpanded] = useState(false);
  const [offered, setOffered] = useState(false);

  // Only the laid-out text tells whether three lines hold it, and the panel's width or the font can change that.
  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return;
    const measure = () => {
      // Once offered, the toggle stays: it may hold the focus, which a reply that now fits would otherwise drop.
      setOffered((already) => already || element.scrollHeight > element.clientHeight);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [text, expanded]);

  return (
    <Row icon="reply" label={t.automaticReply}>
      <span ref={textRef} id={textId} className={classNames(styles.reply, !expanded && styles.clamped)}>
        {text}
      </span>
      {offered && (
        <button
          type="button"
          className={styles.link}
          aria-expanded={expanded}
          aria-controls={textId}
          onClick={() => {
            setExpanded(!expanded);
          }}
        >
          {expanded ? t.showLess : t.showMore}
        </button>
      )}
    </Row>
  );
}

/** Turn on's state: a consent asked for, given, or failed with an error kept as itself, so that its words follow the language. */
interface CalendarConsent {
  readonly asking: boolean;
  readonly given: boolean;
  readonly failure: { readonly error: unknown } | null;
}

/** The person's local time and working hours from their calendar, renewed every minute; nothing until the time is known. Key it by the person. */
function LocalTimeRow({ node }: { node: OrgNode }) {
  const t = useStrings(DETAILS_STRINGS);
  const language = useLanguage();
  const mediator = useMediator();
  const now = useMinuteClock();
  const valueRef = useRef<HTMLSpanElement>(null);
  // Asked again for every chart, as RecordedManagerRow is, so that a refresh brings the free times up to date.
  const request = useMemo(() => new GetWorkingHoursQuery(node.employee), [node]);
  const { data: schedule, error, isLoading, reload } = useQuery(request);
  const [consent, setConsent] = useState<CalendarConsent>({ asking: false, given: false, failure: null });
  // Turn on stays until the answer after a consent is in, as it may hold the focus, and takes no second press meanwhile.
  const waiting = consent.asking || (consent.given && isLoading);
  const asksConsent = error instanceof CalendarConsentRequiredError || waiting;
  // After a consent the row stays to say what came of it, where the focus can go as Turn on goes.
  const saysOutcome = consent.given && !asksConsent;

  useLayoutEffect(() => {
    // Turn on went with the focus, which the browser then hands to the body.
    if (saysOutcome && (document.activeElement === null || document.activeElement === document.body)) valueRef.current?.focus();
  }, [saysOutcome]);

  const turnOn = () => {
    if (waiting) return;
    setConsent({ asking: true, given: false, failure: null });
    mediator.send(new ConsentToCalendarCommand()).then(
      () => {
        setConsent({ asking: false, given: true, failure: null });
        reload();
      },
      (failure: unknown) => {
        setConsent({ asking: false, given: false, failure: { error: failure } });
      },
    );
  };

  if (asksConsent) {
    return (
      <Row icon="clock" label={t.localTime}>
        {t.calendarNeedsConsent}{' '}
        <button type="button" className={styles.link} aria-disabled={waiting || undefined} onClick={turnOn}>
          {t.turnOn}
        </button>
        {consent.failure && (
          <span role="alert" className={styles.note}>
            {describeError(consent.failure.error, language)}
            {pointsToSupport(consent.failure.error) && <SupportLink />}
          </span>
        )}
      </Row>
    );
  }
  const lines = schedule ? describeLocalTime(localTimeOf(schedule, now, browserOffset(now)), language) : null;
  if (!lines && !saysOutcome) return null;
  return (
    <Row icon="clock" label={t.localTime}>
      <span ref={valueRef} tabIndex={saysOutcome ? -1 : undefined} className={styles.localTime}>
        {lines ? (
          <>
            {lines.clock}
            {lines.work && <span className={styles.note}>{lines.work}</span>}
          </>
        ) : error === undefined ? (
          t.calendarSilent
        ) : (
          <>
            {describeError(error, language)}
            {pointsToSupport(error) && <SupportLink />}
          </>
        )}
      </span>
    </Row>
  );
}

/** Who the directory names as the manager and why the chart leaves them out; nothing until that is known. */
function RecordedManagerRow({ node, options }: { node: OrgNode; options: OrgChartOptions }) {
  const t = useStrings(DETAILS_STRINGS);
  const filterLabels = useStrings(FILTER_LABELS);
  // Asked again for every chart: a refresh or other filters can change the answer.
  const request = useMemo(() => new GetRecordedManagerQuery(options, node.employee.id), [options, node]);
  const { data: recorded } = useQuery(request);
  if (!recorded) return null;
  const { manager, reason } = recorded;
  const leftOut = t.managerLeftOut;
  return (
    <Row icon="person" label={t.recordedManager}>
      {manager && <span className={styles.recordedName}>{manager.displayName}</span>}
      <span className={styles.note}>
        {reason === 'notInDirectory' || reason === 'notInChart' ? leftOut[reason] : leftOut.hiddenBy(filterLabels[reason])}
      </span>
    </Row>
  );
}

/** Renders nothing when every row inside was left out. */
function Section({ title, children }: { title: string; children: ReactNode[] }) {
  if (!children.some(Boolean)) return null;
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <dl className={styles.rows}>{children}</dl>
    </section>
  );
}

function Row({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <dt className={styles.label}>
        <Icon name={icon} size={16} />
        {label}
      </dt>
      <dd className={styles.value}>{children}</dd>
    </div>
  );
}

function PhoneLink({ number }: { number: string }) {
  return (
    <a className={styles.link} href={telHref(number)}>
      {number}
    </a>
  );
}
