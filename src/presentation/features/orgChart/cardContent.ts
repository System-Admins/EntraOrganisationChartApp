import { primaryPhone } from '@/domain/employees/employee';
import type { OrgChart, OrgNode, RootFlag } from '@/domain/orgChart/orgChart';

/** What a card shows. Lines that are empty in the directory are null and take no room. */
export interface CardContent {
  readonly flag: RootFlag | null;
  readonly name: string;
  readonly jobTitle: string | null;
  readonly department: string | null;
  readonly mail: string | null;
  readonly phone: string | null;
  readonly office: string | null;
  readonly level: number;
}

const OPTIONAL_LINES = ['jobTitle', 'department', 'mail', 'phone', 'office'] as const satisfies readonly (keyof CardContent)[];

/** Any text gives a line its height; a space that doesn't collapse is found by no search for a person's text. */
const FILLER = '\u00a0';

export function cardContentOf({ employee, flag, depth }: OrgNode): CardContent {
  return {
    flag,
    name: employee.displayName,
    jobTitle: employee.jobTitle,
    department: employee.department,
    mail: employee.mail,
    phone: primaryPhone(employee),
    office: employee.officeLocation,
    level: depth + 1,
  };
}

/** Every line that at least one person in the chart has. Stops early once all lines were found. */
export function fullestCardContent(chart: OrgChart): CardContent {
  const missing = new Set<(typeof OPTIONAL_LINES)[number]>(OPTIONAL_LINES);
  let flag: RootFlag | null = null;
  for (const node of chart.nodes.values()) {
    const content = cardContentOf(node);
    flag ??= content.flag;
    for (const line of missing) if (content[line] !== null) missing.delete(line);
    if (flag !== null && missing.size === 0) break;
  }
  const filler = (line: (typeof OPTIONAL_LINES)[number]) => (missing.has(line) ? null : FILLER);
  return {
    flag,
    name: FILLER,
    jobTitle: filler('jobTitle'),
    department: filler('department'),
    mail: filler('mail'),
    phone: filler('phone'),
    office: filler('office'),
    level: 1,
  };
}
