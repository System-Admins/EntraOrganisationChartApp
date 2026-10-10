import type { ContactDestination, TeamChannel } from '@/application/abstractions/contactLauncher';
import { formatNumber, plural } from '@/application/common/intl';
import type { LeftOutReason } from '@/application/features/contact/teamContact';
import { defineStrings } from '@/application/settings/language';

/** Where a contact button opens, as describeDestination tells it. */
export const DESTINATION_STRINGS = defineStrings({
  en: {
    teamsHere: 'Opens in Microsoft Teams',
    teamsNewTab: 'Opens Microsoft Teams in a new tab',
    teamsNewWindow: 'Opens Microsoft Teams in a new window',
    mailApp: 'Opens your mail app',
    outlookNewTab: 'Opens Outlook on the web in a new tab',
    outlookNewWindow: 'Opens Outlook on the web in a new window',
  } satisfies Record<ContactDestination, string>,
});

/** A team's tiles reach exactly the people of the list beside them; the person asking is never counted. */
export const TEAM_CONTACT_STRINGS = defineStrings({
  en: {
    /** Whom the tiles reach, which their heading and names say: a manager's direct reports, or their whole team. */
    directReports: 'the direct reports',
    wholeTeam: 'the whole team',
    /** The team's people in one department or city, or a department's own people. */
    inPlace: (place: string) => `everyone in ${place}`,
    heading: (whom: string) => `Contact ${whom}`,
    /** The tiles' short labels, as the person's own actions have. */
    labels: { chat: 'Chat', email: 'E-mail', meeting: 'Meeting' } satisfies Record<TeamChannel, string>,
    /** The tiles' names, which hold their labels (WCAG 2.5.3) and say whom they reach. */
    names: {
      chat: (whom: string) => `Chat with ${whom}`,
      email: (whom: string) => `E-mail ${whom}`,
      meeting: (whom: string) => `New meeting with ${whom}`,
    } satisfies Record<TeamChannel, (whom: string) => string>,
    /** Stands in for E-mail where there are too many addresses for one link: the tile's short label, and its name, which holds the label. */
    copy: 'Copy',
    copyAddresses: 'Copy addresses',
    copied: 'Copied',
    /** Read out after every copy. */
    announcement: 'Addresses copied',
    /** Labels the field with the addresses where nothing could copy them. */
    manual: 'Copy these addresses',
    /** The name Teams gives the group chat from three people on, with the department or city where the list holds one. */
    chatTopic: (manager: string, place: string | null) => (place === null ? `${manager}'s team` : `${manager}'s team in ${place}`),
    /** Why a button is missing, or stands in for another, with the limit the chart keeps to. */
    chatLimit: (max: number) => `A group chat takes at most ${formatNumber('en', max)} people.`,
    meetingLimit: (max: number) => `A new meeting from here takes at most ${formatNumber('en', max)} people.`,
    copyHint: (max: number) =>
      `More than ${formatNumber('en', max)} addresses are too many for one e-mail link: copy them, then paste them into a message.`,
    /** Whom the channels leave out, around a list of leftOut; it also explains a button that reaches nobody. */
    teamsLeaveOut: (people: string) => `Chat and meeting leave out ${people}.`,
    emailLeavesOut: (people: string) => `E-mail leaves out ${people}.`,
    leftOut: {
      disabled: (count: number) =>
        `${formatNumber('en', count)} ${plural('en', count, { one: 'disabled account', other: 'disabled accounts' })}`,
      guest: (count: number) => `${formatNumber('en', count)} ${plural('en', count, { one: 'guest', other: 'guests' })}`,
      unlicensed: (count: number) =>
        `${formatNumber('en', count)} ${plural('en', count, { one: 'account', other: 'accounts' })} without a license`,
      noAddress: (count: number) =>
        `${formatNumber('en', count)} ${plural('en', count, { one: 'person', other: 'people' })} without an e-mail address`,
    } satisfies Record<LeftOutReason, (count: number) => string>,
  },
});
