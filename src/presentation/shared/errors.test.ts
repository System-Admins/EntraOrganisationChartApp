import { describe, expect, it } from 'vitest';
import { SIGN_IN_FAILURES, SignInFailedError, SignInRequiredError } from '@/application/abstractions/authenticator';
import { SERVICE_FAILURES, ServiceError } from '@/application/abstractions/serviceError';
import { describeError, errorDetail, pointsToSupport } from './errors';

const TECHNICAL = /Graph|AADSTS|\(\d{3}\)|_|\.json|Read\.All/;

/** One error of every kind describeError words. */
const EVERY_FAILURE: readonly unknown[] = [
  ...SERVICE_FAILURES.map((failure) => new ServiceError(failure, 'Microsoft Graph request failed (503): x')),
  ...SIGN_IN_FAILURES.map((reason) => new SignInFailedError(reason, 'Microsoft sign-in error x_y.')),
  new SignInRequiredError(),
  'not an error',
];

const everyFailure = () => EVERY_FAILURE.map((error) => describeError(error, 'en'));

describe('describeError', () => {
  it('explains every known failure in its own words, with a next step and nothing technical', () => {
    const texts = everyFailure();

    expect(new Set(texts).size).toBe(texts.length);
    for (const text of texts) {
      expect(text).not.toMatch(TECHNICAL);
      expect(text).toMatch(/try again|IT support|sign in again/i);
    }
  });

  it('keeps an unknown error\'s message out of the main text', () => {
    const error = new Error('post_request_failed: https://login.microsoftonline.com');

    expect(describeError(error, 'en')).toBe('Something went wrong. Try again; if it keeps happening, contact your IT support.');
    expect(errorDetail(error)).toBe('post_request_failed: https://login.microsoftonline.com');
  });

  it('tells a guest whom the directory refuses that the organization keeps guests out, and no one else', () => {
    const refused = new ServiceError('guestDenied', 'Microsoft Graph denied a guest account access to the user directory.');

    expect(describeError(refused, 'en')).toBe(
      'You are signed in as a guest, and this organization does not let guests see its directory. ' +
        'If you need the chart, ask your contact in the organization or its IT support.',
    );
    const others = everyFailure().filter((text) => text !== describeError(refused, 'en'));
    expect(others.some((text) => text.includes('guest'))).toBe(false);
  });
});

describe('pointsToSupport', () => {
  it.each(EVERY_FAILURE.map((error) => [error instanceof Error ? describeError(error, 'en') : String(error), error]))(
    'links the support desk exactly where the words send people to their IT support: %s',
    (_words, error) => {
      expect(pointsToSupport(error)).toBe(describeError(error, 'en').includes('IT support'));
    },
  );

  it('links it for a refusal, but not where the person can act alone: offline, busy, cancelled or signed out', () => {
    expect(pointsToSupport(new ServiceError('accessDenied', 'x'))).toBe(true);
    expect(pointsToSupport(new ServiceError('guestDenied', 'x'))).toBe(true);
    expect(pointsToSupport(new ServiceError('offline', 'x'))).toBe(false);
    expect(pointsToSupport(new ServiceError('busy', 'x'))).toBe(false);
    expect(pointsToSupport(new SignInFailedError('cancelled', 'x'))).toBe(false);
    expect(pointsToSupport(new SignInRequiredError())).toBe(false);
  });
});

describe('errorDetail', () => {
  it('is what actually happened, or nothing when the error says nothing', () => {
    expect(errorDetail(new ServiceError('busy', 'Microsoft Graph request failed (503): Service unavailable'))).toBe(
      'Microsoft Graph request failed (503): Service unavailable',
    );
    expect(errorDetail(new Error(''))).toBeNull();
    expect(errorDetail('text')).toBeNull();
    expect(errorDetail(null)).toBeNull();
  });
});
