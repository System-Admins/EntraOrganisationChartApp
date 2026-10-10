import type { SignInFailure } from '@/application/abstractions/authenticator';
import type { ServiceFailure } from '@/application/abstractions/serviceError';
import { formatNumber } from '@/application/common/intl';
import { defineStrings } from '@/application/settings/language';

/** What is wrong with a person's entry, in the application's words, which the export shares. */
export { ACCOUNT_STATE_LABELS, FLAG_LABELS, issueLabels, MISSING_DETAIL_LABELS } from '@/application/common/strings';

/** Everyday words with a next step, for describeError. */
export const ERROR_STRINGS = defineStrings({
  en: {
    service: {
      offline: 'You seem to be offline. Check your internet connection, then try again.',
      busy: 'Microsoft 365 is busy right now. Wait a minute, then try again.',
      accessDenied: 'The organization chart is not allowed to read this information. Contact your IT support.',
      // The organization's own support desk, not the guest's, is the one that can let guests in.
      guestDenied:
        'You are signed in as a guest, and this organization does not let guests see its directory. ' +
        'If you need the chart, ask your contact in the organization or its IT support.',
      notFound: 'The information could not be found. Try again; if it keeps happening, contact your IT support.',
      other: 'Microsoft 365 did not answer as expected. Try again; if it keeps happening, contact your IT support.',
    } satisfies Record<ServiceFailure, string>,
    // Also shown for a consent asked through the sign-in (Teams presence), so none of them names the button.
    signIn: {
      cancelled: 'The sign-in was cancelled. Try again when you are ready.',
      popupBlocked: 'The sign-in window was blocked. Allow pop-ups for this site, then try again.',
      declined:
        'The sign-in was cancelled, or the permission that Microsoft asked for was not given. Try again and accept it; ' +
        'if you cannot, ask your IT support.',
      blocked: 'This account is not allowed to use the organization chart. Use your work account, or contact your IT support.',
      /** A setup error, not the user's: README.md names the redirect URIs the app registration needs. */
      redirectUri:
        "Sign-in is not set up for this site's address. Contact your IT support: the app registration needs this site's redirect URI " +
        '(the technical details name the error).',
      other: 'The sign-in did not finish. Try again; if it keeps happening, contact your IT support.',
    } satisfies Record<SignInFailure, string>,
    signedOut: 'You are signed out. Reload the page and sign in again.',
    unknown: 'Something went wrong. Try again; if it keeps happening, contact your IT support.',
  },
});

/** The link to config.json's support desk, which says before it is pressed what it opens (WCAG 3.2.5). */
export const SUPPORT_STRINGS = defineStrings({
  en: {
    /** The link's text where config.json gives none. */
    label: 'Contact your IT support',
    newTab: '(opens in a new tab)',
    mailApp: '(opens your mail app)',
  },
});

export const SHARED_STRINGS = defineStrings({
  en: {
    /** The label of the small line under an error, before what actually happened, which stays English (errorDetail). */
    technicalDetails: 'Technical details:',
    people: { one: 'person', other: 'people' },
    /** A person's level, in the same words on their card and in their details. */
    level: (level: number) => `Level ${formatNumber('en', level)}`,
    /** In the name's place of someone the address list hides while its filter is on: their card, and wherever the details would name them. */
    unlisted: 'Not in the address list',
  },
});
