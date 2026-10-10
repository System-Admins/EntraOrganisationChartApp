import { formatNumber, plural } from '@/application/common/intl';
import { defineStrings } from '@/application/settings/language';

export const TAB_CONFIG_STRINGS = defineStrings({
  en: {
    /** With the chart's name, which the new tab is given too. */
    heading: (title: string) => `Add ${title}`,
    /** Also what is read out once the last top person is removed. */
    intro: 'The tab shows the whole organization.',
    /** Before the list of the people Teams' picker chose, or the field that holds top persons. */
    onlyTheirTeams: 'The tab shows only the teams of these people:',
    choose: 'Choose people',
    pickerHint: 'To show a single department, choose the people at its top. Only their teams are shown.',
    remove: 'Remove',
    /** The Remove button's name, which starts with its visible label. */
    removePerson: (name: string) => `Remove ${name}`,
    /** Read out after a pick or a removal, with formatList's names. */
    showsTeamsOf: (names: string) => `The tab shows only the teams of ${names}.`,
    /** The field where the host has no people picker, or it failed. */
    topPersons: 'Top persons (optional)',
    placeholder: 'anna@contoso.com, erik@contoso.com',
    hint:
      'To show a single department, enter the e-mail addresses of the people at its top, separated by commas. ' +
      'Only their teams are shown.',
    pickerFailed: 'Teams could not show its people picker, so enter the e-mail addresses here instead.',
    /** The entries no one is found by, as formatList lists them, and how many they are. */
    notAddresses: (entries: string, count: number) =>
      `${entries} ${plural('en', count, { one: 'is not an e-mail address', other: 'are not e-mail addresses' })}.`,
    depth: 'Levels unfolded at start',
    /** The choice that leaves it to config.json, with the levels that gives now. */
    defaultDepth: (levels: number) => `Default (${formatNumber('en', levels)})`,
    depthHint: 'At 0 only the top of the chart shows. With several top persons it always starts folded, side by side.',
  },
});
