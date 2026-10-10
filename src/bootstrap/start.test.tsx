// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/dom';
import type { Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDialogMethods } from '@/testing/dialog';
import { start } from './start';

/** What Teams hands the save handler of a tab's settings. */
interface SaveEvent {
  readonly notifySuccess: () => void;
  readonly notifyFailure: (reason?: string) => void;
}

const teams = vi.hoisted(() => ({
  locale: 'en-us',
  registerOnSaveHandler: vi.fn<(handler: (event: SaveEvent) => void) => void>(),
  setConfig: vi.fn<(config: { readonly contentUrl: string; readonly websiteUrl?: string }) => Promise<void>>(() => Promise.resolve()),
  /** Whether the host has a people picker, which Outlook and microsoft365.com don't. */
  hasPeople: false,
  selectPeople: vi.fn<() => Promise<{ readonly objectId: string; readonly displayName?: string; readonly email?: string }[]>>(() =>
    Promise.resolve([]),
  ),
  /** What the chart registers to be told before Teams suspends the tab. */
  suspend: null as (() => Promise<void>) | null,
}));

/** Without app.lifecycle, beta in TeamsJS 2, and pages.backStack, unless a test puts the lifecycle in. */
const teamsApp = vi.hoisted(
  (): Record<string, unknown> => ({
    initialize: () => Promise.resolve(),
    getContext: () =>
      Promise.resolve({
        app: { theme: 'default', locale: teams.locale, host: { name: 'Teams', clientType: 'web' } },
        page: { subPageId: '' },
      }),
    registerOnThemeChangeHandler: () => undefined,
  }),
);

// With what the composition root's Teams services read too: Teams on the web, without chat and call in the tab.
vi.mock('@microsoft/teams-js', () => ({
  HostName: { teams: 'Teams', teamsModern: 'TeamsModern' },
  HostClientType: { android: 'android', ios: 'ios', ipados: 'ipados', desktop: 'desktop', web: 'web' },
  app: teamsApp,
  pages: {
    isSupported: () => true,
    getConfig: () => Promise.resolve({ contentUrl: '' }),
    config: { registerOnSaveHandler: teams.registerOnSaveHandler, setConfig: teams.setConfig, setValidityState: () => undefined },
  },
  people: { isSupported: () => teams.hasPeople, selectPeople: teams.selectPeople },
  ErrorCode: { USER_ABORT: 8000 },
  chat: { isSupported: () => false },
  call: { isSupported: () => false },
}));

let container: HTMLElement;
let root: Root | undefined;

function browserSpeaks(...languages: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
}

function serveConfig(json: unknown) {
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify(json))));
}

/** The address Teams opens a channel tab's settings with. */
function openTabSettings() {
  window.history.replaceState(null, '', '/?host=teams&view=tab-config');
}

beforeAll(() => {
  // jsdom lacks element scrolling, which the chart does once it shows.
  HTMLElement.prototype.scrollTo = vi.fn();
});

beforeEach(() => {
  container = document.body.appendChild(document.createElement('div'));
  // jsdom has no media queries, which the theme follows outside Teams.
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined }));
  Reflect.deleteProperty(teamsApp, 'lifecycle');
});

afterEach(() => {
  root?.unmount();
  root = undefined;
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  teams.registerOnSaveHandler.mockReset();
  teams.setConfig.mockClear();
  teams.selectPeople.mockClear();
  teams.hasPeople = false;
  teams.locale = 'en-us';
  teams.suspend = null;
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  document.documentElement.removeAttribute('lang');
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.textSize;
  document.title = '';
});

describe('start', () => {
  it("shows the error screen under the chart's own name when config.json cannot be read", async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    browserSpeaks('de-DE', 'en-US');
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 404 })));

    root = await start(container);

    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('The organization chart could not start');
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Organization chart');
    expect(logged).toHaveBeenCalledOnce();
  });

  it("opens the chart in English, whatever the browser's languages", async () => {
    browserSpeaks('de-DE', 'sv-SE');
    serveConfig({ dataSource: 'demo' });

    root = await start(container);

    expect(await screen.findByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('en');
  });

  it('opens in the theme and the text size this browser remembers, over the address\'s theme and config.json\'s', async () => {
    browserSpeaks('en-US');
    localStorage.setItem('orgapp.userSettings', '{"theme":"dark","textSize":"larger"}');
    window.history.replaceState(null, '', '/?theme=contrast');
    serveConfig({ dataSource: 'demo', theme: 'light' });

    root = await start(container);

    expect(await screen.findByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.textSize).toBe('larger');
  });

  it('follows the address\'s theme, else config.json\'s, where the person leaves the theme on Automatic', async () => {
    browserSpeaks('en-US');
    window.history.replaceState(null, '', '/?theme=contrast');
    serveConfig({ dataSource: 'demo', theme: 'dark' });
    root = await start(container);
    expect(await screen.findByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe('contrast');
    expect(document.documentElement.dataset.textSize).toBe('standard');
    root.unmount();

    window.history.replaceState(null, '', '/');
    root = await start(container);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('leaves the theme to Teams whatever the person chose, and keeps the text size they chose', async () => {
    browserSpeaks('en-US');
    localStorage.setItem('orgapp.userSettings', '{"theme":"dark","textSize":"large"}');
    window.history.replaceState(null, '', '/?host=teams&theme=contrast');
    serveConfig({ dataSource: 'demo', theme: 'contrast' });

    root = await start(container);

    expect(await screen.findByRole('button', { name: 'Settings' })).toBeTruthy();
    // Teams' default theme is the light one.
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.textSize).toBe('large');
  });

  it('links the support desk on the error screen, also where config.json is wrong elsewhere', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    browserSpeaks('en-US');
    serveConfig({ dataSource: 'ldap', support: { label: 'Contoso Service Desk', url: 'mailto:servicedesk@contoso.com' } });

    root = await start(container);

    const link = await screen.findByRole('link', { name: 'Contoso Service Desk' });
    expect(link.getAttribute('href')).toBe('mailto:servicedesk@contoso.com');
    expect(link.closest('p')?.textContent).toContain('Contact your IT support and pass on the technical details below.');
  });

  it('says in About this chart which build it is, "dev" where no pipeline numbered it, and where it runs', async () => {
    installDialogMethods();
    browserSpeaks('en-US');
    serveConfig({ dataSource: 'demo' });

    root = await start(container);
    fireEvent.click(await screen.findByRole('button', { name: 'Help' }));

    const about = within(await screen.findByRole('region', { name: 'About this chart' }));
    expect(about.getByText('Version').nextElementSibling?.textContent).toBe('dev');
    expect(about.getByText('Where it runs').nextElementSibling?.textContent).toBe('Its own site');
  });

  it('says in Teams where it runs, and offers nothing to forget with demo data, which the browser keeps no copy of', async () => {
    installDialogMethods();
    browserSpeaks('en-US');
    window.history.replaceState(null, '', '/?host=teams');
    serveConfig({ dataSource: 'demo' });

    root = await start(container);
    fireEvent.click(await screen.findByRole('button', { name: 'Help' }));

    const about = within(await screen.findByRole('region', { name: 'About this chart' }));
    expect(about.getByText('Where it runs').nextElementSibling?.textContent).toBe('Microsoft Teams');
    fireEvent.click(screen.getByRole('button', { name: 'Close help' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const account = within(await screen.findByRole('region', { name: 'Account' }));
    expect(account.getByRole('button', { name: 'Show me in the chart' })).toBeTruthy();
    expect(account.queryByRole('button', { name: "Forget this browser's copy" })).toBeNull();
  });

  it('saves where the person is in Teams before Teams suspends the tab, apart from what the chart\'s own site saves', async () => {
    browserSpeaks('en-US');
    teamsApp.lifecycle = {
      registerBeforeSuspendOrTerminateHandler: (handler: () => Promise<void>) => {
        teams.suspend = handler;
      },
      registerOnResumeHandler: () => undefined,
    };
    window.history.replaceState(null, '', '/?host=teams');
    serveConfig({ dataSource: 'demo' });

    root = await start(container);
    const ceo = await screen.findByRole('treeitem', { name: 'Ingrid Solberg' }, { timeout: 5000 });
    fireEvent.click(ceo);
    await teams.suspend?.();

    const saved = JSON.parse(localStorage.getItem('orgapp.savedViews') ?? '{}') as Record<string, Record<string, unknown>>;
    expect(Object.values(saved.teams ?? {})).toEqual([expect.objectContaining({ selectedId: ceo.dataset.employeeId })]);
    expect(saved.standalone).toBeUndefined();
  });

  it("names a Teams tab's settings after the chart, in English whatever the language of Teams", async () => {
    browserSpeaks('en-US');
    teams.locale = 'de-de';
    openTabSettings();
    serveConfig({ dataSource: 'demo' });

    root = await start(container);

    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Add Organization chart');
    expect(document.documentElement.lang).toBe('en');
  });

  it("offers Teams' people picker in a tab's settings, and saves the people chosen and the levels unfolded at start", async () => {
    browserSpeaks('en-US');
    teams.hasPeople = true;
    teams.selectPeople.mockResolvedValueOnce([{ objectId: 'id-anna', displayName: 'Anna Lund', email: 'anna@contoso.com' }]);
    openTabSettings();
    serveConfig({ dataSource: 'demo', chart: { expandDepth: 2 } });

    root = await start(container);
    fireEvent.click(await screen.findByRole('button', { name: 'Choose people' }));
    expect(await screen.findByRole('button', { name: 'Remove Anna Lund' })).toBeTruthy();
    const depth = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Levels unfolded at start' });
    expect(depth.options[0]?.textContent).toBe('Default (2)');
    fireEvent.change(depth, { target: { value: '3' } });

    // Pressed until the page has reported what it shows, which it does in an effect after it renders.
    await vi.waitFor(async () => {
      const saved = new Promise<void>((resolve) => {
        teams.registerOnSaveHandler.mock.lastCall?.[0]({ notifySuccess: resolve, notifyFailure: () => { resolve(); } });
      });
      await saved;
      expect(teams.setConfig.mock.lastCall?.[0].contentUrl).toBe(`${window.location.origin}/?top=anna%40contoso.com&depth=3&host=teams`);
    });
  });

  it("keeps the field to type addresses in where Teams has no people picker, as in Outlook and on microsoft365.com", async () => {
    browserSpeaks('en-US');
    openTabSettings();
    serveConfig({ dataSource: 'demo' });

    root = await start(container);

    expect(await screen.findByRole('textbox', { name: 'Top persons (optional)' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Choose people' })).toBeNull();
  });

  it("keeps config.json's title on an error screen that comes after config.json was read", async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    browserSpeaks('en-US');
    teams.registerOnSaveHandler.mockImplementation(() => {
      throw new Error('TeamsJS was not initialized.');
    });
    openTabSettings();
    serveConfig({ dataSource: 'demo', branding: { title: 'Contoso organization' } });

    root = await start(container);

    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('The organization chart could not start');
    expect(document.title).toBe('Contoso organization');
    expect(document.documentElement.lang).toBe('en');
    expect(logged).toHaveBeenCalledOnce();
  });
});
