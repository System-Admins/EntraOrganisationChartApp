// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentTabSetup, registerTabConfiguration, teamsPeoplePicker } from './tabConfiguration';

interface SaveEvent {
  readonly notifySuccess: () => void;
  readonly notifyFailure: (reason?: string) => void;
}

interface TabConfig {
  readonly entityId: string;
  readonly suggestedDisplayName?: string;
  readonly contentUrl: string;
  readonly websiteUrl?: string;
}

interface PeoplePickerResult {
  readonly objectId: string;
  readonly displayName?: string;
  readonly email?: string;
}

const teams = vi.hoisted(() => ({
  /** What Teams calls as the person presses Save. */
  saveHandler: null as ((event: SaveEvent) => void) | null,
  setConfig: vi.fn<(config: TabConfig) => Promise<void>>(() => Promise.resolve()),
  setValidityState: vi.fn<(valid: boolean) => void>(),
  getConfig: vi.fn<() => Promise<{ readonly contentUrl?: string }>>(() => Promise.resolve({ contentUrl: '' })),
  /** Whether the host has a people picker, which Outlook and microsoft365.com don't. */
  hasPeople: true,
  selectPeople: vi.fn<(inputs: unknown) => Promise<PeoplePickerResult[]>>(() => Promise.resolve([])),
}));

vi.mock('@microsoft/teams-js', () => ({
  ErrorCode: { NOT_SUPPORTED_ON_PLATFORM: 100, USER_ABORT: 8000 },
  pages: {
    getConfig: teams.getConfig,
    config: {
      registerOnSaveHandler: (handler: (event: SaveEvent) => void) => {
        teams.saveHandler = handler;
      },
      setConfig: teams.setConfig,
      setValidityState: teams.setValidityState,
    },
  },
  people: { isSupported: () => teams.hasPeople, selectPeople: teams.selectPeople },
}));

afterEach(() => {
  teams.saveHandler = null;
  teams.hasPeople = true;
  vi.clearAllMocks();
});

/** Presses Teams' Save: what the tab was saved with, or why it was not. */
function save(): Promise<{ readonly saved?: TabConfig; readonly failure?: string }> {
  return new Promise((resolve) => {
    teams.saveHandler?.({
      notifySuccess: () => {
        resolve({ saved: teams.setConfig.mock.calls.at(-1)?.[0] });
      },
      notifyFailure: (reason) => {
        resolve({ failure: reason });
      },
    });
  });
}

const origin = () => window.location.origin;

describe('registerTabConfiguration', () => {
  it('saves the top persons and the levels unfolded at start in both of the tab\'s addresses, Teams\' own with ?host=teams', async () => {
    const changeSetup = registerTabConfiguration('Organization chart');
    changeSetup({ topPersons: ['anna@contoso.com', '00000000-0000-4000-8000-000000000038'], depth: 2 });

    const { saved } = await save();

    const query = 'top=anna%40contoso.com%2C00000000-0000-4000-8000-000000000038&depth=2';
    expect(saved).toEqual({
      entityId: 'orgchart',
      suggestedDisplayName: 'Organization chart',
      contentUrl: `${origin()}/?${query}&host=teams`,
      websiteUrl: `${origin()}/?${query}`,
    });
  });

  it('leaves the whole organization and the levels config.json sets out of the addresses', async () => {
    registerTabConfiguration('Organization chart')({ topPersons: [], depth: null });

    const { saved } = await save();

    expect([saved?.contentUrl, saved?.websiteUrl]).toEqual([`${origin()}/?host=teams`, `${origin()}/`]);
  });

  it('offers Save only while the page reports a setup that can be saved, and saves the latest one', async () => {
    const changeSetup = registerTabConfiguration('Organization chart');
    // Teams keeps Save unavailable until the page reports a setup.
    expect(teams.setValidityState).not.toHaveBeenCalled();
    expect(await save()).toEqual({ failure: 'The tab has no setup that can be saved.' });

    changeSetup({ topPersons: ['anna@contoso.com'], depth: null });
    expect(teams.setValidityState).toHaveBeenLastCalledWith(true);
    changeSetup(null);
    expect(teams.setValidityState).toHaveBeenLastCalledWith(false);
    changeSetup({ topPersons: ['erik@contoso.com'], depth: 0 });
    expect(teams.setValidityState).toHaveBeenLastCalledWith(true);

    expect(new URL((await save()).saved?.websiteUrl ?? '').search).toBe('?top=erik%40contoso.com&depth=0');
  });

  it('tells Teams why the tab could not be saved', async () => {
    teams.setConfig.mockRejectedValueOnce(new Error('The tab could not be updated.'));
    registerTabConfiguration('Organization chart')({ topPersons: [], depth: null });

    expect(await save()).toEqual({ failure: 'The tab could not be updated.' });
  });
});

describe('currentTabSetup', () => {
  it('reads back the top persons and the levels of the tab being edited', async () => {
    teams.getConfig.mockResolvedValueOnce({ contentUrl: `${origin()}/?top=anna%40contoso.com%2Cerik%40contoso.com&depth=3&host=teams` });

    expect(await currentTabSetup()).toEqual({ topPersons: ['anna@contoso.com', 'erik@contoso.com'], depth: 3 });
  });

  it('leaves the levels to config.json where the chart would refuse them, and starts a new tab with everyone', async () => {
    teams.getConfig.mockResolvedValueOnce({ contentUrl: `${origin()}/?top=anna@contoso.com;&depth=11&host=teams` });
    expect(await currentTabSetup()).toEqual({ topPersons: ['anna@contoso.com'], depth: null });

    teams.getConfig.mockResolvedValueOnce({ contentUrl: '' });
    expect(await currentTabSetup()).toEqual({ topPersons: [], depth: null });

    teams.getConfig.mockRejectedValueOnce(new Error('Not in a tab.'));
    expect(await currentTabSetup()).toEqual({ topPersons: [], depth: null });
  });
});

describe('teamsPeoplePicker', () => {
  it('opens Teams\' people picker for the whole organization, with the people chosen already shown as chosen', async () => {
    await teamsPeoplePicker()?.pick(['id-anna']);

    expect(teams.selectPeople).toHaveBeenCalledExactlyOnceWith({ openOrgWideSearchInChatOrChannel: true, setSelected: ['id-anna'] });
  });

  it('keeps each person chosen by e-mail address, or by object id where Teams gives none, with the name where it gives one', async () => {
    teams.selectPeople.mockResolvedValueOnce([
      { objectId: 'id-anna', displayName: 'Anna Lund', email: 'anna@contoso.com' },
      { objectId: 'id-bo', displayName: ' ', email: '' },
      { objectId: 'id-erik' },
    ]);

    expect(await teamsPeoplePicker()?.pick([])).toEqual([
      { id: 'id-anna', identifier: 'anna@contoso.com', displayName: 'Anna Lund' },
      { id: 'id-bo', identifier: 'id-bo', displayName: null },
      { id: 'id-erik', identifier: 'id-erik', displayName: null },
    ]);
  });

  it('answers nothing chosen where the person cancelled, and fails with what Teams said where it could not show the picker', async () => {
    const picker = teamsPeoplePicker();

    teams.selectPeople.mockRejectedValueOnce({ errorCode: 8000, message: 'User cancelled the operation.' });
    expect(await picker?.pick([])).toBeNull();

    teams.selectPeople.mockRejectedValueOnce({ errorCode: 100 });
    await expect(picker?.pick([])).rejects.toThrow('Teams could not show its people picker (error 100).');
  });

  it('has no picker where the host has none, as in Outlook and on microsoft365.com', () => {
    teams.hasPeople = false;

    expect(teamsPeoplePicker()).toBeNull();
  });
});
