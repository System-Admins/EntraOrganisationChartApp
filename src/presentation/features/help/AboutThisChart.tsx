import { Fragment, useId, useState } from 'react';
import { formatNumber } from '@/application/common/intl';
import type { Diagnostics } from '@/application/features/diagnostics/getDiagnostics';
import type { HostKind } from '@/application/settings/hostKind';
import type { Language } from '@/application/settings/language';
import controls from '../../shared/DialogControls.module.css';
import { DialogSection } from '../../shared/DialogSection';
import { formatDateTime } from '../../shared/formatDateTime';
import { Icon } from '../../shared/Icon';
import { useLanguage, useStrings } from '../../shared/languageContext';
import { useCopiedFeedback } from '../../shared/useCopiedFeedback';
import { useCopyText } from '../../shared/useCopyText';
import { usePresenceStatus } from '../presence/presenceContext';
import type { PresenceStatus } from '../presence/presenceTracker';
import styles from './HelpDialog.module.css';
import { ABOUT_STRINGS } from './strings';

interface AboutThisChartProps {
  /** Missing until they are known, and while there is no chart to count. */
  readonly diagnostics?: Diagnostics;
  readonly host: HostKind;
  /** The build's: the pipeline's 1.0.<build ID>, or "dev". */
  readonly version: string;
}

type Detail = readonly [label: string, value: string];

/** For IT: how the chart runs and reads the directory, also as text to copy, which names no one. */
export function AboutThisChart({ diagnostics, host, version }: AboutThisChartProps) {
  const language = useLanguage();
  const t = useStrings(ABOUT_STRINGS);
  const presence = usePresenceStatus();
  const copyText = useCopyText();
  const hintId = useId();
  const { copied, announced, afterCopy } = useCopiedFeedback();
  // The details that could not be copied, shown to copy by hand until a copy succeeds.
  const [manualText, setManualText] = useState<string | null>(null);
  const details = detailsIn(language, version, host, presence, diagnostics);

  const copyDetails = () => {
    const text = [t.title, ...details.map(([label, value]) => `${label}: ${value}`)].join('\n');
    void copyText(text).then((done) => {
      setManualText(done ? null : text);
      afterCopy(done);
    });
  };

  return (
    <DialogSection title={t.title}>
      <dl className={styles.facts}>
        {details.map(([label, value]) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
      </dl>
      <div className={controls.actions}>
        <button type="button" className={controls.button} aria-describedby={hintId} onClick={copyDetails}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />
          {copied ? t.copied : t.copy}
        </button>
      </div>
      <p id={hintId} className={controls.hint}>
        {t.copyHint}
      </p>
      {/* Heard by screen readers, which don't announce the button's new label while it keeps the focus. */}
      <span className="visually-hidden" role="status">
        {announced ? t.announcement : ''}
      </span>
      {manualText !== null && (
        <label className={controls.copyByHand}>
          {t.manual}
          <textarea
            readOnly
            rows={manualText.split('\n').length}
            value={manualText}
            autoFocus
            onFocus={(event) => {
              event.currentTarget.select();
            }}
          />
        </label>
      )}
    </DialogSection>
  );
}

/** Those always known come first, so that the directory's, which arrive later, don't push them about. */
function detailsIn(
  language: Language,
  version: string,
  host: HostKind,
  presence: PresenceStatus | null,
  diagnostics: Diagnostics | undefined,
): Detail[] {
  const t = ABOUT_STRINGS[language];
  const details: Detail[] = [
    [t.version, version],
    [t.host, t.hosts[host]],
    [t.presence, t.presenceStates[presence ?? 'off']],
  ];
  if (!diagnostics) return details;
  const { directory, topPersonsFound, topPersonsMissing } = diagnostics;
  details.push(
    [t.peopleInDirectory, formatNumber(language, diagnostics.peopleInDirectory)],
    [t.peopleInChart, formatNumber(language, diagnostics.peopleInChart)],
    [t.updated, formatDateTime(diagnostics.loadedAt)],
    [t.readInFull, directory.fullReadAt ? formatDateTime(directory.fullReadAt) : t.notRecorded],
    [t.changeTracking, directory.tracksChanges ? t.on : t.off],
    [t.browserCopy, t.browserCopies[directory.browserCopy]],
  );
  if (topPersonsFound + topPersonsMissing > 0) {
    details.push([t.topPersons, t.topPersonsFound(topPersonsFound, topPersonsMissing)]);
  }
  return details;
}
