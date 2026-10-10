import { KEPT_PARAMETERS } from '@/application/settings/chartAddress';
import type { Employee } from '@/domain/employees/employee';
import { readable } from '../config/urlUserSettingsStore';

/** The static tab's entityId in teams/manifest.template.json. */
const PERSONAL_TAB_ENTITY_ID = 'orgchart';

/** Keeps ?top=, ?team=, ?show= and ?hide= so the link opens the same chart; ?host=teams, depth and theme are dropped. */
export function webPersonLink(employee: Employee, current: URL): string {
  const link = sameChart(current);
  link.searchParams.set('person', employee.mail ?? employee.userPrincipalName);
  return link.href;
}

/** For another page's iframe: the chart `current` shows, without the person whose details are open; readable, as people edit it. */
export function embedLink(current: URL): string {
  return readable(sameChart(current)).href;
}

/** Teams hands `subEntityId` to the tab as page.subPageId. It wants every value percent-encoded, spaces too. */
export function teamsPersonLink(appId: string, employee: Employee, webUrl: string): string {
  const query = Object.entries({
    webUrl,
    label: employee.displayName,
    context: JSON.stringify({ subEntityId: employee.id }),
  })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `https://teams.microsoft.com/l/entity/${encodeURIComponent(appId)}/${PERSONAL_TAB_ENTITY_ID}?${query}`;
}

/** The same page with what decides who is in the chart, and nothing that belongs to the viewer or the host. */
function sameChart(current: URL): URL {
  const link = new URL(current.pathname, current.origin);
  for (const name of KEPT_PARAMETERS) {
    const value = current.searchParams.get(name);
    if (value) link.searchParams.set(name, value);
  }
  return link;
}
