import { SignInRequiredError } from '@/application/abstractions/authenticator';
import { ServiceError, type ServiceFailure } from '@/application/abstractions/serviceError';
import type { AccessTokenProvider } from '../auth/accessTokenProvider';

export const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const RETRYABLE_STATUSES = new Set([429, 503, 504]);
const MAX_RETRIES = 5;
/** Further tries of a request that got no answer at all, 1, 2, 4 and 8 seconds apart: about 15 seconds of a dropped connection. */
const UNANSWERED_RETRIES = 4;
/** How long a request waits for a browser that says it is offline to come back, before it gives up as offline. */
export const ONLINE_WAIT_MS = 60_000;
/** Asks a delta round for only the properties that changed (null where cleared) instead of every selected one. */
const CHANGES_ONLY = { Prefer: 'return=minimal' };

interface GraphPage<T> {
  readonly value: T[];
  readonly '@odata.nextLink'?: string;
  readonly '@odata.deltaLink'?: string;
}

/** One page of a collection, with the link to the page after it; null on the last page. */
export interface PageOf<T> {
  readonly items: readonly T[];
  readonly nextLink: string | null;
}

/** What the client asks of the browser's network connection. */
export interface Connection {
  /** False only where the browser knows it is offline: "online" can still mean a network that reaches nothing. */
  isOnline(): boolean;
  /** Resolves true as the browser goes online again, or false after `timeoutMs`. */
  whenOnline(timeoutMs: number): Promise<boolean>;
}

export const BROWSER_CONNECTION: Connection = {
  // Unknown counts as online, as outside a browser.
  isOnline: () => (globalThis.navigator as Navigator | undefined)?.onLine !== false,
  whenOnline: (timeoutMs) =>
    new Promise((resolve) => {
      const settle = (online: boolean) => {
        clearTimeout(timer);
        window.removeEventListener('online', wentOnline);
        resolve(online);
      };
      const wentOnline = () => {
        settle(true);
      };
      const timer = setTimeout(() => {
        settle(false);
      }, timeoutMs);
      window.addEventListener('online', wentOnline);
    }),
};

interface GraphErrorBody {
  readonly error?: { readonly code?: string; readonly message?: string };
}

export class GraphRequestError extends ServiceError {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    failure: ServiceFailure = failureOf(status),
  ) {
    super(failure, message);
    this.name = 'GraphRequestError';
  }
}

/** A retryable status only gets here once the retries are used up. */
function failureOf(status: number): ServiceFailure {
  if (status === 401 || status === 403) return 'accessDenied';
  if (status === 404) return 'notFound';
  return RETRYABLE_STATUSES.has(status) ? 'busy' : 'other';
}

interface GraphRequestInit {
  readonly method?: string;
  readonly body?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;
export type Delay = (milliseconds: number) => Promise<void>;

export class GraphClient {
  /** `isGuest` says whether the signed-in account is a guest, whom a directory can refuse whatever the app's consent. */
  constructor(
    private readonly getAccessToken: AccessTokenProvider,
    private readonly isGuest: () => boolean = () => false,
    private readonly fetchFn: Fetch = (url, init) => fetch(url, init),
    private readonly delay: Delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    private readonly connection: Connection = BROWSER_CONNECTION,
  ) {}

  /** Yields every page of a collection by following @odata.nextLink, from `from` where given; the server decides the page size. */
  async *pages<T>(path: string, from: string | null = null): AsyncGenerator<PageOf<T>> {
    let url: string | null = from ?? `${GRAPH_ROOT}${path}`;
    while (url) {
      const page: GraphPage<T> = await this.send(url);
      url = page['@odata.nextLink'] ?? null;
      yield { items: page.value, nextLink: url };
    }
  }

  /** A GET of `path`; `headers` are for requests that need their own, such as a count. */
  getJson<T>(path: string, headers: Readonly<Record<string, string>> = {}): Promise<T> {
    return this.send(`${GRAPH_ROOT}${path}`, { headers });
  }

  /** One round of a delta query from an absolute link: every item, then the link for the next round. */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the JSON's type, as with send()
  async readDelta<T>(link: string): Promise<{ readonly items: readonly T[]; readonly deltaLink: string }> {
    const items: T[] = [];
    let url: string | undefined = link;
    while (url) {
      // On every page: a next link carries the round's position, not the request's headers.
      const page: GraphPage<T> = await this.send(url, { headers: CHANGES_ONLY });
      items.push(...page.value);
      const deltaLink = page['@odata.deltaLink'];
      if (deltaLink) return { items, deltaLink };
      url = page['@odata.nextLink'];
    }
    throw new ServiceError('other', 'Microsoft Graph ended a delta round without a delta link.');
  }

  postJson<T>(path: string, body: unknown): Promise<T> {
    return this.send(`${GRAPH_ROOT}${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async send<T>(url: string, init: GraphRequestInit = {}): Promise<T> {
    for (let attempt = 0, unanswered = 0; ; ) {
      const request = { ...init, headers: { ...init.headers, Authorization: `Bearer ${await this.getAccessToken()}` } };
      let response: Response;
      try {
        // fetch only rejects when no answer arrived at all: offline, a name that doesn't resolve, a dropped connection.
        response = await this.fetchFn(url, request);
        // The body comes after the status, and a dropped connection can cut it off too.
        if (response.ok) return (await response.json()) as T;
      } catch (error) {
        // A body that isn't JSON came whole: trying again would only fetch it again.
        if (error instanceof SyntaxError) throw error;
        if (await this.mayRetryUnanswered(unanswered++)) continue;
        throw new ServiceError('offline', `Microsoft Graph could not be reached: ${String(error)}`, { cause: error });
      }
      if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
        await this.delay(retryDelay(response, attempt++));
        continue;
      }
      throw await toError(response, this.isGuest());
    }
  }

  /** Waits before another try of a request that got no answer; false once the tries are used up, or the browser stays offline. */
  private async mayRetryUnanswered(retry: number): Promise<boolean> {
    if (retry >= UNANSWERED_RETRIES) return false;
    // Tries while the browser knows it is offline would all fail, so the request waits for it to come back instead.
    if (!this.connection.isOnline()) return this.connection.whenOnline(ONLINE_WAIT_MS);
    await this.delay(1000 * 2 ** retry);
    return true;
  }
}

/** Graph sends Retry-After (seconds) when throttling; otherwise back off exponentially from one second. */
function retryDelay(response: Response, attempt: number): number {
  const retryAfterSeconds = Number(response.headers.get('Retry-After'));
  return Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 1000 * 2 ** attempt;
}

async function toError(response: Response, guest: boolean): Promise<Error> {
  if (response.status === 401) return new SignInRequiredError();
  const body = (await response.json().catch(() => ({}))) as GraphErrorBody;
  const code = body.error?.code ?? null;
  // Entra ID's guest access settings can keep guests out of the directory, which no consent changes.
  if (response.status === 403 && guest) {
    return new GraphRequestError(
      403,
      code,
      'Microsoft Graph denied a guest account access to the user directory. Guests can read it only where the ' +
        "tenant's external collaboration settings give guest users the same access as members.",
      'guestDenied',
    );
  }
  if (response.status === 403) {
    return new GraphRequestError(
      403,
      code,
      'Microsoft Graph denied access to the user directory. An administrator must grant consent for the ' +
        'User.Read.All permission on the app registration, or for the SharePoint web part approve it under API access ' +
        'in the SharePoint admin center.',
    );
  }
  const detail = body.error?.message ?? response.statusText;
  return new GraphRequestError(response.status, code, `Microsoft Graph request failed (${response.status}): ${detail}`);
}
