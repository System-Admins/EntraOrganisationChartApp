import type { Employee } from '@/domain/employees/employee';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import { HIDE_CATEGORIES, type HideCategory } from '@/domain/orgChart/hideRules';
import { chartHideRules, namedEmployee, withHideRules, type OrgChart, type OrgChartOptions } from '@/domain/orgChart/orgChart';
import type { DirectorySnapshot } from '../../abstractions/employeeDirectory';
import { Query, type RequestHandler } from '../../common/mediator';
import type { OrgChartProvider } from '../../common/orgChartProvider';

/** Per hide rule, how many people it leaves out of the chart, or unnamed in it, while it is on, the other rules staying as they are. */
export type FilterEffects = Readonly<Partial<Record<HideCategory, number>>>;

/** What each filter in Settings does to the chart. Without top persons `unattached` does nothing, so it is left out. */
export class GetFilterEffectsQuery extends Query<FilterEffects> {
  constructor(readonly options: OrgChartOptions) {
    super();
  }
}

export class GetFilterEffectsHandler implements RequestHandler<GetFilterEffectsQuery> {
  /** A chart build per rule takes a moment in a large directory, and Settings asks again every time it opens. */
  private readonly counted = new WeakMap<DirectorySnapshot, Map<string, Promise<FilterEffects>>>();

  constructor(private readonly charts: OrgChartProvider) {}

  async handle({ options }: GetFilterEffectsQuery): Promise<FilterEffects> {
    const { chart, snapshot } = await this.charts.get(options);
    const forSnapshot = this.counted.get(snapshot) ?? new Map<string, Promise<FilterEffects>>();
    this.counted.set(snapshot, forSnapshot);
    const key = JSON.stringify(options);
    let effects = forSnapshot.get(key);
    if (!effects) {
      effects = countEffects(snapshot.employees, options, chart);
      forSnapshot.set(key, effects);
    }
    return effects;
  }
}

/** Builds the chart once per rule, with only that rule switched; not through OrgChartProvider, which keeps only the page's chart. */
async function countEffects(employees: readonly Employee[], options: OrgChartOptions, chart: OrgChart): Promise<FilterEffects> {
  const rules = chartHideRules(options);
  const hasTopPersons = (options.within ?? options).topPersons.length > 0;
  const effects: Partial<Record<HideCategory, number>> = {};
  for (const category of HIDE_CATEGORIES) {
    if (category === 'unattached' && !hasTopPersons) continue;
    await nextTask();
    const switched = buildOrgChart(employees, withHideRules(options, { ...rules, [category]: !rules[category] }));
    const [ruleOff, ruleOn] = rules[category] ? [switched, chart] : [chart, switched];
    effects[category] = peopleLeftOut(ruleOff, ruleOn);
  }
  return effects;
}

/** Person by person, not by size: a rule that hides one member of a circular manager chain can bring the others in. A place that names nobody shows no one. */
function peopleLeftOut(from: OrgChart, by: OrgChart): number {
  let count = 0;
  for (const [id, node] of from.nodes) if (!node.unlisted && namedEmployee(by, id) === undefined) count++;
  return count;
}

/** Lets the page answer a click or a key between builds. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
