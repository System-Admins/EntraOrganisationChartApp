import type { Employee } from '@/domain/employees/employee';
import type { EmployeeSharing, ShareResult } from '../../abstractions/employeeSharing';
import { Command, type RequestHandler } from '../../common/mediator';

export class ShareEmployeeCommand extends Command<ShareResult> {
  constructor(readonly employee: Employee) {
    super();
  }
}

export class ShareEmployeeHandler implements RequestHandler<ShareEmployeeCommand> {
  constructor(private readonly sharing: EmployeeSharing) {}

  handle({ employee }: ShareEmployeeCommand): Promise<ShareResult> {
    return this.sharing.share(employee);
  }
}
