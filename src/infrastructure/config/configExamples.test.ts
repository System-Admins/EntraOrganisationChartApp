import { describe, expect, it } from 'vitest';
import { parseAllowedSites } from './embedding';
import { parseAppConfig } from './appConfig';

const examples = import.meta.glob<string>('/docs/examples/*.json', { eager: true, query: '?raw', import: 'default' });

const TENANT = '11111111-2222-3333-4444-555555555555';
const CLIENT = '66666666-7777-8888-9999-000000000000';

describe('docs/examples', () => {
  it('has examples', () => {
    expect(Object.keys(examples).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(examples))('%s parses once its IDs are filled in', (_path, text) => {
    const json = JSON.parse(text) as { auth?: unknown; embedding?: { allowedSites?: unknown } };
    // The examples hold all-zero IDs, which parseAppConfig refuses on purpose.
    if (json.auth) json.auth = { tenantId: TENANT, clientId: CLIENT };

    expect(() => parseAppConfig(json, '')).not.toThrow();
    expect(() => parseAllowedSites(json.embedding?.allowedSites, 'embedding.allowedSites')).not.toThrow();
  });
});
