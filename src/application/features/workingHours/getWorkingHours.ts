import type { Employee } from '@/domain/employees/employee';
import type { WorkingHoursSource, WorkSchedule } from '../../abstractions/workingHoursSource';
import { Query, type RequestHandler } from '../../common/mediator';

/** Rejects with CalendarConsentRequiredError until someone consents to reading calendars. */
export class GetWorkingHoursQuery extends Query<WorkSchedule | null> {
  constructor(readonly employee: Employee) {
    super();
  }
}

export class GetWorkingHoursHandler implements RequestHandler<GetWorkingHoursQuery> {
  constructor(private readonly source: WorkingHoursSource) {}

  handle({ employee }: GetWorkingHoursQuery): Promise<WorkSchedule | null> {
    return this.source.getWorkingHours(employee);
  }
}
