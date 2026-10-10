import { useMemo, useRef } from 'react';
import { GetEmployeePhotoQuery } from '@/application/features/photos/getEmployeePhoto';
import type { Employee } from '@/domain/employees/employee';
import { useDisplayOptions } from '../../shared/displayOptions';
import { useInView } from '../../shared/useInView';
import { usePhotosForPrint } from '../print/printContext';
import { useQuery } from '../../shared/useQuery';
import { presenceTone } from '../presence/describePresence';
import { usePresence } from '../presence/presenceContext';
import { PresenceDot } from '../presence/PresenceDot';
import styles from './Avatar.module.css';

/** The --initials-1 ... --initials-8 fills in global.css. */
const INITIALS_FILL_COUNT = 8;

interface AvatarProps {
  /** Anyone with a directory id: a person in the chart, or the signed-in user, whom the chart may leave out. */
  readonly employee: Pick<Employee, 'id' | 'displayName'>;
  readonly size: number;
  /** False where the dot would say nothing about the chart, as on the signed-in user's own photo. */
  readonly showPresence?: boolean;
}

/** The photo loads once the avatar nears the viewport or the chart is about to be printed. */
export function Avatar({ employee, size, showPresence = true }: AvatarProps) {
  const { showPhotos } = useDisplayOptions();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref);
  const photosForPrint = usePhotosForPrint();
  const wanted = inView || photosForPrint;
  const query = useMemo(
    () => (showPhotos && wanted ? new GetEmployeePhotoQuery(employee.id) : null),
    [showPhotos, wanted, employee.id],
  );
  const { data, isLoading } = useQuery(query);
  // useQuery keeps the previous response while the next loads, and that photo belongs to someone else.
  const photoUrl = isLoading ? undefined : data;
  // The tracker also answers for people it watches elsewhere, such as the same person's card.
  const tracked = usePresence(employee.id, inView && showPresence);
  const presence = showPresence ? tracked : undefined;

  return (
    <span
      ref={ref}
      className={styles.frame}
      style={{ width: size, height: size }}
      data-presence={presence ? (presenceTone(presence) ?? undefined) : undefined}
      aria-hidden="true"
    >
      <span className={styles.avatar} style={{ fontSize: size * 0.38, background: initialsFill(employee.displayName) }}>
        {photoUrl ? <img className={styles.photo} src={photoUrl} alt="" /> : initialsOf(employee.displayName)}
      </span>
      {/* 12px at least: a smaller dot has no room for its mark. */}
      {presence && <PresenceDot presence={presence} size={Math.max(12, Math.round(size * 0.3))} />}
    </span>
  );
}

function initialsOf(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** A name keeps its fill from visit to visit. */
function initialsFill(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return `var(--initials-${String((hash % INITIALS_FILL_COUNT) + 1)})`;
}
