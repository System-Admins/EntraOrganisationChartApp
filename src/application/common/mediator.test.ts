import { describe, expect, expectTypeOf, it } from 'vitest';
import { Command, Mediator, Query, type RequestHandler } from './mediator';

class Echo extends Query<string> {
  constructor(readonly text: string) {
    super();
  }
}

class Reset extends Command {}

describe('Mediator', () => {
  it('dispatches to the handler registered for the request class and infers the response type', async () => {
    const handler: RequestHandler<Echo> = { handle: ({ text }) => Promise.resolve(text.toUpperCase()) };
    const mediator = new Mediator().register(Echo, handler);

    const response = mediator.send(new Echo('hi'));

    expectTypeOf(response).toEqualTypeOf<Promise<string>>();
    await expect(response).resolves.toBe('HI');
  });

  it('rejects requests without a handler', async () => {
    await expect(new Mediator().send(new Reset())).rejects.toThrow('No handler registered for Reset');
  });

  it('refuses a second handler for the same request', () => {
    const handler: RequestHandler<Reset> = { handle: () => Promise.resolve() };
    const mediator = new Mediator().register(Reset, handler);

    expect(() => mediator.register(Reset, handler)).toThrow('already registered');
  });
});
