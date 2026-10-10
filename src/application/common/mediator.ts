// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the phantom type lets send() infer its result
export abstract class Request<TResponse> {
  declare readonly __response?: TResponse;
}

/** Reads state; handlers must not change anything observable. */
export abstract class Query<TResponse> extends Request<TResponse> {}

export abstract class Command<TResponse = void> extends Request<TResponse> {}

export type ResponseOf<TRequest> = TRequest extends Request<infer TResponse> ? TResponse : never;

export interface RequestHandler<TRequest extends Request<unknown>> {
  handle(request: TRequest): Promise<ResponseOf<TRequest>>;
}

export interface Sender {
  send<TResponse>(request: Request<TResponse>): Promise<TResponse>;
}

type RequestType<TRequest> = abstract new (...args: never[]) => TRequest;

/** Dispatches each request to the single handler registered for its exact class. */
export class Mediator implements Sender {
  private readonly handlers = new Map<RequestType<Request<unknown>>, RequestHandler<Request<unknown>>>();

  register<TRequest extends Request<unknown>>(type: RequestType<TRequest>, handler: RequestHandler<TRequest>): this {
    if (this.handlers.has(type)) throw new Error(`A handler for ${type.name} is already registered.`);
    this.handlers.set(type, handler);
    return this;
  }

  send<TResponse>(request: Request<TResponse>): Promise<TResponse> {
    const handler = this.handlers.get(request.constructor as RequestType<Request<unknown>>);
    if (!handler) return Promise.reject(new Error(`No handler registered for ${request.constructor.name}.`));
    return handler.handle(request) as Promise<TResponse>;
  }
}
