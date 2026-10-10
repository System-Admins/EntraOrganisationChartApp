import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ADDRESS_SEPARATOR, mailAddressOf } from '@/application/features/contact/teamContact';
import { CheckPhotosCommand } from '@/application/features/dataQuality/checkPhotos';
import { ExportIssuesCommand } from '@/application/features/dataQuality/exportIssues';
import {
  GetDirectoryHealthQuery,
  type DirectoryHealth,
  type ReportedPerson,
} from '@/application/features/dataQuality/getDirectoryHealth';
import type { Language } from '@/application/settings/language';
import { ISSUES, type Issue } from '@/domain/dataQuality/directoryIssues';
import type { Employee } from '@/domain/employees/employee';
import type { OrgChart, OrgChartOptions } from '@/domain/orgChart/orgChart';
import { classNames } from '../../shared/classNames';
import { Dialog } from '../../shared/Dialog';
import controls from '../../shared/DialogControls.module.css';
import { describeError, errorDetail, pointsToSupport } from '../../shared/errors';
import { formatDateTime } from '../../shared/formatDateTime';
import { formatPeople } from '../../shared/formatPeople';
import { Icon } from '../../shared/Icon';
import { useLanguage, useLanguageRef, useStrings } from '../../shared/languageContext';
import { useMediator } from '../../shared/mediatorContext';
import { issueLabels, SHARED_STRINGS } from '../../shared/strings';
import { SupportLink } from '../../shared/SupportLink';
import { useAnnouncer } from '../../shared/useAnnouncer';
import { useCopiedFeedback } from '../../shared/useCopiedFeedback';
import { useCopyText } from '../../shared/useCopyText';
import { useQuery } from '../../shared/useQuery';
import { ProgressBar } from '../orgChart/ProgressBar';
import { PeopleList, type PeopleListEntry } from '../peopleList/PeopleList';
import styles from './DirectoryHealthDialog.module.css';
import { HEALTH_STRINGS } from './strings';

type HealthStrings = (typeof HEALTH_STRINGS)['en'];

interface DirectoryHealthDialogProps {
  readonly open: boolean;
  /** The chart's options as the page uses them: the report covers its people, whatever its filters hide. */
  readonly options: OrgChartOptions;
  /** The chart on screen, missing until it has loaded; another one, after a refresh or other filters, is checked again. */
  readonly chart: OrgChart | undefined;
  /** The dialog closed itself (its Close button, Escape, a click beside it): set `open` to false. */
  readonly onClose: () => void;
  /** Show in chart: the owner closes the report, shows the groups the filters hide the person in, and reveals them. */
  readonly onShowInChart: (person: Employee) => void;
}

/** Who is missing what in the directory, in a wide modal dialog that Settings opens. */
export function DirectoryHealthDialog({ open, options, chart, onClose, onShowInChart }: DirectoryHealthDialogProps) {
  const t = useStrings(HEALTH_STRINGS);
  return (
    <Dialog open={open} title={t.title} closeLabel={t.close} wide onClose={onClose}>
      <HealthReport options={options} chart={chart} onShowInChart={onShowInChart} />
    </Dialog>
  );
}

/** Where the photo check is; its counts stand in for those of `before`, the report it ended on, until the report is asked again. */
type PhotoCheck =
  | { readonly state: 'idle' }
  | { readonly state: 'checking'; readonly checked: number }
  | {
      readonly state: 'done' | 'cancelled';
      readonly before: DirectoryHealth;
      readonly answered: number;
      /** Null after a cancel, which ends before the batches under way have answered. */
      readonly withoutPhoto: number | null;
    }
  | { readonly state: 'failed'; readonly error: unknown };

type ReportProps = Pick<DirectoryHealthDialogProps, 'options' | 'chart' | 'onShowInChart'>;

function HealthReport({ options, chart, onShowInChart }: ReportProps) {
  const t = useStrings(HEALTH_STRINGS);
  const { technicalDetails } = useStrings(SHARED_STRINGS);
  const language = useLanguage();
  const languageRef = useLanguageRef();
  const mediator = useMediator();
  // The page's own region is behind the modal dialog, where screen readers don't hear it.
  const { region, announce } = useAnnouncer();
  // Asked as the report opens, and again for every chart, as a refresh or other filters change what it finds.
  const request = useMemo(() => (chart ? new GetDirectoryHealthQuery(options) : null), [chart, options]);
  const { data: health, error, isLoading, reload } = useQuery(request);
  // The failure Try again was pressed for, which stays while the report is asked again, as the button may have the focus.
  const [retried, setRetried] = useState<{ readonly error: unknown } | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<Issue>>(() => new Set());
  const [check, setCheck] = useState<PhotoCheck>({ state: 'idle' });
  const running = useRef<AbortController | null>(null);
  const photoHeading = useRef<HTMLHeadingElement>(null);
  const summary = useRef<HTMLParagraphElement>(null);

  // A check under way ends with the report; the answers it has by then are kept.
  useEffect(
    () => () => {
      running.current?.abort();
    },
    [],
  );

  const total = health?.checkedIds.length ?? 0;
  const ended = 'before' in check && check.before === health ? check : null;
  const answered = ended?.answered ?? health?.photosAnswered ?? 0;
  const withoutPhoto = ended?.withoutPhoto ?? health?.people.photo.length ?? 0;
  const photoButton = !health || total === 0 ? null : photoButtonOf(check, answered, total, t);

  // The check's button goes once everyone has an answer, and the focus it had goes to the No photo heading.
  const hadPhotoButton = useRef(photoButton !== null);
  useLayoutEffect(() => {
    if (hadPhotoButton.current && photoButton === null && document.activeElement === document.body) photoHeading.current?.focus();
    hadPhotoButton.current = photoButton !== null;
  }, [photoButton]);

  const loadFailure = health ? undefined : (error ?? (isLoading ? retried?.error : undefined));
  // Try again goes as the report comes, and the focus it had goes to the report's first line.
  const hadFailure = useRef(loadFailure !== undefined);
  useLayoutEffect(() => {
    if (hadFailure.current && health && document.activeElement === document.body) summary.current?.focus();
    hadFailure.current = loadFailure !== undefined;
  }, [loadFailure, health]);

  if (!health) {
    if (loadFailure === undefined) return <p className={styles.loading}>{t.loading}</p>;
    const detail = errorDetail(loadFailure);
    return (
      <div role="alert" className={styles.failed}>
        {/* While Try again asks again, the alert says so in the reason's place, so that a failure that comes back is said again. */}
        {isLoading ? (
          <p>{t.loading}</p>
        ) : (
          <p className={styles.reason}>
            {t.failed} {describeError(loadFailure, language)}
            {pointsToSupport(loadFailure) && <SupportLink />}
          </p>
        )}
        <div className={controls.actions}>
          {/* Unavailable, not gone, while the report is asked again, so that it keeps the focus. */}
          <button
            type="button"
            className={controls.button}
            aria-disabled={isLoading || undefined}
            onClick={() => {
              if (isLoading) return;
              setRetried({ error: loadFailure });
              reload();
            }}
          >
            {t.tryAgain}
          </button>
        </div>
        {/* Marked as English, which it stays whatever the page speaks, so that screen readers pronounce it as such. */}
        {detail && !isLoading && (
          <p className={controls.hint}>
            {technicalDetails} <span lang="en">{detail}</span>
          </p>
        )}
      </div>
    );
  }

  const startCheck = () => {
    const before = health;
    const controller = new AbortController();
    running.current = controller;
    setCheck({ state: 'checking', checked: before.photosAnswered });
    announce(t.checkStarted);
    const onProgress = (checked: number) => {
      if (!controller.signal.aborted) setCheck({ state: 'checking', checked });
    };
    mediator.send(new CheckPhotosCommand(before.checkedIds, onProgress, controller.signal)).then(
      (result) => {
        // Cancelled too, the answers found so far are the session's, and the report shows them.
        reload();
        if (controller.signal.aborted) return;
        running.current = null;
        setCheck({ state: 'done', before, ...result });
        const words = HEALTH_STRINGS[languageRef.current];
        const withoutPhoto = formatPeople(result.withoutPhoto, languageRef.current);
        const unanswered = before.checkedIds.length - result.answered;
        announce(
          unanswered === 0
            ? words.checkDone(withoutPhoto)
            : words.checkDoneUnanswered(withoutPhoto, formatPeople(unanswered, languageRef.current)),
        );
      },
      (failure: unknown) => {
        if (controller.signal.aborted) return;
        // A source that still reports progress after it failed must not show the check running again.
        controller.abort();
        running.current = null;
        setCheck({ state: 'failed', error: failure });
        announce(HEALTH_STRINGS[languageRef.current].checkFailed(describeError(failure, languageRef.current)));
      },
    );
  };

  const cancelCheck = () => {
    running.current?.abort();
    running.current = null;
    setCheck({ state: 'cancelled', before: health, answered: check.state === 'checking' ? check.checked : answered, withoutPhoto: null });
    announce(t.checkCancelled);
  };

  const toggle = (issue: Issue) => {
    setExpanded((open) => {
      const next = new Set(open);
      if (!next.delete(issue)) next.add(issue);
      return next;
    });
  };

  const labels = issueLabels(language);
  const everyone = formatPeople(total, language);
  const photoStatus =
    total === 0 ? null : check.state === 'checking' ? (
      <>
        <ProgressBar progress={{ loaded: check.checked, total, remainingMs: null }} className={styles.progress} />
        <span>{t.checking(check.checked, everyone)}</span>
      </>
    ) : check.state === 'failed' ? (
      <span className={styles.reason}>
        {t.checkFailed(describeError(check.error, language))}
        {pointsToSupport(check.error) && <SupportLink />}
      </span>
    ) : answered === 0 ? (
      <span className={styles.photoHint}>{t.photosHint}</span>
    ) : answered < total ? (
      <span>
        {check.state === 'done'
          ? t.unanswered(formatPeople(total - answered, language))
          : check.state === 'cancelled'
            ? t.cancelled(answered, everyone)
            : t.checkedPartly(answered, everyone)}
      </span>
    ) : null;

  return (
    <>
      <p ref={summary} tabIndex={-1} className={styles.summary}>
        {t.summary(everyone, formatDateTime(health.loadedAt))}
      </p>
      <p className={controls.hint}>{t.scope}</p>
      {/* In the dialog from its first render, so that screen readers say what the photo check and the exports come to. */}
      <span ref={region} className="visually-hidden" role="status" />
      <div className={styles.issues}>
        {ISSUES.map((issue) => (
          <IssueBlock
            key={issue}
            issue={issue}
            label={labels[issue]}
            people={health.people[issue]}
            count={
              issue !== 'photo'
                ? formatPeople(health.people[issue].length, language)
                : answered === 0
                  ? t.notChecked
                  : formatPeople(withoutPhoto, language)
            }
            expanded={expanded.has(issue)}
            onToggle={() => {
              toggle(issue);
            }}
            loadedAt={health.loadedAt}
            headingRef={issue === 'photo' ? photoHeading : undefined}
            onShowInChart={onShowInChart}
            announce={announce}
          >
            {issue === 'photo' && (photoStatus !== null || photoButton !== null) && (
              <div className={styles.photoCheck}>
                {photoStatus}
                {photoButton !== null && (
                  <button
                    type="button"
                    className={controls.button}
                    onClick={check.state === 'checking' ? cancelCheck : startCheck}
                  >
                    {photoButton}
                  </button>
                )}
              </div>
            )}
          </IssueBlock>
        ))}
      </div>
    </>
  );
}

/** One button for every step of the check, which keeps the focus as its words change; none once everyone has an answer. */
function photoButtonOf(check: PhotoCheck, answered: number, total: number, t: HealthStrings): string | null {
  if (check.state === 'checking') return t.cancel;
  if (check.state === 'failed') return t.tryAgain;
  if (answered === 0) return t.checkPhotos;
  if (answered === total) return null;
  return check.state === 'done' ? t.checkAgain : t.checkRest;
}

interface IssueBlockProps {
  readonly issue: Issue;
  readonly label: string;
  readonly people: readonly ReportedPerson[];
  /** formatPeople's count of them, or what stands in for it. */
  readonly count: string;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly loadedAt: Date;
  /** The heading, which takes the focus from a control that goes, as the photo check's button does. */
  readonly headingRef?: RefObject<HTMLHeadingElement | null>;
  readonly onShowInChart: (person: Employee) => void;
  readonly announce: (message: string) => void;
  /** Under the heading whether or not the people are shown, as the photo check is. */
  readonly children?: ReactNode;
}

/** An issue's heading with its count, which shows and hides the people with it; a heading without people has nothing to show. */
function IssueBlock({ issue, label, people, count, expanded, onToggle, loadedAt, headingRef, onShowInChart, announce, children }: IssueBlockProps) {
  const t = useStrings(HEALTH_STRINGS);
  const bodyId = useId();
  // One text for screen readers, which would otherwise run the label and the count together, where the eye takes them apart.
  const heading = (
    <>
      <span className={styles.label} aria-hidden="true">
        {label}
      </span>
      <span className={styles.count} aria-hidden="true">
        {count}
      </span>
      <span className="visually-hidden">{t.heading(label, count)}</span>
    </>
  );
  return (
    <div className={styles.issue}>
      <h3 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className={styles.heading}>
        {people.length > 0 ? (
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={expanded}
            aria-controls={expanded ? bodyId : undefined}
            onClick={onToggle}
          >
            <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={16} />
            {heading}
          </button>
        ) : (
          <span className={styles.static}>{heading}</span>
        )}
      </h3>
      {children}
      {expanded && people.length > 0 && (
        <IssuePeople
          id={bodyId}
          issue={issue}
          label={label}
          people={people}
          loadedAt={loadedAt}
          onShowInChart={onShowInChart}
          announce={announce}
        />
      )}
    </div>
  );
}

type IssuePeopleProps = Pick<IssueBlockProps, 'issue' | 'label' | 'people' | 'loadedAt' | 'onShowInChart' | 'announce'> & {
  readonly id: string;
};

/** What an issue means, what can be done with its list, and its people, each shown in the chart by a press. */
function IssuePeople({ id, issue, label, people, loadedAt, onShowInChart, announce }: IssuePeopleProps) {
  const t = useStrings(HEALTH_STRINGS);
  const language = useLanguage();
  const languageRef = useLanguageRef();
  const mediator = useMediator();
  const hintId = useId();
  const [exportError, setExportError] = useState<unknown>(null);
  const entries = useMemo(
    () => people.map((person): PeopleListEntry => ({ employee: person.employee, detail: detailOf(issue, person, language) })),
    [issue, people, language],
  );
  // Whom mail reaches, as for a team's e-mail: disabled accounts are left out.
  const addresses = useMemo(() => distinct(people.map(({ employee }) => mailAddressOf(employee))), [people]);
  const managerAddresses = useMemo(() => distinct(people.map(({ manager }) => manager && mailAddressOf(manager))), [people]);

  // Call from the click: the file is handed to the browser at once, as browsers may block a download no gesture started.
  const exportList = () => {
    setExportError(null);
    mediator.send(new ExportIssuesCommand(issue, people, loadedAt, language)).then(
      () => {
        announce(HEALTH_STRINGS[languageRef.current].listExported(label));
      },
      (failure: unknown) => {
        setExportError(failure);
        announce(HEALTH_STRINGS[languageRef.current].exportFailed(describeError(failure, languageRef.current)));
      },
    );
  };

  return (
    <div id={id} className={styles.people}>
      <p className={styles.explanation}>{t.explanations[issue]}</p>
      <div className={controls.actions}>
        {addresses.length > 0 && (
          <CopyAddresses label={t.copyAddresses} announcement={t.addressesCopied} addresses={addresses} hintId={hintId} />
        )}
        {managerAddresses.length > 0 && (
          <CopyAddresses
            label={t.copyManagerAddresses}
            announcement={t.managerAddressesCopied}
            addresses={managerAddresses}
            hintId={hintId}
          />
        )}
        <button type="button" className={controls.button} onClick={exportList}>
          <Icon name="download" size={16} />
          {t.exportList}
        </button>
      </div>
      {(addresses.length > 0 || managerAddresses.length > 0) && (
        <p id={hintId} className={controls.hint}>
          {t.copyHint}
        </p>
      )}
      {exportError !== null && (
        <p className={styles.reason}>
          {t.exportFailed(describeError(exportError, language))}
          {pointsToSupport(exportError) && <SupportLink />}
        </p>
      )}
      <div className={styles.list}>
        <PeopleList
          people={entries}
          label={label}
          action={t.showInChart}
          onOpen={({ employee }) => {
            onShowInChart(employee);
          }}
        />
      </div>
    </div>
  );
}

/** The line under a person's name: what the issue is about for them, else what they do. */
function detailOf(
  issue: Issue,
  { employee, manager, managerUnlisted, usualSpelling, reports, department }: ReportedPerson,
  language: Language,
): string | null {
  const t = HEALTH_STRINGS[language];
  switch (issue) {
    // An unlisted manager is a user, so one who counts as gone is a disabled account.
    case 'managerGone':
      return manager ? t.disabledManager(manager.displayName) : managerUnlisted ? t.unlistedDisabledManager : t.missingManager;
    case 'disabledManager':
      return t.reports(reports);
    case 'managerCycle':
      return manager ? t.manager(manager.displayName) : managerUnlisted ? t.unlistedManager : null;
    case 'departmentSpelling':
      return usualSpelling && employee.department && t.spelling(employee.department.trim(), usualSpelling);
    case 'departmentInItself':
      return department && t.inDepartment(department.path.join(t.pathSeparator));
    case 'departmentElsewhere': {
      if (!department?.main) return null;
      const parent = department.path.at(-2);
      const { parent: mainParent, people } = department.main;
      return t.elsewhere(
        parent === undefined ? t.hereAtTop : t.hereUnder(parent),
        mainParent === null ? t.thereAtTop : t.thereUnder(mainParent),
        formatPeople(people, language),
      );
    }
    case 'jobTitle':
      return employee.department;
    default:
      return employee.jobTitle ?? employee.department;
  }
}

/** Each address once, in the list's order. */
function distinct(addresses: readonly (string | null)[]): string[] {
  return [...new Set(addresses.filter((address) => address !== null))];
}

interface CopyAddressesProps {
  readonly label: string;
  /** Said after every copy. */
  readonly announcement: string;
  readonly addresses: readonly string[];
  /** The hint that says what the addresses leave out. */
  readonly hintId: string;
}

/** A copy button with its own feedback, and the addresses to copy by hand where nothing could copy them. */
function CopyAddresses({ label, announcement, addresses, hintId }: CopyAddressesProps) {
  const t = useStrings(HEALTH_STRINGS);
  const copyText = useCopyText();
  const { copied, announced, afterCopy } = useCopiedFeedback();
  // The addresses that could not be copied, shown to copy by hand until a copy succeeds.
  const [manualText, setManualText] = useState<string | null>(null);

  const copy = () => {
    const text = addresses.join(ADDRESS_SEPARATOR);
    void copyText(text).then((done) => {
      setManualText(done ? null : text);
      afterCopy(done);
    });
  };

  return (
    <>
      <button type="button" className={controls.button} aria-describedby={hintId} onClick={copy}>
        <Icon name={copied ? 'check' : 'copy'} size={16} />
        {copied ? t.copied : label}
      </button>
      {/* Heard by screen readers, which don't announce the button's new label while it keeps the focus. */}
      <span className="visually-hidden" role="status">
        {announced ? announcement : ''}
      </span>
      {manualText !== null && (
        <label className={classNames(controls.copyByHand, styles.manual)}>
          {t.manualAddresses}
          <textarea
            readOnly
            rows={3}
            value={manualText}
            autoFocus
            onFocus={(event) => {
              event.currentTarget.select();
            }}
          />
        </label>
      )}
    </>
  );
}
