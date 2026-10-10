import { describe, expect, it } from 'vitest';
import type { DirectorySnapshot, DirectoryStatus, EmployeeDirectory } from '@/application/abstractions/employeeDirectory';
import type { OrgChartOptions } from '@/domain/orgChart/orgChart';
import { directoryOf } from '@/testing/directory';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import type { RequestHandler } from '../../common/mediator';
import { OrgChartProvider } from '../../common/orgChartProvider';
import { GetDiagnosticsHandler, GetDiagnosticsQuery } from './getDiagnostics';

const SNAPSHOT: DirectorySnapshot = {
  employees: [
    makeEmployee('ceo', null, { displayName: 'Ingrid Solberg' }),
    makeEmployee('lead', 'ceo', { displayName: 'Erik Lund' }),
    makeEmployee('guest', 'ceo', { displayName: 'Guest Consultant', isGuest: true }),
    makeEmployee('departed', null, { displayName: 'Former Director', accountEnabled: false }),
  ],
  loadedAt: new Date(2026, 9, 1, 9, 12),
};

const STATUS: DirectoryStatus = { fullReadAt: new Date(2026, 8, 30, 14, 3), tracksChanges: true, browserCopy: 'kept' };

function handlerFor(status: DirectoryStatus = STATUS): RequestHandler<GetDiagnosticsQuery> {
  const directory = directoryOf(() => SNAPSHOT, status);
  return new GetDiagnosticsHandler(new OrgChartProvider(directory), directory);
}

/** A chart from its CEO, with an address in it that no one in the directory has. */
const OPTIONS: OrgChartOptions = {
  topPersons: ['ceo', 'nobody@contoso.com'],
  hide: { ...SHOW_EVERYONE, guests: true, disabledAccounts: true },
};

describe('GetDiagnosticsHandler', () => {
  it('counts the directory, the chart under its options and the top persons, and says how the directory was read and is kept', async () => {
    const diagnostics = await handlerFor().handle(new GetDiagnosticsQuery(OPTIONS));

    expect(diagnostics).toEqual({
      peopleInDirectory: 4,
      peopleInChart: 2,
      loadedAt: SNAPSHOT.loadedAt,
      topPersonsFound: 1,
      topPersonsMissing: 1,
      directory: STATUS,
    });
  });

  it('asks the directory how it is kept every time, as a copy the browser refused fails after the chart has shown', async () => {
    let status = STATUS;
    const directory: EmployeeDirectory = { ...directoryOf(() => SNAPSHOT), status: () => status };
    const handler = new GetDiagnosticsHandler(new OrgChartProvider(directory), directory);
    await handler.handle(new GetDiagnosticsQuery(OPTIONS));

    status = { ...STATUS, browserCopy: 'failed' };

    expect((await handler.handle(new GetDiagnosticsQuery(OPTIONS))).directory.browserCopy).toBe('failed');
  });

  it('holds no name, address or other text from the directory or the address, only counts, dates and states', async () => {
    const diagnostics = await handlerFor().handle(new GetDiagnosticsQuery(OPTIONS));
    const text = JSON.stringify(diagnostics);

    for (const employee of SNAPSHOT.employees) {
      expect(text).not.toContain(employee.displayName);
      expect(text).not.toContain(employee.userPrincipalName);
    }
    expect(text).not.toContain('nobody');
  });
});
