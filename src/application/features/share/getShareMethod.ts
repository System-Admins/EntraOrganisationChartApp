import type { EmployeeSharing, ShareMethod } from '../../abstractions/employeeSharing';
import { Query, type RequestHandler } from '../../common/mediator';

export class GetShareMethodQuery extends Query<ShareMethod> {}

export class GetShareMethodHandler implements RequestHandler<GetShareMethodQuery> {
  constructor(private readonly sharing: EmployeeSharing) {}

  handle(): Promise<ShareMethod> {
    return Promise.resolve(this.sharing.method());
  }
}
