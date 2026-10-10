import type { OrgChart, OrgChartOptions } from '@/domain/orgChart/orgChart';
import type { ProgressListener } from '../../abstractions/employeeDirectory';
import { Query, type RequestHandler } from '../../common/mediator';
import type { OrgChartProvider } from '../../common/orgChartProvider';

export interface OrgChartResult {
  readonly chart: OrgChart;
  readonly loadedAt: Date;
  /** Older than the refresh age: show it, then send RefreshDirectoryCommand. */
  readonly isStale: boolean;
}

export class GetOrgChartQuery extends Query<OrgChartResult> {
  constructor(
    readonly options: OrgChartOptions,
    readonly onProgress?: ProgressListener,
  ) {
    super();
  }
}

export class GetOrgChartHandler implements RequestHandler<GetOrgChartQuery> {
  constructor(
    private readonly charts: OrgChartProvider,
    private readonly refreshAfterMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async handle({ options, onProgress }: GetOrgChartQuery): Promise<OrgChartResult> {
    const { chart, snapshot } = await this.charts.get(options, onProgress);
    const age = this.now() - snapshot.loadedAt.getTime();
    // A negative age means one of the clocks was wrong; waiting for it to pass could take years.
    return { chart, loadedAt: snapshot.loadedAt, isStale: age > this.refreshAfterMs || age < 0 };
  }
}
