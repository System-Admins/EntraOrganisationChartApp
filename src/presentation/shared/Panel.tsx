import type { ReactNode } from 'react';
import { classNames } from './classNames';
import { useStrings } from './languageContext';
import styles from './Panel.module.css';
import { SHARED_STRINGS } from './strings';

interface PanelProps {
  readonly title: string;
  /** 1 where the panel is all the page shows, so that the page still has a top-level heading. */
  readonly headingLevel?: 1 | 2;
  readonly tone?: 'neutral' | 'error';
  readonly busy?: boolean;
  /** What actually happened behind an error put in everyday words (errorDetail); shown small, below the rest. */
  readonly detail?: string | null;
  readonly children?: ReactNode;
}

/** Centered message used for loading, empty, error and sign-in states. */
export function Panel({ title, headingLevel = 2, tone = 'neutral', busy = false, detail, children }: PanelProps) {
  const { technicalDetails } = useStrings(SHARED_STRINGS);
  const Heading = `h${headingLevel}` as const;
  return (
    <section
      className={classNames(styles.panel, tone === 'error' && styles.error)}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-busy={busy}
    >
      {busy && <span className={styles.spinner} aria-hidden="true" />}
      <Heading className={styles.title}>{title}</Heading>
      {children}
      {/* Marked as English, which it stays whatever the page speaks, so that screen readers pronounce it as such. */}
      {detail && (
        <p className={styles.detail}>
          {technicalDetails} <span lang="en">{detail}</span>
        </p>
      )}
    </section>
  );
}
