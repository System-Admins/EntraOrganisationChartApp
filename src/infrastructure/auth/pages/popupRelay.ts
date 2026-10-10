import { runPopupRelay } from '@azure/msal-browser/popup-relay';
import { POPUP_RELAY_STRINGS } from './strings';

// Runs top-level, where it can hear the sign-in popup, and forwards the response through window.opener.

/** Shape of MSAL's relayed request in this page's #req; MSAL itself checks where it goes. */
type RelayRequest =
  | { readonly method: 'GET'; readonly url: string }
  | { readonly method: 'POST'; readonly fields: Readonly<Record<string, string>> };

void start();

async function start(): Promise<void> {
  // Any page can open this one with its own request, so the request must carry this app's client ID and redirect page.
  if (openedByThisApp() && (await isThisAppsSignIn(relayRequest()))) {
    document.getElementById('continue')?.addEventListener(
      'click',
      () => {
        runPopupRelay({ allowedAuthorityOrigins: ['https://login.microsoftonline.com'] });
      },
      { once: true },
    );
    return;
  }
  document.getElementById('continue')?.remove();
  // The page is in English, its HTML's language, so what this script writes into it is too.
  document.getElementById('message')?.replaceChildren(POPUP_RELAY_STRINGS.en.notOpenedByApp);
}

/** A cross-origin opener's location can't be read at all. (instanceof Window is false for another window.) */
function openedByThisApp(): boolean {
  const opener = window.opener as Window | null;
  try {
    return opener !== null && opener.location.origin === window.location.origin;
  } catch {
    return false;
  }
}

function relayRequest(): RelayRequest | null {
  try {
    const request = JSON.parse(new URLSearchParams(window.location.hash.slice(1)).get('req') ?? '') as unknown;
    return typeof request === 'object' && request !== null ? (request as RelayRequest) : null;
  } catch {
    return null;
  }
}

async function isThisAppsSignIn(request: RelayRequest | null): Promise<boolean> {
  if (!request) return false;
  try {
    const parameters =
      request.method === 'GET' ? new URL(request.url).searchParams : new URLSearchParams(Object.entries(request.fields));
    const config = (await (await fetch('/config.json', { cache: 'no-cache' })).json()) as { auth?: { clientId?: string } };
    return (
      parameters.get('client_id') === config.auth?.clientId &&
      parameters.get('redirect_uri') === new URL('/redirect.html', window.location.origin).href
    );
  } catch {
    return false;
  }
}
