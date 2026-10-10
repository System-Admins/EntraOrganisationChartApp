import type { ChartEmbedding } from '../../abstractions/chartEmbedding';
import { Query, type RequestHandler } from '../../common/mediator';
import type { UserSettings } from '../../settings/userSettings';

/** The address for another page's iframe that shows the chart with the people `settings` put in it, and nobody's details open. */
export class GetEmbedAddressQuery extends Query<string> {
  constructor(readonly settings: UserSettings) {
    super();
  }
}

export class GetEmbedAddressHandler implements RequestHandler<GetEmbedAddressQuery> {
  constructor(private readonly embedding: ChartEmbedding) {}

  handle({ settings }: GetEmbedAddressQuery): Promise<string> {
    return Promise.resolve(this.embedding.address(settings));
  }
}
