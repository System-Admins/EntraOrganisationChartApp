import { useState } from 'react';
import type { Employee } from '@/domain/employees/employee';
import { Icon } from '../../shared/Icon';
import { useStrings } from '../../shared/languageContext';
import { useCopiedFeedback } from '../../shared/useCopiedFeedback';
import styles from './ShareAction.module.css';
import { SHARE_STRINGS } from './strings';
import { useShare } from './useShare';
import { useShareMethod } from './useShareMethod';

interface ShareActionProps {
  readonly employee: Employee;
  /** The look of the neighbouring action buttons. */
  readonly className?: string;
}

/** When the link can't be copied, a row with the link spans the grid. Key it by person to reset that row. */
export function ShareAction({ employee, className }: ShareActionProps) {
  const share = useShare();
  const method = useShareMethod();
  const t = useStrings(SHARE_STRINGS);
  const { copied, announced, afterCopy } = useCopiedFeedback();
  // The link that could not be copied, shown to copy by hand until a later press does better.
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const name = copied || !method ? undefined : t.names[method];

  const start = () => {
    share(employee).then(
      (next) => {
        setManualUrl(next.outcome === 'manual' ? next.url : null);
        afterCopy(next.outcome === 'copied');
      },
      (error: unknown) => {
        console.error(`Could not share a link to ${employee.displayName}.`, error);
      },
    );
  };

  return (
    <>
      <button type="button" className={className} aria-label={name} title={name} onClick={start}>
        <Icon name={copied ? 'check' : 'link'} />
        {copied ? t.copied : t.link}
      </button>
      <span className={styles.announcement} role="status">
        {announced ? t.announcement : ''}
      </span>
      {manualUrl !== null && (
        <label className={styles.manual}>
          {t.manual}
          <input
            className={styles.link}
            readOnly
            value={manualUrl}
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
