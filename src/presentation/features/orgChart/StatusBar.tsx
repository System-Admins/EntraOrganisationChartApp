import { useEffect, useState } from 'react';
import { SignInRequiredError } from '@/application/abstractions/authenticator';
import { formatList, formatNumber } from '@/application/common/intl';
import type { Language } from '@/application/settings/language';
import type { OrgChart } from '@/domain/orgChart/orgChart';
import { useSignIn } from '../authentication/useSignIn';
import { useConsentToPresence, usePresenceStatus } from '../presence/presenceContext';
import { describeError, pointsToSupport } from '../../shared/errors';
import { formatDateTime } from '../../shared/formatDateTime';
import { formatPeople } from '../../shared/formatPeople';
import { useLanguage, useLanguageRef, useStrings } from '../../shared/languageContext';
import { SupportLink } from '../../shared/SupportLink';
import { describeProgress, type DirectoryProgress } from './directoryProgress';
import styles from './OrgChartPage.module.css';
import { ProgressBar } from './ProgressBar';
import { PAGE_STRINGS, STATUS_STRINGS, TEAM_BAR_STRINGS } from './strings';
import { describeRefreshFailure } from './useOrgChartData';

interface StatusBarProps {
  readonly chart: OrgChart;
  readonly loadedAt: Date;
  readonly isRefreshing: boolean;
  /** How far a full read of the directory is, while one runs. */
  readonly progress: DirectoryProgress | null;
  /** People checked for a photo while an export is being prepared; null when none is. */
  readonly exportProgress: number | null;
  readonly refreshError: unknown;
  readonly onRefresh: () => void;
  /** In the language of the moment; `support` where its words send people to their IT support. */
  readonly notice: { readonly text: string; readonly support: boolean } | null;
  readonly linkedPersonMissing: boolean;
  /** The top persons came from ?top=, so their text is the link's, not the administrator's. */
  readonly topPersonsFromLink: boolean;
  /** How the filters differ from config.json's, which explains a people count others don't see; null when not. */
  readonly filterNote: string | null;
  /** Whether the chart shows one person's team alone, which TeamBar says above the chart, with Show everyone. */
  readonly showsTeam: boolean;
  /** The person whose team the chart shows alone; null where the team's person is missing. */
  readonly teamHeadId: string | null;
  /** The bar itself is not a live region: only what a person's own action led to is announced. */
  readonly announce: (message: string) => void;
}

export function StatusBar({
  chart,
  loadedAt,
  isRefreshing,
  progress,
  exportProgress,
  refreshError,
  onRefresh,
  notice,
  linkedPersonMissing,
  topPersonsFromLink,
  filterNote,
  showsTeam,
  teamHeadId,
  announce,
}: StatusBarProps) {
  const language = useLanguage();
  const languageRef = useLanguageRef();
  const t = useStrings(STATUS_STRINGS);
  const { preparingExport } = useStrings(PAGE_STRINGS);
  const { signIn, busy, error: signInError, failure: signInFailure } = useSignIn(onRefresh);
  const presenceStatus = usePresenceStatus();
  const consentToPresence = useConsentToPresence();
  // The failure, not its words, so that they follow a change of language.
  const [presenceFailure, setPresenceFailure] = useState<{ readonly error: unknown } | null>(null);
  const teamMissing = showsTeam && teamHeadId === null;
  // While a team is shown, the team's bar covers a missing person; the chart's missing top persons would only repeat it.
  const unresolved = showsTeam ? [] : chart.unresolvedTopPersons;
  const needsSignIn = refreshError instanceof SignInRequiredError;
  const refreshFailure = refreshError ? describeRefreshFailure(refreshError, language) : null;
  // Asked to sign in, the bar shows what a sign-in failed with, if anything, instead of the refresh's failure.
  const refreshNeedsSupport = needsSignIn
    ? signInFailure !== null && pointsToSupport(signInFailure)
    : pointsToSupport(refreshError);
  const topPersonFromLinkMissing = unresolved.length > 0 && topPersonsFromLink;
  const linkWarnings = linkWarningsIn(language, topPersonFromLinkMissing, linkedPersonMissing);

  // Opening the link, or choosing filters, is the person's action, and these are its outcome; a change of language re-words them unsaid.
  useEffect(() => {
    // The team's bar shows this warning; it is said here with the link's, as one announcement would replace the other.
    const team = teamMissing ? [TEAM_BAR_STRINGS[languageRef.current].teamMissing] : [];
    const warnings = [...team, ...linkWarningsIn(languageRef.current, topPersonFromLinkMissing, linkedPersonMissing)];
    if (warnings.length > 0) announce(warnings.join(' '));
  }, [teamMissing, topPersonFromLinkMissing, linkedPersonMissing, announce, languageRef]);

  useEffect(() => {
    if (signInFailure !== null) announce(describeError(signInFailure, languageRef.current));
  }, [signInFailure, announce, languageRef]);

  const turnOnPresence = () => {
    setPresenceFailure(null);
    consentToPresence().catch((error: unknown) => {
      setPresenceFailure({ error });
      announce(describeError(error, languageRef.current));
    });
  };

  return (
    <>
      <span title={t.countTooltip}>{formatPeople(chart.peopleCount, language)}</span>
      {filterNote && <span>{filterNote}</span>}
      {isRefreshing && (
        <span className={styles.reading}>
          {progress && <ProgressBar progress={progress} className={styles.progressBar} />}
          {t.updating(progress && describeProgress(progress, language))}
        </span>
      )}
      {exportProgress !== null && (
        <span>{preparingExport}{exportProgress ? ` ${formatNumber(language, exportProgress)}` : ''}</span>
      )}
      {refreshFailure && (
        <span className={styles.warning}>
          {refreshFailure.message}{' '}
          <button
            type="button"
            className={styles.link}
            onClick={needsSignIn ? signIn : onRefresh}
            disabled={needsSignIn && busy}
          >
            {refreshFailure.action}
          </button>
          {needsSignIn && signInError && ` ${signInError}`}
          {refreshNeedsSupport && <SupportLink />}
        </span>
      )}
      {/* Text from a link isn't repeated: anyone can put words in a link. */}
      {unresolved.length > 0 && !topPersonsFromLink && (
        <span className={styles.warning}>
          {t.topPersonsMissing(formatList(language, unresolved, 'conjunction'))}
          <SupportLink />
        </span>
      )}
      {linkWarnings.map((warning) => (
        <span key={warning} className={styles.warning}>
          {warning}
        </span>
      ))}
      {presenceStatus === 'needsConsent' && (
        <span className={styles.warning} title={t.presencePermission}>
          {t.presenceNeedsConsent}{' '}
          <button type="button" className={styles.link} onClick={turnOnPresence}>
            {t.turnOn}
          </button>
          {presenceFailure && ` ${describeError(presenceFailure.error, language)}`}
          {presenceFailure && pointsToSupport(presenceFailure.error) && <SupportLink />}
        </span>
      )}
      {presenceStatus === 'denied' && (
        <span className={styles.warning} title={t.presencePermission}>
          {t.presenceDenied}
          <SupportLink />
        </span>
      )}
      {notice && (
        <span>
          {notice.text}
          {notice.support && <SupportLink />}
        </span>
      )}
      <span className={styles.updated}>{t.updated(formatDateTime(loadedAt))}</span>
    </>
  );
}

/** What is wrong with the link that opened the chart; its own words are never repeated, as anyone can write a link. */
function linkWarningsIn(language: Language, topPersonMissing: boolean, personMissing: boolean): string[] {
  const texts = STATUS_STRINGS[language];
  return [topPersonMissing ? texts.topPersonFromLinkMissing : null, personMissing ? texts.linkedPersonMissing : null].filter(
    (warning) => warning !== null,
  );
}
