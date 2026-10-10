// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Request, Sender } from '@/application/common/mediator';
import { GetOrgChartQuery, type OrgChartResult } from '@/application/features/orgChart/getOrgChart';
import { GetPresencesQuery } from '@/application/features/presence/getPresences';
import { SaveUserSettingsCommand } from '@/application/features/settings/saveUserSettings';
import { GetWorkingHoursQuery } from '@/application/features/workingHours/getWorkingHours';
import type { AppSettings } from '@/application/settings/appSettings';
import type { HostKind } from '@/application/settings/hostKind';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import type { Employee } from '@/domain/employees/employee';
import { stubBrowserLocale } from '@/testing/browserLocale';
import { installDialogMethods } from '@/testing/dialog';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { makePresence } from '@/testing/makePresence';
import type { ThemeSetter } from '../theme/themeSync';
import { App } from './App';

const SETTINGS: AppSettings = {
  chart: {
    options: { topPersons: ['ceo'], hide: SHOW_EVERYONE },
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
    hide: SHOW_EVERYONE,
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
  initialPerson: null,
  allowExport: false,
  allowReports: false,
  changePhotoUrl: null,
  support: null,
  extraFields: [],
};

/** Åse and Zara report to the CEO, in an order the browser's language decides: a Norwegian browser puts Å after Z. */
const TEAM = [makeEmployee('ceo'), makeEmployee('zara', 'ceo'), makeEmployee('åse', 'ceo')];

function mediatorFor(employees: readonly Employee[], sent: Request<unknown>[] = []): Sender {
  return {
    send: <T,>(request: Request<T>) => {
      sent.push(request);
      if (!(request instanceof GetOrgChartQuery)) return Promise.resolve(undefined as T);
      const result: OrgChartResult = {
        chart: buildOrgChart(employees, request.options),
        loadedAt: new Date(2026, 8, 30, 9, 0),
        isStale: false,
      };
      return Promise.resolve(result as T);
    },
  };
}

const renderApp = (
  settings: AppSettings,
  mediator: Sender,
  printOpensBrowser = false,
  setTheme: ThemeSetter = () => undefined,
  host: HostKind = 'embedded',
) =>
  render(
    <App
      mediator={mediator}
      settings={settings}
      host={host}
      canSignOut={false}
      canForget={false}
      printOpensBrowser={printOpensBrowser}
      version="1.0.42"
      lifecycle={{ onSuspend: () => () => undefined, onResume: () => () => undefined }}
      setTheme={setTheme}
    />,
  );

/** A group of choices in Settings > Display. */
const choices = (name: string) => within(within(screen.getByRole('dialog')).getByRole('group', { name }));

const order = () => screen.getAllByRole('treeitem').map((item) => item.dataset.employeeId);

beforeAll(() => {
  // jsdom lacks these browser APIs.
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  HTMLElement.prototype.scrollTo = vi.fn();
  installDialogMethods();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('lang');
  document.title = '';
});

describe('App', () => {
  it.each([
    [true, 'Print in browser'],
    [false, 'Print'],
  ])('names the print button for a host where printing opens the browser: %s', async (printOpensBrowser, name) => {
    renderApp(SETTINGS, mediatorFor([makeEmployee('ceo')]), printOpensBrowser);

    await screen.findByRole('treeitem', { name: 'Ceo' });
    expect(screen.getByRole('button', { name })).toBeTruthy();
    // config.json's title, which the language never replaces.
    expect(document.title).toBe('Org');
  });

  it("speaks English and sorts names in the browser's own order, and names the page after the chart where config.json gives no title", async () => {
    stubBrowserLocale('nb');
    renderApp({ ...SETTINGS, branding: { ...SETTINGS.branding, title: null } }, mediatorFor(TEAM));
    await screen.findByRole('treeitem', { name: 'Ceo' });
    expect(order()).toEqual(['ceo', 'zara', 'åse']);
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Organization chart');
  });

  it('says in a person\'s details where they work today, unless config.json keeps that out', async () => {
    const inTheOffice = makePresence({ workLocation: 'office' });
    const chart = mediatorFor(TEAM);
    const mediator: Sender = {
      send: <T,>(request: Request<T>) =>
        request instanceof GetPresencesQuery
          ? Promise.resolve(new Map(request.employeeIds.map((id) => [id, inTheOffice])) as T)
          : chart.send(request),
    };
    const withPresence = (showWorkLocation: boolean): AppSettings => ({
      ...SETTINGS,
      chart: { ...SETTINGS.chart, showPresence: true, showWorkLocation },
    });

    renderApp(withPresence(true), mediator);
    fireEvent.click(await screen.findByRole('treeitem', { name: 'Ceo' }));
    expect(await screen.findByText('In the office')).toBeTruthy();
    cleanup();

    renderApp(withPresence(false), mediator);
    fireEvent.click(await screen.findByRole('treeitem', { name: 'Ceo' }));
    const panel = screen.getByRole('complementary', { name: 'Details for Ceo' });
    expect(await within(panel).findByText('Available')).toBeTruthy();
    expect(within(panel).queryByText('Work location today')).toBeNull();
  });

  it('shows a person\'s local time from their calendar, unless config.json keeps it out, and then asks no calendar', async () => {
    const sent: Request<unknown>[] = [];
    const chart = mediatorFor(TEAM, sent);
    const mediator: Sender = {
      send: <T,>(request: Request<T>) => {
        if (!(request instanceof GetWorkingHoursQuery)) return chart.send(request);
        sent.push(request);
        return Promise.resolve({ timeZone: 'Etc/UTC', workingHours: null, free: null } as T);
      },
    };
    const withCalendars = (showWorkingHours: boolean): AppSettings => ({ ...SETTINGS, chart: { ...SETTINGS.chart, showWorkingHours } });

    renderApp(withCalendars(true), mediator);
    fireEvent.click(await screen.findByRole('treeitem', { name: 'Ceo' }));
    expect(await screen.findByText('Local time')).toBeTruthy();
    cleanup();
    sent.length = 0;

    renderApp(withCalendars(false), mediator);
    fireEvent.click(await screen.findByRole('treeitem', { name: 'Ceo' }));
    expect(await screen.findByRole('complementary', { name: 'Details for Ceo' })).toBeTruthy();
    expect(screen.queryByText('Local time')).toBeNull();
    expect(sent.filter((request) => request instanceof GetWorkingHoursQuery)).toEqual([]);
  });

  it('shows the theme and the text size chosen in Settings at once, and what Automatic stands for again', async () => {
    const setTheme = vi.fn<ThemeSetter>();
    const sent: Request<unknown>[] = [];
    renderApp({ ...SETTINGS, theme: { chosen: 'auto', automatic: 'light' } }, mediatorFor(TEAM, sent), false, setTheme);
    await screen.findByRole('treeitem', { name: 'Ceo' });
    // The page opened in it already (start.tsx): handing it over again changes nothing.
    expect(setTheme).toHaveBeenLastCalledWith({ preference: 'light', textSize: 'standard' });
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    fireEvent.click(choices('Theme').getByRole('radio', { name: 'High contrast' }));
    expect(setTheme).toHaveBeenLastCalledWith({ preference: 'contrast', textSize: 'standard' });
    fireEvent.click(choices('Text size').getByRole('radio', { name: 'Larger' }));
    expect(setTheme).toHaveBeenLastCalledWith({ preference: 'contrast', textSize: 'larger' });

    // Automatic is config.json's theme, or the address's, not the system's.
    fireEvent.click(choices('Theme').getByRole('radio', { name: 'Automatic' }));
    expect(setTheme).toHaveBeenLastCalledWith({ preference: 'light', textSize: 'larger' });
    const saved = sent.filter((request) => request instanceof SaveUserSettingsCommand).map(({ settings }) => settings);
    expect(saved.map(({ theme, textSize }) => [theme, textSize])).toEqual([
      ['contrast', 'standard'],
      ['contrast', 'larger'],
      ['auto', 'larger'],
    ]);
  });

  it('opens with the theme and the text size this browser remembers, and in Teams leaves the theme to Teams', async () => {
    const setTheme = vi.fn<ThemeSetter>();
    const remembered: AppSettings = { ...SETTINGS, theme: { chosen: 'dark', automatic: 'light' }, textSize: 'large' };
    renderApp(remembered, mediatorFor(TEAM), false, setTheme);
    await screen.findByRole('treeitem', { name: 'Ceo' });
    expect(setTheme).toHaveBeenLastCalledWith({ preference: 'dark', textSize: 'large' });
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(choices('Theme').getByRole<HTMLInputElement>('radio', { name: 'Dark' }).checked).toBe(true);
    expect(choices('Text size').getByRole<HTMLInputElement>('radio', { name: 'Large' }).checked).toBe(true);
    cleanup();

    renderApp(SETTINGS, mediatorFor(TEAM), false, setTheme, 'teams');
    await screen.findByRole('treeitem', { name: 'Ceo' });
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const display = within(within(screen.getByRole('dialog')).getByRole('region', { name: 'Display' }));
    expect(display.queryByRole('group', { name: 'Theme' })).toBeNull();
    expect(display.getByText('The chart follows the theme you chose in Teams.')).toBeTruthy();
  });

  it('links the support desk config.json names after the words that send people to their IT support', async () => {
    const support = { label: 'Contoso Service Desk', url: 'https://servicedesk.contoso.com' };
    // Nobody in the directory: the chart is empty, and the person config.json starts it from is missing.
    renderApp({ ...SETTINGS, support }, mediatorFor([]));

    const links = await screen.findAllByRole('link', { name: 'Contoso Service Desk' });
    expect(links.map((link) => link.parentElement?.textContent)).toEqual([
      "Nobody matches the chart's settings. If you expected to see people here, please contact IT. " +
        'Contoso Service Desk (opens in a new tab)',
      'The chart is set to start from ceo, but they were not found or are hidden. Please tell IT. ' +
        'Contoso Service Desk (opens in a new tab)',
    ]);
    expect(links.every((link) => link.getAttribute('target') === '_blank')).toBe(true);
  });
});
