import type { EmployeeSharing, ShareMethod, ShareResult } from '@/application/abstractions/employeeSharing';
import type { Employee } from '@/domain/employees/employee';
import { webPersonLink } from './personLinks';
import { shareMethod, shareOrCopy } from './shareOrCopy';

/** Embedded pages (SharePoint and others) share the app's own address: their host page's is out of reach. */
export class BrowserEmployeeSharing implements EmployeeSharing {
  share(employee: Employee): Promise<ShareResult> {
    return shareOrCopy(webPersonLink(employee, new URL(window.location.href)), employee.displayName);
  }

  method(): ShareMethod {
    return shareMethod();
  }
}
