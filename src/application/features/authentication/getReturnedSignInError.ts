import type { Authenticator } from '../../abstractions/authenticator';
import { Query, type RequestHandler } from '../../common/mediator';

/** See Authenticator.returnedSignInError. */
export class GetReturnedSignInErrorQuery extends Query<Error | null> {}

export class GetReturnedSignInErrorHandler implements RequestHandler<GetReturnedSignInErrorQuery> {
  constructor(private readonly authenticator: Authenticator) {}

  handle(): Promise<Error | null> {
    return Promise.resolve(this.authenticator.returnedSignInError);
  }
}
