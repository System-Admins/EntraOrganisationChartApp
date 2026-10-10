import type { SignedInUser, SignedInUserSource } from '../../abstractions/signedInUser';
import { Query, type RequestHandler } from '../../common/mediator';

export class GetSignedInUserQuery extends Query<SignedInUser | null> {}

export class GetSignedInUserHandler implements RequestHandler<GetSignedInUserQuery> {
  constructor(private readonly source: SignedInUserSource) {}

  handle(): Promise<SignedInUser | null> {
    return Promise.resolve(this.source.getSignedInUser());
  }
}
