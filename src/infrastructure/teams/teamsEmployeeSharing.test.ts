// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeamsEmployeeSharing } from './teamsEmployeeSharing';

const host = vi.hoisted(() => ({ name: 'Teams', clientType: 'desktop' }));

vi.mock('@microsoft/teams-js', () => ({
  HostName: { teams: 'Teams', teamsModern: 'TeamsModern' },
  HostClientType: { android: 'android', ios: 'ios', ipados: 'ipados' },
  app: { getContext: () => Promise.resolve({ app: { appId: null, host } }) },
  pages: { isSupported: () => true },
}));

afterEach(() => {
  host.name = 'Teams';
  host.clientType = 'desktop';
  vi.unstubAllGlobals();
});

describe('TeamsEmployeeSharing', () => {
  it('shares through the dialog of Teams on desktop and the web', async () => {
    expect((await TeamsEmployeeSharing.create(null)).method()).toBe('share');
  });

  it('decides as a browser does on Teams mobile, where that dialog does nothing', async () => {
    host.clientType = 'android';
    vi.stubGlobal('matchMedia', () => ({ matches: true }));

    const sharing = await TeamsEmployeeSharing.create(null);
    expect(sharing.method()).toBe('copy');
    Object.defineProperty(navigator, 'share', { value: () => Promise.resolve(), configurable: true });
    expect(sharing.method()).toBe('share');
    Reflect.deleteProperty(navigator, 'share');
  });
});
