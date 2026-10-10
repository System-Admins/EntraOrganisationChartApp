import { Fragment, type ReactNode } from 'react';
import type { HostKind } from '@/application/settings/hostKind';
import { namedEmployee, ROOT_FLAGS, type OrgChart } from '@/domain/orgChart/orgChart';
import type { Presence } from '@/domain/presence/presence';
import { DialogSection } from '../../shared/DialogSection';
import { Icon } from '../../shared/Icon';
import { useLanguage, useStrings } from '../../shared/languageContext';
import { FLAG_LABELS, SHARED_STRINGS } from '../../shared/strings';
import { SupportLink } from '../../shared/SupportLink';
import { areaStyles } from '../orgChart/areaColors';
import { PAGE_SIZE } from '../orgChart/treeItems';
import { describePresence, presenceTone } from '../presence/describePresence';
import { PresenceDot } from '../presence/PresenceDot';
import { usePresenceStatus } from '../presence/presenceContext';
import { usePrint } from '../print/printContext';
import styles from './HelpDialog.module.css';
import { HELP_KEYS, HELP_STRINGS } from './strings';

const NOTHING_SET = { activity: null, outOfOffice: false, outOfOfficeMessage: null, statusMessage: null, workLocation: null } as const;

/** One status for each colour and mark the dots have; out of office colours the dot whatever the availability, which stays unknown. */
const STATUSES: readonly Presence[] = [
  { ...NOTHING_SET, availability: 'available' },
  { ...NOTHING_SET, availability: 'busy' },
  { ...NOTHING_SET, availability: 'doNotDisturb' },
  { ...NOTHING_SET, availability: 'away' },
  { ...NOTHING_SET, availability: 'offline' },
  { ...NOTHING_SET, availability: 'unknown', outOfOffice: true },
];

interface HelpTopicsProps {
  /** Where the chart runs, which decides what Back does: the browser's button, that of Teams on phones, or the other page's. */
  readonly host: HostKind;
  /** Without the search field, its key goes unlisted. */
  readonly searchable: boolean;
  /** The chart on screen, whose top persons the legend of colours names; missing until it has loaded. */
  readonly chart?: OrgChart;
}

/** What a press and the keys do, what the marks on the cards mean, and whom to ask: a section each. */
export function HelpTopics({ host, searchable, chart }: HelpTopicsProps) {
  const t = useStrings(HELP_STRINGS);
  const flagLabels = useStrings(FLAG_LABELS);
  const shared = useStrings(SHARED_STRINGS);
  const language = useLanguage();
  // In step with the toolbar's Print in browser: Teams' printer opens the chart in the browser instead.
  const { opensBrowser } = usePrint();
  // The dots only show where Teams status is on and allowed.
  const presence = usePresenceStatus();
  // None with a single top person, whose cards take the accent.
  const areas = areaStyles(chart?.topPersonIds ?? []);
  return (
    <>
      <DialogSection title={t.usingTitle}>
        <div className={styles.topics}>
          <Topic title={t.pointerTitle}>
            <p className={styles.topicText}>{t.pointer(PAGE_SIZE)}</p>
          </Topic>
          <Topic title={t.searchTitle}>
            <p className={styles.topicText}>{t.search}</p>
          </Topic>
          <Topic title={t.departmentsTitle}>
            <p className={styles.topicText}>{t.departments}</p>
          </Topic>
          {/* Another page's iframe leaves Back to that page. */}
          {host !== 'embedded' && host !== 'sharepoint' && (
            <Topic title={t.backTitle}>
              <p className={styles.topicText}>{t.back[host]}</p>
            </Topic>
          )}
          <Topic title={t.keysTitle}>
            <dl className={styles.keys}>
              {HELP_KEYS.filter((key) => searchable || key !== 'search').map((key) => (
                <Fragment key={key}>
                  <dt>{t.keys[key].keys}</dt>
                  <dd>{key === 'print' && opensBrowser ? t.printOpensBrowser : t.keys[key].does}</dd>
                </Fragment>
              ))}
            </dl>
          </Topic>
        </div>
      </DialogSection>
      <DialogSection title={t.marksTitle}>
        <div className={styles.topics}>
          {(presence === 'active' || presence === 'needsConsent') && (
            <Topic title={t.statusTitle}>
              <p className={styles.topicText}>{t.status}</p>
              <ul className={styles.marks}>
                {STATUSES.map((status) => (
                  <li key={presenceTone(status)} className={styles.mark}>
                    <span className={styles.statusDot}>
                      <PresenceDot presence={status} size={14} />
                    </span>
                    {describePresence(status, language)}
                  </li>
                ))}
              </ul>
            </Topic>
          )}
          {chart && areas.size > 0 && (
            <Topic title={t.areasTitle} className={styles.areas}>
              <p className={styles.topicText}>{t.areas}</p>
              <ul className={styles.marks}>
                {chart.topPersonIds.map((id) => (
                  <li key={id} className={styles.mark}>
                    <span className={styles.areaSample} style={areas.get(id)} aria-hidden="true" />
                    {namedEmployee(chart, id)?.displayName ?? shared.unlisted}
                  </li>
                ))}
              </ul>
            </Topic>
          )}
          <Topic title={t.warningsTitle}>
            <p className={styles.topicText}>{t.warnings}</p>
            <dl className={styles.keys}>
              {ROOT_FLAGS.map((flag) => (
                <Fragment key={flag}>
                  <dt className={styles.flag}>
                    <Icon name="warning" size={12} />
                    {flagLabels[flag]}
                  </dt>
                  <dd>{t.flags[flag]}</dd>
                </Fragment>
              ))}
            </dl>
          </Topic>
          {chart && holdsUnlisted(chart) && (
            <Topic title={t.unlistedTitle}>
              <p className={styles.topicText}>{t.unlisted}</p>
            </Topic>
          )}
        </div>
      </DialogSection>
      <DialogSection title={t.supportTitle}>
        <p className={styles.topicText}>
          {t.support}
          <SupportLink />
        </p>
      </DialogSection>
    </>
  );
}

interface TopicProps {
  readonly title: string;
  /** Hides the topic with its heading, as `.areas` does where the cards have no colours of their areas. */
  readonly className?: string;
  readonly children: ReactNode;
}

function Topic({ title, className, children }: TopicProps) {
  return (
    <div className={className}>
      <h4 className={styles.topicTitle}>{title}</h4>
      {children}
    </div>
  );
}

/** Whether the chart holds the place of anyone unlisted, whose card the legend then explains. */
function holdsUnlisted(chart: OrgChart): boolean {
  for (const node of chart.nodes.values()) if (node.unlisted) return true;
  return false;
}
