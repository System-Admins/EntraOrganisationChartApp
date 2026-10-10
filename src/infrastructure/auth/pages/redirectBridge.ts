import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';
import { REDIRECT_STRINGS } from './strings';

// The page is in English, its HTML's language, so what this script writes into it is too.
const texts = REDIRECT_STRINGS.en;
const title = document.title;

// Entry point of redirect.html: hands the auth response back to the page that started the flow.
const handover = broadcastResponseToMainFrame();
// The call names the page "Microsoft Authentication" as it starts, so the page's own title goes back.
document.title = title;
handover.catch((error: unknown) => {
  console.error('Could not complete sign-in.', error);
  showFailure();
});

/** The page is a popup, or the tab itself after a full-page sign-in, where closing the window leads nowhere. */
function showFailure(): void {
  document.title = texts.failed;
  document.querySelector('h1')?.replaceChildren(texts.failed);
  const chart = document.createElement('a');
  chart.href = '/';
  chart.textContent = texts.link;
  document.getElementById('status')?.replaceChildren(texts.beforeLink, chart, texts.afterLink);
}
