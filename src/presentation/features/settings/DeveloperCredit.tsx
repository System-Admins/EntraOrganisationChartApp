import { useId } from 'react';
import { Icon } from '../../shared/Icon';
import { useStrings } from '../../shared/languageContext';
import { SUPPORT_STRINGS } from '../../shared/strings';
import styles from './SettingsDialog.module.css';
import { CREDIT_STRINGS } from './strings';

/** The developer's site, which the credit links to. */
export const DEVELOPER_URL = 'https://www.systemadmins.com/';

/** The last line of the settings: who developed the chart, as a link that says it opens a new tab before it is pressed (WCAG 3.2.5). */
export function DeveloperCredit() {
  const t = useStrings(CREDIT_STRINGS);
  const support = useStrings(SUPPORT_STRINGS);
  const hintId = useId();
  return (
    <p className={styles.credit}>
      {t.developedBy}{' '}
      <a className={styles.creditLink} href={DEVELOPER_URL} target="_blank" rel="noopener noreferrer" aria-describedby={hintId}>
        {t.developer}
        <Icon name="external" size={14} />
      </a>{' '}
      <span id={hintId}>{support.newTab}</span>
    </p>
  );
}
