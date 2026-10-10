import { classNames } from '../../shared/classNames';
import type { DirectoryProgress } from './directoryProgress';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  readonly progress: DirectoryProgress;
  readonly className?: string;
}

/** Drawn only with a total to measure against. The words beside it say the same (describeProgress), so screen readers skip it. */
export function ProgressBar({ progress: { loaded, total }, className }: ProgressBarProps) {
  if (total === null || total <= 0) return null;
  return <progress className={classNames(styles.bar, className)} value={Math.min(loaded, total)} max={total} aria-hidden="true" />;
}
