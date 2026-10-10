import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { resolveTheme } from '@/application/settings/appSettings';
import type { Branding } from '@/application/settings/branding';
import { resolveLanguage } from '@/application/settings/language';
import { fetchAppConfig, parseAppConfig, supportDeskIn } from '@/infrastructure/config/appConfig';
import { readStoredUserSettings } from '@/infrastructure/config/storageUserSettingsStore';
import { detectHostEnvironment } from '@/infrastructure/host/hostEnvironment';
import { App } from '@/presentation/app/App';
import { StartupError } from '@/presentation/app/StartupError';
import { TabConfigPage } from '@/presentation/features/teamsTabConfig/TabConfigPage';
import { LanguageProvider } from '@/presentation/shared/languageContext';
import { SupportDeskProvider } from '@/presentation/shared/supportDesk';
import { applyBranding, applyLanguage, chartTitle } from '@/presentation/theme/branding';
import { syncTheme } from '@/presentation/theme/themeSync';
import { createMediator } from './compositionRoot';

/** Renders the chart, the Teams tab's settings or the error screen; the root is returned so that tests can unmount it. */
export async function start(container: HTMLElement | null): Promise<Root> {
  if (!container) throw new Error('The page has no #root element.');
  const root = createRoot(container);
  const search = window.location.search;
  // The browser's, until config.json and the host have their say, and on the error screen when they can't.
  let language = resolveLanguage('auto', navigator.languages);
  // Null until config.json is read; an error screen after that keeps its title.
  let branding: Branding | null = null;
  // config.json as read, whose support desk the error screen links even where the file is wrong elsewhere.
  let json: unknown = null;

  try {
    // Teams must be initialized before MSAL is created; the config fetch runs alongside it.
    const [read, host] = await Promise.all([fetchAppConfig(), detectHostEnvironment(search)]);
    json = read;
    const config = parseAppConfig(json, search, readStoredUserSettings(), host.languages);
    // A Teams deep link can't add ?person= to the tab's URL, so the person arrives through the Teams context.
    const settings = { ...config.settings, initialPerson: config.settings.initialPerson ?? host.subPageId };
    branding = settings.branding;
    language = resolveLanguage(settings.language.chosen, [settings.language.automatic]);
    applyBranding(settings.branding);
    applyLanguage(language, settings.branding);
    const setTheme = syncTheme(
      { preference: resolveTheme(settings.theme.chosen, settings.theme.automatic), textSize: settings.textSize },
      host,
      settings.pageColors,
    );

    if (host.kind === 'teams' && new URLSearchParams(search).get('view') === 'tab-config') {
      const { registerTabConfiguration, currentTabSetup, teamsPeoplePicker } = await import('@/infrastructure/teams/tabConfiguration');
      const title = chartTitle(settings.branding, language);
      const setup = await currentTabSetup();
      const changeSetup = registerTabConfiguration(title);
      root.render(
        <StrictMode>
          <LanguageProvider language={language}>
            <TabConfigPage
              title={title}
              initialSetup={setup}
              defaultDepth={settings.chart.expandDepth}
              peoplePicker={teamsPeoplePicker()}
              onSetupChange={changeSetup}
            />
          </LanguageProvider>
        </StrictMode>,
      );
      return root;
    }

    const mediator = await createMediator(config, host);
    root.render(
      <StrictMode>
        <App
          mediator={mediator}
          settings={settings}
          host={host.kind}
          canSignOut={config.dataSource === 'graph' && host.kind === 'standalone'}
          canForget={config.dataSource === 'graph' && host.kind !== 'standalone'}
          // The composition root gives Teams the printer that opens the browser (TeamsChartPrinter).
          printOpensBrowser={host.kind === 'teams'}
          version={__APP_VERSION__}
          lifecycle={host}
          setTheme={setTheme}
        />
      </StrictMode>,
    );
  } catch (error) {
    console.error(error);
    applyLanguage(language, branding);
    root.render(
      <LanguageProvider language={language}>
        <SupportDeskProvider desk={supportDeskIn(json)}>
          <StartupError error={error} />
        </SupportDeskProvider>
      </LanguageProvider>,
    );
  }
  return root;
}
