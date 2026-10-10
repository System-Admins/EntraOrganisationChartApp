import { app, HostClientType, HostName, pages } from '@microsoft/teams-js';
import type { EmployeeSharing, ShareMethod, ShareResult } from '@/application/abstractions/employeeSharing';
import type { Employee } from '@/domain/employees/employee';
import { teamsPersonLink, webPersonLink } from '../share/personLinks';
import { shareMethod, shareOrCopy } from '../share/shareOrCopy';

/** pages.shareDeepLink does nothing on Teams mobile. */
const MOBILE_CLIENTS: readonly string[] = [HostClientType.android, HostClientType.ios, HostClientType.ipados];

/** Teams desktop and web show their own copy-link dialog; elsewhere the link is built here for the personal tab. */
export class TeamsEmployeeSharing implements EmployeeSharing {
  private constructor(
    private readonly appId: string | null,
    private readonly useShareDialog: boolean,
  ) {}

  /** `manifestId` stands in when the host reports no app ID. It only matches apps uploaded as custom apps. */
  static async create(manifestId: string | null): Promise<TeamsEmployeeSharing> {
    const { app: current } = await app.getContext();
    const inTeams = current.host.name === HostName.teams || current.host.name === HostName.teamsModern;
    const useShareDialog = inTeams && !MOBILE_CLIENTS.includes(current.host.clientType) && pages.isSupported();
    return new TeamsEmployeeSharing(current.appId?.toString() ?? manifestId, useShareDialog);
  }

  share(employee: Employee): Promise<ShareResult> {
    const webUrl = webPersonLink(employee, new URL(window.location.href));
    if (this.useShareDialog) {
      try {
        pages.shareDeepLink({ subPageId: employee.id, subPageLabel: employee.displayName, subPageWebUrl: webUrl });
        return Promise.resolve({ outcome: 'shared' });
      } catch (error) {
        console.warn('Teams could not show its share dialog; copying the link instead.', error);
      }
    }
    return shareOrCopy(this.appId ? teamsPersonLink(this.appId, employee, webUrl) : webUrl, employee.displayName);
  }

  method(): ShareMethod {
    return this.useShareDialog ? 'share' : shareMethod();
  }
}
