import type { Employee } from '@/domain/employees/employee';
import type { SignedInUserSource } from '../../abstractions/signedInUser';
import { Query, type RequestHandler } from '../../common/mediator';
import { planTeamContact, type TeamContactPlan } from './teamContact';

/** Whom each of a team's channels reaches, so that its buttons can be offered and explained before anyone presses one. */
export class GetTeamContactQuery extends Query<TeamContactPlan> {
  constructor(
    /** Everyone the tiles reach as the chart shows them: the people of the list beside them. */
    readonly team: readonly Employee[],
  ) {
    super();
  }
}

export class GetTeamContactHandler implements RequestHandler<GetTeamContactQuery> {
  constructor(private readonly signedInUser: SignedInUserSource) {}

  handle({ team }: GetTeamContactQuery): Promise<TeamContactPlan> {
    return Promise.resolve(planTeamContact(team, this.signedInUser.getSignedInUser()?.id ?? null));
  }
}
