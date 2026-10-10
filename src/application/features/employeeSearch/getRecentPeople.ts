import { namedEmployee, type OrgChart, type OrgChartOptions } from '@/domain/orgChart/orgChart';
import type { RecentPeopleStore } from '../../abstractions/recentPeopleStore';
import type { SignedInUserSource } from '../../abstractions/signedInUser';
import { Query, type RequestHandler } from '../../common/mediator';
import type { OrgChartProvider } from '../../common/orgChartProvider';
import { searchHit, type EmployeeSearchHit } from './searchEmployees';

/** What Search offers before anything is typed. Everyone in it is named in the chart, and nobody twice. */
export interface RecentPeople {
  /** The signed-in user. */
  readonly you: EmployeeSearchHit | null;
  /** The manager the directory records for the signed-in user, also where the chart leaves the user out. */
  readonly yourManager: EmployeeSearchHit | null;
  /** The people opened lately, newest first, without the two above. */
  readonly recent: readonly EmployeeSearchHit[];
}

/** Asked with the chart's current options, so that everyone offered can be shown in it. */
export class GetRecentPeopleQuery extends Query<RecentPeople> {
  constructor(readonly options: OrgChartOptions) {
    super();
  }
}

export class GetRecentPeopleHandler implements RequestHandler<GetRecentPeopleQuery> {
  constructor(
    private readonly charts: OrgChartProvider,
    private readonly signedInUser: SignedInUserSource,
    private readonly store: RecentPeopleStore,
  ) {}

  async handle({ options }: GetRecentPeopleQuery): Promise<RecentPeople> {
    const { chart, snapshot } = await this.charts.get(options);
    const user = this.signedInUser.getSignedInUser();
    const managerId = user && snapshot.employees.find((employee) => employee.id === user.id)?.managerId;
    const you = user && hitIn(chart, user.id);
    const yourManager = managerId ? hitIn(chart, managerId) : null;
    const offered = new Set([you?.employee.id, yourManager?.employee.id]);
    // Someone a refresh or the filters took out of the chart, or outside the team shown alone, is left out until they are back.
    const recent = this.store
      .list()
      .filter((id) => !offered.has(id))
      .flatMap((id) => hitIn(chart, id) ?? []);
    return { you, yourManager, recent };
  }
}

function hitIn(chart: OrgChart, id: string): EmployeeSearchHit | null {
  return namedEmployee(chart, id) ? searchHit(chart, id) : null;
}
