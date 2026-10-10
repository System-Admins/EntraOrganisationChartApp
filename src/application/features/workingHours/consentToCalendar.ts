import type { Authenticator } from '../../abstractions/authenticator';
import { Command, type RequestHandler } from '../../common/mediator';

export class ConsentToCalendarCommand extends Command {}

export class ConsentToCalendarHandler implements RequestHandler<ConsentToCalendarCommand> {
  constructor(private readonly authenticator: Authenticator) {}

  handle(): Promise<void> {
    return this.authenticator.consentToCalendar();
  }
}
