import { defineStrings } from '@/application/settings/language';

/** What redirectBridge.ts writes into redirect.html when the sign-in fails; the rest of the page's text is in its HTML. */
export const REDIRECT_STRINGS = defineStrings({
  en: {
    failed: 'Sign-in failed',
    beforeLink: 'Sign-in could not be completed. Close this window and try again, or ',
    link: 'go back to the organization chart',
    afterLink: '.',
  },
});

/** What popupRelay.ts writes into popup-relay.html when the chart did not open it; the rest of the page's text is in its HTML. */
export const POPUP_RELAY_STRINGS = defineStrings({
  en: {
    notOpenedByApp: 'This window only works when the organization chart opens it. You can close it.',
  },
});
