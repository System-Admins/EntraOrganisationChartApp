import type { Employee } from '@/domain/employees/employee';
import { ATTRIBUTE_RULES, hiddenBecause, isUnlisted } from '@/domain/orgChart/hideRules';
import { chartHideRules, type OrgChartOptions } from '@/domain/orgChart/orgChart';
import { Query, type RequestHandler } from '../../common/mediator';
import type { OrgChartProvider } from '../../common/orgChartProvider';

/** An attribute rule that hides the manager, the address list's, no user with the recorded id, or a manager outside the chart that ?top= narrows. */
export const RECORDED_MANAGER_REASONS = [...ATTRIBUTE_RULES, 'hiddenFromAddressList', 'notInDirectory', 'notInChart'] as const;

export type RecordedManagerReason = (typeof RECORDED_MANAGER_REASONS)[number];

export interface RecordedManager {
  /** Null where no user has the recorded id (deleted, or not a user, such as a contact), and where the address list's rule keeps the manager unnamed. */
  readonly manager: Employee | null;
  readonly reason: RecordedManagerReason;
}

/** Explains "Manager not shown": null where the person has no recorded manager or the chart shows that manager. */
export class GetRecordedManagerQuery extends Query<RecordedManager | null> {
  constructor(
    readonly options: OrgChartOptions,
    readonly employeeId: string,
  ) {
    super();
  }
}

export class GetRecordedManagerHandler implements RequestHandler<GetRecordedManagerQuery> {
  constructor(private readonly charts: OrgChartProvider) {}

  async handle({ options, employeeId }: GetRecordedManagerQuery): Promise<RecordedManager | null> {
    const { chart, snapshot } = await this.charts.get(options);
    const managerId = chart.nodes.get(employeeId)?.employee.managerId ?? null;
    if (managerId === null || chart.nodes.has(managerId)) return null;
    const manager = snapshot.employees.find((employee) => employee.id === managerId);
    if (!manager) return { manager: null, reason: 'notInDirectory' };
    const rules = chartHideRules(options);
    // Whatever else hides them, the rule that keeps them unnamed is the one to give.
    if (isUnlisted(manager, rules)) return { manager: null, reason: 'hiddenFromAddressList' };
    return { manager, reason: hiddenBecause(manager, rules) ?? 'notInChart' };
  }
}
