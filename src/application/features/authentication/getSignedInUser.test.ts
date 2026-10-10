import { describe, expect, it } from 'vitest';
import type { SignedInUser } from '../../abstractions/signedInUser';
import type { RequestHandler } from '../../common/mediator';
import { GetSignedInUserHandler, GetSignedInUserQuery } from './getSignedInUser';

describe('GetSignedInUserHandler', () => {
  it('answers with the account that is signed in at the time of asking', async () => {
    let signedIn: SignedInUser | null = null;
    const handler: RequestHandler<GetSignedInUserQuery> = new GetSignedInUserHandler({
      getSignedInUser: () => signedIn,
    });

    expect(await handler.handle(new GetSignedInUserQuery())).toBeNull();

    signedIn = { id: 'anna', displayName: 'Anna Jensen', userPrincipalName: 'anna@contoso.com', isGuest: false };
    expect(await handler.handle(new GetSignedInUserQuery())).toBe(signedIn);
  });
});
