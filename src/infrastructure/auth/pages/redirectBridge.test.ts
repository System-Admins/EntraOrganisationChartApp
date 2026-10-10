// @vitest-environment jsdom
import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import redirectHtml from '/redirect.html?raw';

vi.mock('@azure/msal-browser/redirect-bridge', () => ({ broadcastResponseToMainFrame: vi.fn() }));

/** redirect.html as the browser has it before the script runs. */
const PAGE = new DOMParser().parseFromString(redirectHtml, 'text/html');

async function runBridge(outcome: Promise<void>): Promise<void> {
  // As MSAL does, which names the page the moment it is called.
  vi.mocked(broadcastResponseToMainFrame).mockImplementation(() => {
    document.title = 'Microsoft Authentication';
    return outcome;
  });
  document.title = PAGE.title;
  document.body.innerHTML = PAGE.body.innerHTML;
  vi.resetModules();
  await import('./redirectBridge');
  await outcome.catch(() => undefined);
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.title = '';
});

describe('redirect bridge', () => {
  it('leaves the page as its HTML has it while the response is handed over, its own title included', async () => {
    await runBridge(Promise.resolve());

    expect(document.body.innerHTML).toBe(PAGE.body.innerHTML);
    expect(document.querySelector('h1')?.textContent).toBe('Returning to the organization chart...');
    expect(document.title).toBe('Returning to the organization chart...');
  });

  it('writes a failure into the page\'s alert, under a heading that no longer says it is signing in', async () => {
    await runBridge(Promise.reject(new Error('hash_empty_error')));

    expect(document.querySelector('h1')?.textContent).toBe('Sign-in failed');
    expect(document.title).toBe('Sign-in failed');
    const status = document.querySelector('main > [role=alert]');
    expect(status?.textContent).toBe(
      'Sign-in could not be completed. Close this window and try again, or go back to the organization chart.',
    );
    expect(status?.querySelector('a')?.getAttribute('href')).toBe('/');
  });
});
