import { useId } from 'react';
import { classNames } from '../../shared/classNames';
import { Icon, type IconName } from '../../shared/Icon';
import styles from './OrgChartPage.module.css';

interface ModeBarProps {
  readonly icon: IconName;
  /** What the chart shows, which also names the bar. */
  readonly text: string;
  /** The filled button's words: the way back. */
  readonly action: string;
  readonly onAction: () => void;
  /** Where what the bar is about has gone missing. */
  readonly warning?: boolean;
}

/** Over a chart that shows less than everyone's people, where nobody misses it: what it shows, and the way back. Place it in OrgChartPage's .bars. */
export function ModeBar({ icon, text, action, onAction, warning = false }: ModeBarProps) {
  const textId = useId();
  // A region named by what it says, so that it is in a landmark, as everything else on the page is, and screen readers list it.
  return (
    <section className={classNames(styles.bar, warning && styles.barWarning)} aria-labelledby={textId}>
      <Icon name={icon} />
      <p id={textId} className={styles.barText}>
        {text}
      </p>
      <button type="button" className={styles.barButton} onClick={onAction}>
        {action}
      </button>
    </section>
  );
}
