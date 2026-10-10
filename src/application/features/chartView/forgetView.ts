import type { OrgChartOptions } from '@/domain/orgChart/orgChart';
import type { ViewStateStore } from '../../abstractions/viewStateStore';
import { Command, type RequestHandler } from '../../common/mediator';
import { viewScope } from './viewScope';

/** Where the person was in the chart that `options` build, forgotten: the logo starts that chart afresh. */
export class ForgetViewCommand extends Command {
  constructor(readonly options: OrgChartOptions) {
    super();
  }
}

export class ForgetViewHandler implements RequestHandler<ForgetViewCommand> {
  constructor(private readonly store: ViewStateStore) {}

  handle({ options }: ForgetViewCommand): Promise<void> {
    this.store.remove(viewScope(options));
    return Promise.resolve();
  }
}
