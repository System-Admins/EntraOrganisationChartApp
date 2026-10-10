import type { RecentPeopleStore } from '../../abstractions/recentPeopleStore';
import { Command, type RequestHandler } from '../../common/mediator';

/** Search's Clear recent. */
export class ClearRecentPeopleCommand extends Command {}

export class ClearRecentPeopleHandler implements RequestHandler<ClearRecentPeopleCommand> {
  constructor(private readonly store: RecentPeopleStore) {}

  handle(): Promise<void> {
    this.store.clear();
    return Promise.resolve();
  }
}
