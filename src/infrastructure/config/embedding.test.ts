import { describe, expect, it } from 'vitest';
import { frameAncestors, parseAllowedSites } from './embedding';

describe('embedding', () => {
  it('allows every SharePoint site and the Teams hosts when no sites are named', () => {
    const directive = frameAncestors(parseAllowedSites(undefined, 'embedding.allowedSites'));

    expect(directive).toMatch(/^frame-ancestors 'self' https:\/\/\*\.sharepoint\.com https:\/\/teams\.microsoft\.com /);
    expect(directive).toContain('https://outlook.office.com');
  });

  it('allows only the named sites, besides the Microsoft 365 hosts the Teams app runs in', () => {
    const directive = frameAncestors(['https://contoso.sharepoint.com']);

    expect(directive).toContain(" 'self' https://contoso.sharepoint.com https://teams.microsoft.com");
    expect(directive).not.toContain('https://*.sharepoint.com');
    expect(frameAncestors([])).toMatch(/^frame-ancestors 'self' https:\/\/teams\.microsoft\.com/);
  });

  it('normalizes sites as people paste them', () => {
    expect(parseAllowedSites([' https://Contoso.SharePoint.com/ ', 'https://*.contoso.com:8443'], 'sites')).toEqual([
      'https://contoso.sharepoint.com',
      'https://*.contoso.com:8443',
    ]);
  });

  it.each([
    'http://contoso.sharepoint.com',
    'https://contoso.sharepoint.com/sites/hr',
    "https://contoso.com; script-src 'unsafe-inline'",
    'https://*',
    '*',
    'contoso.sharepoint.com',
  ])('rejects %s, which is not a bare https origin', (site) => {
    expect(() => parseAllowedSites([site], 'embedding.allowedSites')).toThrow('embedding.allowedSites may only hold sites');
  });

  it('rejects a value that is not a list', () => {
    expect(() => parseAllowedSites('https://contoso.sharepoint.com', 'embedding.allowedSites')).toThrow('must be a list');
  });
});
