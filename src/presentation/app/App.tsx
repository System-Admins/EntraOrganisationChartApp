import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import type { HostLifecycle } from '@/application/abstractions/hostLifecycle';
import type { Sender } from '@/application/common/mediator';
import { resolveTheme, type AppSettings } from '@/application/settings/appSettings';
import type { HostKind } from '@/application/settings/hostKind';
import { resolveLanguage } from '@/application/settings/language';
import { OrgChartPage } from '../features/orgChart/OrgChartPage';
import { PresenceProvider } from '../features/presence/presenceContext';
import { PrintProvider } from '../features/print/printContext';
import { UserSettingsProvider, useUserSettings } from '../features/settings/userSettingsContext';
import { DisplayOptionsProvider } from '../shared/displayOptions';
import { LanguageProvider } from '../shared/languageContext';
import { MediatorProvider } from '../shared/mediatorContext';
import { SupportDeskProvider } from '../shared/supportDesk';
import { applyLanguage } from '../theme/branding';
import type { ThemeSetter } from '../theme/themeSync';

interface AppProps {
  readonly mediator: Sender;
  readonly settings: AppSettings;
  /** Teams and other pages' iframes hold their setup in their address and own the Microsoft sign-in. */
  readonly host: HostKind;
  /** Only a standalone page signs in on its own; Teams and embedding pages own the Microsoft sign-in. */
  readonly canSignOut: boolean;
  /** Where the host page owns the sign-in and the directory comes from Graph, Settings offers Forget this browser's copy instead. */
  readonly canForget: boolean;
  /** See PrintState.opensBrowser. */
  readonly printOpensBrowser: boolean;
  /** The build's, for Help > About this chart. */
  readonly version: string;
  /** What the host says of the page's life: Teams suspends and resumes it. */
  readonly lifecycle: HostLifecycle;
  /** Shows the theme and text size chosen in Settings (syncTheme, which start.tsx ran with those the chart opens with). */
  readonly setTheme: ThemeSetter;
}

export function App({ mediator, settings, host, canSignOut, canForget, printOpensBrowser, version, lifecycle, setTheme }: AppProps) {
  return (
    <MediatorProvider mediator={mediator}>
      <UserSettingsProvider settings={settings}>
        <ChosenTheme settings={settings} setTheme={setTheme} />
        <ChosenLanguage settings={settings}>
          <SupportDeskProvider desk={settings.support}>
            <DisplayOptionsProvider value={{ showPhotos: settings.chart.showPhotos }}>
              <PresenceProvider enabled={settings.chart.showPresence}>
                <PrintProvider opensBrowser={printOpensBrowser}>
                  <OrgChartPage
                    settings={settings}
                    host={host}
                    canSignOut={canSignOut}
                    canForget={canForget}
                    version={version}
                    lifecycle={lifecycle}
                  />
                </PrintProvider>
              </PresenceProvider>
            </DisplayOptionsProvider>
          </SupportDeskProvider>
        </ChosenLanguage>
      </UserSettingsProvider>
    </MediatorProvider>
  );
}

/** The theme and text size chosen in Settings, or what Automatic stands for; a theme Teams sets still wins in syncTheme. */
function ChosenTheme({ settings, setTheme }: { settings: AppSettings; setTheme: ThemeSetter }) {
  const [{ theme, textSize }] = useUserSettings();
  const preference = resolveTheme(theme, settings.theme.automatic);

  // Before the paint, so that the page never shows the old theme beside the choice just made.
  useLayoutEffect(() => {
    setTheme({ preference, textSize });
  }, [setTheme, preference, textSize]);

  return null;
}

/** The language chosen in Settings, or what Automatic stands for, for every component and for the page itself. */
function ChosenLanguage({ settings, children }: { settings: AppSettings; children: ReactNode }) {
  const [{ language: chosen }] = useUserSettings();
  const language = resolveLanguage(chosen, [settings.language.automatic]);

  useEffect(() => {
    applyLanguage(language, settings.branding);
  }, [language, settings.branding]);

  return <LanguageProvider language={language}>{children}</LanguageProvider>;
}
