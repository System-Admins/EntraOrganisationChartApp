import type { OrgChartOptions } from '@/domain/orgChart/orgChart';
import type { DirectoryStatus, EmployeeDirectory } from '../../abstractions/employeeDirectory';
import { Query, type RequestHandler } from '../../common/mediator';
import type { OrgChartProvider } from '../../common/orgChartProvider';

/** Counts, dates and states only: people copy these details into messages to IT, which must not carry anyone's name. */
export interface Diagnostics {
  /** Everyone the directory holds, the people the filters leave out included. */
  readonly peopleInDirectory: number;
  readonly peopleInChart: number;
  /** When the directory was read, or last brought up to date. */
  readonly loadedAt: Date;
  /** The top persons named in config.json or the address that the chart found, and those it did not find or hides. */
  readonly topPersonsFound: number;
  readonly topPersonsMissing: number;
  readonly directory: DirectoryStatus;
}

/** What IT asks about first when the chart doesn't show what someone expects. */
export class GetDiagnosticsQuery extends Query<Diagnostics> {
  constructor(readonly options: OrgChartOptions) {
    super();
  }
}

export class GetDiagnosticsHandler implements RequestHandler<GetDiagnosticsQuery> {
  constructor(
    private readonly charts: OrgChartProvider,
    private readonly directory: EmployeeDirectory,
  ) {}

  async handle({ options }: GetDiagnosticsQuery): Promise<Diagnostics> {
    const { chart, snapshot } = await this.charts.get(options);
    return {
      peopleInDirectory: snapshot.employees.length,
      peopleInChart: chart.peopleCount,
      loadedAt: snapshot.loadedAt,
      topPersonsFound: chart.topPersonIds.length,
      topPersonsMissing: chart.unresolvedTopPersons.length,
      directory: this.directory.status(),
    };
  }
}
