/* vite.config.ts imports this file through Node's type stripping: no imports, aliases, browser APIs or enums here. */

/** The Microsoft 365 apps that host the Teams app; always allowed, or the Teams app would stop loading. */
export const MICROSOFT_365_HOSTS = [
  'https://teams.microsoft.com',
  'https://*.teams.microsoft.com',
  'https://*.cloud.microsoft',
  'https://*.microsoft365.com',
  'https://*.office.com',
  'https://outlook.office.com',
  'https://outlook.office365.com',
] as const;

/** Allowed when config.json names no sites: every organization's SharePoint. */
export const DEFAULT_EMBEDDING_SITES = ['https://*.sharepoint.com'] as const;

/** An https origin, optionally with a leading "*." for all subdomains: the form frame-ancestors takes. */
const SITE = /^https:\/\/(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?$/;

/** Null when left out. Only bare origins: anything else could end the directive and add its own policy. */
export function parseAllowedSites(value: unknown, label: string): string[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${label} must be a list of sites such as "https://contoso.sharepoint.com".`);
  }
  return value.map((item) => {
    const site = item.trim().toLowerCase().replace(/\/$/, '');
    if (!SITE.test(site)) {
      throw new Error(
        `${label} may only hold sites such as "https://contoso.sharepoint.com" or "https://*.contoso.com" (got "${item}").`,
      );
    }
    return site;
  });
}

export function frameAncestors(allowedSites: readonly string[] | null): string {
  return ['frame-ancestors', "'self'", ...(allowedSites ?? DEFAULT_EMBEDDING_SITES), ...MICROSOFT_365_HOSTS].join(' ');
}
