// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ProgressListener } from '@/application/abstractions/employeeDirectory';
import type { HostLifecycle } from '@/application/abstractions/hostLifecycle';
import { ServiceError } from '@/application/abstractions/serviceError';
import type { SignedInUser } from '@/application/abstractions/signedInUser';
import type { ChartView } from '@/application/abstractions/viewStateStore';
import type { Request, Sender } from '@/application/common/mediator';
import { ForgetBrowserCopyCommand } from '@/application/features/authentication/forgetBrowserCopy';
import { GetSignedInUserQuery } from '@/application/features/authentication/getSignedInUser';
import { SignOutCommand } from '@/application/features/authentication/signOut';
import { ForgetViewCommand } from '@/application/features/chartView/forgetView';
import { GetSavedViewQuery } from '@/application/features/chartView/getSavedView';
import { SaveViewCommand } from '@/application/features/chartView/saveView';
import { GetDirectoryHealthHandler, GetDirectoryHealthQuery } from '@/application/features/dataQuality/getDirectoryHealth';
import { GetRulesShowingHandler, GetRulesShowingQuery } from '@/application/features/dataQuality/getRulesShowing';
import { PhotoAnswers } from '@/application/features/dataQuality/photoAnswers';
import { GetRecentPeopleQuery } from '@/application/features/employeeSearch/getRecentPeople';
import { RememberPersonCommand } from '@/application/features/employeeSearch/rememberPerson';
import { TrackOpenLayersCommand } from '@/application/features/navigation/trackOpenLayers';
import { GetDiagnosticsQuery, type Diagnostics } from '@/application/features/diagnostics/getDiagnostics';
import { OrgChartProvider } from '@/application/common/orgChartProvider';
import { RefreshDirectoryCommand } from '@/application/features/directory/refreshDirectory';
import {
  SearchEmployeesHandler,
  SearchEmployeesQuery,
  type EmployeeSearchHit,
} from '@/application/features/employeeSearch/searchEmployees';
import { ExportEmployeesCommand } from '@/application/features/export/exportEmployees';
import { GetFilterEffectsQuery, type FilterEffects } from '@/application/features/orgChart/getFilterEffects';
import { GetOrgChartQuery, type OrgChartResult } from '@/application/features/orgChart/getOrgChart';
import { GetRecordedManagerQuery } from '@/application/features/orgChart/getRecordedManager';
import { PrintChartCommand } from '@/application/features/print/printChart';
import { SaveUserSettingsCommand } from '@/application/features/settings/saveUserSettings';
import { GetEmbedAddressQuery } from '@/application/features/share/getEmbedAddress';
import type { AppSettings, SupportDesk } from '@/application/settings/appSettings';
import type { HostKind } from '@/application/settings/hostKind';
import type { Employee } from '@/domain/employees/employee';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import type { HideRules } from '@/domain/orgChart/hideRules';
import { chartHideRules, type OrgChartOptions } from '@/domain/orgChart/orgChart';
import { installDialogMethods } from '@/testing/dialog';
import { directoryOf } from '@/testing/directory';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { describeError } from '../../shared/errors';
import { MediatorProvider } from '../../shared/mediatorContext';
import { SupportDeskProvider } from '../../shared/supportDesk';
import { PEOPLE_LIST_CAP } from '../peopleList/PeopleList';
import { PrintProvider } from '../print/printContext';
import { UserSettingsProvider } from '../settings/userSettingsContext';
import { OrgChartPage } from './OrgChartPage';

const EMPLOYEES = [makeEmployee('ceo'), makeEmployee('lead', 'ceo'), makeEmployee('dev', 'lead')];

/** `defaults` are config.json's hide rules; they differ from the options' where a link changed the rules. */
const settingsFor = (
  options: OrgChartOptions,
  initialPerson: string | null = null,
  defaults: HideRules = chartHideRules(options),
): AppSettings => ({
  chart: {
    options,
    team: null,
    expandDepth: 1,
    showPhotos: false,
    showPresence: false,
    showWorkLocation: true,
    showWorkingHours: false,
    showLevels: false,
    startAt: 'top',
  },
  defaults: {
    hide: defaults,
    showLevels: false,
    language: 'auto',
    team: null,
    startAt: 'top',
    theme: 'auto',
    textSize: 'standard',
  },
  refreshAfterMinutes: 60,
  theme: { chosen: 'auto', automatic: 'auto' },
  textSize: 'standard',
  language: { chosen: 'auto', automatic: 'en' },
  branding: {
    title: 'Org',
    logoUrl: null,
    logoUrlDark: null,
    logoAlt: null,
    faviconUrl: null,
    fontFamily: null,
    colors: {},
    darkColors: {},
  },
  pageColors: {},
  without: [],
  initialPerson,
  allowExport: true,
  allowReports: true,
  changePhotoUrl: 'https://myaccount.microsoft.com/',
  support: null,
  extraFields: [],
});

const SETTINGS = settingsFor({ topPersons: ['ceo'], hide: SHOW_EVERYONE });

const EXPORT_ERROR = new Error('The disk is full.');
const REFRESH_ERROR = new Error('The directory did not answer.');
const LOAD_ERROR = new Error('Microsoft Graph request failed (503).');
const SIGN_OUT_ERROR = new Error('The sign-out did not finish.');

interface Setup {
  readonly settings?: AppSettings;
  readonly employees?: readonly Employee[];
  readonly isStale?: boolean;
  readonly refresh?: (command: RefreshDirectoryCommand) => Promise<void>;
  readonly printOpensBrowser?: boolean;
  /** Where the page runs; on a site of its own without it. */
  readonly host?: HostKind;
  readonly canSignOut?: boolean;
  /** Offers Forget this browser's copy, as start.tsx does for an embedded page with Graph data. */
  readonly canForget?: boolean;
  readonly signedInUser?: SignedInUser | null;
  /** How an export ends; without it the export fails. */
  readonly exportResult?: () => Promise<void>;
  /** Answers a request in place of the defaults below, wherever it returns a promise. */
  readonly answer?: (request: Request<unknown>) => Promise<unknown> | undefined;
  /** What the host says of the page's life; a host that never suspends it without it. */
  readonly lifecycle?: HostLifecycle;
  /** config.json's support desk; none without it. */
  readonly support?: SupportDesk | null;
}

/** A host that never suspends the page, as only Teams does. */
const STEADY_HOST: HostLifecycle = { onSuspend: () => () => undefined, onResume: () => () => undefined };

/** A host that suspends and resumes the page when the test says so, as Teams does. */
function suspendingHost() {
  const suspended = new Set<() => void>();
  const resumed = new Set<() => void>();
  const listen = (listeners: Set<() => void>) => (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const call = (listeners: ReadonlySet<() => void>) => () => {
    act(() => {
      for (const listener of listeners) listener();
    });
  };
  return { lifecycle: { onSuspend: listen(suspended), onResume: listen(resumed) }, suspend: call(suspended), resume: call(resumed) };
}

/** Renders the page without waiting for anything; see renderPage. */
function mountPage({
  settings = SETTINGS,
  employees = EMPLOYEES,
  isStale = false,
  refresh,
  printOpensBrowser = false,
  host = 'standalone',
  canSignOut = false,
  canForget = false,
  signedInUser = null,
  exportResult,
  answer,
  lifecycle = STEADY_HOST,
  support = null,
}: Setup = {}) {
  const refreshes: RefreshDirectoryCommand[] = [];
  const sent: Request<unknown>[] = [];
  const mediator: Sender = {
    send: <T,>(request: Request<T>) => {
      sent.push(request);
      const answered = answer?.(request);
      if (answered) return answered as Promise<T>;
      if (request instanceof GetOrgChartQuery) {
        const result: OrgChartResult = {
          chart: buildOrgChart(employees, request.options),
          loadedAt: new Date(2026, 8, 30, 9, 0),
          isStale,
        };
        return Promise.resolve(result as T);
      }
      if (request instanceof RefreshDirectoryCommand) {
        refreshes.push(request);
        return (refresh?.(request) ?? Promise.resolve()) as Promise<T>;
      }
      if (request instanceof ExportEmployeesCommand) {
        request.onProgress?.(1234);
        return (exportResult?.() ?? Promise.reject(EXPORT_ERROR)) as Promise<T>;
      }
      if (request instanceof GetSignedInUserQuery) return Promise.resolve(signedInUser as T);
      return Promise.resolve(undefined as T);
    },
  };
  render(
    <MediatorProvider mediator={mediator}>
      <UserSettingsProvider settings={settings}>
        <SupportDeskProvider desk={support}>
          <PrintProvider opensBrowser={printOpensBrowser}>
            <OrgChartPage
              settings={settings}
              host={host}
              canSignOut={canSignOut}
              canForget={canForget}
              version="1.0.42"
              lifecycle={lifecycle}
            />
          </PrintProvider>
        </SupportDeskProvider>
      </UserSettingsProvider>
    </MediatorProvider>,
  );
  return { refreshes, sent };
}

/** Renders the page and waits for its first chart. */
async function renderPage(setup: Setup = {}) {
  const mounted = mountPage(setup);
  const loading = screen.queryByText('Loading the organization...');
  // The status bar fills in with the first chart.
  await screen.findByRole('contentinfo');
  await waitFor(() => {
    expect(screen.getByRole('contentinfo').textContent).not.toBe('');
  });
  return { ...mounted, wasLoading: loading !== null };
}

const card = (name: string) => screen.getByRole('treeitem', { name });
const tool = (name: string | RegExp) => within(screen.getByRole('toolbar')).getByRole('button', { name });
/** The page's announcements: the last of the hidden live regions in the page's header. */
const announcements = () => within(screen.getAllByRole('banner')[0] as HTMLElement).getAllByRole('status').at(-1) as HTMLElement;
/** The hidden live region that says the zoom, right after the toolbar. */
const zoomRegion = () => screen.getByRole('toolbar').nextElementSibling as HTMLElement;
/** Focus as the Tab key gives it, which is what makes jsdom match :focus-visible. */
const tabTo = (element: HTMLElement) => {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab' });
  act(() => {
    element.focus();
  });
};
const announced = async (message: string) => {
  await waitFor(() => {
    expect(announcements().textContent).toBe(message);
  });
};
const frame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
/** Searches the people as the app does. */
const searching = (employees: readonly Employee[]) => {
  const snapshot = { employees: [...employees], loadedAt: new Date() };
  const handler = new SearchEmployeesHandler(new OrgChartProvider(directoryOf(() => snapshot)));
  return (request: Request<unknown>) => (request instanceof SearchEmployeesQuery ? handler.handle(request) : undefined);
};
/** Answers the directory health report and its Show in chart as the app does, over the same people. */
const reporting = (employees: readonly Employee[]) => {
  const snapshot = { employees: [...employees], loadedAt: new Date(2026, 8, 30, 9, 0) };
  const provider = new OrgChartProvider(directoryOf(() => snapshot));
  const health = new GetDirectoryHealthHandler(provider, new PhotoAnswers());
  const rules = new GetRulesShowingHandler(provider);
  return (request: Request<unknown>) => {
    if (request instanceof GetDirectoryHealthQuery) return health.handle(request);
    return request instanceof GetRulesShowingQuery ? rules.handle(request) : undefined;
  };
};
const searchField = () => screen.getByRole('combobox', { name: 'Search' });
const search = (text: string) => {
  act(() => {
    searchField().focus();
  });
  fireEvent.change(searchField(), { target: { value: text } });
};

function deferred() {
  let settle: { resolve: () => void; reject: (error: Error) => void } | undefined;
  const promise = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject };
  });
  return { promise, resolve: () => settle?.resolve(), reject: (error: Error) => settle?.reject(error) };
}

const scrollTo = vi.fn();

beforeAll(() => {
  // jsdom lacks these browser APIs, and lays nothing out.
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  HTMLElement.prototype.scrollTo = scrollTo;
  HTMLElement.prototype.getClientRects = () => [new DOMRect()] as unknown as DOMRectList;
  installDialogMethods();
});

afterEach(cleanup);

describe('OrgChartPage', () => {
  it('has the announcement region before anything is loaded, and a footer that is a landmark, not a live region', async () => {
    const { wasLoading } = await renderPage();

    expect(wasLoading).toBe(true);
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toContain('3 people');
    expect(footer.hasAttribute('role')).toBe(false);
    expect(footer.querySelector('[role="status"], [aria-live]')).toBeNull();
    expect(announcements().textContent).toBe('');
  });

  it('announces the start and the end of a reload a person asked for, but not its progress', async () => {
    const running = deferred();
    const { refreshes } = await renderPage({ refresh: () => running.promise });

    fireEvent.click(tool('Reload from the directory'));
    await announced('Updating the directory...');
    expect(refreshes[0]?.full).toBe(true);

    act(() => {
      refreshes[0]?.onProgress?.(200, 1000);
    });
    expect(screen.getByRole('contentinfo').textContent).toContain('Updating... 200 of about 1,000 people loaded');
    await frame();
    expect(announcements().textContent).toBe('Updating the directory...');

    await act(async () => {
      running.resolve();
      await running.promise;
    });
    await announced('Directory updated.');
  });

  it('keeps an automatic refresh silent when it succeeds', async () => {
    const { refreshes } = await renderPage({ isStale: true });

    await waitFor(() => {
      expect(refreshes).toHaveLength(1);
    });
    expect(refreshes[0]?.full).toBe(false);
    await frame();
    expect(announcements().textContent).toBe('');
  });

  it('announces a failed refresh, also an automatic one, and the retry a person starts', async () => {
    const attempts = [() => Promise.reject(REFRESH_ERROR)];
    await renderPage({ isStale: true, refresh: () => attempts.shift()?.() ?? Promise.resolve() });

    await announced(`Update failed: ${describeError(REFRESH_ERROR, 'en')} Retry.`);
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toContain(`Update failed: ${describeError(REFRESH_ERROR, 'en')} Retry`);

    fireEvent.click(within(footer).getByRole('button', { name: 'Retry' }));
    await announced('Directory updated.');
    expect(footer.textContent).not.toContain('Update failed');
  });

  it('announces a notice, such as a failed export', async () => {
    await renderPage();

    fireEvent.click(tool('Export to CSV (comma-separated values)'));

    await announced(`Export failed: ${describeError(EXPORT_ERROR, 'en')}`);
    expect(screen.getByRole('contentinfo').textContent).toContain(`Export failed: ${describeError(EXPORT_ERROR, 'en')}`);
  });

  it('shows that an export is being prepared, and says when it is ready', async () => {
    const saving = deferred();
    await renderPage({ exportResult: () => saving.promise });

    fireEvent.click(tool('Export to CSV (comma-separated values)'));

    await announced('Preparing the export...');
    expect((tool('Preparing the export...') as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => {
      expect(screen.getByRole('contentinfo').textContent).toContain('Preparing the export... 1,234');
    });

    await act(async () => {
      saving.resolve();
      await saving.promise;
    });

    await announced('The export is ready.');
    expect((tool('Export to CSV (comma-separated values)') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('contentinfo').textContent).not.toContain('Preparing the export');
  });

  it('starts with a link that skips to the card in the tab order', async () => {
    await renderPage();
    const link = screen.getByRole('link', { name: 'Skip to chart' });
    expect(document.querySelector('a, button, input, [tabindex]')).toBe(link);
    fireEvent.click(card('Lead'));
    scrollTo.mockClear();

    const followed = fireEvent.click(link);

    expect(followed).toBe(false);
    expect(document.activeElement).toBe(card('Lead'));
    expect(scrollTo).toHaveBeenCalled();
  });

  it('keeps the toolbar to one Tab stop and moves inside it with the arrow keys', async () => {
    await renderPage();
    const stops = () => within(screen.getByRole('toolbar')).getAllByRole('button').filter((button) => button.tabIndex === 0);
    expect(stops()).toEqual([tool('Expand all')]);

    act(() => {
      tool('Expand all').focus();
    });
    fireEvent.keyDown(tool('Expand all'), { key: 'ArrowLeft' });

    expect(document.activeElement).toBe(tool('Help'));
    expect(stops()).toEqual([tool('Help')]);
  });

  it('folds back to the top persons at 100% with Collapse all, whatever the zoom was', async () => {
    await renderPage();
    expect(card('Lead')).toBeTruthy();

    fireEvent.click(tool('Zoom out'));
    await waitFor(() => {
      expect(tool(/^Zoom \d+ percent/).getAttribute('aria-label')).toBe('Zoom 83 percent. Reset zoom');
    });
    fireEvent.click(tool('Collapse all'));

    expect(tool(/^Zoom \d+ percent/).getAttribute('aria-label')).toBe('Zoom 100 percent. Reset zoom');
    expect(screen.queryByRole('treeitem', { name: 'Lead' })).toBeNull();
    expect(card('Ceo').getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the zoom level\'s action as a tooltip instead of a native title', async () => {
    await renderPage();
    const reset = tool('Zoom 100 percent. Reset zoom');
    expect(reset.hasAttribute('title')).toBe(false);

    fireEvent.pointerEnter(reset, { pointerType: 'mouse' });

    expect(reset.textContent).toBe('100%Reset zoom');
  });

  it('closes the details with Escape from the toolbar without moving focus, after the tooltip', async () => {
    await renderPage();
    fireEvent.click(card('Lead'));
    tabTo(tool('Expand all'));
    expect(tool('Expand all').textContent).toBe('Expand all');

    fireEvent.keyDown(tool('Expand all'), { key: 'Escape' });
    expect(tool('Expand all').textContent).toBe('');
    expect(screen.getByRole('complementary')).toBeTruthy();

    fireEvent.keyDown(tool('Expand all'), { key: 'Escape' });
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(document.activeElement).toBe(tool('Expand all'));
  });

  it('returns focus to the card when the details are closed from inside the panel or from nowhere', async () => {
    await renderPage();
    fireEvent.click(card('Lead'));
    const close = within(screen.getByRole('complementary')).getByRole('button', { name: /Close/ });
    act(() => {
      close.focus();
    });

    fireEvent.keyDown(close, { key: 'Escape' });
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(document.activeElement).toBe(card('Lead'));

    fireEvent.click(card('Dev'));
    act(() => {
      card('Lead').blur();
    });
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: /Close/ }));
    expect(document.activeElement).toBe(card('Dev'));
  });

  it('explains in the details who the manager the chart leaves out is, asking with the chart\'s own options', async () => {
    const boss = makeEmployee('boss', 'ceo', { displayName: 'Bo Sund', accountEnabled: false });
    const { sent } = await renderPage({
      settings: settingsFor({ topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, disabledAccounts: true } }),
      employees: [makeEmployee('ceo'), boss, makeEmployee('analyst', 'boss')],
      answer: (request) =>
        request instanceof GetRecordedManagerQuery ? Promise.resolve({ manager: boss, reason: 'disabledAccounts' }) : undefined,
    });

    fireEvent.click(card('Analyst'));

    expect(await screen.findByText('Hidden by the filters: Disabled accounts')).toBeTruthy();
    const asked = sent.filter((request) => request instanceof GetRecordedManagerQuery);
    expect(asked.map(({ employeeId }) => employeeId)).toEqual(['analyst']);
    expect(asked[0]?.options).toBe(sent.find((request) => request instanceof GetOrgChartQuery)?.options);
  });

  it('goes from a card to the search field with \'/\', which opens the field\'s list as any focus does', async () => {
    const dev: EmployeeSearchHit = {
      employee: EMPLOYEES[2] ?? makeEmployee('dev'),
      matchedFields: [],
      matchedExtraFields: [],
      path: ['ceo', 'lead'],
      managerName: 'Lead',
    };
    await renderPage({
      answer: (request) =>
        request instanceof GetRecentPeopleQuery ? Promise.resolve({ you: dev, yourManager: null, recent: [] }) : undefined,
    });
    act(() => {
      card('Lead').focus();
    });

    fireEvent.keyDown(card('Lead'), { key: '/' });

    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Search' }));
    expect(await screen.findByRole('group', { name: 'You' })).toBeTruthy();
  });

  it('announces what \'*\' unfolded beside a card, which keeps the focus', async () => {
    await renderPage({ employees: [...EMPLOYEES, makeEmployee('aide', 'ceo'), makeEmployee('intern', 'aide')] });
    act(() => {
      card('Lead').focus();
    });

    fireEvent.keyDown(card('Lead'), { key: '*' });
    await announced('Unfolded 2 teams.');
    expect(card('Dev')).toBeTruthy();
    expect(card('Intern')).toBeTruthy();
    expect(document.activeElement).toBe(card('Lead'));

    fireEvent.keyDown(card('Lead'), { key: '*' });
    await announced('No teams to unfold at this level.');
  });

  it('says when \'*\' kept a team folded, as Expand all does, to keep the page responsive', async () => {
    const leads = Array.from({ length: 50 }, (_, index) => `lead${String(index)}`);
    const crowded = [
      makeEmployee('ceo'),
      makeEmployee('big', 'ceo'),
      makeEmployee('small', 'ceo'),
      makeEmployee('helper', 'small'),
      ...leads.flatMap((lead) => [
        makeEmployee(lead, 'big'),
        ...Array.from({ length: 50 }, (_, index) => makeEmployee(`${lead}dev${String(index)}`, lead)),
      ]),
    ];
    // A view saved with Big's leads unfolded, whose teams unfolding Big would bring back: fifty pages of fifty people.
    const view: ChartView = { depth: 1, toggled: leads.map((lead) => [lead, true]), selectedId: null, currentId: null };
    await renderPage({
      employees: crowded,
      answer: (request) => (request instanceof GetSavedViewQuery ? Promise.resolve(view) : undefined),
    });
    act(() => {
      card('Small').focus();
    });

    fireEvent.keyDown(card('Small'), { key: '*' });

    await announced('Unfolded 1 of 2 teams to keep the page responsive.');
    expect(card('Big').getAttribute('aria-expanded')).toBe('false');
  });

  it('announces whose details are shown, unless the panel took the focus itself', async () => {
    await renderPage();

    fireEvent.click(card('Ceo'));
    await announced('Details for Ceo shown');
    fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: /Lead/ }));
    await announced('Details for Lead shown');

    // The outline's sheet takes the focus for a person opened from the chart, which screen readers report.
    screen.getByRole('tree').style.setProperty('--layout', 'outline');
    act(() => {
      card('Ceo').focus();
    });
    fireEvent.click(card('Ceo'));
    for (let frames = 0; frames < 3; frames++) await frame();
    expect(document.activeElement).toBe(within(screen.getByRole('complementary')).getByRole('heading', { level: 2 }));
    expect(announcements().textContent).toBe('Details for Lead shown');
  });

  describe('the signed-in user', () => {
    const DEV: SignedInUser = { id: 'dev', displayName: 'Dev', userPrincipalName: 'dev@contoso.com', isGuest: false };
    const profile = () => screen.findByRole('button', { name: /^Signed in as / });

    it('stands beside Sign out and opens the user\'s own card and details', async () => {
      await renderPage({ canSignOut: true, signedInUser: DEV });

      const button = await profile();
      expect(button.getAttribute('aria-label')).toBe('Signed in as Dev (dev@contoso.com). Show me in the chart');
      expect(button.nextElementSibling).toBe(tool('Sign out'));
      fireEvent.click(button);

      expect(screen.getByRole('complementary', { name: 'Details for Dev' })).toBeTruthy();
      await announced('Details for Dev shown');
    });

    it('announces the details in the outline too, where the sheet leaves the focus alone', async () => {
      await renderPage({ canSignOut: true, signedInUser: DEV });
      screen.getByRole('tree').style.setProperty('--layout', 'outline');

      const button = await profile();
      act(() => {
        button.focus();
      });
      fireEvent.click(button);

      await announced('Details for Dev shown');
      expect(screen.getByRole('complementary').contains(document.activeElement)).toBe(false);
    });

    it('tells a user whom the chart leaves out that they are not shown', async () => {
      const away: SignedInUser = { id: 'away', displayName: 'Away', userPrincipalName: 'away@contoso.com', isGuest: false };
      await renderPage({ canSignOut: true, signedInUser: away });

      fireEvent.click(await profile());

      expect(screen.getByRole('contentinfo').textContent).toContain('You are not shown in this chart.');
      await announced('You are not shown in this chart.');
      expect(screen.queryByRole('complementary')).toBeNull();
    });

    it('is absent where the page cannot sign out: demo data, Teams and embedding pages', async () => {
      await renderPage({ signedInUser: DEV });

      expect(screen.queryByRole('button', { name: /^Signed in as / })).toBeNull();
      expect(within(screen.getByRole('toolbar')).queryByRole('button', { name: 'Sign out' })).toBeNull();
    });
  });

  describe('the settings', () => {
    const GUEST = makeEmployee('guest', 'ceo', { isGuest: true });
    const HIDING_GUESTS = settingsFor({ topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, guests: true } });
    const openSettings = () => {
      act(() => {
        tool('Settings').focus();
      });
      fireEvent.click(tool('Settings'));
      return screen.getByRole('dialog', { name: 'Settings' });
    };
    const footer = () => screen.getByRole('contentinfo').textContent;
    /** The Filters section's live region, which says the count a change leads to; About has one of its own. */
    const countRegion = (dialog: HTMLElement) => within(within(dialog).getByRole('region', { name: 'Filters' })).getByRole('status');

    it('open as a dialog from the toolbar, which is not part of the toolbar\'s arrow keys, and hand the focus back', async () => {
      await renderPage();
      expect(tool('Settings').getAttribute('aria-haspopup')).toBe('dialog');

      const dialog = openSettings();
      expect(screen.getByRole('toolbar').contains(dialog)).toBe(false);
      expect(dialog.contains(document.activeElement)).toBe(true);

      fireEvent.click(within(dialog).getByRole('button', { name: 'Close settings' }));
      expect(screen.queryByRole('checkbox')).toBeNull();
      expect(document.activeElement).toBe(tool('Settings'));
    });

    it('change who is in the chart at once, say so beside the count, and are remembered', async () => {
      const { sent } = await renderPage({ settings: HIDING_GUESTS, employees: [...EMPLOYEES, GUEST] });
      expect(footer()).toContain('3 people');
      expect(footer()).not.toContain('Filters changed');

      const dialog = openSettings();
      expect(within(dialog).getByText('3 people in the chart')).toBeTruthy();
      expect(countRegion(dialog).textContent).toBe('');
      fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Guests' }));

      await waitFor(() => {
        expect(countRegion(dialog).textContent).toBe('4 people in the chart');
      });
      expect(card('Guest')).toBeTruthy();
      expect(footer()).toContain('4 people');
      expect(footer()).toContain('Filters changed: also showing guests.');
      const saved = sent.filter((request) => request instanceof SaveUserSettingsCommand);
      expect(saved.map(({ settings }) => settings.hide.guests)).toEqual([false]);

      fireEvent.click(within(dialog).getByRole('button', { name: 'Reset filters' }));
      await waitFor(() => {
        expect(footer()).toContain('3 people');
      });
      expect(footer()).not.toContain('Filters changed');
      expect(screen.queryByRole('treeitem', { name: 'Guest' })).toBeNull();
    });

    it('say how many people each filter hides or shows, asking with the chart\'s options and only while they are open', async () => {
      const effects: FilterEffects = { withoutManager: 0, withHiddenManager: 0, inManagerCycle: 0, disabledAccounts: 2, guests: 1 };
      const { sent } = await renderPage({
        settings: HIDING_GUESTS,
        employees: [...EMPLOYEES, GUEST],
        answer: (request) => (request instanceof GetFilterEffectsQuery ? Promise.resolve(effects) : undefined),
      });
      const asked = () => sent.filter((request) => request instanceof GetFilterEffectsQuery);
      expect(asked()).toEqual([]);

      const dialog = openSettings();
      expect(await within(dialog).findByRole('checkbox', { name: 'Guests, 1 hidden' })).toBeTruthy();
      expect(within(dialog).getByRole('checkbox', { name: 'Disabled accounts, 2 shown' })).toBeTruthy();
      expect(asked()[0]?.options).toBe(sent.filter((request) => request instanceof GetOrgChartQuery).at(-1)?.options);
      // The count of people is said only when a filter changes it.
      expect(countRegion(dialog).textContent).toBe('');

      fireEvent.click(within(dialog).getByRole('button', { name: 'Close settings' }));
      const askedWhileOpen = asked().length;
      const charts = () => sent.filter((request) => request instanceof GetOrgChartQuery).length;
      const chartsBefore = charts();
      // A new chart, which Settings would count again.
      fireEvent.click(tool('Reload from the directory'));
      await waitFor(() => {
        expect(charts()).toBeGreaterThan(chartsBefore);
      });
      await frame();
      expect(asked()).toHaveLength(askedWhileOpen);

      expect(await within(openSettings()).findByRole('checkbox', { name: 'Guests, 1 hidden' })).toBeTruthy();
      expect(asked().length).toBeGreaterThan(askedWhileOpen);
    });

    it('count again when a refresh brings a new chart while they are open', async () => {
      const refreshing = deferred();
      const { sent } = await renderPage({
        isStale: true,
        refresh: () => refreshing.promise,
        answer: (request) => (request instanceof GetFilterEffectsQuery ? Promise.resolve({ guests: 1 }) : undefined),
      });
      const asked = () => sent.filter((request) => request instanceof GetFilterEffectsQuery);
      openSettings();
      await waitFor(() => {
        expect(asked()).toHaveLength(1);
      });

      await act(async () => {
        refreshing.resolve();
        await refreshing.promise;
      });

      await waitFor(() => {
        expect(asked()).toHaveLength(2);
      });
    });

    it('leave the filters without numbers where they could not be counted', async () => {
      const { sent } = await renderPage({
        settings: HIDING_GUESTS,
        employees: [...EMPLOYEES, GUEST],
        answer: (request) => (request instanceof GetFilterEffectsQuery ? Promise.reject(new Error('Out of memory.')) : undefined),
      });

      const dialog = openSettings();
      await waitFor(() => {
        expect(sent.some((request) => request instanceof GetFilterEffectsQuery)).toBe(true);
      });
      await frame();
      expect(within(dialog).getByRole('checkbox', { name: 'Guests' })).toBeTruthy();
      expect(within(dialog).getByText('3 people in the chart')).toBeTruthy();
    });

    it('export and search the chart that the filters leave', async () => {
      const { sent } = await renderPage({ settings: HIDING_GUESTS, employees: [...EMPLOYEES, GUEST] });

      fireEvent.click(within(openSettings()).getByRole('checkbox', { name: 'Guests' }));
      await waitFor(() => {
        expect(footer()).toContain('4 people');
      });
      fireEvent.click(tool('Export to CSV (comma-separated values)'));

      const exported = sent.find((request) => request instanceof ExportEmployeesCommand);
      expect(exported?.options.hide.guests).toBe(false);
    });

    it('start from the rules of the link that opened the chart, and reset to config.json\'s', async () => {
      const shown = settingsFor({ topPersons: ['ceo'], hide: SHOW_EVERYONE }, null, { ...SHOW_EVERYONE, guests: true });
      await renderPage({ settings: shown, employees: [...EMPLOYEES, GUEST] });
      expect(footer()).toContain('4 people');
      expect(footer()).toContain('Filters changed: also showing guests.');

      const dialog = openSettings();
      expect(within(dialog).getByRole<HTMLInputElement>('checkbox', { name: 'Guests' }).checked).toBe(true);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Reset filters' }));

      await waitFor(() => {
        expect(footer()).toContain('3 people');
      });
      expect(footer()).not.toContain('Filters changed');
    });

    it('close the details of a person the filters take out of the chart, and keep a card in the tab order', async () => {
      const showing = settingsFor({ topPersons: ['ceo'], hide: SHOW_EVERYONE });
      await renderPage({ settings: showing, employees: [...EMPLOYEES, GUEST] });
      fireEvent.click(card('Guest'));
      expect(screen.getByRole('complementary', { name: 'Details for Guest' })).toBeTruthy();

      fireEvent.click(within(openSettings()).getByRole('checkbox', { name: 'Guests' }));

      await waitFor(() => {
        expect(screen.queryByRole('complementary')).toBeNull();
        expect(screen.getAllByRole('treeitem').filter((item) => item.tabIndex === 0)).toEqual([card('Ceo')]);
      });
    });

    it('add the level to the cards and the open details at once, keep the reporting line, and are remembered', async () => {
      const { sent } = await renderPage();
      fireEvent.click(card('Lead'));
      const details = within(screen.getByRole('complementary', { name: 'Details for Lead' }));
      expect(screen.getByRole('tree').textContent).not.toContain('Level');
      expect(card('Lead').getAttribute('aria-level')).toBe('2');
      expect(details.getByText('Reporting line')).toBeTruthy();
      const chartsLoaded = () => sent.filter((request) => request instanceof GetOrgChartQuery).length;
      const loaded = chartsLoaded();

      const dialog = openSettings();
      expect(within(dialog).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
        'Filters',
        'Display',
        'Reports',
      ]);
      const box = within(dialog).getByRole<HTMLInputElement>('checkbox', { name: "Show each person's level" });
      expect(box.checked).toBe(false);
      fireEvent.click(box);

      expect(box.checked).toBe(true);
      expect(card('Lead').textContent).toContain('Level 2');
      expect(details.getByText('Level 2')).toBeTruthy();
      expect(details.queryByText('Reporting line')).toBeNull();
      expect(details.getByRole('list', { name: 'Reporting line' }).textContent).toBe('Ceo›Lead');
      const saved = sent.filter((request) => request instanceof SaveUserSettingsCommand);
      expect(saved.map(({ settings }) => settings)).toEqual([
        {
          hide: SHOW_EVERYONE,
          showLevels: true,
          language: 'auto',
          team: null,
          startAt: 'top',
          theme: 'auto',
          textSize: 'standard',
        },
      ]);
      // The filters are the same object, so the chart is not asked for again.
      expect(chartsLoaded()).toBe(loaded);
      expect(footer()).not.toContain('Filters changed');

      fireEvent.click(box);
      expect(screen.getByRole('tree').textContent).not.toContain('Level');
      expect(details.getByText('Reporting line')).toBeTruthy();
    });

    it('keep the filters when the level changes, and the level when the filters change', async () => {
      const { sent } = await renderPage({ settings: HIDING_GUESTS, employees: [...EMPLOYEES, GUEST] });
      const dialog = openSettings();
      const lastSaved = () => sent.filter((request) => request instanceof SaveUserSettingsCommand).at(-1)?.settings;

      fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Guests' }));
      await waitFor(() => {
        expect(footer()).toContain('4 people');
      });
      fireEvent.click(within(dialog).getByRole('checkbox', { name: "Show each person's level" }));

      expect(lastSaved()).toEqual({
        hide: { ...SHOW_EVERYONE, guests: false },
        showLevels: true,
        language: 'auto',
        team: null,
        startAt: 'top',
        theme: 'auto',
        textSize: 'standard',
      });

      fireEvent.click(within(dialog).getByRole('button', { name: 'Reset filters' }));
      await waitFor(() => {
        expect(footer()).toContain('3 people');
      });
      expect(lastSaved()).toEqual({
        hide: { ...SHOW_EVERYONE, guests: true },
        showLevels: true,
        language: 'auto',
        team: null,
        startAt: 'top',
        theme: 'auto',
        textSize: 'standard',
      });
      expect(card('Ceo').textContent).toContain('Level 1');
    });

    it('open with levels where config.json or the person\'s browser switched them on', async () => {
      await renderPage({ settings: { ...SETTINGS, chart: { ...SETTINGS.chart, showLevels: true } } });
      expect(card('Lead').textContent).toContain('Level 2');

      fireEvent.click(card('Lead'));
      expect(within(screen.getByRole('complementary')).getByText('Level 2')).toBeTruthy();
      expect(within(openSettings()).getByRole<HTMLInputElement>('checkbox', { name: "Show each person's level" }).checked).toBe(true);
    });

    it('offer the account too, for the narrow header that has no room for the profile and Sign out', async () => {
      const DEV: SignedInUser = { id: 'dev', displayName: 'Dev', userPrincipalName: 'dev@contoso.com', isGuest: false };
      const { sent } = await renderPage({ canSignOut: true, signedInUser: DEV });
      await screen.findByRole('button', { name: /^Signed in as / });

      const dialog = openSettings();
      expect(within(dialog).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
        'Filters',
        'Display',
        'Account',
        'Reports',
      ]);
      const account = within(dialog).getByRole('region', { name: 'Account' });
      expect(account.textContent).toContain('dev@contoso.com');
      fireEvent.click(within(account).getByRole('button', { name: 'Show me in the chart' }));

      expect(screen.queryByRole('region', { name: 'Account' })).toBeNull();
      expect(screen.getByRole('complementary', { name: 'Details for Dev' })).toBeTruthy();
      expect(document.activeElement).toBe(card('Dev'));

      fireEvent.click(within(within(openSettings()).getByRole('region', { name: 'Account' })).getByRole('button', { name: 'Sign out' }));
      expect(sent.some((request) => request instanceof SignOutCommand)).toBe(true);
    });

    it('say who is signed in and lead to a new profile photo in Teams and embedding pages too, without Sign out', async () => {
      const DEV: SignedInUser = { id: 'dev', displayName: 'Dev', userPrincipalName: 'dev@contoso.com', isGuest: false };
      await renderPage({ signedInUser: DEV });

      const section = within(await within(openSettings()).findByRole('region', { name: 'Account' }));
      expect(section.getByRole('link', { name: 'Change profile photo' }).getAttribute('href')).toBe('https://myaccount.microsoft.com/');
      expect(section.getByRole('button', { name: 'Show me in the chart' })).toBeTruthy();
      expect(section.queryByRole('button', { name: 'Sign out' })).toBeNull();
    });

    it('have no account section where nobody is signed in and the page has nothing to sign out of or forget', async () => {
      await renderPage();

      expect(within(openSettings()).queryByRole('region', { name: 'Account' })).toBeNull();
    });

    it('offer to forget this browser\'s copy where the host page owns the sign-in, closing first, and not beside Sign out', async () => {
      const { sent } = await renderPage({ host: 'teams', canForget: true });
      const forgets = () => sent.filter((request) => request instanceof ForgetBrowserCopyCommand);

      const account = within(within(openSettings()).getByRole('region', { name: 'Account' }));
      expect(account.queryByRole('button', { name: 'Sign out' })).toBeNull();
      fireEvent.click(account.getByRole('button', { name: "Forget this browser's copy" }));

      expect(screen.queryByRole('region', { name: 'Account' })).toBeNull();
      expect(document.activeElement).toBe(tool('Settings'));
      expect(forgets()).toHaveLength(1);
      cleanup();

      await renderPage({ canSignOut: true });
      const standalone = within(within(openSettings()).getByRole('region', { name: 'Account' }));
      expect(standalone.getByRole('button', { name: 'Sign out' })).toBeTruthy();
      expect(standalone.queryByRole('button', { name: "Forget this browser's copy" })).toBeNull();
    });

    it('offer nothing to forget in an embedded page that keeps no copy, as with demo data, whose own account stays', async () => {
      const DEMO_YOU: SignedInUser = { id: 'dev', displayName: 'Dev', userPrincipalName: 'dev@contoso.com', isGuest: false };
      await renderPage({ host: 'embedded' });
      expect(within(openSettings()).queryByRole('region', { name: 'Account' })).toBeNull();
      cleanup();

      await renderPage({ host: 'teams', signedInUser: DEMO_YOU });
      const account = within(await within(openSettings()).findByRole('region', { name: 'Account' }));
      expect(account.getByRole('button', { name: 'Show me in the chart' })).toBeTruthy();
      expect(account.queryByRole('button', { name: "Forget this browser's copy" })).toBeNull();
    });

    it('say so when this browser\'s copy could not be forgotten, which leaves the page as it was', async () => {
      await renderPage({
        host: 'embedded',
        canForget: true,
        answer: (request) => (request instanceof ForgetBrowserCopyCommand ? Promise.reject(new Error('The browser refused.')) : undefined),
      });

      fireEvent.click(
        within(within(openSettings()).getByRole('region', { name: 'Account' })).getByRole('button', { name: "Forget this browser's copy" }),
      );

      const notice = `Forgetting this browser's copy failed: ${describeError(new Error(), 'en')}`;
      await announced(notice);
      expect(footer()).toContain(notice);
      expect(card('Ceo')).toBeTruthy();
    });

    it('offer code to embed the chart on its own site only, asked with the person\'s settings and again as they change', async () => {
      const embedding = (request: Request<unknown>) =>
        request instanceof GetEmbedAddressQuery
          ? Promise.resolve(`https://chart.contoso.com/${request.settings.hide.guests ? '' : '?show=guests'}`)
          : undefined;
      const { sent } = await renderPage({ settings: HIDING_GUESTS, employees: [...EMPLOYEES, GUEST], answer: embedding });
      const asked = () => sent.filter((request) => request instanceof GetEmbedAddressQuery);
      expect(asked()).toEqual([]);

      const dialog = openSettings();
      const embed = within(await within(dialog).findByRole('region', { name: 'Embed this chart' }));
      const code = () => embed.getByRole<HTMLTextAreaElement>('textbox', { name: 'Embed code' }).value;
      expect(within(dialog).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
        'Filters',
        'Display',
        'Embed this chart',
        'Reports',
      ]);
      expect(code()).toBe('<iframe src="https://chart.contoso.com/" title="Org" width="100%" height="800" style="border:0"></iframe>');
      expect(asked().at(-1)?.settings.hide.guests).toBe(true);

      fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Guests' }));

      await waitFor(() => {
        expect(code()).toContain('src="https://chart.contoso.com/?show=guests"');
      });
      expect(asked().at(-1)?.settings).toEqual(sent.filter((request) => request instanceof SaveUserSettingsCommand).at(-1)?.settings);
      cleanup();

      // Teams and other pages' iframes have addresses of their own, which the code can't know.
      for (const host of ['teams', 'embedded'] as const) {
        const other = await renderPage({ host, answer: embedding });
        expect(within(openSettings()).queryByRole('region', { name: 'Embed this chart' })).toBeNull();
        expect(other.sent.some((request) => request instanceof GetEmbedAddressQuery)).toBe(false);
        cleanup();
      }
    });

  });

  describe('help', () => {
    const openHelp = () => {
      act(() => {
        tool('Help').focus();
      });
      fireEvent.click(tool('Help'));
      return screen.getByRole('dialog', { name: 'Help' });
    };

    it('opens as a dialog of its own from the toolbar, right after Settings, and hands the focus back', async () => {
      await renderPage();
      const tools = within(screen.getByRole('toolbar')).getAllByRole('button');
      expect(tools.indexOf(tool('Help'))).toBe(tools.indexOf(tool('Settings')) + 1);
      expect(tool('Help').getAttribute('aria-haspopup')).toBe('dialog');

      const dialog = openHelp();
      expect(screen.getByRole('toolbar').contains(dialog)).toBe(false);
      expect(dialog.contains(document.activeElement)).toBe(true);
      expect(within(dialog).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
        'Using the chart',
        'Colours and marks',
        'Your IT support',
        'About this chart',
      ]);

      fireEvent.click(within(dialog).getByRole('button', { name: 'Close help' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(tool('Help'));
    });

    it('says last what IT asks about, counting with the chart\'s options and only while it is open', async () => {
      const diagnostics: Diagnostics = {
        peopleInDirectory: 1234,
        peopleInChart: 3,
        loadedAt: new Date(2026, 8, 30, 9, 0),
        topPersonsFound: 1,
        topPersonsMissing: 0,
        directory: { fullReadAt: new Date(2026, 8, 29, 14, 3), tracksChanges: true, browserCopy: 'kept' },
      };
      const { sent } = await renderPage({
        host: 'teams',
        answer: (request) => (request instanceof GetDiagnosticsQuery ? Promise.resolve(diagnostics) : undefined),
      });
      const asked = () => sent.filter((request) => request instanceof GetDiagnosticsQuery);
      fireEvent.click(tool('Settings'));
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Settings' })).getByRole('button', { name: 'Close settings' }));
      expect(asked()).toEqual([]);

      const dialog = openHelp();
      const sections = within(dialog).getAllByRole('region');
      const about = within(sections.at(-1) as HTMLElement);
      expect(about.getByRole('heading', { level: 3 }).textContent).toBe('About this chart');
      expect(about.getByText('1.0.42')).toBeTruthy();
      expect(about.getByText('Microsoft Teams')).toBeTruthy();
      expect(await about.findByText('1,234')).toBeTruthy();
      expect(asked()[0]?.options).toBe(sent.filter((request) => request instanceof GetOrgChartQuery).at(-1)?.options);

      fireEvent.click(within(dialog).getByRole('button', { name: 'Close help' }));
      const askedWhileOpen = asked().length;
      const charts = () => sent.filter((request) => request instanceof GetOrgChartQuery).length;
      const chartsBefore = charts();
      fireEvent.click(tool('Reload from the directory'));
      await waitFor(() => {
        expect(charts()).toBeGreaterThan(chartsBefore);
      });
      await frame();
      expect(asked()).toHaveLength(askedWhileOpen);
    });
  });

  describe('the directory health report', () => {
    /** Someone the default filters hide, for having no manager while the chart has a top person. */
    const STRAY = makeEmployee('stray', null);
    const HIDING_STRAYS = settingsFor({ topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, withoutManager: true } });
    const openReport = () => {
      act(() => {
        tool('Settings').focus();
      });
      fireEvent.click(tool('Settings'));
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Settings' })).getByRole('button', { name: 'Directory health' }));
      return screen.getByRole('dialog', { name: 'Directory health' });
    };
    /** Shows the people of an issue, and shows one of them in the chart. */
    const showInChart = async (report: HTMLElement, issue: RegExp, name: string) => {
      fireEvent.click(await within(report).findByRole('button', { name: issue }));
      fireEvent.click(within(report).getByRole('button', { name }));
    };

    it('opens from Reports in Settings, which closes first, and hands the focus back to the cog as it closes', async () => {
      const employees = [...EMPLOYEES, STRAY];
      await renderPage({ settings: HIDING_STRAYS, employees, answer: reporting(employees) });

      const report = openReport();

      expect(screen.queryByRole('region', { name: 'Filters' })).toBeNull();
      expect(report.contains(document.activeElement)).toBe(true);
      expect(await within(report).findByText(/^4 people checked/)).toBeTruthy();
      fireEvent.click(within(report).getByRole('button', { name: 'Close directory health' }));
      expect(screen.queryByText(/^4 people checked/)).toBeNull();
      expect(document.activeElement).toBe(tool('Settings'));
    });

    it('is not offered where config.json switches it off', async () => {
      const { sent } = await renderPage({ settings: { ...SETTINGS, allowReports: false } });

      fireEvent.click(tool('Settings'));

      expect(screen.queryByRole('region', { name: 'Reports' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Directory health' })).toBeNull();
      expect(sent.some((request) => request instanceof GetDirectoryHealthQuery)).toBe(false);
    });

    it('shows someone a filter hides in the chart: it shows their group, reveals them with their details, and says so', async () => {
      const employees = [...EMPLOYEES, STRAY];
      const { sent } = await renderPage({ settings: HIDING_STRAYS, employees, answer: reporting(employees) });
      expect(screen.queryByRole('treeitem', { name: 'Stray' })).toBeNull();

      await showInChart(openReport(), /^No manager set, 1 person/, 'Stray');

      await announced('Details for Stray shown. Filters changed: also showing people without a manager.');
      expect(document.activeElement).toBe(card('Stray'));
      expect(screen.getByRole('complementary', { name: 'Details for Stray' })).toBeTruthy();
      expect(screen.queryByText(/^4 people checked/)).toBeNull();
      const saved = sent.filter((request) => request instanceof SaveUserSettingsCommand).map(({ settings }) => settings.hide);
      expect(saved).toEqual([SHOW_EVERYONE]);
      expect(screen.getByRole('contentinfo').textContent).toContain('Filters changed: also showing people without a manager.');
    });

    it('reveals someone the chart shows past the first page of a long team, with the page that holds them', async () => {
      const agents = Array.from({ length: 60 }, (_, index) =>
        makeEmployee(`agent${String(index).padStart(2, '0')}`, 'ceo', index === 57 ? { jobTitle: null } : {}),
      );
      const employees = [makeEmployee('ceo'), ...agents];
      const { sent } = await renderPage({ employees, answer: reporting(employees) });
      expect(screen.queryByRole('treeitem', { name: 'Agent57' })).toBeNull();

      await showInChart(openReport(), /^No job title, 1 person/, 'Agent57');

      expect(document.activeElement).toBe(card('Agent57'));
      expect(screen.getByRole('complementary', { name: 'Details for Agent57' })).toBeTruthy();
      // Shown already, so the filters stay as they were and no rules are asked for.
      expect(sent.some((request) => request instanceof SaveUserSettingsCommand)).toBe(false);
      expect(sent.some((request) => request instanceof GetRulesShowingQuery)).toBe(false);
    });

    it('says so where no filters show the person any more, as after a refresh took them away', async () => {
      const employees = [...EMPLOYEES, STRAY];
      const later = reporting(EMPLOYEES);
      const reported = reporting(employees);
      await renderPage({
        settings: HIDING_STRAYS,
        employees,
        // The report was made before the refresh; the rules are asked of the directory after it.
        answer: (request) => (request instanceof GetRulesShowingQuery ? later(request) : reported(request)),
      });

      await showInChart(openReport(), /^No manager set, 1 person/, 'Stray');

      await announced('Stray could not be shown in this chart.');
      expect(screen.getByRole('contentinfo').textContent).toContain('Stray could not be shown in this chart.');
    });
  });

  describe('one team alone', () => {
    /** The lead's team of three is smaller than the chart of five, which has the CEO's aide too. */
    const COMPANY = [
      makeEmployee('ceo'),
      makeEmployee('lead', 'ceo'),
      makeEmployee('dev', 'lead'),
      makeEmployee('tester', 'lead'),
      makeEmployee('aide', 'ceo'),
    ];
    const LEAD: SignedInUser = { id: 'lead', displayName: 'Lead', userPrincipalName: 'lead@contoso.com', isGuest: false };
    /** The chart as a link to the lead's team opens it. */
    const OPENED_ON_LEAD: AppSettings = { ...SETTINGS, chart: { ...SETTINGS.chart, team: 'lead@contoso.com' } };
    const footer = () => screen.getByRole('contentinfo').textContent;
    const details = () => within(screen.getByRole('complementary'));
    const MISSING = 'The person whose team this chart shows was not found or is hidden.';
    /** The bar over a chart that shows one team alone, named by what it says. */
    const teamBar = (name: string | RegExp = /^Showing only /) => screen.queryByRole('region', { name });
    const showEveryoneIn = (bar: HTMLElement | null) => within(bar as HTMLElement).getByRole('button', { name: 'Show everyone' });
    const teams = (sent: readonly Request<unknown>[]) =>
      sent.filter((request) => request instanceof SaveUserSettingsCommand).map(({ settings }) => settings.team);
    const showOnlyLeadsTeam = async () => {
      fireEvent.click(card('Lead'));
      fireEvent.click(details().getByRole('button', { name: 'Show only this team' }));
      await announced("Showing only Lead's team, 3 people.");
    };

    it('narrows the chart, the search and the export to a person\'s team from their details, which stay open', async () => {
      const { sent } = await renderPage({ employees: COMPANY, exportResult: () => Promise.resolve() });

      await showOnlyLeadsTeam();

      expect(screen.queryByRole('treeitem', { name: 'Ceo' })).toBeNull();
      expect(screen.queryByRole('treeitem', { name: 'Aide' })).toBeNull();
      // One level deep, the way a chart with one top person opens.
      expect(card('Lead').getAttribute('aria-expanded')).toBe('true');
      expect([card('Dev'), card('Tester')]).toHaveLength(2);
      expect(screen.getByRole('complementary', { name: 'Details for Lead' })).toBeTruthy();
      // Between the header and the chart, where it is seen first and its button comes right after the toolbar's.
      const bar = teamBar("Showing only Lead's team, 3 people.") as HTMLElement;
      const header = screen.getByRole('toolbar').closest('header') as HTMLElement;
      expect(header.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(bar.compareDocumentPosition(screen.getByRole('main')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(footer()).not.toContain('Showing only');
      expect(teams(sent)).toEqual(['lead@contoso.com']);
      fireEvent.change(screen.getByRole('combobox', { name: 'Search' }), { target: { value: 'dev' } });
      await waitFor(() => {
        expect(sent.some((request) => request instanceof SearchEmployeesQuery)).toBe(true);
      });
      fireEvent.click(tool('Export to CSV (comma-separated values)'));
      const narrowed = sent.filter((request) => request instanceof GetOrgChartQuery).at(-1)?.options;
      expect(narrowed?.topPersons).toEqual(['lead@contoso.com']);
      expect(sent.find((request) => request instanceof SearchEmployeesQuery)?.options).toBe(narrowed);
      expect(sent.find((request) => request instanceof ExportEmployeesCommand)?.options).toBe(narrowed);
    });

    it('opens a team\'s chart at 100%, whatever zoom the person set before', async () => {
      await renderPage({ employees: COMPANY });
      const zoomLevel = () => tool(/^Zoom \d+ percent/).getAttribute('aria-label');
      fireEvent.click(tool('Zoom out'));
      await waitFor(() => {
        expect(zoomLevel()).toBe('Zoom 83 percent. Reset zoom');
      });

      await showOnlyLeadsTeam();

      expect(zoomLevel()).toBe('Zoom 100 percent. Reset zoom');
    });

    it('keeps the focus on the button in the details, which says Show everyone in the team\'s chart', async () => {
      await renderPage({ employees: COMPANY });
      fireEvent.click(card('Lead'));
      const button = details().getByRole('button', { name: 'Show only this team' });
      act(() => {
        button.focus();
      });

      fireEvent.click(button);
      await announced("Showing only Lead's team, 3 people.");

      expect(button.textContent).toBe('Show everyone');
      expect(document.activeElement).toBe(button);
      fireEvent.click(button);
      await announced('Showing everyone, 5 people.');
      expect(button.textContent).toBe('Show only this team');
      // Back among everyone, the head is revealed, as the details' other links reveal people.
      expect(document.activeElement).toBe(card('Lead'));
    });

    it('shows everyone again from the team\'s bar, revealing the former head with their details', async () => {
      const { sent } = await renderPage({ employees: COMPANY });
      await showOnlyLeadsTeam();
      fireEvent.click(card('Dev'));
      const button = showEveryoneIn(teamBar());
      act(() => {
        button.focus();
      });

      fireEvent.click(button);

      await announced('Showing everyone, 5 people.');
      expect([card('Ceo'), card('Aide')]).toHaveLength(2);
      expect(screen.getByRole('complementary', { name: 'Details for Lead' })).toBeTruthy();
      // The bar goes with its button, and the head's card takes the focus.
      expect(teamBar()).toBeNull();
      expect(document.activeElement).toBe(card('Lead'));
      expect(teams(sent)).toEqual(['lead@contoso.com', null]);
      // The team's own announcement stands: the details that come with it are not announced on top.
      await frame();
      expect(announcements().textContent).toBe('Showing everyone, 5 people.');
    });

    it('goes back from the logo in another page\'s iframe to the chart as it opened, with everyone, folded and without details', async () => {
      const { sent } = await renderPage({ employees: COMPANY, host: 'embedded' });
      await showOnlyLeadsTeam();

      fireEvent.click(screen.getByRole('button', { name: 'Org' }));

      await waitFor(() => {
        expect(card('Ceo')).toBeTruthy();
      });
      expect(card('Lead').getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByRole('complementary')).toBeNull();
      expect(teams(sent)).toEqual(['lead@contoso.com', null]);
    });

    it('opens on the team a link names, which the logo in another page\'s iframe goes back to after Show everyone', async () => {
      await renderPage({ settings: OPENED_ON_LEAD, employees: COMPANY, host: 'embedded' });
      expect(screen.queryByRole('treeitem', { name: 'Ceo' })).toBeNull();

      fireEvent.click(showEveryoneIn(teamBar("Showing only Lead's team, 3 people.")));
      await announced('Showing everyone, 5 people.');
      fireEvent.click(screen.getByRole('button', { name: 'Org' }));

      await waitFor(() => {
        expect(screen.queryByRole('treeitem', { name: 'Ceo' })).toBeNull();
      });
      expect(card('Lead').getAttribute('aria-expanded')).toBe('true');
      expect(screen.queryByRole('complementary')).toBeNull();
    });

    it('shows no logo or title in Teams, which names the app itself, and keeps the search and the tools', async () => {
      await renderPage({ employees: COMPANY, host: 'teams' });

      expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Org' })).toBeNull();
      expect(screen.getByRole('combobox', { name: 'Search' })).toBeTruthy();
      expect(tool('Settings')).toBeTruthy();
      // The header's first child is then the search, which the narrow layout and the paper treat as the brand's stand-in.
      const header = screen.getByRole('toolbar').closest('header') as HTMLElement;
      expect(header.firstElementChild).toBe(screen.getByRole('combobox', { name: 'Search' }).closest('header > *'));
      expect(header.className).toMatch(/headerWithoutBrand/);
      cleanup();

      await renderPage({ employees: COMPANY, host: 'embedded' });
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Org');
      expect(screen.getByRole('button', { name: 'Org' })).toBeTruthy();
    });

    it('leaves out the logo and title, the search, the toolbar or the status bar, as the embedding page asks', async () => {
      mountPage({ settings: { ...SETTINGS, without: ['logo', 'search'] }, employees: COMPANY, host: 'sharepoint' });
      await screen.findByRole('tree');
      expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
      expect(screen.queryByRole('combobox', { name: 'Search' })).toBeNull();
      // The toolbar is then the header's first child, which the narrow layout and the paper treat as the brand's stand-in.
      expect(screen.getByRole('toolbar').closest('header')?.className).toMatch(/headerWithoutBrand/);
      expect(screen.getByRole('contentinfo').textContent).not.toBe('');
      cleanup();

      mountPage({ settings: { ...SETTINGS, without: ['toolbar', 'statusBar'] }, employees: COMPANY, host: 'sharepoint' });
      await screen.findByRole('tree');
      expect(screen.queryByRole('toolbar')).toBeNull();
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Org');
      expect(screen.getByRole('combobox', { name: 'Search' })).toBeTruthy();
      expect(screen.getByRole('contentinfo').textContent).toBe('');
    });

    it('keeps no header, nor the link that skips it, where the embedding page leaves out all it holds', async () => {
      mountPage({ settings: { ...SETTINGS, without: ['logo', 'search', 'toolbar'] }, employees: COMPANY, host: 'sharepoint' });
      await screen.findByRole('tree');
      await waitFor(() => {
        expect(screen.getByRole('contentinfo').textContent).not.toBe('');
      });

      expect(screen.queryByRole('banner')).toBeNull();
      expect(screen.queryByRole('link', { name: 'Skip to chart' })).toBeNull();
      // The header's live regions stay, from the first render on.
      expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(3);
    });

    it('brings back the status bar it leaves out while a refresh has failed', async () => {
      const attempts = [() => Promise.reject(REFRESH_ERROR)];
      mountPage({
        settings: { ...SETTINGS, without: ['statusBar'] },
        isStale: true,
        refresh: () => attempts.shift()?.() ?? Promise.resolve(),
      });
      const footer = await screen.findByRole('contentinfo');
      await waitFor(() => {
        expect(footer.textContent).toContain('Update failed');
      });

      fireEvent.click(within(footer).getByRole('button', { name: 'Retry' }));

      await waitFor(() => {
        expect(footer.textContent).toBe('');
      });
    });

    it('warns where the person whose team a link names is missing, and Show everyone forgets that team', async () => {
      const { sent } = await renderPage({
        settings: { ...SETTINGS, chart: { ...SETTINGS.chart, team: 'gone@contoso.com' } },
        employees: COMPANY,
      });
      const bar = teamBar(MISSING);
      expect(bar?.textContent).not.toContain('gone@contoso.com');
      expect(footer()).not.toContain('gone@contoso.com');
      // Under the warning stands the configured chart, never a team named after someone else.
      expect(screen.getAllByRole('treeitem')[0]).toBe(card('Ceo'));
      expect(teamBar()).toBeNull();
      await announced(MISSING);

      fireEvent.click(showEveryoneIn(bar));

      await announced('Showing everyone, 5 people.');
      expect(teamBar(MISSING)).toBeNull();
      expect(teams(sent)).toEqual([null]);
    });

    it('hands the focus to the card in the tab order where Show everyone has no head to reveal, as its button goes', async () => {
      await renderPage({ settings: { ...SETTINGS, chart: { ...SETTINGS.chart, team: 'gone@contoso.com' } }, employees: COMPANY });
      const button = showEveryoneIn(teamBar(MISSING));
      act(() => {
        button.focus();
      });

      fireEvent.click(button);

      await announced('Showing everyone, 5 people.');
      expect(document.activeElement).toBe(card('Ceo'));
      expect(card('Ceo').tabIndex).toBe(0);
    });

    it('stops warning that a link\'s person is missing once the person picks a team that leaves them out', async () => {
      await renderPage({ settings: settingsFor(SETTINGS.chart.options, 'aide@contoso.com'), employees: COMPANY });
      expect(screen.getByRole('complementary', { name: 'Details for Aide' })).toBeTruthy();

      fireEvent.click(card('Lead'));
      fireEvent.click(details().getByRole('button', { name: 'Show only this team' }));
      await announced("Showing only Lead's team, 3 people.");

      expect(footer()).not.toContain('The person in this link is not in the chart.');
    });

    it('offers a signed-in manager Show my team in Settings, which closes them and opens the team with their details', async () => {
      const { sent } = await renderPage({ employees: COMPANY, signedInUser: LEAD });
      const openSettings = () => {
        act(() => {
          tool('Settings').focus();
        });
        fireEvent.click(tool('Settings'));
        return within(screen.getByRole('dialog', { name: 'Settings' }));
      };

      const account = within(await openSettings().findByRole('region', { name: 'Account' }));
      fireEvent.click(account.getByRole('button', { name: 'Show my team' }));

      expect(screen.queryByRole('region', { name: 'Account' })).toBeNull();
      expect(document.activeElement).toBe(tool('Settings'));
      await announced("Showing only Lead's team, 3 people.");
      expect(screen.getByRole('complementary', { name: 'Details for Lead' })).toBeTruthy();
      expect(teamBar("Showing only Lead's team, 3 people.")).toBeTruthy();
      expect(teams(sent)).toEqual(['lead@contoso.com']);
      // The team is on screen already.
      expect(within(openSettings().getByRole('region', { name: 'Account' })).queryByRole('button', { name: 'Show my team' })).toBeNull();
    });

    it('offers no team of their own to someone without direct reports, nor narrowing that would leave nobody out', async () => {
      await renderPage({
        employees: COMPANY,
        signedInUser: { id: 'dev', displayName: 'Dev', userPrincipalName: 'dev@contoso.com', isGuest: false },
      });
      fireEvent.click(tool('Settings'));
      const account = within(await screen.findByRole('region', { name: 'Account' }));
      expect(account.getByRole('button', { name: 'Show me in the chart' })).toBeTruthy();
      expect(account.queryByRole('button', { name: 'Show my team' })).toBeNull();
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close settings' }));

      fireEvent.click(card('Ceo'));
      // The CEO's team is the whole chart.
      expect(details().queryByRole('button', { name: 'Show only this team' })).toBeNull();
    });
  });

  describe('the side panel', () => {
    /** The lead's team of two, and the CEO's aide. */
    const COMPANY = [
      makeEmployee('ceo'),
      makeEmployee('lead', 'ceo'),
      makeEmployee('dev', 'lead'),
      makeEmployee('tester', 'lead'),
      makeEmployee('aide', 'ceo'),
    ];
    /** Fourteen agents under the CEO: more than the twelve suggestions. */
    const AGENTS = [makeEmployee('ceo'), ...Array.from({ length: 14 }, (_, index) => makeEmployee(`agent${String(index)}`, 'ceo'))];
    const panel = () => screen.getByRole('complementary');
    /** The people a list in the panel holds, by their names. */
    const listed = () =>
      within(within(panel()).getByRole('list')).getAllByRole('button').map((row) => document.getElementById(row.getAttribute('aria-labelledby') ?? '')?.textContent);
    const openLeadsTeam = () => {
      fireEvent.click(card('Lead'));
      fireEvent.click(within(panel()).getByRole('button', { name: 'See the whole team' }));
      return screen.getByRole('complementary', { name: "Lead's team" });
    };

    it('lists a manager\'s whole team in place of their details, taking the focus there, and goes back to them', async () => {
      await renderPage({ employees: COMPANY });

      const team = openLeadsTeam();

      expect(document.activeElement).toBe(within(team).getByRole('heading', { level: 2 }));
      expect(listed()).toEqual(['Dev', 'Tester']);
      // The selected card still names the panel it controls, which now lists the card's team.
      expect(card('Lead').getAttribute('aria-controls')).toBe(team.id);
      fireEvent.click(within(team).getByRole('button', { name: 'Back to the details for Lead' }));

      const details = screen.getByRole('complementary', { name: 'Details for Lead' });
      expect(document.activeElement).toBe(within(details).getByRole('button', { name: 'See the whole team' }));
    });

    it('lists the team\'s people in a city from its row, hands the focus back to the row with Back, and leads on to the whole team', async () => {
      await renderPage({
        employees: [
          makeEmployee('ceo'),
          makeEmployee('lead', 'ceo'),
          makeEmployee('dev', 'lead', { city: 'Oslo' }),
          makeEmployee('tester', 'lead', { city: 'Bergen' }),
          makeEmployee('aide', 'ceo'),
        ],
      });
      fireEvent.click(card('Lead'));
      const oslo = () => within(within(panel()).getByRole('list', { name: 'Cities' })).getByRole('button', { name: 'Oslo 1 person' });

      fireEvent.click(oslo());

      const inOslo = screen.getByRole('complementary', { name: "Lead's team in Oslo" });
      expect(document.activeElement).toBe(within(inOslo).getByRole('heading', { level: 2 }));
      expect(listed()).toEqual(['Dev']);
      fireEvent.click(within(inOslo).getByRole('button', { name: 'Back to the details for Lead' }));
      expect(screen.getByRole('complementary', { name: 'Details for Lead' })).toBeTruthy();
      expect(document.activeElement).toBe(oslo());

      fireEvent.click(oslo());
      fireEvent.click(within(panel()).getByRole('button', { name: 'See the whole team' }));

      const team = screen.getByRole('complementary', { name: "Lead's team" });
      expect(document.activeElement).toBe(within(team).getByRole('heading', { level: 2 }));
      expect(listed()).toEqual(['Dev', 'Tester']);
    });

    it('shows a city among the rest on request, lists its people from its row, and comes back to that row with the list still unfolded', async () => {
      await renderPage({
        employees: [
          makeEmployee('ceo'),
          makeEmployee('lead', 'ceo'),
          makeEmployee('dev', 'lead', { city: 'Oslo' }),
          makeEmployee('tester', 'lead', { city: 'Bergen' }),
          makeEmployee('p1', 'lead', { city: 'Paris' }),
          makeEmployee('p2', 'lead', { city: 'Rome' }),
          makeEmployee('p3', 'lead', { city: 'Lima' }),
        ],
      });
      fireEvent.click(card('Lead'));
      const cities = () => within(within(panel()).getByRole('list', { name: 'Cities' }));
      expect(cities().getAllByRole('listitem')).toHaveLength(3);
      fireEvent.click(within(panel()).getByRole('button', { name: 'Show 2 more cities' }));
      expect(cities().getAllByRole('listitem')).toHaveLength(5);

      fireEvent.click(cities().getByRole('button', { name: 'Bergen 1 person' }));

      expect(screen.getByRole('complementary', { name: "Lead's team in Bergen" })).toBeTruthy();
      expect(listed()).toEqual(['Tester']);
      fireEvent.click(within(panel()).getByRole('button', { name: 'Back to the details for Lead' }));

      // The details mount afresh, so the list unfolds again for the row that opened the list.
      expect(document.activeElement).toBe(cities().getByRole('button', { name: 'Bergen 1 person' }));
      expect(cities().getAllByRole('listitem')).toHaveLength(5);
      expect(within(panel()).getByRole('button', { name: 'Show fewer cities' })).toBeTruthy();

      // Another person's lists start folded.
      fireEvent.click(card('Ceo'));
      expect(within(panel()).getByRole('button', { name: 'Show 2 more cities', expanded: false })).toBeTruthy();
    });

    it('opens one of the team with their details, the card taking the focus in the tree layout', async () => {
      await renderPage({ employees: COMPANY });
      const team = openLeadsTeam();

      fireEvent.click(within(team).getByRole('button', { name: 'Tester' }));

      expect(screen.getByRole('complementary', { name: 'Details for Tester' })).toBeTruthy();
      expect(document.activeElement).toBe(card('Tester'));
      await announced('Details for Tester shown');
    });

    it('takes the focus to the heading of the details in the outline, as for anyone opened from the sheet', async () => {
      await renderPage({ employees: COMPANY });
      screen.getByRole('tree').style.setProperty('--layout', 'outline');
      const team = openLeadsTeam();

      fireEvent.click(within(team).getByRole('button', { name: 'Dev' }));
      for (let frames = 0; frames < 3; frames++) await frame();

      const details = screen.getByRole('complementary', { name: 'Details for Dev' });
      expect(document.activeElement).toBe(within(details).getByRole('heading', { level: 2 }));
    });

    it('goes back to the card from a team that a refresh emptied, whose details have no button to go back to', async () => {
      let people = COMPANY;
      await renderPage({
        answer: (request) =>
          request instanceof GetOrgChartQuery
            ? Promise.resolve({ chart: buildOrgChart(people, request.options), loadedAt: new Date(2026, 8, 30, 9, 0), isStale: false })
            : undefined,
      });
      const team = openLeadsTeam();
      people = COMPANY.filter((employee) => employee.managerId !== 'lead');

      fireEvent.click(tool('Reload from the directory'));
      await waitFor(() => {
        expect(team.textContent).toContain('0 people');
      });
      fireEvent.click(within(team).getByRole('button', { name: 'Back to the details for Lead' }));

      expect(screen.getByRole('complementary', { name: 'Details for Lead' })).toBeTruthy();
      expect(document.activeElement).toBe(card('Lead'));
    });

    it('closes the team list with Escape, handing the focus to the manager\'s card', async () => {
      await renderPage({ employees: COMPANY });
      openLeadsTeam();

      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

      expect(screen.queryByRole('complementary')).toBeNull();
      expect(document.activeElement).toBe(card('Lead'));
    });

    it('gives way to the details of anyone picked elsewhere: a card, or in the search the very manager whose team it lists', async () => {
      await renderPage({ employees: COMPANY, answer: searching(COMPANY) });
      openLeadsTeam();

      fireEvent.click(card('Aide'));
      expect(screen.getByRole('complementary', { name: 'Details for Aide' })).toBeTruthy();

      openLeadsTeam();
      search('lead');
      fireEvent.click(await screen.findByRole('option', { name: /^Lead/ }));
      expect(screen.getByRole('complementary', { name: 'Details for Lead' })).toBeTruthy();
    });

    it('lists every match of a search from Show all, with the focus, and closes back to the search field', async () => {
      await renderPage({ employees: AGENTS, answer: searching(AGENTS) });
      fireEvent.click(card('Ceo'));
      search('agent');

      fireEvent.click(await screen.findByRole('option', { name: 'Show all 14' }));

      const results = screen.getByRole('complementary', { name: 'Search results' });
      expect(document.activeElement).toBe(within(results).getByRole('heading', { level: 2 }));
      expect(await within(results).findByText('14 matches for "agent"')).toBeTruthy();
      expect(listed()).toHaveLength(14);
      // Nobody's details are open, so no card is marked as the one the panel is about.
      expect(card('Ceo').getAttribute('aria-selected')).toBe('false');
      fireEvent.click(within(results).getByRole('button', { name: 'Close search results' }));

      expect(screen.queryByRole('complementary')).toBeNull();
      expect(document.activeElement).toBe(searchField());
      // Closed with the results, so that a second Escape isn't needed to close the suggestions too.
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(searchField().getAttribute('aria-expanded')).toBe('false');
    });

    it('closes the results with Escape, handing the focus to the search field with its suggestions closed', async () => {
      await renderPage({ employees: AGENTS, answer: searching(AGENTS) });
      search('agent');
      fireEvent.click(await screen.findByRole('option', { name: 'Show all 14' }));

      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

      expect(screen.queryByRole('complementary')).toBeNull();
      expect(document.activeElement).toBe(searchField());
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(searchField().getAttribute('aria-expanded')).toBe('false');
    });

    it('opens a match from the results with their details, revealed in the chart', async () => {
      await renderPage({ employees: AGENTS, answer: searching(AGENTS) });
      search('agent');
      fireEvent.click(await screen.findByRole('option', { name: 'Show all 14' }));

      fireEvent.click(await within(panel()).findByRole('button', { name: 'Agent7' }));

      expect(screen.getByRole('complementary', { name: 'Details for Agent7' })).toBeTruthy();
      expect(document.activeElement).toBe(card('Agent7'));
    });

    it('opens nobody from results made before a refresh took the person away, while it searches the new chart', async () => {
      let people = AGENTS;
      const searchAgents = searching(AGENTS);
      let resultSearches = 0;
      await renderPage({
        answer: (request) => {
          if (request instanceof GetOrgChartQuery) {
            return Promise.resolve({ chart: buildOrgChart(people, request.options), loadedAt: new Date(2026, 8, 30, 9, 0), isStale: false });
          }
          // The search of the refreshed chart takes its time, so the results of the chart before it stay on screen.
          if (request instanceof SearchEmployeesQuery && request.limit === PEOPLE_LIST_CAP && resultSearches++ > 0) return new Promise(() => undefined);
          return searchAgents(request);
        },
      });
      search('agent');
      fireEvent.click(await screen.findByRole('option', { name: 'Show all 14' }));
      const results = screen.getByRole('complementary', { name: 'Search results' });
      await within(results).findByRole('button', { name: 'Agent7' });
      people = AGENTS.filter((employee) => employee.id !== 'agent7');

      fireEvent.click(tool('Reload from the directory'));
      await waitFor(() => {
        expect(resultSearches).toBe(2);
      });
      fireEvent.click(within(results).getByRole('button', { name: 'Agent7' }));

      expect(screen.getByRole('complementary', { name: 'Search results' })).toBe(results);
      expect(screen.queryByRole('treeitem', { name: 'Agent7' })).toBeNull();
    });

    it('closes the results as the logo in another page\'s iframe restarts the chart', async () => {
      await renderPage({ employees: AGENTS, answer: searching(AGENTS), host: 'embedded' });
      search('agent');
      fireEvent.click(await screen.findByRole('option', { name: 'Show all 14' }));
      expect(screen.getByRole('complementary', { name: 'Search results' })).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Org' }));

      expect(screen.queryByRole('complementary')).toBeNull();
    });

    describe('with the host\'s Back button', () => {
      /** What the page told the host's Back button last: what is open, and what a press closes. */
      const tracked = (sent: readonly Request<unknown>[]) => sent.filter((request) => request instanceof TrackOpenLayersCommand).at(-1);
      const pressBack = (sent: readonly Request<unknown>[]) => {
        act(() => {
          tracked(sent)?.closeTopmost();
        });
      };

      it('closes a person\'s details, handing the focus to their card, and then leaves Back to the host', async () => {
        const { sent } = await renderPage({ employees: COMPANY });
        expect(tracked(sent)?.open).toEqual({ panel: 0, dialog: false });
        fireEvent.click(card('Lead'));
        act(() => {
          within(panel()).getByRole('button', { name: /Close/ }).focus();
        });
        expect(tracked(sent)?.open).toEqual({ panel: 1, dialog: false });

        pressBack(sent);

        expect(screen.queryByRole('complementary')).toBeNull();
        expect(document.activeElement).toBe(card('Lead'));
        expect(tracked(sent)?.open).toEqual({ panel: 0, dialog: false });
      });

      it('returns from the whole team to the manager\'s details, with the focus on See the whole team, and closes them next', async () => {
        const { sent } = await renderPage({ employees: COMPANY });
        openLeadsTeam();
        expect(tracked(sent)?.open).toEqual({ panel: 2, dialog: false });

        pressBack(sent);

        const details = screen.getByRole('complementary', { name: 'Details for Lead' });
        expect(document.activeElement).toBe(within(details).getByRole('button', { name: 'See the whole team' }));
        expect(tracked(sent)?.open).toEqual({ panel: 1, dialog: false });
        pressBack(sent);
        expect(screen.queryByRole('complementary')).toBeNull();
      });

      it('closes the search results, handing the focus back to the search field', async () => {
        const { sent } = await renderPage({ employees: AGENTS, answer: searching(AGENTS) });
        search('agent');
        fireEvent.click(await screen.findByRole('option', { name: 'Show all 14' }));
        expect(tracked(sent)?.open).toEqual({ panel: 1, dialog: false });

        pressBack(sent);

        expect(screen.queryByRole('complementary')).toBeNull();
        expect(document.activeElement).toBe(searchField());
        expect(searchField().getAttribute('aria-expanded')).toBe('false');
      });

      it('closes Settings before the side panel, which the dialog lies over, and hands the focus back to the cog', async () => {
        const { sent } = await renderPage({ employees: COMPANY });
        fireEvent.click(card('Lead'));
        act(() => {
          tool('Settings').focus();
        });
        fireEvent.click(tool('Settings'));
        expect(tracked(sent)?.open).toEqual({ panel: 1, dialog: true });

        pressBack(sent);

        expect(screen.queryByRole('region', { name: 'Display' })).toBeNull();
        expect(document.activeElement).toBe(tool('Settings'));
        expect(screen.getByRole('complementary', { name: 'Details for Lead' })).toBeTruthy();
        expect(tracked(sent)?.open).toEqual({ panel: 1, dialog: false });
      });

      it('closes Help before the side panel, and hands the focus back to Help', async () => {
        const { sent } = await renderPage({ employees: COMPANY });
        fireEvent.click(card('Lead'));
        act(() => {
          tool('Help').focus();
        });
        fireEvent.click(tool('Help'));
        expect(tracked(sent)?.open).toEqual({ panel: 1, dialog: true });

        pressBack(sent);

        expect(screen.queryByRole('dialog')).toBeNull();
        expect(document.activeElement).toBe(tool('Help'));
        expect(screen.getByRole('complementary', { name: 'Details for Lead' })).toBeTruthy();
        expect(tracked(sent)?.open).toEqual({ panel: 1, dialog: false });
      });

      it('closes the directory health report before the side panel, and hands the focus back to the cog', async () => {
        const { sent } = await renderPage({ employees: COMPANY, answer: reporting(COMPANY) });
        fireEvent.click(card('Lead'));
        act(() => {
          tool('Settings').focus();
        });
        fireEvent.click(tool('Settings'));
        fireEvent.click(within(screen.getByRole('dialog', { name: 'Settings' })).getByRole('button', { name: 'Directory health' }));
        expect(await screen.findByText(/^5 people checked/)).toBeTruthy();
        expect(tracked(sent)?.open).toEqual({ panel: 1, dialog: true });

        pressBack(sent);

        expect(screen.queryByText(/^5 people checked/)).toBeNull();
        expect(document.activeElement).toBe(tool('Settings'));
        expect(screen.getByRole('complementary', { name: 'Details for Lead' })).toBeTruthy();
        expect(tracked(sent)?.open).toEqual({ panel: 1, dialog: false });
      });
    });
  });

  describe('the departments', () => {
    /** Management over Strategy over Sales, whose people have no job title. */
    const COMPANY = [
      makeEmployee('ceo', null, { department: 'Management' }),
      makeEmployee('head', 'ceo', { department: 'Strategy' }),
      makeEmployee('lead', 'head', { department: 'Sales', jobTitle: null }),
      makeEmployee('rep', 'lead', { department: 'Sales', jobTitle: null }),
    ];
    const panel = () => screen.getByRole('complementary');
    /** What the page told the host's Back button last: what is open, and what a press closes. */
    const tracked = (sent: readonly Request<unknown>[]) => sent.filter((request) => request instanceof TrackOpenLayersCommand).at(-1);
    const pressBack = (sent: readonly Request<unknown>[]) => {
      act(() => {
        tracked(sent)?.closeTopmost();
      });
    };
    const openDepartments = () => {
      fireEvent.click(tool('Departments'));
      return screen.getByRole('complementary', { name: 'Departments' });
    };

    it('open from the toolbar in the side panel, which takes the focus and selects nobody', async () => {
      await renderPage({ employees: COMPANY });
      fireEvent.click(card('Head'));

      const departments = openDepartments();

      expect(document.activeElement).toBe(within(departments).getByRole('heading', { name: 'Departments' }));
      expect(within(departments).getByRole('button', { name: 'Management 4 people' })).toBeTruthy();
      expect(card('Head').getAttribute('aria-selected')).toBe('false');
    });

    it('go from department to department and back, one layer at a time, with the focus on what opened each', async () => {
      const { sent } = await renderPage({ employees: COMPANY });
      openDepartments();
      expect(tracked(sent)?.open).toEqual({ panel: 1, dialog: false });
      fireEvent.click(within(panel()).getByRole('button', { name: 'Strategy 3 people' }));
      expect(screen.getByRole('complementary', { name: 'Strategy' })).toBeTruthy();
      fireEvent.click(within(panel()).getByRole('button', { name: 'Sales 2 people' }));
      expect(screen.getByRole('complementary', { name: 'Sales' })).toBeTruthy();
      expect(tracked(sent)?.open).toEqual({ panel: 3, dialog: false });

      pressBack(sent);

      expect(screen.getByRole('complementary', { name: 'Strategy' })).toBeTruthy();
      expect(document.activeElement).toBe(within(panel()).getByRole('button', { name: 'Sales 2 people' }));
      expect(tracked(sent)?.open).toEqual({ panel: 2, dialog: false });
      fireEvent.click(within(panel()).getByRole('button', { name: 'Back to the departments' }));
      expect(document.activeElement).toBe(within(panel()).getByRole('button', { name: 'Strategy 3 people' }));
      expect(tracked(sent)?.open).toEqual({ panel: 1, dialog: false });
      pressBack(sent);
      expect(screen.queryByRole('complementary')).toBeNull();
      expect(document.activeElement).toBe(tool('Departments'));
      expect(tracked(sent)?.open).toEqual({ panel: 0, dialog: false });
    });

    it('open a department\'s person in the chart, with their details', async () => {
      await renderPage({ employees: COMPANY });
      openDepartments();
      fireEvent.click(within(panel()).getByRole('button', { name: 'Management 4 people' }));

      fireEvent.click(within(panel()).getByRole('button', { name: 'Ceo' }));

      expect(screen.getByRole('complementary', { name: 'Details for Ceo' })).toBeTruthy();
    });

    it('hand the focus back to their button as Escape closes them', async () => {
      await renderPage({ employees: COMPANY });
      openDepartments();
      fireEvent.click(within(panel()).getByRole('button', { name: 'Strategy 3 people' }));

      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

      expect(screen.queryByRole('complementary')).toBeNull();
      expect(document.activeElement).toBe(tool('Departments'));
    });

    it('open from a person\'s department path, and go back to their details with the focus on the department pressed', async () => {
      const { sent } = await renderPage({ employees: COMPANY });
      fireEvent.click(tool('Expand all'));
      fireEvent.click(card('Rep'));
      fireEvent.click(within(screen.getByRole('list', { name: 'Department' })).getByRole('button', { name: 'Strategy' }));

      expect(screen.getByRole('complementary', { name: 'Strategy' })).toBeTruthy();
      expect(card('Rep').getAttribute('aria-selected')).toBe('true');
      expect(tracked(sent)?.open).toEqual({ panel: 2, dialog: false });
      fireEvent.click(within(panel()).getByRole('button', { name: 'Back to the details for Rep' }));

      const path = within(screen.getByRole('complementary', { name: 'Details for Rep' })).getByRole('list', { name: 'Department' });
      expect(document.activeElement).toBe(within(path).getByRole('button', { name: 'Strategy' }));
      expect(tracked(sent)?.open).toEqual({ panel: 1, dialog: false });
    });

    it('give way to the details of anyone else selected', async () => {
      await renderPage({ employees: COMPANY });
      fireEvent.click(tool('Expand all'));
      fireEvent.click(card('Rep'));
      fireEvent.click(within(screen.getByRole('list', { name: 'Department' })).getByRole('button', { name: 'Sales' }));

      fireEvent.click(card('Head'));

      expect(screen.getByRole('complementary', { name: 'Details for Head' })).toBeTruthy();
    });

    describe('as a chart', () => {
      const showAsChart = () => {
        openDepartments();
        fireEvent.click(within(panel()).getByRole('button', { name: 'Show as chart' }));
      };
      const departmentCard = (name: string) => within(screen.getByRole('tree', { name: /^Departments in / })).getByRole('treeitem', { name });

      it('take the chart\'s place from the panel, under a bar that leads back to the people, and move the focus to their first card', async () => {
        await renderPage({ employees: COMPANY });

        showAsChart();

        expect(screen.queryByRole('complementary')).toBeNull();
        expect(document.activeElement).toBe(departmentCard('Management'));
        expect(screen.getByRole('region', { name: 'Showing the departments, 3 departments.' })).toBeTruthy();
        await announced('Showing the departments, 3 departments.');

        fireEvent.click(screen.getByRole('button', { name: 'Show people' }));

        expect(screen.queryByRole('tree', { name: /^Departments in / })).toBeNull();
        expect(document.activeElement).toBe(card('Ceo'));
        await announced('Showing the people.');
      });

      it('list a picked department\'s people beside it, and open a person in the people chart', async () => {
        await renderPage({ employees: COMPANY });
        showAsChart();

        fireEvent.click(departmentCard('Management'));

        const people = screen.getByRole('complementary', { name: 'Management' });
        expect(within(people).queryByRole('button', { name: /^Back/ })).toBeNull();
        expect(departmentCard('Management').getAttribute('aria-selected')).toBe('true');
        fireEvent.click(within(people).getByRole('button', { name: 'Ceo' }));

        expect(screen.getByRole('complementary', { name: 'Details for Ceo' })).toBeTruthy();
        expect(screen.queryByRole('tree', { name: /^Departments in / })).toBeNull();
      });

      it('let Back close a picked department\'s people, then the departments, before it leaves the chart', async () => {
        const { sent } = await renderPage({ employees: COMPANY });
        showAsChart();
        expect(tracked(sent)?.open).toEqual({ panel: 1, dialog: false });
        fireEvent.click(departmentCard('Management'));
        expect(tracked(sent)?.open).toEqual({ panel: 2, dialog: false });

        act(() => {
          within(panel()).getByRole('button', { name: 'Close the department' }).focus();
        });
        pressBack(sent);

        expect(screen.queryByRole('complementary')).toBeNull();
        expect(document.activeElement).toBe(departmentCard('Management'));
        expect(tracked(sent)?.open).toEqual({ panel: 1, dialog: false });
        pressBack(sent);
        expect(screen.queryByRole('tree', { name: /^Departments in / })).toBeNull();
        expect(tracked(sent)?.open).toEqual({ panel: 0, dialog: false });
      });

      it('unfold every department with Expand all, and fold them again with Collapse all', async () => {
        await renderPage({ employees: COMPANY });
        showAsChart();
        expect(within(screen.getByRole('tree', { name: /^Departments in / })).queryByRole('treeitem', { name: 'Sales' })).toBeNull();

        fireEvent.click(tool('Expand all'));

        expect(departmentCard('Sales')).toBeTruthy();
        fireEvent.click(tool('Collapse all'));
        expect(departmentCard('Management').getAttribute('aria-expanded')).toBe('false');
      });
    });

    it('end the trail before a department the filters take away', async () => {
      await renderPage({ employees: COMPANY });
      openDepartments();
      fireEvent.click(within(panel()).getByRole('button', { name: 'Strategy 3 people' }));
      fireEvent.click(within(panel()).getByRole('button', { name: 'Sales 2 people' }));

      fireEvent.click(tool('Settings'));
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Settings' })).getByRole('checkbox', { name: /People without a job title/ }));

      expect(await screen.findByRole('complementary', { name: 'Strategy' })).toBeTruthy();
      expect(within(panel()).queryByRole('button', { name: /Sales/ })).toBeNull();
    });
  });

  describe('where it opens', () => {
    const COMPANY = [
      makeEmployee('ceo'),
      makeEmployee('lead', 'ceo'),
      makeEmployee('dev', 'lead'),
      makeEmployee('tester', 'lead'),
      makeEmployee('aide', 'ceo'),
    ];
    /** Dev's details open in the lead's team, unfolded by hand, with the CEO's folding as it was. */
    const VIEW: ChartView = { depth: 0, toggled: [['ceo', true], ['lead', true]], selectedId: 'dev', currentId: 'dev' };
    const viewToRestore =
      (view: ChartView | null) =>
      (request: Request<unknown>): Promise<unknown> | undefined =>
        request instanceof GetSavedViewQuery ? Promise.resolve(view) : undefined;
    const startingAt = (startAt: AppSettings['chart']['startAt']): AppSettings => ({ ...SETTINGS, chart: { ...SETTINGS.chart, startAt } });
    const DEV: SignedInUser = { id: 'dev', displayName: 'Dev', userPrincipalName: 'dev@contoso.com', isGuest: false };

    it('opens as a saved view left the chart, asking with the chart\'s options and the start choice', async () => {
      const { sent } = await renderPage({ settings: startingAt('lastView'), employees: COMPANY, answer: viewToRestore(VIEW) });

      expect(await screen.findByRole('complementary', { name: 'Details for Dev' })).toBeTruthy();
      expect(card('Lead').getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(card('Dev'));
      const asked = sent.filter((request) => request instanceof GetSavedViewQuery);
      expect(asked).toHaveLength(1);
      expect(asked[0]?.options).toBe(sent.find((request) => request instanceof GetOrgChartQuery)?.options);
      expect(asked[0]?.startAt).toBe('lastView');
    });

    it('opens on the person a link names whatever view was saved, and asks for none', async () => {
      const { sent } = await renderPage({
        settings: settingsFor(SETTINGS.chart.options, 'aide@contoso.com'),
        employees: COMPANY,
        answer: viewToRestore(VIEW),
      });

      expect(screen.getByRole('complementary', { name: 'Details for Aide' })).toBeTruthy();
      expect(card('Lead').getAttribute('aria-expanded')).toBe('false');
      expect(sent.some((request) => request instanceof GetSavedViewQuery)).toBe(false);
    });

    it('opens at the top where there is no view to take up and the person chose the top', async () => {
      await renderPage({ employees: COMPANY, answer: viewToRestore(null) });

      expect(await screen.findByRole('treeitem', { name: 'Ceo' })).toBeTruthy();
      expect(card('Lead').getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByRole('complementary')).toBeNull();
    });

    it('waits for the signed-in user to open at their own card, showing no chart that would jump there', async () => {
      let answerUser: (user: SignedInUser | null) => void = () => undefined;
      const user = new Promise<SignedInUser | null>((resolve) => {
        answerUser = resolve;
      });
      const { sent } = mountPage({
        settings: startingAt('me'),
        employees: COMPANY,
        answer: (request) => (request instanceof GetSignedInUserQuery ? user : undefined),
      });
      await waitFor(() => {
        expect(sent.some((request) => request instanceof GetSignedInUserQuery)).toBe(true);
      });
      await frame();
      expect(screen.queryByRole('tree')).toBeNull();
      expect(screen.getByText('Loading the organization...')).toBeTruthy();

      await act(async () => {
        answerUser(DEV);
        await user;
      });

      expect(await screen.findByRole('complementary', { name: 'Details for Dev' })).toBeTruthy();
      expect(document.activeElement).toBe(card('Dev'));
    });

    it('opens at the top for someone who chose their own card where the chart leaves them out', async () => {
      await renderPage({ settings: startingAt('me'), employees: COMPANY, signedInUser: { ...DEV, id: 'away' } });

      expect(await screen.findByRole('treeitem', { name: 'Ceo' })).toBeTruthy();
      expect(screen.queryByRole('complementary')).toBeNull();
    });

    it('opens on a recent view before the person\'s own card, as when they come back from a chat in Teams', async () => {
      const { sent } = await renderPage({ settings: startingAt('me'), employees: COMPANY, signedInUser: DEV, answer: viewToRestore(VIEW) });

      expect(await screen.findByRole('complementary', { name: 'Details for Dev' })).toBeTruthy();
      expect(card('Lead').getAttribute('aria-expanded')).toBe('true');
      // The view decided it, before the account was asked for.
      expect(sent.findIndex((request) => request instanceof GetSavedViewQuery)).toBeLessThan(
        sent.findIndex((request) => request instanceof GetSignedInUserQuery),
      );
    });

    it('saves where the person is, with the chart\'s options, as the page goes and as the host suspends it', async () => {
      const host = suspendingHost();
      const { sent } = await renderPage({ employees: COMPANY, lifecycle: host.lifecycle });
      const saved = () => sent.filter((request) => request instanceof SaveViewCommand);
      fireEvent.click(card('Lead'));

      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });
      expect(saved().at(-1)?.view).toEqual({ depth: 1, toggled: [['lead', true]], selectedId: 'lead', currentId: 'lead' });
      expect(saved().at(-1)?.options).toBe(sent.filter((request) => request instanceof GetOrgChartQuery).at(-1)?.options);

      fireEvent.click(card('Dev'));
      host.suspend();
      expect(saved().at(-1)?.view.selectedId).toBe('dev');
    });

    it('saves the view a moment after a change too, once for a burst of them', async () => {
      const { sent } = await renderPage({ employees: COMPANY });
      const saved = () => sent.filter((request) => request instanceof SaveViewCommand);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        fireEvent.click(card('Lead'));
        fireEvent.click(card('Dev'));
        expect(saved()).toHaveLength(0);

        act(() => {
          vi.advanceTimersByTime(1000);
        });
      } finally {
        vi.useRealTimers();
      }

      expect(saved()).toHaveLength(1);
      expect(saved()[0]?.view.selectedId).toBe('dev');
    });

    it('forgets with the logo of a site of its own the view of the chart it leads to, and saves none on the way', async () => {
      const fromLink = settingsFor({ topPersons: ['lead'], hide: { ...SHOW_EVERYONE, unattached: true }, within: SETTINGS.chart.options });
      const { sent } = await renderPage({ settings: fromLink, employees: COMPANY });
      fireEvent.click(card('Dev'));

      fireEvent.click(screen.getByRole('link', { name: 'Org' }));
      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });

      // "/" builds the chart config.json sets up, not the one the link narrowed.
      const forgotten = sent.filter((request) => request instanceof ForgetViewCommand);
      expect(forgotten.map(({ options }) => options)).toEqual([SETTINGS.chart.options]);
      expect(sent.some((request) => request instanceof SaveViewCommand)).toBe(false);
    });

    it('saves its view again once Back brings the page back from the browser\'s cache after the logo', async () => {
      const { sent } = await renderPage({ employees: COMPANY });
      const saved = () => sent.filter((request) => request instanceof SaveViewCommand);
      fireEvent.click(screen.getByRole('link', { name: 'Org' }));
      act(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      });
      expect(saved()).toHaveLength(0);

      act(() => {
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      });
      fireEvent.click(card('Lead'));
      act(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
      });

      expect(saved().map(({ view }) => view.selectedId)).toEqual(['lead']);
    });

    it('remembers everyone whose details are opened, for Search', async () => {
      const { sent } = await renderPage({ employees: COMPANY });

      fireEvent.click(card('Lead'));
      fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: /Dev/ }));

      await waitFor(() => {
        expect(sent.filter((request) => request instanceof RememberPersonCommand).map(({ employeeId }) => employeeId)).toEqual([
          'lead',
          'dev',
        ]);
      });
    });

    it('asks for the chart again as the host resumes the page, refreshing it where it has grown stale meanwhile', async () => {
      const host = suspendingHost();
      let stale = false;
      const { sent, refreshes } = await renderPage({
        employees: COMPANY,
        lifecycle: host.lifecycle,
        answer: (request) =>
          request instanceof GetOrgChartQuery
            ? Promise.resolve({ chart: buildOrgChart(COMPANY, request.options), loadedAt: new Date(2026, 8, 30, 9, 0), isStale: stale })
            : undefined,
      });
      const charts = () => sent.filter((request) => request instanceof GetOrgChartQuery).length;
      const asked = charts();
      stale = true;

      host.resume();

      await waitFor(() => {
        expect(refreshes).toHaveLength(1);
      });
      expect(refreshes[0]?.full).toBe(false);
      expect(charts()).toBeGreaterThan(asked);
      await frame();
      expect(announcements().textContent).toBe('');
    });

    it('refreshes again as a later resume finds the chart stale, after the stale chart it opened with was refreshed', async () => {
      const host = suspendingHost();
      let stale = true;
      const { sent, refreshes } = await renderPage({
        employees: COMPANY,
        lifecycle: host.lifecycle,
        refresh: () => {
          stale = false;
          return Promise.resolve();
        },
        answer: (request) =>
          request instanceof GetOrgChartQuery
            ? Promise.resolve({ chart: buildOrgChart(COMPANY, request.options), loadedAt: new Date(2026, 8, 30, 9, 0), isStale: stale })
            : undefined,
      });
      // The chart it opened with, then the refreshed one.
      await waitFor(() => {
        expect(sent.filter((request) => request instanceof GetOrgChartQuery)).toHaveLength(2);
      });
      await frame();
      expect(refreshes).toHaveLength(1);
      // Hours later, as Teams resumes the page.
      stale = true;

      host.resume();

      await waitFor(() => {
        expect(refreshes).toHaveLength(2);
      });
    });

    it('saves no view before the chart has started, which would replace the view it may still open with', async () => {
      const host = suspendingHost();
      const { sent } = mountPage({
        employees: COMPANY,
        lifecycle: host.lifecycle,
        answer: (request) => (request instanceof GetSavedViewQuery ? new Promise(() => undefined) : undefined),
      });
      // The chart is there, and the page still reads the saved view.
      await waitFor(() => {
        expect(screen.getByRole('contentinfo').textContent).not.toBe('');
      });
      expect(screen.getByText('Loading the organization...')).toBeTruthy();

      act(() => {
        window.dispatchEvent(new Event('pagehide'));
      });
      host.suspend();

      expect(sent.some((request) => request instanceof SaveViewCommand)).toBe(false);
    });
  });

  describe('with long teams and flagged people', () => {
    /** Sixty agents under the CEO: a page of fifty, and ten more. */
    const AGENTS = [
      makeEmployee('ceo'),
      ...Array.from({ length: 60 }, (_, index) => makeEmployee(`agent${String(index + 1).padStart(2, '0')}`, 'ceo')),
    ];

    it('reveals a search pick past the first page of a long team, with the page that holds them', async () => {
      await renderPage({ employees: AGENTS, answer: searching(AGENTS) });
      expect(screen.queryByRole('treeitem', { name: 'Agent57' })).toBeNull();
      expect(screen.getByRole('treeitem', { name: 'Show 10 more' })).toBeTruthy();

      search('agent57');
      fireEvent.click(await screen.findByRole('option', { name: /^Agent57/ }));

      expect(document.activeElement).toBe(card('Agent57'));
      expect(screen.getByRole('complementary', { name: 'Details for Agent57' })).toBeTruthy();
      expect(screen.queryByRole('treeitem', { name: /^Show/ })).toBeNull();
    });

    it('opens a link to a person past the first page of a long team on them', async () => {
      await renderPage({ settings: settingsFor(SETTINGS.chart.options, 'agent57@contoso.com'), employees: AGENTS });

      expect(screen.getByRole('complementary', { name: 'Details for Agent57' })).toBeTruthy();
      expect(card('Agent57').getAttribute('aria-selected')).toBe('true');
    });

    it('shows a direct report past the first page from the details, after their Show all', async () => {
      await renderPage({ employees: AGENTS });
      fireEvent.click(card('Ceo'));
      const details = screen.getByRole('complementary', { name: 'Details for Ceo' });

      fireEvent.click(within(details).getByRole('button', { name: 'Show all 60' }));
      fireEvent.click(within(details).getByRole('button', { name: /^Agent57/ }));

      expect(screen.getByRole('complementary', { name: 'Details for Agent57' })).toBeTruthy();
      expect(document.activeElement).toBe(card('Agent57'));
    });

    it('opens a saved view on a person past the first page of a long team, as pages are found again rather than saved', async () => {
      const view: ChartView = { depth: 1, toggled: [], selectedId: 'agent57', currentId: 'agent57' };
      await renderPage({
        employees: AGENTS,
        answer: (request) => (request instanceof GetSavedViewQuery ? Promise.resolve(view) : undefined),
      });

      expect(await screen.findByRole('complementary', { name: 'Details for Agent57' })).toBeTruthy();
      expect(document.activeElement).toBe(card('Agent57'));
    });

    it('hands the focus to the heading over a folded group as the details of someone in it close', async () => {
      await renderPage({ employees: [makeEmployee('ceo'), makeEmployee('stray')] });
      fireEvent.click(card('Stray'));
      fireEvent.click(screen.getByRole('treeitem', { name: 'No manager set (1 person)' }));
      expect(screen.queryByRole('treeitem', { name: 'Stray' })).toBeNull();
      const close = within(screen.getByRole('complementary', { name: 'Details for Stray' })).getByRole('button', { name: /Close/ });
      act(() => {
        close.focus();
      });

      fireEvent.click(close);

      expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: 'No manager set (1 person)' }));
    });

    it('announces what \'*\' unfolded among the headings, as groups', async () => {
      const strays = Array.from({ length: 51 }, (_, index) => makeEmployee(`stray${String(index + 1).padStart(2, '0')}`));
      const orphans = Array.from({ length: 51 }, (_, index) => makeEmployee(`orphan${String(index + 1).padStart(2, '0')}`, 'gone'));
      await renderPage({ employees: [makeEmployee('ceo'), ...strays, ...orphans] });
      const heading = screen.getByRole('treeitem', { name: 'No manager set (51 people)' });
      act(() => {
        heading.focus();
      });

      fireEvent.keyDown(heading, { key: '*' });
      await announced('Unfolded 2 groups.');
      expect(screen.getByRole('treeitem', { name: 'Manager not shown (51 people)' }).getAttribute('aria-expanded')).toBe('true');

      fireEvent.keyDown(heading, { key: '*' });
      await announced('No groups to unfold.');
    });
  });

  it('says the zoom when it changes', async () => {
    await renderPage();
    expect(zoomRegion().getAttribute('role')).toBe('status');
    expect(zoomRegion().textContent).toBe('Zoom 100 percent');

    fireEvent.click(tool('Zoom out'));
    await waitFor(() => {
      expect(zoomRegion().textContent).toBe('Zoom 83 percent');
    });
  });

  it('shows how far the first read is, as a bar and in words, with the time left at its pace so far', () => {
    let report: ProgressListener = () => undefined;
    mountPage({
      answer: (request) => {
        if (!(request instanceof GetOrgChartQuery)) return undefined;
        report = request.onProgress ?? report;
        return new Promise(() => undefined);
      },
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 9, 1, 9, 0, 0));
      act(() => {
        report(0, 5000);
      });
      vi.setSystemTime(new Date(2026, 9, 1, 9, 0, 30));
      act(() => {
        report(1000, 5000);
      });
    } finally {
      vi.useRealTimers();
    }

    const words = screen.getByText(/loaded/);
    expect(words.textContent).toBe('1,000 of about 5,000 people loaded, about 2 minutes left');
    // The bar says the same, for the eye only, inside the loading panel, which is busy and so says nothing as it changes.
    const bar = words.parentElement?.querySelector('progress');
    expect([bar?.getAttribute('value'), bar?.getAttribute('max'), bar?.getAttribute('aria-hidden')]).toEqual(['1000', '5000', 'true']);
    expect(words.parentElement?.getAttribute('aria-busy')).toBe('true');
  });

  it('counts the people being loaded, and words a load that failed, with Try again and the technical detail', async () => {
    const loading = deferred();
    mountPage({
      answer: (request) => {
        if (!(request instanceof GetOrgChartQuery)) return undefined;
        request.onProgress?.(1234);
        return loading.promise;
      },
    });
    expect(screen.getByText(/loaded$/).textContent).toBe('1,234 people loaded');
    // Without a total, there is nothing to measure a bar against.
    expect(document.querySelector('progress')).toBeNull();

    await act(async () => {
      loading.reject(LOAD_ERROR);
      await loading.promise.catch(() => undefined);
    });

    const panel = await screen.findByRole('alert');
    expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe('Could not load the organization');
    expect(panel.textContent).toContain(describeError(LOAD_ERROR, 'en'));
    expect(within(panel).getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(within(panel).getByText('Microsoft Graph request failed (503).').getAttribute('lang')).toBe('en');
  });

  it('names the tree after the chart where config.json names none', async () => {
    await renderPage({ settings: { ...SETTINGS, branding: { ...SETTINGS.branding, title: null } } });

    expect(screen.getByRole('tree', { name: 'Organization chart' })).toBeTruthy();
  });

  it('shows and announces a partial Expand all and a failed sign-out as notices', async () => {
    // More people on the third level than Expand all shows at once, though it shows each team's first page only.
    const crowded = [
      makeEmployee('ceo'),
      ...Array.from({ length: 41 }, (_, lead) => [
        makeEmployee(`lead${String(lead)}`, 'ceo'),
        ...Array.from({ length: 50 }, (_, dev) => makeEmployee(`lead${String(lead)}dev${String(dev)}`, `lead${String(lead)}`)),
      ]).flat(),
    ];
    await renderPage({
      employees: crowded,
      canSignOut: true,
      answer: (request) => (request instanceof SignOutCommand ? Promise.reject(SIGN_OUT_ERROR) : undefined),
    });
    const footer = () => screen.getByRole('contentinfo').textContent;

    fireEvent.click(tool('Expand all'));
    const partly = 'Expanded 2 of 3 levels to keep the page responsive. Click a person to see more.';
    expect(footer()).toContain(partly);
    await announced(partly);

    fireEvent.click(tool('Sign out'));
    const signOutFailed = `Sign-out failed: ${describeError(SIGN_OUT_ERROR, 'en')}`;
    await announced(signOutFailed);
    expect(footer()).toContain(signOutFailed);
  });

  it('says on the Print button that the print is being prepared, and disables it meanwhile', async () => {
    const printing = deferred();
    await renderPage({ answer: (request) => (request instanceof PrintChartCommand ? printing.promise : undefined) });

    fireEvent.click(tool('Print'));
    expect((tool('Preparing the print...') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      printing.resolve();
      await printing.promise;
    });
    expect(tool('Print')).toBeTruthy();
  });

  it('says that printing opens the browser where the host prints there', async () => {
    await renderPage({ printOpensBrowser: true });

    expect(tool('Print in browser')).toBeTruthy();
  });

  it('tells staff what to do when the chart is empty or a link\'s person is missing', async () => {
    await renderPage({ settings: settingsFor({ topPersons: ['ceo'], hide: SHOW_EVERYONE }, 'nobody@contoso.com') });

    const warning = 'The person in this link is not in the chart. Search for them by name.';
    expect(screen.getByRole('contentinfo').textContent).toContain(warning);
    await announced(warning);
    expect(screen.queryByRole('link', { name: 'Skip to chart' })).not.toBeNull();
    cleanup();

    await renderPage({ employees: [], settings: settingsFor({ topPersons: ['gone@contoso.com'], hide: SHOW_EVERYONE }) });
    expect(screen.getByText(/If you expected to see people here, please contact IT/)).toBeTruthy();
    expect(screen.getByRole('contentinfo').textContent).toContain(
      'The chart is set to start from gone@contoso.com, but they were not found or are hidden. Please tell IT.',
    );
    expect(screen.queryByRole('link', { name: 'Skip to chart' })).toBeNull();
  });

  describe('with someone the address list hides', () => {
    /** The lead is hidden from the address list, and the rule that keeps them unnamed is on. */
    const HIDDEN_LEAD = EMPLOYEES.map((employee) => (employee.id === 'lead' ? { ...employee, hiddenFromAddressList: true } : employee));
    const HIDING = { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, hiddenFromAddressList: true } };

    it('holds their place in the chart over the people below, and opens a link to them on nobody, saying so', async () => {
      await renderPage({ employees: HIDDEN_LEAD, settings: settingsFor(HIDING, 'lead') });

      expect(screen.getByRole('treeitem', { name: 'Not in the address list' })).toBeTruthy();
      expect(screen.queryByRole('complementary')).toBeNull();
      const warning = 'The person in this link is not in the chart. Search for them by name.';
      expect(screen.getByRole('contentinfo').textContent).toContain(warning);
      // The CEO and the developer: the place is a card, not one of the people counted.
      expect(screen.getByRole('contentinfo').firstElementChild?.textContent).toBe('2 people');
    });

    it('takes a team or a link\'s top person whom the address list hides for one not found, and shows the chart it would narrow', async () => {
      const hiding = settingsFor(HIDING);
      await renderPage({ employees: HIDDEN_LEAD, settings: { ...hiding, chart: { ...hiding.chart, team: 'lead@contoso.com' } } });

      const missing = 'The person whose team this chart shows was not found or is hidden.';
      expect(screen.getByRole('region', { name: missing })).toBeTruthy();
      expect(screen.getAllByRole('treeitem')[0]).toBe(card('Ceo'));
      cleanup();

      await renderPage({ employees: HIDDEN_LEAD, settings: settingsFor({ topPersons: ['lead@contoso.com'], hide: HIDING.hide, within: HIDING }) });
      expect(screen.getAllByRole('treeitem')[0]).toBe(card('Ceo'));
      expect(screen.getByRole('contentinfo').textContent).toContain('A person this link puts at the top of the chart was not found or is hidden.');
    });

    it('tells a user whom the address list hides that they are not shown, and offers no team of theirs', async () => {
      const lead: SignedInUser = { id: 'lead', displayName: 'Lead', userPrincipalName: 'lead@contoso.com', isGuest: false };
      await renderPage({ employees: HIDDEN_LEAD, settings: settingsFor(HIDING), canSignOut: true, signedInUser: lead });

      fireEvent.click(await screen.findByRole('button', { name: /^Signed in as / }));
      expect(screen.getByRole('contentinfo').textContent).toContain('You are not shown in this chart.');
      expect(screen.queryByRole('complementary')).toBeNull();

      fireEvent.click(tool('Settings'));
      expect(within(screen.getByRole('dialog', { name: 'Settings' })).queryByRole('button', { name: 'Show my team' })).toBeNull();
    });
  });

  describe('the support desk', () => {
    const DESK: SupportDesk = { label: 'Contoso Service Desk', url: 'https://servicedesk.contoso.com' };
    const failingLoad = (error: Error) => (request: Request<unknown>) =>
      request instanceof GetOrgChartQuery ? Promise.reject(error) : undefined;

    it('words a guest\'s refusal as such, in the panel that stands in for the chart, and links the desk after it', async () => {
      const refused = new ServiceError(
        'guestDenied',
        'Microsoft Graph denied a guest account access to the user directory. Guests can read it only where the ' +
          "tenant's external collaboration settings give guest users the same access as members.",
      );
      mountPage({ support: DESK, answer: failingLoad(refused) });

      const panel = await screen.findByRole('alert');
      expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe('Could not load the organization');
      const link = within(panel).getByRole('link', { name: 'Contoso Service Desk' });
      expect(link.parentElement?.textContent).toBe(
        'You are signed in as a guest, and this organization does not let guests see its directory. ' +
          'If you need the chart, ask your contact in the organization or its IT support. Contoso Service Desk (opens in a new tab)',
      );
      expect(panel.textContent).not.toContain('consent');
    });

    it('links no desk under a failure the person can deal with alone, such as being offline', async () => {
      mountPage({ support: DESK, answer: failingLoad(new ServiceError('offline', 'Microsoft Graph could not be reached.')) });

      const panel = await screen.findByRole('alert');
      expect(panel.textContent).toContain('You seem to be offline.');
      expect(within(panel).queryByRole('link')).toBeNull();
    });

    it('links the desk after a failed export, whose words send people to their IT support, but not after other notices', async () => {
      await renderPage({ support: DESK });

      fireEvent.click(tool('Export to CSV (comma-separated values)'));
      const link = await within(screen.getByRole('contentinfo')).findByRole('link', { name: 'Contoso Service Desk' });
      expect(link.parentElement?.textContent).toBe(
        `Export failed: ${describeError(EXPORT_ERROR, 'en')} Contoso Service Desk (opens in a new tab)`,
      );

      fireEvent.click(tool('Expand all'));
      await waitFor(() => {
        expect(within(screen.getByRole('contentinfo')).queryByRole('link')).toBeNull();
      });
    });
  });
});
