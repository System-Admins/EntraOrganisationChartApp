import type { Clipboard } from '../../abstractions/clipboard';
import { Command, type RequestHandler } from '../../common/mediator';

/** Answers whether the text is on the clipboard; where it is not, the person needs it shown to copy by hand. */
export class CopyTextCommand extends Command<boolean> {
  constructor(readonly text: string) {
    super();
  }
}

export class CopyTextHandler implements RequestHandler<CopyTextCommand> {
  constructor(private readonly clipboard: Clipboard) {}

  handle({ text }: CopyTextCommand): Promise<boolean> {
    return this.clipboard.copy(text);
  }
}
