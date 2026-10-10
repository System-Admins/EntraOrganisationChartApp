import type { EmployeeSearchHit } from '@/application/features/employeeSearch/searchEmployees';
import type { SEARCH_STRINGS } from './strings';

/** The words a hit's details take, from the search's strings. */
type HitWords = Pick<(typeof SEARCH_STRINGS)['en'], 'reportsTo' | 'extraDetail'>;

/** What the search matched comes first, then the e-mail address and the manager; the suggestions and the results view share it. */
export function hitDetails(
  { employee, matchedFields, matchedExtraFields, managerName }: EmployeeSearchHit,
  { reportsTo, extraDetail }: HitWords,
  /** Before everything else, such as who the person is to the signed-in user. */
  lead: string | null = null,
): string {
  const details = [
    lead,
    ...matchedFields.map((field) => employee[field]),
    ...matchedExtraFields.map(({ property, label }) => extraDetail(label, employee.extra[property] ?? '')),
    employee.mail,
    managerName && reportsTo(managerName),
  ];
  return [...new Set(details)].filter(Boolean).join(' · ');
}
