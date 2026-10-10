/** The local calendar date as 2026-09-29, regardless of the browser's locale. */
export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
}

export function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}
