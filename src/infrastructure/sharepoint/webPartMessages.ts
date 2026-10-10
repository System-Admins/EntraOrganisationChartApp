// The SharePoint web part's build copies this file (scripts/package-sharepoint-app.mjs): no imports, nothing past ES2015.

/** The web part opens the chart with ?host=sharepoint, which has the chart take its sign-in from the web part. */
export const WEB_PART_HOST = 'sharepoint';

/** The chart's requests to the web part that frames it; the web part answers each with a message of the same type. */
export const WEB_PART_MESSAGES = { hello: 'orgapp.webPart.hello', token: 'orgapp.webPart.token' } as const;

/** The person viewing the page, as SharePoint's page context names them. */
export interface WebPartUser {
  readonly id: string;
  readonly displayName: string;
  readonly userPrincipalName: string;
  readonly isGuest: boolean;
}

export interface HelloRequest {
  readonly type: typeof WEB_PART_MESSAGES.hello;
}

/** `locale` is the SharePoint page's language, such as "en-US". */
export interface HelloAnswer {
  readonly type: typeof WEB_PART_MESSAGES.hello;
  readonly user: WebPartUser;
  readonly locale: string;
}

/** `fresh` asks past SharePoint's cached token, after Microsoft Graph refused it. */
export interface TokenRequest {
  readonly type: typeof WEB_PART_MESSAGES.token;
  readonly id: number;
  readonly fresh: boolean;
}

/** A token for Microsoft Graph, or SharePoint's own words for why it has none. */
export type TokenAnswer = { readonly type: typeof WEB_PART_MESSAGES.token; readonly id: number } & (
  | { readonly token: string }
  | { readonly error: string }
);

export function isHelloRequest(data: unknown): data is HelloRequest {
  return field(data, 'type') === WEB_PART_MESSAGES.hello;
}

export function isTokenRequest(data: unknown): data is TokenRequest {
  return (
    field(data, 'type') === WEB_PART_MESSAGES.token &&
    typeof field(data, 'id') === 'number' &&
    typeof field(data, 'fresh') === 'boolean'
  );
}

export function isHelloAnswer(data: unknown): data is HelloAnswer {
  const user = field(data, 'user');
  return (
    field(data, 'type') === WEB_PART_MESSAGES.hello &&
    typeof field(data, 'locale') === 'string' &&
    typeof field(user, 'id') === 'string' &&
    typeof field(user, 'displayName') === 'string' &&
    typeof field(user, 'userPrincipalName') === 'string' &&
    typeof field(user, 'isGuest') === 'boolean'
  );
}

export function isTokenAnswer(data: unknown): data is TokenAnswer {
  return (
    field(data, 'type') === WEB_PART_MESSAGES.token &&
    typeof field(data, 'id') === 'number' &&
    (typeof field(data, 'token') === 'string' || typeof field(data, 'error') === 'string')
  );
}

/** A property of what another window posted, which can be anything. */
function field(data: unknown, name: string): unknown {
  return typeof data === 'object' && data !== null ? (data as Readonly<Record<string, unknown>>)[name] : undefined;
}
