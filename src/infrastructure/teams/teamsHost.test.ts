// @vitest-environment jsdom
import type { ResumeContext } from '@microsoft/teams-js';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { connectToTeams } from './teamsHost';

const context = vi.hoisted(() => ({
  app: { theme: 'dark', locale: 'en-us' },
  user: { loginHint: 'anna@contoso.com' },
  page: { subPageId: 'anna' },
}));

interface TeamsApp {
  initialize: () => Promise<void>;
  getContext: () => Promise<typeof context>;
  registerOnThemeChangeHandler: Mock<(handler: (theme: string) => void) => void>;
  notifySuccess: Mock<() => Promise<void>>;
  /** Beta in TeamsJS 2: put in by the tests that need it. */
  lifecycle?: unknown;
}

const app = vi.hoisted(
  (): TeamsApp => ({
    initialize: () => Promise.resolve(),
    getContext: () => Promise.resolve(structuredClone(context)),
    registerOnThemeChangeHandler: vi.fn(),
    notifySuccess: vi.fn(() => Promise.resolve()),
  }),
);

vi.mock('@microsoft/teams-js', () => ({ app }));

/** What Teams registers through app.lifecycle, and calls when it suspends and resumes the tab. */
const lifecycle = {
  suspend: null as (() => Promise<void>) | null,
  resume: null as ((resumed: ResumeContext) => void) | null,
  api: {
    registerBeforeSuspendOrTerminateHandler: (handler: () => Promise<void>) => {
      lifecycle.suspend = handler;
    },
    registerOnResumeHandler: (handler: (resumed: ResumeContext) => void) => {
      lifecycle.resume = handler;
    },
  },
};

const TAB = 'https://orgchart.contoso.com/?host=teams';

beforeEach(() => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-GB', 'en']);
  // Without the property at all, as in a TeamsJS without the beta.
  delete app.lifecycle;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  app.registerOnThemeChangeHandler.mockReset();
  app.notifySuccess.mockClear();
  lifecycle.suspend = null;
  lifecycle.resume = null;
  context.app.locale = 'en-us';
  context.app.theme = 'dark';
  context.page.subPageId = 'anna';
});

describe('connectToTeams', () => {
  it('reads the theme, the account, the deep link\'s person, and the language of Teams before the browser\'s', async () => {
    expect(await connectToTeams()).toMatchObject({
      kind: 'teams',
      theme: 'dark',
      loginHint: 'anna@contoso.com',
      subPageId: 'anna',
      languages: ['en-us', 'en-GB', 'en'],
    });
  });

  it('leaves the language to the browser where Teams names none', async () => {
    context.app.locale = '';

    expect((await connectToTeams()).languages).toEqual(['en-GB', 'en']);
  });

  it('passes on a change of the Teams theme', async () => {
    const host = await connectToTeams();
    const themes = vi.fn();
    host.onThemeChange(themes);

    app.registerOnThemeChangeHandler.mock.calls[0]?.[0]('contrast');

    expect(themes).toHaveBeenCalledExactlyOnceWith('contrast');
  });

  it('connects without app.lifecycle, which TeamsJS 2 has in beta only, and then never suspends the page', async () => {
    const host = await connectToTeams();

    expect(host.kind).toBe('teams');
    expect(host.onSuspend(vi.fn())).toBeTypeOf('function');
    expect(lifecycle.suspend).toBeNull();
  });

  it('connects where registering for the lifecycle fails, and says so on the console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    app.lifecycle = {
      registerBeforeSuspendOrTerminateHandler: () => {
        throw new Error('The host does not support this.');
      },
      registerOnResumeHandler: vi.fn(),
    };

    await expect(connectToTeams()).resolves.toMatchObject({ kind: 'teams' });
    expect(warn).toHaveBeenCalledOnce();
  });

  describe('where Teams suspends the tab', () => {
    /** The tab's address, which a resume with another tab's replaces. */
    const replace = vi.fn<(url: string) => void>();

    beforeEach(() => {
      app.lifecycle = lifecycle.api;
      replace.mockReset();
      vi.stubGlobal('location', { href: TAB, replace });
    });

    it('tells the page before it suspends, and only the pages still listening', async () => {
      const host = await connectToTeams();
      const saveView = vi.fn();
      const stopped = vi.fn();
      host.onSuspend(saveView);
      host.onSuspend(stopped)();

      await lifecycle.suspend?.();

      expect(saveView).toHaveBeenCalledOnce();
      expect(stopped).not.toHaveBeenCalled();
    });

    it('takes up where it was when resumed with the same tab, listening to the theme again and taking the one Teams has now', async () => {
      const host = await connectToTeams();
      const resumed = vi.fn();
      const themes = vi.fn();
      host.onResume(resumed);
      host.onThemeChange(themes);
      app.registerOnThemeChangeHandler.mockClear();
      // Changed while the tab was suspended, which Teams told nobody.
      context.app.theme = 'contrast';

      lifecycle.resume?.({ entityId: 'orgchart', contentUrl: new URL(TAB) });

      await vi.waitFor(() => {
        expect(app.notifySuccess).toHaveBeenCalledOnce();
      });
      expect(resumed).toHaveBeenCalledOnce();
      expect(app.registerOnThemeChangeHandler).toHaveBeenCalledOnce();
      expect(themes).toHaveBeenCalledExactlyOnceWith('contrast');
      expect(replace).not.toHaveBeenCalled();
    });

    it('takes up where it was, in the theme it had, when Teams cannot say what the resumed tab shows', async () => {
      const host = await connectToTeams();
      const resumed = vi.fn();
      const themes = vi.fn();
      host.onResume(resumed);
      host.onThemeChange(themes);
      vi.spyOn(app, 'getContext').mockRejectedValue(new Error('The context is not available yet.'));

      lifecycle.resume?.({ entityId: 'orgchart', contentUrl: new URL(TAB) });

      await vi.waitFor(() => {
        expect(app.notifySuccess).toHaveBeenCalledOnce();
      });
      expect(resumed).toHaveBeenCalledOnce();
      expect(themes).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
    });

    it('opens afresh what another tab of the app asks for, as its address holds its own setup', async () => {
      const host = await connectToTeams();
      const resumed = vi.fn();
      host.onResume(resumed);

      lifecycle.resume?.({ entityId: 'orgchart', contentUrl: new URL(`${TAB}&top=head.of.sales@contoso.com`) });

      await vi.waitFor(() => {
        expect(replace).toHaveBeenCalledExactlyOnceWith(`${TAB}&top=head.of.sales@contoso.com`);
      });
      expect(resumed).not.toHaveBeenCalled();
      expect(app.notifySuccess).toHaveBeenCalledOnce();
    });

    it('opens afresh for a deep link to another person, which comes before where the page was, but not for the same one', async () => {
      await connectToTeams();

      lifecycle.resume?.({ entityId: 'orgchart', contentUrl: new URL(TAB) });
      await vi.waitFor(() => {
        expect(app.notifySuccess).toHaveBeenCalledOnce();
      });
      expect(replace).not.toHaveBeenCalled();

      context.page.subPageId = 'bo';
      lifecycle.resume?.({ entityId: 'orgchart', contentUrl: new URL(TAB) });
      await vi.waitFor(() => {
        expect(replace).toHaveBeenCalledExactlyOnceWith(TAB);
      });
    });
  });
});
