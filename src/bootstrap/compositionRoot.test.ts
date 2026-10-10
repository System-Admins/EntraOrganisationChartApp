// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInRequiredError } from '@/application/abstractions/authenticator';
import type { SignedInUser } from '@/application/abstractions/signedInUser';
import { CalendarConsentRequiredError } from '@/application/abstractions/workingHoursSource';
import { formatLocalDate } from '@/application/common/formatLocalDate';
import { Query } from '@/application/common/mediator';
import { ForgetBrowserCopyCommand } from '@/application/features/authentication/forgetBrowserCopy';
import { GetReturnedSignInErrorQuery } from '@/application/features/authentication/getReturnedSignInError';
import { GetSignedInUserQuery } from '@/application/features/authentication/getSignedInUser';
import { SignOutCommand } from '@/application/features/authentication/signOut';
import { GetSavedViewQuery } from '@/application/features/chartView/getSavedView';
import { SaveViewCommand } from '@/application/features/chartView/saveView';
import { CopyTextCommand } from '@/application/features/clipboard/copyText';
import { ClearRecentPeopleCommand } from '@/application/features/employeeSearch/clearRecentPeople';
import { GetRecentPeopleQuery } from '@/application/features/employeeSearch/getRecentPeople';
import { RememberPersonCommand } from '@/application/features/employeeSearch/rememberPerson';
import { SearchEmployeesQuery } from '@/application/features/employeeSearch/searchEmployees';
import { TrackOpenLayersCommand } from '@/application/features/navigation/trackOpenLayers';
import { GetTeamContactQuery } from '@/application/features/contact/getTeamContact';
import { CheckPhotosCommand } from '@/application/features/dataQuality/checkPhotos';
import { ExportIssuesCommand } from '@/application/features/dataQuality/exportIssues';
import { GetDirectoryHealthQuery } from '@/application/features/dataQuality/getDirectoryHealth';
import { GetRulesShowingQuery } from '@/application/features/dataQuality/getRulesShowing';
import { GetDiagnosticsQuery } from '@/application/features/diagnostics/getDiagnostics';
import { GetFilterEffectsQuery } from '@/application/features/orgChart/getFilterEffects';
import { GetOrgChartQuery } from '@/application/features/orgChart/getOrgChart';
import { GetRecordedManagerQuery } from '@/application/features/orgChart/getRecordedManager';
import { GetEmployeePhotoQuery } from '@/application/features/photos/getEmployeePhoto';
import { SaveUserSettingsCommand } from '@/application/features/settings/saveUserSettings';
import { GetEmbedAddressQuery } from '@/application/features/share/getEmbedAddress';
import { ConsentToCalendarCommand } from '@/application/features/workingHours/consentToCalendar';
import { GetWorkingHoursQuery } from '@/application/features/workingHours/getWorkingHours';
import type { Issue } from '@/domain/dataQuality/directoryIssues';
import { departmentPath, departmentTree, getDepartment } from '@/domain/orgChart/departmentTree';
import { getNode, type OrgNode } from '@/domain/orgChart/orgChart';
import type { GraphAuthenticator } from '@/infrastructure/auth/graphAuthenticator';
import { createMsalAuthenticator } from '@/infrastructure/auth/msalAuthenticator';
import { parseAppConfig } from '@/infrastructure/config/appConfig';
import { readStoredUserSettings } from '@/infrastructure/config/storageUserSettingsStore';
import { DEMO_SIGNED_IN_USER } from '@/infrastructure/demo/demoEmployeeSource';
import { IndexedDbPhotoStore } from '@/infrastructure/directory/photoStore';
import { plainHost } from '@/infrastructure/host/hostEnvironment';
import { PAGE_SIZE } from '@/presentation/features/orgChart/treeItems';
import { installFakeIndexedDb } from '@/testing/fakeIndexedDb';
import { makeEmployee } from '@/testing/makeEmployee';
import { createMediator } from './compositionRoot';

// Graph data signs in through MSAL, which a test gives the account it needs.
vi.mock('@/infrastructure/auth/msalAuthenticator', () => ({ createMsalAuthenticator: vi.fn() }));

const HOST = plainHost('standalone', ['en-US']);
const demo = () => createMediator(parseAppConfig({ dataSource: 'demo' }, ''), HOST);

/** MSAL signed in as `user`, with a token for every request. */
const signedInAs = (user: SignedInUser): GraphAuthenticator => ({
  signIn: () => Promise.resolve(),
  returnedSignInError: null,
  consentToPresence: () => Promise.resolve(),
  consentToCalendar: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  forgetSignIn: () => Promise.resolve(),
  getSignedInUser: () => user,
  getAccessToken: () => Promise.resolve('token'),
  getPresenceToken: () => Promise.resolve('token'),
  getCalendarToken: () => Promise.resolve('token'),
});

class UnknownQuery extends Query<void> {}

/** Graph data from a tenant, whose copies the browser keeps unless config.json says otherwise. */
const GRAPH = { auth: { tenantId: '11111111-2222-3333-4444-555555555555', clientId: '66666666-7777-8888-9999-000000000000' } };
const GRAPH_SCOPE = `${GRAPH.auth.tenantId}/${GRAPH.auth.clientId}`;
const PHOTO = 'data:image/jpeg;base64,QUJD';

/** Graph, answering each photo a $batch asks for with the same small picture. */
function graphWithPhotos() {
  const fetchFn = vi.fn((_url: string, init?: RequestInit) => {
    const { requests } = JSON.parse(typeof init?.body === 'string' ? init.body : '') as { requests: { id: string }[] };
    const responses = requests.map(({ id }) => ({ id, status: 200, headers: { 'content-type': 'image/jpeg' }, body: 'QUJD' }));
    return Promise.resolve(new Response(JSON.stringify({ responses }), { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchFn);
  return fetchFn;
}

/** What each mediator's stores listen to on the window, the history and the other tabs' storage, which the page never stops. */
const listening: (readonly [string, EventListenerOrEventListenerObject])[] = [];

beforeEach(() => {
  const listen = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    listening.push([type, listener]);
    listen(type, listener, options);
  });
});

afterEach(() => {
  for (const [type, listener] of listening.splice(0)) window.removeEventListener(type, listener);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // A push drops the entry that a step back left ahead (Forward), and starts the next test at the plain address.
  window.history.pushState(null, '', '/');
  localStorage.clear();
});

describe('createMediator', () => {
  it('writes what actually failed to the console, because the UI only explains it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mediator = await demo();

    await expect(mediator.send(new UnknownQuery())).rejects.toThrow('No handler registered');

    expect(warn).toHaveBeenCalledExactlyOnceWith('A request failed.', expect.any(Error));
  });

  it('tells a guest whom the directory refuses that guests are kept out, not that a consent is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const guest = { id: 'gail', displayName: 'Gail', userPrincipalName: 'gail_fabrikam.com#EXT#@contoso.com', isGuest: true };
    vi.mocked(createMsalAuthenticator).mockResolvedValue(signedInAs(guest));
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 403 }))));
    const config = parseAppConfig(
      {
        auth: { tenantId: '11111111-2222-3333-4444-555555555555', clientId: '66666666-7777-8888-9999-000000000000' },
        directory: { cacheInBrowser: false },
      },
      '',
    );
    const mediator = await createMediator(config, HOST);

    await expect(mediator.send(new GetOrgChartQuery(config.settings.chart.options))).rejects.toMatchObject({ failure: 'guestDenied' });
  });

  it("reads Microsoft Graph as the SharePoint web part's user, with its token, and never starts MSAL", async () => {
    vi.mocked(createMsalAuthenticator).mockClear();
    const fetchFn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response('{"value":[]}', { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchFn);
    const user = { id: 'anna', displayName: 'Anna', userPrincipalName: 'anna@contoso.com', isGuest: false };
    const webPart = plainHost('sharepoint', ['en-US'], { user, graphToken: () => Promise.resolve('web-part-token') });
    const mediator = await createMediator(parseAppConfig({ ...GRAPH, directory: { cacheInBrowser: false } }, ''), webPart);

    await expect(mediator.send(new GetSignedInUserQuery())).resolves.toEqual(user);
    await expect(mediator.send(new GetWorkingHoursQuery(makeEmployee('anna')))).resolves.toBeNull();
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer web-part-token' });
    expect(createMsalAuthenticator).not.toHaveBeenCalled();
  });

  it('has no sign-in failure to show with demo data', async () => {
    const mediator = await demo();

    await expect(mediator.send(new GetReturnedSignInErrorQuery())).resolves.toBeNull();
  });

  it('signs in with demo data as a team lead in the chart, with a manager above and a team below', async () => {
    const config = parseAppConfig({ dataSource: 'demo' }, '');
    const mediator = await createMediator(config, HOST);

    const user = await mediator.send(new GetSignedInUserQuery());
    const { chart } = await mediator.send(new GetOrgChartQuery(config.settings.chart.options));
    const node = user && chart.nodes.get(user.id);

    expect(user).toMatchObject({ displayName: 'Åse Vik', userPrincipalName: 'ase.vik@contoso.com' });
    expect(node?.employee).toMatchObject({ displayName: 'Åse Vik', jobTitle: 'Team Lead', userPrincipalName: 'ase.vik@contoso.com' });
    expect(node?.parentId && chart.nodes.get(node.parentId)?.employee.jobTitle).toMatch(/^Director of /);
    expect(node?.childIds.length).toBeGreaterThan(1);
  });

  it('says with demo data that the directory was read in full, is kept nowhere and tracks no changes', async () => {
    const config = parseAppConfig({ dataSource: 'demo' }, '');
    const mediator = await createMediator(config, HOST);
    const { options } = config.settings.chart;

    const { chart, loadedAt } = await mediator.send(new GetOrgChartQuery(options));
    const diagnostics = await mediator.send(new GetDiagnosticsQuery(options));

    expect(diagnostics).toMatchObject({
      peopleInChart: chart.peopleCount,
      loadedAt,
      directory: { fullReadAt: loadedAt, tracksChanges: false, browserCopy: 'off' },
    });
    expect(diagnostics.peopleInDirectory).toBeGreaterThan(chart.nodes.size);
  });

  it('explains with demo data why a manager is not shown: a disabled director, and one no longer in the directory', async () => {
    const config = parseAppConfig({ dataSource: 'demo', chart: { hide: { withHiddenManager: false } } }, '');
    const mediator = await createMediator(config, HOST);
    const { options } = config.settings.chart;

    const { chart } = await mediator.send(new GetOrgChartQuery(options));
    const flagged = [...chart.nodes.values()].filter((node) => node.flag === 'managerNotShown');
    const recorded = await Promise.all(flagged.map((node) => mediator.send(new GetRecordedManagerQuery(options, node.employee.id))));

    expect(recorded.map((answer) => `${answer?.manager?.jobTitle ?? 'nobody'}: ${String(answer?.reason)}`).sort()).toEqual([
      'Former Director: disabledAccounts',
      'Former Director: disabledAccounts',
      'nobody: notInDirectory',
    ]);
  });

  it('counts with demo data what each filter does: the disabled director\'s team, the guest, the circular chain, the address list', async () => {
    const config = parseAppConfig({ dataSource: 'demo' }, '');
    const mediator = await createMediator(config, HOST);

    const effects = await mediator.send(new GetFilterEffectsQuery(config.settings.chart.options));

    // Without top persons, everyone's teams are shown, so there is no rule about who is outside them.
    expect(effects).toEqual({
      // The Chair of the Board and the seasonal workers, who have no team either.
      withoutManager: 56,
      withHiddenManager: 3,
      inManagerCycle: 3,
      disabledAccounts: 3,
      guests: 1,
      unlicensed: 1,
      withoutJobTitle: 1,
      // The Head of Internal Audit, whose place stays over the team, and the Executive Advisor.
      hiddenFromAddressList: 2,
    });
  });

  it('keeps with demo data the place of a head hidden from the address list over their team, nameless, and leaves out an advisor hidden too', async () => {
    const config = parseAppConfig({ dataSource: 'demo' }, '');
    const mediator = await createMediator(config, HOST);
    const { options } = config.settings.chart;
    const titlesIn = (nodes: Iterable<OrgNode>) => Array.from(nodes, (node) => node.employee.jobTitle);

    const { chart } = await mediator.send(new GetOrgChartQuery(options));
    const places = [...chart.nodes.values()].filter((node) => node.unlisted);
    const { hits } = await mediator.send(new SearchEmployeesQuery(options, 'internal audit'));

    expect(places.map((node) => node.employee.displayName)).toEqual(['']);
    expect(places.flatMap((node) => titlesIn(node.childIds.map((id) => getNode(chart, id))))).toEqual(['Internal Auditor', 'Internal Auditor']);
    expect(titlesIn(chart.nodes.values())).not.toContain('Head of Internal Audit');
    expect(titlesIn(chart.nodes.values())).not.toContain('Executive Advisor');
    expect(hits.map(({ employee, managerName }) => [employee.jobTitle, managerName])).toEqual([
      ['Internal Auditor', null],
      ['Internal Auditor', null],
    ]);

    const everyone = await mediator.send(new GetOrgChartQuery({ ...options, hide: { ...options.hide, hiddenFromAddressList: false } }));
    expect(titlesIn(everyone.chart.nodes.values())).toEqual(expect.arrayContaining(['Head of Internal Audit', 'Executive Advisor']));
  });

  it('has with demo data a team and a group of flagged people longer than a page of the chart, to see the pages in', async () => {
    const config = parseAppConfig(
      { dataSource: 'demo', chart: { topPersons: ['ingrid.solberg@contoso.com', 'maria.garcia@contoso.com'], hide: { withoutManager: false } } },
      '',
    );
    const mediator = await createMediator(config, HOST);

    const { chart } = await mediator.send(new GetOrgChartQuery(config.settings.chart.options));
    const support = [...chart.nodes.values()].find((node) => node.employee.jobTitle === 'Head of Customer Support');
    const unmanaged = [...chart.nodes.values()].filter((node) => node.flag === 'noManager');

    expect(support?.childIds.length).toBeGreaterThan(PAGE_SIZE);
    expect(unmanaged.length).toBeGreaterThan(PAGE_SIZE);
  });

  it('reads with demo data the organization\'s own fields that config.json names, and only those, which search then finds people by', async () => {
    const config = parseAppConfig(
      { dataSource: 'demo', directory: { extraFields: [{ property: 'employeeOrgData.costCenter', label: 'Cost centre', search: true }] } },
      '',
    );
    const mediator = await createMediator(config, HOST);
    const { options } = config.settings.chart;

    const { chart } = await mediator.send(new GetOrgChartQuery(options));
    const ase = chart.nodes.get(DEMO_SIGNED_IN_USER.id)?.employee;
    const costCenter = ase?.extra['employeeOrgData.costCenter'] ?? '';
    const { hits } = await mediator.send(new SearchEmployeesQuery(options, costCenter, 100));

    // The demo's people have an employee type too, which config.json doesn't name here.
    expect(Object.keys(ase?.extra ?? {})).toEqual(['employeeOrgData.costCenter']);
    expect(costCenter).toMatch(/^4\d{3}$/);
    expect(hits.length).toBeGreaterThan(1);
    // Everyone in her department, each found by the cost centre.
    expect(hits.map(({ employee }) => employee.department)).toEqual(hits.map(() => ase?.department));
    expect(hits.map(({ matchedExtraFields }) => matchedExtraFields)).toEqual(hits.map(() => config.settings.extraFields));
  });

  it('forgets the copy of the directory that the chart reads, then reloads the page', async () => {
    const config = parseAppConfig({ dataSource: 'demo' }, '');
    const mediator = await createMediator(config, HOST);
    const { options } = config.settings.chart;
    const { chart } = await mediator.send(new GetOrgChartQuery(options));
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });

    await mediator.send(new ForgetBrowserCopyCommand());

    expect(reload).toHaveBeenCalledOnce();
    // Read anew: the directory kept nothing of what it read before.
    expect((await mediator.send(new GetOrgChartQuery(options))).chart).not.toBe(chart);
  });

  it('offers with demo data the demo you and her manager in an empty search field, then the people opened since', async () => {
    const config = parseAppConfig({ dataSource: 'demo' }, '');
    const mediator = await createMediator(config, HOST);
    const { options } = config.settings.chart;
    const { chart } = await mediator.send(new GetOrgChartQuery(options));
    const managerId = getNode(chart, DEMO_SIGNED_IN_USER.id).parentId;

    const before = await mediator.send(new GetRecentPeopleQuery(options));
    expect(before.you?.employee.displayName).toBe('Åse Vik');
    expect(before.yourManager?.employee.id).toBe(managerId);
    expect(before.recent).toEqual([]);

    const someone = [...chart.nodes.keys()].find((id) => id !== DEMO_SIGNED_IN_USER.id && id !== managerId) ?? '';
    await mediator.send(new RememberPersonCommand(someone));
    await mediator.send(new RememberPersonCommand(DEMO_SIGNED_IN_USER.id));
    expect((await mediator.send(new GetRecentPeopleQuery(options))).recent.map((hit) => hit.employee.id)).toEqual([someone]);

    await mediator.send(new ClearRecentPeopleCommand());
    expect((await mediator.send(new GetRecentPeopleQuery(options))).recent).toEqual([]);
  });

  it('opens again with demo data where a person left the chart a moment ago', async () => {
    const config = parseAppConfig({ dataSource: 'demo' }, '');
    const mediator = await createMediator(config, HOST);
    const { options } = config.settings.chart;
    const view = { depth: 2, toggled: [], selectedId: DEMO_SIGNED_IN_USER.id, currentId: DEMO_SIGNED_IN_USER.id };

    await mediator.send(new SaveViewCommand(options, view));

    expect(await mediator.send(new GetSavedViewQuery(options, 'top'))).toMatchObject(view);
  });

  it.each([
    ['Forget this browser\'s copy', new ForgetBrowserCopyCommand()],
    ['Sign out', new SignOutCommand()],
  ])('deletes with %s the recent people and the saved views, which stay deleted as the page leaves', async (_, command) => {
    const config = parseAppConfig({ dataSource: 'demo' }, '');
    const mediator = await createMediator(config, HOST);
    const { options } = config.settings.chart;
    const view = { depth: 1, toggled: [], selectedId: DEMO_SIGNED_IN_USER.id, currentId: null };
    await mediator.send(new RememberPersonCommand(DEMO_SIGNED_IN_USER.id));
    await mediator.send(new SaveViewCommand(options, view));
    expect(localStorage.getItem('orgapp.recentPeople')).not.toBeNull();
    expect(localStorage.getItem('orgapp.savedViews')).not.toBeNull();
    vi.stubGlobal('location', { reload: vi.fn() });

    await mediator.send(command);
    // The page leaves or reloads, saving its view on pagehide.
    await mediator.send(new SaveViewCommand(options, view));
    await mediator.send(new RememberPersonCommand(DEMO_SIGNED_IN_USER.id));

    expect(localStorage.getItem('orgapp.recentPeople')).toBeNull();
    expect(localStorage.getItem('orgapp.savedViews')).toBeNull();
  });

  it.each([
    ['Sign out', () => new SignOutCommand()],
    ['Forget this browser\'s copy', () => new ForgetBrowserCopyCommand()],
  ])('keeps the photos it showed for the next visit, and deletes them with %s', async (_, command) => {
    const fake = installFakeIndexedDb();
    vi.mocked(createMsalAuthenticator).mockResolvedValue(signedInAs(DEMO_SIGNED_IN_USER));
    graphWithPhotos();
    vi.stubGlobal('location', { reload: vi.fn() });
    const mediator = await createMediator(parseAppConfig(GRAPH, ''), HOST);

    await expect(mediator.send(new GetEmployeePhotoQuery('anna'))).resolves.toBe(PHOTO);
    await vi.waitFor(() => {
      expect([...fake.records('orgapp', 'photos').keys()]).toEqual([`${GRAPH_SCOPE}/anna`]);
    });

    await mediator.send(command());

    expect(fake.records('orgapp', 'photos').size).toBe(0);
  });

  it('keeps no photos in the browser where config.json keeps no copy there, and deletes those kept before', async () => {
    const fake = installFakeIndexedDb();
    await new IndexedDbPhotoStore(GRAPH_SCOPE).write(new Map([['erik', PHOTO]]));
    vi.mocked(createMsalAuthenticator).mockResolvedValue(signedInAs(DEMO_SIGNED_IN_USER));
    const fetchFn = graphWithPhotos();

    const mediator = await createMediator(parseAppConfig({ ...GRAPH, directory: { cacheInBrowser: false } }, ''), HOST);
    await vi.waitFor(() => {
      expect(fake.records('orgapp', 'photos').size).toBe(0);
    });
    await expect(mediator.send(new GetEmployeePhotoQuery('erik'))).resolves.toBe(PHOTO);
    // Time enough for a write to the browser's database, had one started.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fake.records('orgapp', 'photos').size).toBe(0);
  });

  it('deletes the kept photos when a sign-in is required, as it deletes the copy of the directory', async () => {
    const fake = installFakeIndexedDb();
    await new IndexedDbPhotoStore(GRAPH_SCOPE).write(new Map([['erik', PHOTO]]));
    vi.mocked(createMsalAuthenticator).mockResolvedValue({
      ...signedInAs(DEMO_SIGNED_IN_USER),
      getAccessToken: () => Promise.reject(new SignInRequiredError()),
    });
    const config = parseAppConfig(GRAPH, '');
    const mediator = await createMediator(config, HOST);

    await expect(mediator.send(new GetOrgChartQuery(config.settings.chart.options))).rejects.toBeInstanceOf(SignInRequiredError);

    expect(fake.records('orgapp', 'photos').size).toBe(0);
  });

  it('gives with demo data the demo you\'s working hours in her office\'s zone, and needs no consent for them', async () => {
    const config = parseAppConfig({ dataSource: 'demo' }, '');
    const mediator = await createMediator(config, HOST);
    const { chart } = await mediator.send(new GetOrgChartQuery(config.settings.chart.options));

    const schedule = await mediator.send(new GetWorkingHoursQuery(getNode(chart, DEMO_SIGNED_IN_USER.id).employee));

    expect(schedule?.timeZone).toMatch(/^Europe\//);
    expect(schedule?.workingHours?.days.length).toBeGreaterThan(0);
    await expect(mediator.send(new ConsentToCalendarCommand())).resolves.toBeUndefined();
  });

  it('asks calendars with a token of their own, and logs no consent that is missing for them as a failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchFn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response('{"value":[]}', { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchFn);
    const getCalendarToken = vi.fn(() => Promise.resolve('calendar-token'));
    vi.mocked(createMsalAuthenticator).mockResolvedValue({ ...signedInAs(DEMO_SIGNED_IN_USER), getCalendarToken });
    const mediator = await createMediator(parseAppConfig({ ...GRAPH, directory: { cacheInBrowser: false } }, ''), HOST);
    const anna = makeEmployee('anna');

    await expect(mediator.send(new GetWorkingHoursQuery(anna))).resolves.toBeNull();
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/calendar/getSchedule');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer calendar-token' });

    getCalendarToken.mockRejectedValue(new SignInRequiredError());
    await expect(mediator.send(new GetWorkingHoursQuery(anna))).rejects.toBeInstanceOf(CalendarConsentRequiredError);
    expect(warn).not.toHaveBeenCalled();
  });

  it('lets Back close the side panel on a page of its own, keeping the address as the person changed it', async () => {
    const config = parseAppConfig({ dataSource: 'demo' }, '');
    const mediator = await createMediator(config, HOST);
    const closeTopmost = vi.fn();
    await mediator.send(new TrackOpenLayersCommand({ panel: 1, dialog: false }, closeTopmost));
    expect(window.history.state).toMatchObject({ orgappLayers: 1 });
    await mediator.send(new SaveUserSettingsCommand({ ...config.settings.defaults, team: 'lead@contoso.com' }));

    window.history.back();

    await vi.waitFor(() => {
      expect(closeTopmost).toHaveBeenCalledOnce();
    });
    expect(window.location.search).toContain('team=lead@contoso.com');
  });

  it('leaves the history of the page that embeds the chart alone', async () => {
    const mediator = await createMediator(parseAppConfig({ dataSource: 'demo' }, ''), { ...HOST, kind: 'embedded' });

    await mediator.send(new TrackOpenLayersCommand({ panel: 2, dialog: false }, vi.fn()));

    expect(window.history.state).toBeNull();
  });

  it('plans how to reach a demo team without the demo you, and has the big support team\'s addresses copied', async () => {
    const config = parseAppConfig({ dataSource: 'demo' }, '');
    const mediator = await createMediator(config, HOST);
    const { chart } = await mediator.send(new GetOrgChartQuery(config.settings.chart.options));
    const teamOf = (node: OrgNode) => [node.employee, ...node.childIds.map((id) => getNode(chart, id).employee)];
    const you = getNode(chart, DEMO_SIGNED_IN_USER.id);
    const support = [...chart.nodes.values()].find((node) => node.employee.jobTitle === 'Head of Customer Support');

    const yours = await mediator.send(new GetTeamContactQuery(teamOf(you)));
    expect(yours.chat.reach).toBe('link');
    expect(yours.email.people).toHaveLength(you.childIds.length);
    expect(yours.email.people).not.toContain(DEMO_SIGNED_IN_USER.userPrincipalName);

    const crowd = support && (await mediator.send(new GetTeamContactQuery(teamOf(support))));
    expect(crowd?.email.reach).toBe('copy');
    expect([crowd?.chat.reach, crowd?.meeting.reach]).toEqual(['tooMany', 'tooMany']);
  });

  it('finds with demo data each problem the directory health report looks for, and the filters that show who has it', async () => {
    const ceos = ['ingrid.solberg@contoso.com', 'erik.haugen@contoso.com', 'maria.garcia@contoso.com', 'jonas.berg@contoso.com'];
    const config = parseAppConfig({ dataSource: 'demo', chart: { topPersons: ceos } }, '');
    const mediator = await createMediator(config, HOST);
    const { options } = config.settings.chart;

    const { people, checkedIds, photosAnswered } = await mediator.send(new GetDirectoryHealthQuery(options));
    const titles = (issue: Issue) => people[issue].map(({ employee }) => employee.jobTitle);

    // The Head of Research and the Chair of the Board, and the 55 seasonal workers.
    expect(people.noManager).toHaveLength(57);
    expect(titles('managerGone')).toEqual(['Analyst', 'Analyst', 'Analyst']);
    expect(titles('disabledManager')).toEqual(['Former Director']);
    expect(titles('managerCycle')).toEqual(['Project Manager', 'Project Manager']);
    expect(titles('department')).toContain('Facilities Coordinator');
    expect(people.departmentSpelling.map(({ employee, usualSpelling }) => [employee.department, usualSpelling])).toEqual([
      ['Energy facilities', 'Energy Facilities'],
    ]);
    expect(titles('officeLocation')).toContain('Caretaker');
    expect(titles('phone')).toContain('Caretaker');
    expect(titles('departmentInItself')).toEqual(['Executive Assistant']);
    expect(titles('departmentElsewhere')).toEqual(['Business Developer']);
    expect(photosAnswered).toBe(0);

    const seasonal = people.noManager.find(({ employee }) => employee.jobTitle === 'Seasonal Worker')?.employee.id ?? '';
    expect(await mediator.send(new GetRulesShowingQuery(options, seasonal))).toEqual({ ...options.hide, withoutManager: false });

    // The report keeps what the photo check finds for the rest of the page's session.
    await mediator.send(new CheckPhotosCommand(checkedIds.slice(0, 3)));
    expect((await mediator.send(new GetDirectoryHealthQuery(options))).photosAnswered).toBe(3);
  });

  it('nests the demo\'s departments three deep, one of them again below itself', async () => {
    const ceos = ['ingrid.solberg@contoso.com', 'erik.haugen@contoso.com', 'maria.garcia@contoso.com', 'jonas.berg@contoso.com'];
    const config = parseAppConfig({ dataSource: 'demo', chart: { topPersons: ceos } }, '');
    const mediator = await createMediator(config, HOST);
    const { chart } = await mediator.send(new GetOrgChartQuery(config.settings.chart.options));

    const tree = departmentTree(chart);

    expect(tree.rootIds[0]).toBe('executivemanagement');
    const names = (id: string) => departmentPath(tree, id).map(({ name }) => name);
    expect(names('executivemanagement/strategyma/businessdevelopment')).toEqual(['Executive Management', 'Strategy M&A', 'Business Development']);
    expect(getDepartment(tree, 'executivemanagement/strategyma/executivemanagement').insideItself).toBe(true);
    expect(getDepartment(tree, 'executivemanagement/businessdevelopment').memberIds).toHaveLength(1);
  });

  it('saves a list of the directory health report as a file named after its issue', async () => {
    const config = parseAppConfig({ dataSource: 'demo' }, '');
    const mediator = await createMediator(config, HOST);
    const { people, loadedAt } = await mediator.send(new GetDirectoryHealthQuery(config.settings.chart.options));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:list', configurable: true });
    // The writer lets go of the file a minute on, which a test that ends sooner must not leave behind.
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      await mediator.send(new ExportIssuesCommand('managerCycle', people.managerCycle, loadedAt, 'en'));

      expect(click.mock.contexts.map((link) => (link as HTMLAnchorElement).download)).toEqual([
        `directory-health-circular-manager-chain-${formatLocalDate(loadedAt)}.csv`,
      ]);
    } finally {
      vi.useRealTimers();
      Reflect.deleteProperty(URL, 'createObjectURL');
    }
  });

  it('copies through the browser\'s clipboard', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      const mediator = await demo();

      await expect(mediator.send(new CopyTextCommand('Version: 1.0.42'))).resolves.toBe(true);
      expect(writeText).toHaveBeenCalledExactlyOnceWith('Version: 1.0.42');
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('gives another page\'s iframe the chart\'s address with the person\'s filters and team, and nobody\'s details open', async () => {
    window.history.replaceState(null, '', '/?top=ceo@contoso.com&person=dev@contoso.com&depth=2');
    const config = parseAppConfig({ dataSource: 'demo' }, window.location.search);
    const mediator = await createMediator(config, HOST);
    const { defaults } = config.settings;

    const address = await mediator.send(
      new GetEmbedAddressQuery({ ...defaults, hide: { ...defaults.hide, guests: false }, team: 'lead@contoso.com' }),
    );

    expect(address).toBe(`${window.location.origin}/?top=ceo@contoso.com&team=lead@contoso.com&show=guests`);
  });

  it('remembers a person\'s filters in the address, and how the chart looks and speaks to them in the browser', async () => {
    const config = parseAppConfig({ dataSource: 'demo' }, '');
    const mediator = await createMediator(config, HOST);
    const { defaults } = config.settings;

    await mediator.send(
      new SaveUserSettingsCommand({
        hide: { ...defaults.hide, guests: false },
        showLevels: true,
        language: 'en',
        team: 'lead@contoso.com',
        startAt: 'lastView',
        theme: 'contrast',
        textSize: 'larger',
      }),
    );

    expect(window.location.search).toBe('?show=guests&team=lead@contoso.com');
    expect(readStoredUserSettings()).toEqual({
      showLevels: true,
      language: 'en',
      startAt: 'lastView',
      theme: 'contrast',
      textSize: 'larger',
    });
  });

  it('forgets the choices the browser remembers once the person goes back to config.json\'s and to Automatic', async () => {
    const key = 'orgapp.userSettings';
    localStorage.setItem(key, '{"showLevels":true,"language":"en","theme":"dark","textSize":"large"}');
    const config = parseAppConfig({ dataSource: 'demo' }, '', readStoredUserSettings());
    const mediator = await createMediator(config, HOST);

    await mediator.send(new SaveUserSettingsCommand(config.settings.defaults));

    expect(localStorage.getItem(key)).toBeNull();
  });
});
