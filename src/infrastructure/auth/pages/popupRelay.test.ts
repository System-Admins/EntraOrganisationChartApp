// @vitest-environment jsdom
import { runPopupRelay } from '@azure/msal-browser/popup-relay';
import { afterEach, describe, expect, it, vi } from 'vitest';
import relayHtml from '/popup-relay.html?raw';

vi.mock('@azure/msal-browser/popup-relay', () => ({ runPopupRelay: vi.fn() }));

/** popup-relay.html as the browser has it before the script runs. */
const PAGE = new DOMParser().parseFromString(relayHtml, 'text/html');

async function openRelay(): Promise<void> {
  document.body.innerHTML = PAGE.body.innerHTML;
  vi.resetModules();
  await import('./popupRelay');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('popup relay', () => {
  it('keeps its heading when it was not opened by the app, and offers nothing to continue', async () => {
    await openRelay();
    await vi.waitFor(() => {
      expect(document.getElementById('message')?.textContent).toBe(
        'This window only works when the organization chart opens it. You can close it.',
      );
    });

    expect(document.querySelector('h1')?.textContent).toBe('Sign in');
    expect(document.querySelector('button')).toBeNull();
    expect(runPopupRelay).not.toHaveBeenCalled();
  });

  it('leaves its own words in place while it checks the request of the chart that opened it', async () => {
    vi.stubGlobal('opener', window);
    // The check waits for config.json, which never comes here.
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    window.location.hash = `req=${encodeURIComponent(JSON.stringify({ method: 'GET', url: 'https://login.microsoftonline.com/x' }))}`;

    await openRelay();

    expect(document.body.innerHTML).toBe(PAGE.body.innerHTML);
    expect(document.getElementById('message')?.textContent).toBe('Continue to sign in with your Microsoft work account.');
    expect(document.getElementById('continue')?.textContent).toBe('Continue');
  });
});
