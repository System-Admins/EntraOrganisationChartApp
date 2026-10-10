import { SignInRequiredError, type Authenticator } from '@/application/abstractions/authenticator';
import type { BackNavigation } from '@/application/abstractions/backNavigation';
import type { BrowserCopy } from '@/application/abstractions/browserCopy';
import type { ChartPrinter } from '@/application/abstractions/chartPrinter';
import type { ContactLauncher } from '@/application/abstractions/contactLauncher';
import type { EmployeeDirectory } from '@/application/abstractions/employeeDirectory';
import type { EmployeePhotos } from '@/application/abstractions/employeePhotos';
import type { EmployeeSharing } from '@/application/abstractions/employeeSharing';
import { PresenceUnavailableError, type PresenceSource } from '@/application/abstractions/presenceSource';
import type { SignedInUserSource } from '@/application/abstractions/signedInUser';
import { CalendarConsentRequiredError, type WorkingHoursSource } from '@/application/abstractions/workingHoursSource';
import { Mediator, type Sender } from '@/application/common/mediator';
import { OrgChartProvider } from '@/application/common/orgChartProvider';
import {
  GetReturnedSignInErrorHandler,
  GetReturnedSignInErrorQuery,
} from '@/application/features/authentication/getReturnedSignInError';
import {
  ForgetBrowserCopyCommand,
  ForgetBrowserCopyHandler,
} from '@/application/features/authentication/forgetBrowserCopy';
import { GetSignedInUserHandler, GetSignedInUserQuery } from '@/application/features/authentication/getSignedInUser';
import { SignInCommand, SignInHandler } from '@/application/features/authentication/signIn';
import { SignOutCommand, SignOutHandler } from '@/application/features/authentication/signOut';
import { ForgetViewCommand, ForgetViewHandler } from '@/application/features/chartView/forgetView';
import { GetSavedViewHandler, GetSavedViewQuery } from '@/application/features/chartView/getSavedView';
import { SaveViewCommand, SaveViewHandler } from '@/application/features/chartView/saveView';
import { ConsentToPresenceCommand, ConsentToPresenceHandler } from '@/application/features/presence/consentToPresence';
import { CopyTextCommand, CopyTextHandler } from '@/application/features/clipboard/copyText';
import { ContactEmployeeCommand, ContactEmployeeHandler } from '@/application/features/contact/contactEmployee';
import { ContactTeamCommand, ContactTeamHandler } from '@/application/features/contact/contactTeam';
import {
  GetContactDestinationsHandler,
  GetContactDestinationsQuery,
} from '@/application/features/contact/getContactDestinations';
import { GetTeamContactHandler, GetTeamContactQuery } from '@/application/features/contact/getTeamContact';
import { CheckPhotosCommand, CheckPhotosHandler } from '@/application/features/dataQuality/checkPhotos';
import { ExportIssuesCommand, ExportIssuesHandler } from '@/application/features/dataQuality/exportIssues';
import { GetDirectoryHealthHandler, GetDirectoryHealthQuery } from '@/application/features/dataQuality/getDirectoryHealth';
import { GetRulesShowingHandler, GetRulesShowingQuery } from '@/application/features/dataQuality/getRulesShowing';
import { PhotoAnswers } from '@/application/features/dataQuality/photoAnswers';
import { GetDiagnosticsHandler, GetDiagnosticsQuery } from '@/application/features/diagnostics/getDiagnostics';
import { RefreshDirectoryCommand, RefreshDirectoryHandler } from '@/application/features/directory/refreshDirectory';
import {
  ClearRecentPeopleCommand,
  ClearRecentPeopleHandler,
} from '@/application/features/employeeSearch/clearRecentPeople';
import { GetRecentPeopleHandler, GetRecentPeopleQuery } from '@/application/features/employeeSearch/getRecentPeople';
import { RememberPersonCommand, RememberPersonHandler } from '@/application/features/employeeSearch/rememberPerson';
import { SearchEmployeesHandler, SearchEmployeesQuery } from '@/application/features/employeeSearch/searchEmployees';
import { SaveUserSettingsCommand, SaveUserSettingsHandler } from '@/application/features/settings/saveUserSettings';
import { ExportEmployeesCommand, ExportEmployeesHandler } from '@/application/features/export/exportEmployees';
import { GetFilterEffectsHandler, GetFilterEffectsQuery } from '@/application/features/orgChart/getFilterEffects';
import { GetOrgChartHandler, GetOrgChartQuery } from '@/application/features/orgChart/getOrgChart';
import { GetRecordedManagerHandler, GetRecordedManagerQuery } from '@/application/features/orgChart/getRecordedManager';
import { TrackOpenLayersCommand, TrackOpenLayersHandler } from '@/application/features/navigation/trackOpenLayers';
import { GetEmployeePhotoHandler, GetEmployeePhotoQuery } from '@/application/features/photos/getEmployeePhoto';
import { GetPresencesHandler, GetPresencesQuery } from '@/application/features/presence/getPresences';
import { PrintChartCommand, PrintChartHandler } from '@/application/features/print/printChart';
import { GetEmbedAddressHandler, GetEmbedAddressQuery } from '@/application/features/share/getEmbedAddress';
import { GetShareMethodHandler, GetShareMethodQuery } from '@/application/features/share/getShareMethod';
import { ShareEmployeeCommand, ShareEmployeeHandler } from '@/application/features/share/shareEmployee';
import { ConsentToCalendarCommand, ConsentToCalendarHandler } from '@/application/features/workingHours/consentToCalendar';
import { GetWorkingHoursHandler, GetWorkingHoursQuery } from '@/application/features/workingHours/getWorkingHours';
import { openingUserSettings } from '@/application/settings/appSettings';
import { createHostAuthenticator } from '@/infrastructure/auth/hostAuthenticator';
import { BrowserClipboard } from '@/infrastructure/clipboard/browserClipboard';
import type { AppConfig } from '@/infrastructure/config/appConfig';
import { StorageRecentPeopleStore } from '@/infrastructure/config/storageRecentPeopleStore';
import { StorageUserSettingsStore } from '@/infrastructure/config/storageUserSettingsStore';
import { StorageViewStateStore } from '@/infrastructure/config/storageViewStateStore';
import { UrlUserSettingsStore } from '@/infrastructure/config/urlUserSettingsStore';
import { BrowserContactLauncher } from '@/infrastructure/contact/browserContactLauncher';
import { DEMO_SIGNED_IN_USER, DemoEmployeeSource } from '@/infrastructure/demo/demoEmployeeSource';
import { DemoPhotoSource } from '@/infrastructure/demo/demoPhotoSource';
import { DemoPresenceSource } from '@/infrastructure/demo/demoPresenceSource';
import { DemoWorkingHoursSource } from '@/infrastructure/demo/demoWorkingHoursSource';
import { CachedEmployeeDirectory } from '@/infrastructure/directory/cachedEmployeeDirectory';
import { IndexedDbPhotoStore } from '@/infrastructure/directory/photoStore';
import { IndexedDbSnapshotStore } from '@/infrastructure/directory/snapshotStore';
import { CsvFileWriter } from '@/infrastructure/export/csvFileWriter';
import { GraphClient } from '@/infrastructure/graph/graphClient';
import { GraphEmployeeSource } from '@/infrastructure/graph/graphEmployeeSource';
import { GraphPhotoSource } from '@/infrastructure/graph/graphPhotoSource';
import { GraphPresenceSource } from '@/infrastructure/graph/graphPresenceSource';
import { GraphWorkingHoursSource } from '@/infrastructure/graph/graphWorkingHoursSource';
import type { HostEnvironment } from '@/infrastructure/host/hostEnvironment';
import { BrowserBackNavigation } from '@/infrastructure/navigation/browserBackNavigation';
import { BrowserChartPrinter } from '@/infrastructure/print/browserChartPrinter';
import { BrowserChartEmbedding } from '@/infrastructure/share/browserChartEmbedding';
import { BrowserEmployeeSharing } from '@/infrastructure/share/browserEmployeeSharing';

interface DataAccess {
  readonly directory: EmployeeDirectory;
  readonly photos: EmployeePhotos;
  readonly presence: PresenceSource;
  readonly workingHours: WorkingHoursSource;
  readonly authenticator: Authenticator;
  readonly signedInUser: SignedInUserSource;
}

/** What the app asks of the page that hosts it. */
interface HostServices {
  readonly contactLauncher: ContactLauncher;
  readonly chartPrinter: ChartPrinter;
  readonly sharing: EmployeeSharing;
  readonly backNavigation: BackNavigation;
}

export async function createMediator(config: AppConfig, host: HostEnvironment): Promise<Sender> {
  const { defaults, extraFields } = config.settings;
  const address = new UrlUserSettingsStore(defaults);
  const [
    { directory, photos, presence, workingHours, authenticator, signedInUser },
    { contactLauncher, chartPrinter, sharing, backNavigation },
  ] = await Promise.all([createDataAccess(config, host), createHostServices(config, host, address)]);
  const charts = new OrgChartProvider(directory);
  const recentPeople = new StorageRecentPeopleStore();
  const savedViews = new StorageViewStateStore(host.kind);
  // Sign out and Forget this browser's copy delete the same: everything the chart keeps in the browser for the next visit.
  const browserCopies: readonly BrowserCopy[] = [directory, photos, recentPeople, savedViews];
  // In memory for the page's session only, so the report shows a finished photo check again without asking anew.
  const photoAnswers = new PhotoAnswers();
  const tableWriter = new CsvFileWriter(config.csvSeparator);
  const mediator = new Mediator()
    .register(GetOrgChartQuery, new GetOrgChartHandler(charts, config.settings.refreshAfterMinutes * 60_000))
    .register(GetRecordedManagerQuery, new GetRecordedManagerHandler(charts))
    .register(GetFilterEffectsQuery, new GetFilterEffectsHandler(charts))
    .register(GetDiagnosticsQuery, new GetDiagnosticsHandler(charts, directory))
    .register(GetDirectoryHealthQuery, new GetDirectoryHealthHandler(charts, photoAnswers))
    .register(CheckPhotosCommand, new CheckPhotosHandler(photos, photoAnswers))
    .register(GetRulesShowingQuery, new GetRulesShowingHandler(charts))
    .register(ExportIssuesCommand, new ExportIssuesHandler(tableWriter, extraFields))
    .register(SearchEmployeesQuery, new SearchEmployeesHandler(charts, extraFields))
    .register(GetRecentPeopleQuery, new GetRecentPeopleHandler(charts, signedInUser, recentPeople))
    .register(RememberPersonCommand, new RememberPersonHandler(recentPeople))
    .register(ClearRecentPeopleCommand, new ClearRecentPeopleHandler(recentPeople))
    .register(GetSavedViewQuery, new GetSavedViewHandler(savedViews))
    .register(SaveViewCommand, new SaveViewHandler(savedViews))
    .register(ForgetViewCommand, new ForgetViewHandler(savedViews))
    .register(TrackOpenLayersCommand, new TrackOpenLayersHandler(backNavigation))
    .register(GetEmployeePhotoQuery, new GetEmployeePhotoHandler(photos))
    .register(GetPresencesQuery, new GetPresencesHandler(presence))
    .register(GetWorkingHoursQuery, new GetWorkingHoursHandler(workingHours))
    .register(RefreshDirectoryCommand, new RefreshDirectoryHandler(directory))
    .register(ContactEmployeeCommand, new ContactEmployeeHandler(contactLauncher))
    .register(GetContactDestinationsQuery, new GetContactDestinationsHandler(contactLauncher))
    .register(GetTeamContactQuery, new GetTeamContactHandler(signedInUser))
    .register(ContactTeamCommand, new ContactTeamHandler(contactLauncher, signedInUser))
    .register(PrintChartCommand, new PrintChartHandler(chartPrinter))
    .register(ShareEmployeeCommand, new ShareEmployeeHandler(sharing))
    .register(GetShareMethodQuery, new GetShareMethodHandler(sharing))
    .register(GetEmbedAddressQuery, new GetEmbedAddressHandler(new BrowserChartEmbedding(defaults)))
    .register(ExportEmployeesCommand, new ExportEmployeesHandler(charts, photos, tableWriter, extraFields))
    .register(CopyTextCommand, new CopyTextHandler(new BrowserClipboard()))
    .register(SignInCommand, new SignInHandler(authenticator))
    .register(GetReturnedSignInErrorQuery, new GetReturnedSignInErrorHandler(authenticator))
    .register(GetSignedInUserQuery, new GetSignedInUserHandler(signedInUser))
    .register(SignOutCommand, new SignOutHandler(authenticator, browserCopies))
    .register(
      ForgetBrowserCopyCommand,
      new ForgetBrowserCopyHandler(authenticator, browserCopies, () => {
        window.location.reload();
      }),
    )
    .register(ConsentToPresenceCommand, new ConsentToPresenceHandler(authenticator))
    .register(ConsentToCalendarCommand, new ConsentToCalendarHandler(authenticator))
    .register(
      SaveUserSettingsCommand,
      new SaveUserSettingsHandler([address, new StorageUserSettingsStore(defaults, openingUserSettings(config.settings))]),
    );
  return loggingFailures(mediator);
}

/** The UI only explains failures, so the details go to the console. Sign-in, presence and calendar consent states are no failures. */
function loggingFailures(mediator: Sender): Sender {
  return {
    send: (request) =>
      mediator.send(request).catch((error: unknown) => {
        if (
          !(error instanceof SignInRequiredError) &&
          !(error instanceof PresenceUnavailableError) &&
          !(error instanceof CalendarConsentRequiredError)
        ) {
          console.warn('A request failed.', error);
        }
        throw error;
      }),
  };
}

async function createDataAccess(config: AppConfig, host: HostEnvironment): Promise<DataAccess> {
  const extraFields = config.settings.extraFields.map(({ property }) => property);
  if (config.dataSource === 'demo') {
    return {
      directory: new CachedEmployeeDirectory(new DemoEmployeeSource(extraFields), null),
      photos: new DemoPhotoSource(),
      presence: new DemoPresenceSource(),
      workingHours: new DemoWorkingHoursSource(),
      authenticator: {
        signIn: () => Promise.resolve(),
        returnedSignInError: null,
        consentToPresence: () => Promise.resolve(),
        consentToCalendar: () => Promise.resolve(),
        signOut: () => Promise.resolve(),
        forgetSignIn: () => Promise.resolve(),
      },
      // Signed in from the start, so that what is about one's own place in the chart can be tried out.
      signedInUser: { getSignedInUser: () => DEMO_SIGNED_IN_USER },
    };
  }

  // The SharePoint web part's sign-in where it hands one over; MSAL is loaded on demand, so demo mode ships without it.
  const authenticator = host.signIn
    ? createHostAuthenticator(host.signIn)
    : await (await import('@/infrastructure/auth/msalAuthenticator')).createMsalAuthenticator(config.auth, host);
  // A guest whom the directory refuses is told so, not sent to ask for a consent that would change nothing.
  const graph = new GraphClient(authenticator.getAccessToken, () => authenticator.getSignedInUser()?.isGuest === true);
  const scope = `${config.auth.tenantId}/${config.auth.clientId}`;
  const store = new IndexedDbSnapshotStore(scope, extraFields);
  const photoStore = new IndexedDbPhotoStore(scope);
  // Copies saved while cacheInBrowser was on would otherwise stay in the browser.
  if (!config.cacheInBrowser) {
    void store.clear().catch(() => undefined);
    void photoStore.clear().catch(() => undefined);
  }
  // Kept photos are for a signed-in user, as the directory's copy is, and go with it when a sign-in is required.
  const ensureSignedIn = () =>
    authenticator.getAccessToken().catch(async (error: unknown) => {
      if (error instanceof SignInRequiredError) await photoStore.clear().catch(() => undefined);
      throw error;
    });
  return {
    directory: new CachedEmployeeDirectory(
      new GraphEmployeeSource(graph, extraFields),
      config.cacheInBrowser ? store : null,
      ensureSignedIn,
    ),
    photos: new GraphPhotoSource(graph, config.cacheInBrowser ? photoStore : null),
    presence: new GraphPresenceSource(new GraphClient(authenticator.getPresenceToken)),
    workingHours: new GraphWorkingHoursSource(new GraphClient(authenticator.getCalendarToken)),
    authenticator,
    signedInUser: authenticator,
  };
}

/** `address` keeps the person's filters and team in the page's address, which a step back through the history must keep too. */
async function createHostServices(config: AppConfig, host: HostEnvironment, address: UrlUserSettingsStore): Promise<HostServices> {
  if (host.kind !== 'teams') {
    return {
      contactLauncher: new BrowserContactLauncher(config.emailClient),
      chartPrinter: new BrowserChartPrinter(),
      sharing: new BrowserEmployeeSharing(),
      // Entries an iframe pushes join its page's history, whose own Back they would take over.
      backNavigation:
        host.kind === 'standalone'
          ? new BrowserBackNavigation(() => {
              address.restore();
            })
          : { track: () => undefined },
    };
  }
  const [{ TeamsContactLauncher }, { TeamsChartPrinter }, { TeamsEmployeeSharing }, { TeamsBackNavigation }] = await Promise.all([
    import('@/infrastructure/teams/teamsContactLauncher'),
    import('@/infrastructure/teams/teamsChartPrinter'),
    import('@/infrastructure/teams/teamsEmployeeSharing'),
    import('@/infrastructure/teams/teamsBackNavigation'),
  ]);
  return {
    contactLauncher: new TeamsContactLauncher(config.emailClient),
    chartPrinter: new TeamsChartPrinter(),
    // The Teams app's manifest ID is the client ID (see teams/manifest.template.json).
    sharing: await TeamsEmployeeSharing.create(config.auth?.clientId ?? null),
    backNavigation: new TeamsBackNavigation(),
  };
}
