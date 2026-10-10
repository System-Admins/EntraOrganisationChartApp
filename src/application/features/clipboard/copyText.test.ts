import { describe, expect, it, vi } from 'vitest';
import type { Clipboard } from '../../abstractions/clipboard';
import type { RequestHandler } from '../../common/mediator';
import { CopyTextCommand, CopyTextHandler } from './copyText';

describe('CopyTextHandler', () => {
  it('hands the text to the clipboard and answers whether it got there', async () => {
    const copy = vi.fn<Clipboard['copy']>(() => Promise.resolve(true));
    const handler: RequestHandler<CopyTextCommand> = new CopyTextHandler({ copy });

    expect(await handler.handle(new CopyTextCommand('Version: 1.0.42'))).toBe(true);
    expect(copy).toHaveBeenCalledExactlyOnceWith('Version: 1.0.42');

    copy.mockResolvedValueOnce(false);
    expect(await handler.handle(new CopyTextCommand('Version: 1.0.42'))).toBe(false);
  });
});
