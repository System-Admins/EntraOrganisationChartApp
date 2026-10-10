import type { HostLifecycle } from '@/application/abstractions/hostLifecycle';
import type { SignedInUser } from '@/application/abstractions/signedInUser';
import type { ThemeName } from '@/application/settings/appSettings';
import type { HostKind } from '@/application/settings/hostKind';
import { WEB_PART_HOST } from '../sharepoint/webPartMessages';

/** Only Teams suspends and resumes the page; elsewhere the lifecycle's listeners are never called. */
export interface HostEnvironment extends HostLifecycle {
  readonly kind: HostKind;
  /** Theme imposed by the host; null when the app follows its own theme setting. */
  readonly theme: ThemeName | null;
  readonly loginHint: string | null;
  /** The person a Teams deep link opens the app on (the link's subEntityId). */
  readonly subPageId: string | null;
  /** Language tags to speak in, first choice first: the host's own, such as Teams' "en-gb", then the browser's. */
  readonly languages: readonly string[];
  /** The SharePoint web part's sign-in, which the chart takes instead of signing in itself; null elsewhere. */
  readonly signIn: HostSignIn | null;
  onThemeChange(listener: (theme: ThemeName) => void): void;
}

/** A sign-in that the page around the chart keeps: it names the person and hands out their tokens for Microsoft Graph. */
export interface HostSignIn {
  readonly user: SignedInUser;
  /** `fresh` passes by the host's cached token, as after Microsoft Graph refused it. */
  graphToken(fresh: boolean): Promise<string>;
}

/** How long a host has to answer, after which the chart runs as a plain page. */
const HOST_TIMEOUT_MS = 5000;

const stopNothing = () => undefined;

/** Teams and the SharePoint web part are opted into with ?host=, which they set, so that other pages never wait for them. */
export async function detectHostEnvironment(search: string): Promise<HostEnvironment> {
  const embedded = window.self !== window.top;
  const host = new URLSearchParams(search).get('host');
  if (host === 'teams') {
    try {
      const { connectToTeams } = await import('../teams/teamsHost');
      return await withTimeout(connectToTeams(), HOST_TIMEOUT_MS);
    } catch (error) {
      console.warn('Microsoft Teams did not respond; continuing as a plain embedded page.', error);
    }
  }
  // A link to the web part's address, opened in a tab of its own, has no web part to ask.
  if (host === WEB_PART_HOST && embedded) {
    try {
      const { connectToWebPart } = await import('../sharepoint/webPartHost');
      return await connectToWebPart(window.parent, HOST_TIMEOUT_MS);
    } catch (error) {
      console.warn('The SharePoint web part did not respond; continuing as a plain embedded page.', error);
    }
  }
  return plainHost(embedded ? 'embedded' : 'standalone', navigator.languages);
}

/** A host that imposes no theme and never suspends the page; without `signIn` the chart signs in itself. */
export function plainHost(kind: HostKind, languages: readonly string[], signIn: HostSignIn | null = null): HostEnvironment {
  return {
    kind,
    theme: null,
    loginHint: null,
    subPageId: null,
    languages,
    signIn,
    onThemeChange: () => undefined,
    onSuspend: () => stopNothing,
    onResume: () => stopNothing,
  };
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out after ${milliseconds} ms.`));
    }, milliseconds);
    promise.then(resolve, reject).finally(() => {
      clearTimeout(timer);
    });
  });
}
