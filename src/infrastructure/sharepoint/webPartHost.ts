import { SignInFailedError } from '@/application/abstractions/authenticator';
import { ServiceError } from '@/application/abstractions/serviceError';
import type { SignedInUser } from '@/application/abstractions/signedInUser';
import { ACCOUNT_BLOCKED, entraErrorNumber } from '../auth/entraErrors';
import { plainHost, type HostEnvironment, type HostSignIn } from '../host/hostEnvironment';
import {
  isHelloAnswer,
  isTokenAnswer,
  WEB_PART_MESSAGES,
  type HelloRequest,
  type TokenAnswer,
  type TokenRequest,
} from './webPartMessages';

/** Entra ID's number for a permission nobody consented to: for the web part, API access that SharePoint has not approved. */
const NOT_APPROVED = '65001';

/** Asks the web part around the chart who is viewing the page; rejects where no answer comes in `timeoutMs`. */
export function connectToWebPart(parent: Window, timeoutMs: number): Promise<HostEnvironment> {
  return new Promise((resolve, reject) => {
    const answered = (event: MessageEvent) => {
      if (event.source !== parent || !isHelloAnswer(event.data)) return;
      stop();
      const { user, locale } = event.data;
      const languages = locale ? [locale, ...navigator.languages] : navigator.languages;
      resolve(plainHost('sharepoint', languages, new WebPartSignIn(parent, event.origin, user)));
    };
    const stop = () => {
      clearTimeout(timer);
      window.removeEventListener('message', answered);
    };
    const timer = setTimeout(() => {
      stop();
      reject(new Error(`No answer within ${timeoutMs} ms.`));
    }, timeoutMs);
    window.addEventListener('message', answered);
    // The hello carries nothing; the origin of its answer is the only one the token requests then go to.
    parent.postMessage({ type: WEB_PART_MESSAGES.hello } satisfies HelloRequest, '*');
  });
}

/** Each token is asked for anew, as SharePoint keeps and renews its own. */
export class WebPartSignIn implements HostSignIn {
  private lastId = 0;
  private readonly waiting = new Map<number, (answer: TokenAnswer) => void>();

  constructor(
    private readonly parent: Window,
    /** The web part's page, the only origin that receives the requests and whose answers count. */
    private readonly origin: string,
    readonly user: SignedInUser,
  ) {
    window.addEventListener('message', this.answered);
  }

  graphToken(fresh: boolean): Promise<string> {
    const id = ++this.lastId;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, (answer) => {
        if ('token' in answer) resolve(answer.token);
        else reject(tokenError(answer.error));
      });
      this.parent.postMessage({ type: WEB_PART_MESSAGES.token, id, fresh } satisfies TokenRequest, this.origin);
    });
  }

  dispose(): void {
    window.removeEventListener('message', this.answered);
  }

  private readonly answered = (event: MessageEvent) => {
    if (event.source !== this.parent || event.origin !== this.origin || !isTokenAnswer(event.data)) return;
    const settle = this.waiting.get(event.data.id);
    this.waiting.delete(event.data.id);
    settle?.(event.data);
  };
}

/** SharePoint's description of a failed token request, which stays in the message, as a failure the UI can explain. */
function tokenError(description: string): Error {
  const detail = `SharePoint gave no token for Microsoft Graph: ${description}`;
  const entraNumber = entraErrorNumber(description);
  if (entraNumber === NOT_APPROVED) {
    return new ServiceError(
      'accessDenied',
      `${detail} An administrator must approve the web part's API access in the SharePoint admin center.`,
    );
  }
  return new SignInFailedError(entraNumber !== null && ACCOUNT_BLOCKED.has(entraNumber) ? 'blocked' : 'other', detail);
}
