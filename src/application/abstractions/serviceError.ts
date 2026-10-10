/** What a person can act on when a service behind a port (Microsoft Graph, Microsoft's sign-in) fails; a guest kept out is one. */
export const SERVICE_FAILURES = ['offline', 'busy', 'accessDenied', 'guestDenied', 'notFound', 'other'] as const;

export type ServiceFailure = (typeof SERVICE_FAILURES)[number];

/** The UI explains `failure`; `message` says what actually happened, for the console. */
export class ServiceError extends Error {
  constructor(
    readonly failure: ServiceFailure,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ServiceError';
  }
}
