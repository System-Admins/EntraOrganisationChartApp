import { SignInFailedError, SignInRequiredError, type SignInFailure } from '@/application/abstractions/authenticator';
import { ServiceError, type ServiceFailure } from '@/application/abstractions/serviceError';
import type { Language } from '@/application/settings/language';
import { ERROR_STRINGS } from './strings';

/** Everyday words with a next step. Error.message is never shown as it is; errorDetail keeps it for a small line. */
export function describeError(error: unknown, language: Language): string {
  const texts = ERROR_STRINGS[language];
  if (error instanceof ServiceError) return texts.service[error.failure];
  if (error instanceof SignInFailedError) return texts.signIn[error.reason];
  if (error instanceof SignInRequiredError) return texts.signedOut;
  return texts.unknown;
}

/** The failures whose words send people to their IT support, because trying again alone may not help. */
const NEEDS_SUPPORT: ReadonlySet<ServiceFailure | SignInFailure> = new Set([
  'accessDenied',
  'guestDenied',
  'notFound',
  'other',
  'declined',
  'blocked',
  'redirectUri',
]);

/** Whether describeError's words send the person to their IT support, after which the support desk is linked (SupportLink). */
export function pointsToSupport(error: unknown): boolean {
  if (error instanceof ServiceError) return NEEDS_SUPPORT.has(error.failure);
  if (error instanceof SignInFailedError) return NEEDS_SUPPORT.has(error.reason);
  return !(error instanceof SignInRequiredError);
}

/** What actually happened, for whoever supports the app, in English; null when the error says nothing. */
export function errorDetail(error: unknown): string | null {
  return error instanceof Error && error.message ? error.message : null;
}
