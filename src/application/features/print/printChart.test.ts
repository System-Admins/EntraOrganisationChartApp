import { describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from '../../common/mediator';
import { PrintChartCommand, PrintChartHandler } from './printChart';

describe('PrintChartHandler', () => {
  it('hands printing to the host-specific printer', async () => {
    const print = vi.fn(() => Promise.resolve());
    const handler: RequestHandler<PrintChartCommand> = new PrintChartHandler({ print });

    await handler.handle(new PrintChartCommand());

    expect(print).toHaveBeenCalledTimes(1);
  });
});
