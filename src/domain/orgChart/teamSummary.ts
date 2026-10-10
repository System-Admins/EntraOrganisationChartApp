import { mostUsedSpellings, nameKey } from '../text/nameKey';
import { descendantIds, getNode, type OrgChart } from './orgChart';

/** A department or a city, by the spelling most of the team's people use, with how many of them it has. */
export interface TeamShare {
  readonly name: string;
  readonly count: number;
}

/** The values among a team's people, most people first; equal counts keep the outline's order. */
export interface TeamShares {
  /** The first TOP_SHARES, or one more where that names them all. */
  readonly top: readonly TeamShare[];
  /** The others, shown on request. */
  readonly rest: readonly TeamShare[];
}

export interface TeamSummary {
  /** Everyone the chart names below the person, at every level. */
  readonly size: number;
  /** How far down the team goes: 1 where everyone in it reports to the person directly, 0 for nobody. */
  readonly levels: number;
  /** The people in the team who have direct reports of their own. */
  readonly managers: number;
  /** People without a department, or without a city, count in neither. */
  readonly departments: TeamShares;
  readonly cities: TeamShares;
}

/** As many of each as the details' Team section lists before a line that counts the rest. */
export const TOP_SHARES = 3;

/** The details a team's people are counted by, which the Team section lists and each of its rows narrows the team to. */
export const TEAM_SHARE_FIELDS = ['department', 'city'] as const;

export type TeamShareField = (typeof TEAM_SHARE_FIELDS)[number];

/** One department or city of a team, by the name its row shows. */
export interface TeamShareFilter {
  readonly field: TeamShareField;
  readonly name: string;
}

/** Everyone below the person at a glance, the person left out, as the chart shows them: an unlisted person's place is nobody to count. */
export function summarizeTeam(chart: OrgChart, id: string): TeamSummary {
  const head = getNode(chart, id);
  const departments: (string | null)[] = [];
  const cities: (string | null)[] = [];
  let size = 0;
  let levels = 0;
  let managers = 0;
  for (const memberId of descendantIds(chart, id)) {
    const { employee, childIds, depth, unlisted } = getNode(chart, memberId);
    if (unlisted) continue;
    size++;
    levels = Math.max(levels, depth - head.depth);
    if (childIds.length > 0) managers++;
    departments.push(employee.department);
    cities.push(employee.city);
  }
  return { size, levels, managers, departments: sharesOf(departments), cities: sharesOf(cities) };
}

/** Everyone below the person in one department or city, however they spell it, in the outline's order: as many as its row counts. */
export function teamMembersIn(chart: OrgChart, id: string, { field, name }: TeamShareFilter): string[] {
  const key = nameKey(name);
  if (key === '') return [];
  return descendantIds(chart, id).filter((memberId) => nameKey(getNode(chart, memberId).employee[field]) === key);
}

/** Values count under their name key (nameKey), as the department tree and the directory health report compare them, and an empty one counts in none. */
function sharesOf(values: readonly (string | null)[]): TeamShares {
  const names = mostUsedSpellings(values);
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = nameKey(value);
    if (key !== '') counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  // The sort is stable, so equal counts stay in the order the walk down the team met them.
  const sorted = Array.from(counts, ([key, count]) => ({ name: names.get(key) ?? key, count })).sort((a, b) => b.count - a.count);
  // A last one is named rather than counted as "1 more", which takes as much room.
  const named = sorted.length === TOP_SHARES + 1 ? sorted.length : TOP_SHARES;
  return { top: sorted.slice(0, named), rest: sorted.slice(named) };
}
