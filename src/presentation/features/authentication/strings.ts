import { defineStrings } from '@/application/settings/language';

export const SIGN_IN_STRINGS = defineStrings({
  en: {
    title: 'Sign in to see the organization chart',
    text: "Use your work account. The chart is read from your organization's directory.",
    signIn: 'Sign in',
    signingIn: 'Signing in...',
  },
});

export const PROFILE_STRINGS = defineStrings({
  en: {
    /** The toolbar's profile button: its name and its tooltip. */
    label: (account: string) => `Signed in as ${account}. Show me in the chart`,
  },
});
