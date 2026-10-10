import { useId } from 'react';
import controls from '../../shared/DialogControls.module.css';
import { DialogSection } from '../../shared/DialogSection';
import { useStrings } from '../../shared/languageContext';
import { REPORTS_STRINGS } from './strings';

interface ReportsSettingsProps {
  /** Opens the directory health report; the owner closes Settings first, as a modal dialog can't open over another's focus. */
  readonly onShowDirectoryHealth: () => void;
}

/** Reports about the directory, each in a dialog of its own. */
export function ReportsSettings({ onShowDirectoryHealth }: ReportsSettingsProps) {
  const t = useStrings(REPORTS_STRINGS);
  const hintId = useId();
  return (
    <DialogSection title={t.title}>
      <div className={controls.actions}>
        <button type="button" className={controls.button} aria-haspopup="dialog" aria-describedby={hintId} onClick={onShowDirectoryHealth}>
          {t.directoryHealth}
        </button>
      </div>
      <p id={hintId} className={controls.hint}>
        {t.directoryHealthHint}
      </p>
    </DialogSection>
  );
}
