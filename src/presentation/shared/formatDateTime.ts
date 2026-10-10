import { formatLocalDate, padTwo } from '@/application/common/formatLocalDate';

/** Local date and 24-hour time in the form 2026-09-29 17:58, regardless of the browser's locale. */
export function formatDateTime(date: Date): string {
  return `${formatLocalDate(date)} ${padTwo(date.getHours())}:${padTwo(date.getMinutes())}`;
}
