import { rulesShowing } from '@/domain/dataQuality/rulesShowing';
import type { HideRules } from '@/domain/orgChart/hideRules';
import { chartHideRules, namedEmployee, type OrgChartOptions } from '@/domain/orgChart/orgChart';
import { Query, type RequestHandler } from '../../common/mediator';
import type { OrgChartProvider } from '../../common/orgChartProvider';

/** The filters that show the person, as few of the chart's own switched off as it takes; null where no filters would show them. */
export class GetRulesShowingQuery extends Query<HideRules | null> {
  constructor(
    readonly options: OrgChartOptions,
    readonly employeeId: string,
  ) {
    super();
  }
}

export class GetRulesShowingHandler implements RequestHandler<GetRulesShowingQuery> {
  constructor(private readonly charts: OrgChartProvider) {}

  async handle({ options, employeeId }: GetRulesShowingQuery): Promise<HideRules | null> {
    const { chart, snapshot } = await this.charts.get(options);
    // The page's chart, which the provider keeps: someone it names needs no change, and no chart is built to find that out.
    if (namedEmployee(chart, employeeId)) return chartHideRules(options);
    return rulesShowing(snapshot.employees, options, employeeId);
  }
}
