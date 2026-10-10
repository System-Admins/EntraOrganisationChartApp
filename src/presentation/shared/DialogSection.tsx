import { useId, type ReactNode } from 'react';
import styles from './DialogSection.module.css';

interface DialogSectionProps {
  readonly title: string;
  readonly children: ReactNode;
}

/** A group of a dialog, Settings' or Help's: a region named by its heading, which screen readers can list and jump to. */
export function DialogSection({ title, children }: DialogSectionProps) {
  const titleId = useId();
  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.sectionTitle}>
        {title}
      </h3>
      {children}
    </section>
  );
}
