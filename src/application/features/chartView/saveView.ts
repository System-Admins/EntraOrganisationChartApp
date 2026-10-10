import type { OrgChartOptions } from '@/domain/orgChart/orgChart';
import type { ChartView, ViewStateStore } from '../../abstractions/viewStateStore';
import { Command, type RequestHandler } from '../../common/mediator';
import { viewScope } from './viewScope';

/** Where the person is in the chart that `options` build, for the next visit. */
export class SaveViewCommand extends Command {
  constructor(
    readonly options: OrgChartOptions,
    readonly view: ChartView,
  ) {
    super();
  }
}

export class SaveViewHandler implements RequestHandler<SaveViewCommand> {
  constructor(
    private readonly store: ViewStateStore,
    private readonly now: () => number = () => Date.now(),
  ) {}

  handle({ options, view }: SaveViewCommand): Promise<void> {
    this.store.save(viewScope(options), { ...view, savedAt: new Date(this.now()) });
    return Promise.resolve();
  }
}
