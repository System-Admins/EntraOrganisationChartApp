import type { BrowserCopyState } from '@/application/abstractions/employeeDirectory';
import { formatNumber } from '@/application/common/intl';
import type { HostKind } from '@/application/settings/hostKind';
import { defineStrings } from '@/application/settings/language';
import type { RootFlag } from '@/domain/orgChart/orgChart';
import type { PresenceStatus } from '../presence/presenceTracker';

/** The keys Help lists, in the order people need them: moving around first, then the shortcuts. */
export const HELP_KEYS = ['move', 'unfold', 'fold', 'ends', 'open', 'letters', 'siblings', 'search', 'escape', 'print'] as const;

export type HelpKey = (typeof HELP_KEYS)[number];

/** The Help dialog: the keys, the empty search field, Back and the marks on the cards; it changes with them. */
export const HELP_STRINGS = defineStrings({
  en: {
    title: 'Help',
    close: 'Close help',
    usingTitle: 'Using the chart',
    pointerTitle: 'Mouse and touch',
    /** People miss that the badge does less than the card around it, and that a long team goes on past its Show more. */
    pointer: (pageSize: number) =>
      "Clicking a card folds or unfolds the people below it and shows the person's details. " +
      'The badge with the number of direct reports folds or unfolds without showing the details. ' +
      `A long team shows ${formatNumber('en', pageSize)} people at a time, and Show more at its end shows the next ones.`,
    searchTitle: 'Search',
    /** The list the empty field opens (SearchBox), which nobody expects before typing. */
    search:
      'Before you type, the search field lists you, your manager and the people whose details you opened lately, ' +
      'as soon as you click it or move to it.',
    departmentsTitle: 'Departments',
    /** How the department tree is arranged, which nothing in Microsoft 365 says: people expect a hierarchy the directory doesn't keep. */
    departments:
      'Microsoft 365 keeps a department as text on each person, without the departments above it, so the chart arranges departments ' +
      'by whom their people report to: a department sits under the department of the people it reports into. A department that ' +
      'people report into from several places shows in each, and the directory health report lists the departments that come again ' +
      "below themselves, and the few people apart from the rest of their department. The Departments button lists them; Show as chart " +
      "there shows them in the chart's place.",
    backTitle: 'Back',
    /** Where the host hands the chart its Back button (BackNavigation); other pages keep their own. */
    back: {
      standalone:
        "The browser's Back button, and the Back gesture of phones, first go from the whole team back to the manager's details, " +
        'and from a department back to the one before it, then close the details, the search results or the departments. ' +
        'Only then do they leave the chart.',
      teams:
        "On phones, the Back button of Teams first closes this dialog, then goes from the whole team back to the manager's " +
        'details and from a department back to the one before it, and closes the details, the search results or the departments. ' +
        'Only then does it leave the chart.',
    } satisfies Record<Exclude<HostKind, 'embedded' | 'sharepoint'>, string>,
    keysTitle: 'Keyboard',
    /** Each entry's keys, then what they do. Keys are named in words: screen readers name arrow characters inconsistently. */
    keys: {
      move: { keys: 'Up or Down arrow', does: 'Move to the previous or the next person, heading or Show more' },
      unfold: { keys: 'Right arrow', does: 'Unfold the team or the heading, or move into it' },
      fold: { keys: 'Left arrow', does: 'Fold the team or the heading, or move to the manager or the heading above' },
      ends: { keys: 'Home or End', does: 'Move to the first or the last item shown' },
      open: {
        keys: 'Enter or Space',
        does:
          "Show the person's details and fold or unfold the team, as a click does. " +
          'On a heading, fold or unfold it; on Show more, show the next people',
      },
      letters: {
        keys: 'Letters',
        does:
          'Move to the next person shown whose name starts with the letters typed, or the next heading or Show more that does; ' +
          'a space right after a letter is part of the name',
      },
      siblings: {
        keys: 'Asterisk (*)',
        does:
          'Unfold the teams of everyone with the same manager or under the same heading, or of everyone at the top; ' +
          'on a heading, unfold every heading',
      },
      search: { keys: 'Slash (/)', does: 'Go to Search' },
      escape: { keys: 'Escape', does: 'Close the details or a list in their place, the search suggestions or this dialog' },
      print: { keys: 'Ctrl+P, or Cmd+P on a Mac', does: 'Print the chart as it is unfolded, with photos' },
    } satisfies Record<HelpKey, { readonly keys: string; readonly does: string }>,
    /** What the print keys do where the host can't print its page (Teams): see PrintState.opensBrowser. */
    printOpensBrowser: 'Open the chart in the browser, to print it there',
    marksTitle: 'Colours and marks',
    statusTitle: 'Teams status',
    /** Before the statuses, each a dot as the photos have it, named by describePresence. */
    status: "The ring around a photo, and the dot on it, show the person's status in Teams:",
    areasTitle: 'Area colours',
    /** Before the top persons, each beside their colour (areaColors.ts). */
    areas: 'Each person at the top has a colour of their own, on the top edge and the badge of every card in their area:',
    warningsTitle: 'Warnings',
    /** Before the warnings, each in the words of the card (FLAG_LABELS) beside what it means; the headings over them use the same words. */
    warnings:
      'A warning on a card says why the person heads a branch of their own. Such people are gathered under a heading for each warning, ' +
      'with their number, and the filters in Settings decide whether they are shown:',
    flags: {
      noManager: 'The directory names no manager for the person.',
      managerNotShown:
        "The directory names a manager whom the chart leaves out, such as a disabled account. The person's details say who.",
      managerCycle: "The person's managers lead back to the person, so the chain starts with one of them.",
    } satisfies Record<RootFlag, string>,
    /** Only where the chart holds such a place; titled in the words of the card (SHARED_STRINGS.unlisted). */
    unlistedTitle: 'Not in the address list',
    unlisted:
      'A card without a name or photo holds the place of someone your organization hides from the address list, ' +
      'so that the people below them still show under it. Clicking it only folds or unfolds them.',
    supportTitle: 'Your IT support',
    /** Followed by the link to config.json's support desk, where there is one. */
    support:
      'The chart shows what the directory holds. For wrong or missing details, or anything else about the chart, ' +
      'ask your IT support.',
  },
});

/** About this chart: what IT asks about first, in words a person can read out to them or copy. */
export const ABOUT_STRINGS = defineStrings({
  en: {
    title: 'About this chart',
    version: 'Version',
    host: 'Where it runs',
    hosts: {
      standalone: 'Its own site',
      embedded: 'Embedded in another page',
      sharepoint: 'SharePoint web part',
      teams: 'Microsoft Teams',
    } satisfies Record<HostKind, string>,
    presence: 'Teams status',
    /** 'off' is config.json's chart.showPresence; the others are why the chart may not show it. */
    presenceStates: {
      active: 'On',
      needsConsent: 'Needs permission',
      denied: 'Not allowed by your organization',
      off: 'Off in config.json',
    } satisfies Record<PresenceStatus | 'off', string>,
    peopleInDirectory: 'People in the directory',
    peopleInChart: 'People in the chart',
    updated: 'Updated',
    readInFull: 'Read in full',
    /** A copy that an older version stored, without the time. */
    notRecorded: 'Not recorded',
    changeTracking: 'Change tracking',
    on: 'On',
    off: 'Off',
    browserCopy: 'Copy in this browser',
    browserCopies: {
      kept: 'Kept for the next visit',
      off: 'Not kept',
      failed: 'Could not be saved',
    } satisfies Record<BrowserCopyState, string>,
    topPersons: 'Top persons',
    /** The top persons the chart found, and those it did not find or the filters hide. */
    topPersonsFound: (found: number, missing: number) =>
      missing === 0
        ? `${formatNumber('en', found)} found`
        : `${formatNumber('en', found)} found, ${formatNumber('en', missing)} not found or hidden`,
    copy: 'Copy details',
    copied: 'Copied',
    /** Read out after every copy. */
    announcement: 'Details copied',
    copyHint: 'For your IT support, if they ask. The details name no one.',
    /** Labels the field with the details where nothing could copy them. */
    manual: 'Copy these details',
  },
});
