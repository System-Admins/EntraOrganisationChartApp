import type { Presence } from '@/domain/presence/presence';
import { useLanguage } from '../../shared/languageContext';
import { describePresence, presenceTone } from './describePresence';
import styles from './PresenceDot.module.css';

type Tone = NonNullable<ReturnType<typeof presenceTone>>;

/** Teams tells these apart by colour alone; a mark means colour isn't the only cue (WCAG 1.4.1). */
const MARKS: Partial<Record<Tone, string>> = {
  available: 'M4.5 8.5 7 11l4.5-5.5',
  away: 'M8 4.5v4l2.5 1.5',
  outOfOffice: 'M11.5 8h-7M7.5 5l-3 3 3 3',
};

/** Decorative: the same status is in the card's accessible description and in the details panel as text. */
export function PresenceDot({ presence, size }: { presence: Presence; size: number }) {
  const language = useLanguage();
  const tone = presenceTone(presence);
  if (!tone) return null;
  const mark = MARKS[tone];
  return (
    <span
      className={`${styles.dot} ${styles[tone] ?? ''}`}
      style={{ width: size, height: size }}
      title={describePresence(presence, language)}
      aria-hidden="true"
    >
      {mark && (
        <svg className={styles.mark} viewBox="0 0 16 16" focusable="false">
          <path d={mark} />
        </svg>
      )}
    </span>
  );
}
