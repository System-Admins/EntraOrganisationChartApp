import type { OrgChartOptions } from '@/domain/orgChart/orgChart';

/** Which chart a saved view belongs to: its top persons and those of the chart they narrow (?top=, a team shown alone). */
export function viewScope(options: OrgChartOptions): string {
  // Compared as resolveEmployees compares them; the hide rules stay out, as a view outlives their changes.
  const people = (topPersons: readonly string[]) => topPersons.map((person) => person.trim().toLowerCase());
  return JSON.stringify([people(options.topPersons), options.within ? people(options.within.topPersons) : null]);
}
