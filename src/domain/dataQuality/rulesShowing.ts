import type { Employee } from '../employees/employee';
import { buildOrgChart } from '../orgChart/buildOrgChart';
import { HIDE_CATEGORIES, tidyingOff, type HideRules } from '../orgChart/hideRules';
import { chartHideRules, namedEmployee, withHideRules, type OrgChartOptions } from '../orgChart/orgChart';

/** The chart's rules with as few of them off as it takes to show the person by name; null where no rules would, as outside the teams ?top= narrows it to, or where the address list's keeps them unnamed. */
export function rulesShowing(directory: readonly Employee[], options: OrgChartOptions, id: string): HideRules | null {
  const rules = chartHideRules(options);
  const shows = (hide: HideRules) => namedEmployee(buildOrgChart(directory, withHideRules(options, hide)), id) !== undefined;
  const loosest = tidyingOff(rules);
  if (!shows(loosest)) return null;
  // Back on one at a time where the person stays shown, the account rules first: a disabled manager's report shows flagged, not with every disabled account.
  return HIDE_CATEGORIES.toReversed().reduce<HideRules>((shown, rule) => {
    if (!rules[rule]) return shown;
    const tighter = { ...shown, [rule]: true };
    return shows(tighter) ? tighter : shown;
  }, loosest);
}
