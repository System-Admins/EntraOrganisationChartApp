import type { BackNavigation, OpenLayers } from '../../abstractions/backNavigation';
import { Command, type RequestHandler } from '../../common/mediator';

/** Sent whenever what is open over the chart changes, so that the host's Back closes it first; `closeTopmost` is called for each press. */
export class TrackOpenLayersCommand extends Command {
  constructor(
    readonly open: OpenLayers,
    readonly closeTopmost: () => void,
  ) {
    super();
  }
}

export class TrackOpenLayersHandler implements RequestHandler<TrackOpenLayersCommand> {
  constructor(private readonly back: BackNavigation) {}

  handle({ open, closeTopmost }: TrackOpenLayersCommand): Promise<void> {
    this.back.track(open, closeTopmost);
    return Promise.resolve();
  }
}
