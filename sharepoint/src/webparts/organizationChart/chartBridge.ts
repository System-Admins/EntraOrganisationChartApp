import {
  isHelloRequest,
  isTokenRequest,
  WEB_PART_MESSAGES,
  type HelloAnswer,
  type TokenAnswer,
  type WebPartUser,
} from '../../generated/webPartMessages';

/** What the chart asks of SharePoint: the page context's person and language, and tokens from its token provider. */
export interface ChartHost {
  readonly user: WebPartUser;
  readonly locale: string;
  graphToken(fresh: boolean): Promise<string>;
}

/** Answers the chart in `frame` and nothing else, as a token reads the directory as the person viewing the page. */
export class ChartBridge {
  public constructor(
    private readonly frame: HTMLIFrameElement,
    /** The chart's site: the only origin whose requests count, and the only one the answers go to. */
    private readonly origin: string,
    private readonly host: ChartHost,
  ) {
    window.addEventListener('message', this.received);
  }

  public dispose(): void {
    window.removeEventListener('message', this.received);
  }

  private readonly received = (event: MessageEvent): void => {
    if (event.source !== this.frame.contentWindow || event.origin !== this.origin) return;
    const request: unknown = event.data;
    if (isHelloRequest(request)) {
      this.answer({ type: WEB_PART_MESSAGES.hello, user: this.host.user, locale: this.host.locale });
    } else if (isTokenRequest(request)) {
      const answer = { type: WEB_PART_MESSAGES.token, id: request.id };
      this.host.graphToken(request.fresh).then(
        (token) => this.answer({ ...answer, token }),
        (error: unknown) => this.answer({ ...answer, error: error instanceof Error ? error.message : String(error) }),
      );
    }
  };

  private answer(message: HelloAnswer | TokenAnswer): void {
    // A frame that a link or a redirect took elsewhere since then gets nothing: its origin no longer matches.
    this.frame.contentWindow?.postMessage(message, this.origin);
  }
}
