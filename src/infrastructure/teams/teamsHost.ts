import { app, type ResumeContext } from '@microsoft/teams-js';
import type { ThemeName } from '@/application/settings/appSettings';
import type { HostEnvironment } from '../host/hostEnvironment';

/** What the tab was opened with, which a resumed tab must still show: its address and the person a deep link named. */
interface Opened {
  readonly url: string;
  readonly subPageId: string | null;
}

/** Must run before MSAL is created: TeamsJS installs the bridge that nested app authentication uses. */
export async function connectToTeams(): Promise<HostEnvironment> {
  await app.initialize();
  const context = await app.getContext();
  const opened: Opened = { url: window.location.href, subPageId: context.page.subPageId || null };
  let theme = toThemeName(context.app.theme);
  const themeListeners = new Set<(theme: ThemeName) => void>();
  const suspendListeners = new Set<() => void>();
  const resumeListeners = new Set<() => void>();
  const showTheme = (teamsTheme: string) => {
    if (toThemeName(teamsTheme) === theme) return;
    theme = toThemeName(teamsTheme);
    for (const listener of themeListeners) listener(theme);
  };
  const listenToTheme = () => {
    app.registerOnThemeChangeHandler(showTheme);
  };
  listenToTheme();

  const resume = async ({ contentUrl }: ResumeContext) => {
    const current = await app.getContext().catch(() => null);
    const asked = current?.page.subPageId || null;
    const url = new URL(contentUrl).href;
    // Another tab of the app, or a deep link to another person, opens afresh, where a link always comes first.
    if (url !== opened.url || (asked !== null && asked !== opened.subPageId)) {
      void app.notifySuccess().catch(() => undefined);
      window.location.replace(url);
      return;
    }
    // Teams sends a suspended tab no theme changes.
    listenToTheme();
    if (current) showTheme(current.app.theme);
    for (const listener of resumeListeners) listener();
    void app.notifySuccess().catch(() => undefined);
  };
  keepAcrossSuspension(
    () => {
      for (const listener of suspendListeners) listener();
    },
    (resumed) => {
      resume(resumed).catch((error: unknown) => {
        console.warn('The chart could not take up where it was suspended.', error);
      });
    },
  );

  return {
    kind: 'teams',
    theme,
    loginHint: context.user?.loginHint ?? null,
    subPageId: opened.subPageId,
    languages: context.app.locale ? [context.app.locale, ...navigator.languages] : navigator.languages,
    // Nested app authentication reaches Teams' sign-in through MSAL.
    signIn: null,
    onThemeChange: (listener) => {
      themeListeners.add(listener);
    },
    onSuspend: (listener) => listen(suspendListeners, listener),
    onResume: (listener) => listen(resumeListeners, listener),
  };
}

/** Registering both handlers lets Teams suspend the tab when the person moves elsewhere in Teams, rather than end it. */
function keepAcrossSuspension(suspend: () => void, resume: (context: ResumeContext) => void): void {
  // app.lifecycle is beta in TeamsJS 2: without it Teams loads the tab afresh each time, and the page saves its view on pagehide.
  if (!('lifecycle' in app)) return;
  try {
    app.lifecycle.registerBeforeSuspendOrTerminateHandler(() => {
      suspend();
      return Promise.resolve();
    });
    app.lifecycle.registerOnResumeHandler(resume);
  } catch (error) {
    console.warn('Teams cannot suspend the chart, so it loads it afresh each time.', error);
  }
}

function listen(listeners: Set<() => void>, listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function toThemeName(teamsTheme: string): ThemeName {
  if (teamsTheme === 'dark') return 'dark';
  if (teamsTheme === 'contrast') return 'contrast';
  return 'light';
}
