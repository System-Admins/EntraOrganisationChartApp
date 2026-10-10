import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeamsBackNavigation } from './teamsBackNavigation';

interface BackStack {
  /** Whether the host hands the tab its Back button; 'missing' for a TeamsJS without pages.backStack. */
  backButton: boolean | 'missing';
  handler: (() => boolean) | null;
}

const teams = vi.hoisted((): BackStack => ({ backButton: true, handler: null }));

vi.mock('@microsoft/teams-js', () => ({
  pages: {
    backStack: {
      isSupported: () => {
        if (teams.backButton === 'missing') throw new TypeError("Cannot read properties of undefined (reading 'isSupported')");
        return teams.backButton;
      },
      registerBackButtonHandler: (handler: () => boolean) => {
        teams.handler = handler;
      },
    },
  },
}));

afterEach(() => {
  teams.backButton = true;
  teams.handler = null;
});

describe('TeamsBackNavigation', () => {
  it('closes Settings and then the side panel\'s layers with Teams\' Back button, and leaves Back to Teams once nothing is open', () => {
    const back = new TeamsBackNavigation();
    const closeTopmost = vi.fn();
    expect(teams.handler?.()).toBe(false);

    back.track({ panel: 1, dialog: true }, closeTopmost);

    expect(teams.handler?.()).toBe(true);
    // A second press can come before the page has said what is still open.
    expect(teams.handler?.()).toBe(true);
    expect(teams.handler?.()).toBe(false);
    expect(closeTopmost).toHaveBeenCalledTimes(2);
  });

  it('follows what the page says is open, the latest close included', () => {
    const back = new TeamsBackNavigation();
    const first = vi.fn();
    const latest = vi.fn();
    back.track({ panel: 2, dialog: false }, first);
    back.track({ panel: 1, dialog: false }, latest);

    expect(teams.handler?.()).toBe(true);
    expect(teams.handler?.()).toBe(false);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });

  it.each([false, 'missing'] as const)('takes no Back button where Teams offers none to the tab: %s', (backButton) => {
    teams.backButton = backButton;

    const back = new TeamsBackNavigation();

    expect(teams.handler).toBeNull();
    expect(() => {
      back.track({ panel: 1, dialog: false }, vi.fn());
    }).not.toThrow();
  });
});
