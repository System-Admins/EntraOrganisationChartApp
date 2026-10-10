import type { RecentPeopleStore } from '../../abstractions/recentPeopleStore';
import { Command, type RequestHandler } from '../../common/mediator';

/** A person whose details were opened, whichever way, for Search's recent people. */
export class RememberPersonCommand extends Command {
  constructor(readonly employeeId: string) {
    super();
  }
}

export class RememberPersonHandler implements RequestHandler<RememberPersonCommand> {
  constructor(private readonly store: RecentPeopleStore) {}

  handle({ employeeId }: RememberPersonCommand): Promise<void> {
    this.store.remember(employeeId);
    return Promise.resolve();
  }
}
