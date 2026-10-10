import type { OrgChartOptions } from '@/domain/orgChart/orgChart';
import type { ChartView, ViewStateStore } from '../../abstractions/viewStateStore';
import { Query, type RequestHandler } from '../../common/mediator';
import type { StartPosition } from '../../settings/appSettings';
import { viewScope } from './viewScope';

/** A view left this recently reopens whatever the start choice: long enough to come back from a chat in Teams. */
export const RECENT_VIEW_MS = 30 * 60_000;

/** The view the chart opens with, for its scope: the saved one where it is recent or the person starts where they left off. */
export class GetSavedViewQuery extends Query<ChartView | null> {
  constructor(
    readonly options: OrgChartOptions,
    readonly startAt: StartPosition,
  ) {
    super();
  }
}

export class GetSavedViewHandler implements RequestHandler<GetSavedViewQuery> {
  constructor(
    private readonly store: ViewStateStore,
    private readonly now: () => number = () => Date.now(),
  ) {}

  handle({ options, startAt }: GetSavedViewQuery): Promise<ChartView | null> {
    const saved = this.store.get(viewScope(options));
    if (!saved) return Promise.resolve(null);
    const age = this.now() - saved.savedAt.getTime();
    // A negative age means one of the clocks was wrong, which says nothing of how recent the view is.
    const recent = age >= 0 && age < RECENT_VIEW_MS;
    return Promise.resolve(recent || startAt === 'lastView' ? saved : null);
  }
}
