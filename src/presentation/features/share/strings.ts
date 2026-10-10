import type { ShareMethod } from '@/application/abstractions/employeeSharing';
import { defineStrings } from '@/application/settings/language';

/** The Link button in a person's details, and what it says once pressed. */
export const SHARE_STRINGS = defineStrings({
  en: {
    link: 'Link',
    /** The visible label stays "Link"; the name and tooltip say what a press does with it. */
    names: { copy: 'Copy link', share: 'Share link' } satisfies Record<ShareMethod, string>,
    copied: 'Copied',
    /** Read out after every copy. */
    announcement: 'Link copied',
    /** Labels the field with the link where nothing could copy it. */
    manual: 'Copy this link',
  },
});
