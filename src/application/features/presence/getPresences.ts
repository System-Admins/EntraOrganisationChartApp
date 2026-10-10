import type { Presence } from '@/domain/presence/presence';
import type { PresenceSource } from '../../abstractions/presenceSource';
import { Query, type RequestHandler } from '../../common/mediator';

/** Rejects with PresenceUnavailableError when presence can't be read at all. */
export class GetPresencesQuery extends Query<ReadonlyMap<string, Presence>> {
  constructor(readonly employeeIds: readonly string[]) {
    super();
  }
}

export class GetPresencesHandler implements RequestHandler<GetPresencesQuery> {
  constructor(private readonly source: PresenceSource) {}

  handle({ employeeIds }: GetPresencesQuery): Promise<ReadonlyMap<string, Presence>> {
    return this.source.getPresences(employeeIds);
  }
}
