import { defineStrings } from '@/application/settings/language';

export const APP_STRINGS = defineStrings({
  en: {
    /** The logo's tooltip, as a link to the start page or a button that restarts the chart. */
    home: 'Back to the start',
    startupError: {
      title: 'The organization chart could not start',
      text:
        'The chart is not set up correctly, or the link that opened it is wrong. Contact your IT support and pass on ' +
        'the technical details below.',
    },
  },
});
