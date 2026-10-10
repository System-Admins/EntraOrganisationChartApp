import { formatNumber, plural } from '@/application/common/intl';
import type { StartPosition, TextSize, ThemeName } from '@/application/settings/appSettings';
import { defineStrings, type Language } from '@/application/settings/language';
import type { HideCategory } from '@/domain/orgChart/hideRules';

export const SETTINGS_STRINGS = defineStrings({
  en: {
    title: 'Settings',
    close: 'Close settings',
  },
});

/** The Filters section around its checkboxes, which FILTER_LABELS words. */
export const FILTER_STRINGS = defineStrings({
  en: {
    title: 'Filters',
    legend: 'Show in the chart',
    /** A checkbox's label with the people its rule leaves out while it is on, or lets in while it is off. */
    hidden: (filter: string, count: number) => `${filter}, ${formatNumber('en', count)} hidden`,
    shown: (filter: string, count: number) => `${filter}, ${formatNumber('en', count)} shown`,
    /** Rules overlap: a disabled guest is left out by two of them. */
    countsHint: 'Each number assumes that the other filters stay as they are.',
    /** Under the checkboxes, with formatPeople's count. */
    inChart: (people: string) => `${people} in the chart`,
    reset: 'Reset filters',
  },
});

/** Each hide rule as the people it is about: the settings dialog's checkboxes and the status bar's note. */
export const FILTER_LABELS = defineStrings({
  en: {
    withoutManager: 'People without a manager',
    withHiddenManager: 'People whose manager is not shown',
    inManagerCycle: 'People in a circular manager chain',
    disabledAccounts: 'Disabled accounts',
    guests: 'Guests',
    unlicensed: 'Accounts without a license',
    withoutJobTitle: 'People without a job title',
    hiddenFromAddressList: 'People hidden from the address list',
    unattached: "People outside the top persons' teams",
  } satisfies Record<HideCategory, string>,
});

/** The status bar's note on filters that differ from config.json's, around lists of FILTER_LABELS. */
export const FILTER_CHANGE_STRINGS = defineStrings({
  en: {
    alsoShowing: (people: string) => `also showing ${people}`,
    hiding: (people: string) => `hiding ${people}`,
    changed: (changes: string) => `Filters changed: ${changes}.`,
  },
});

/** Each language in its own name, which its readers recognize whatever language the page is in. */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = { en: 'English' };

export const DISPLAY_STRINGS = defineStrings({
  en: {
    title: 'Display',
    language: 'Language',
    automatic: 'Automatic',
    languageHint: 'Automatic follows the language the chart is set up with, otherwise that of Teams or your browser.',
    theme: 'Theme',
    /** Each theme beside Automatic, which `automatic` words. */
    themes: { light: 'Light', dark: 'Dark', contrast: 'High contrast' } satisfies Record<ThemeName, string>,
    themeHint: 'Automatic follows the theme the chart is set up with, otherwise the light or dark setting of your system.',
    /** In place of the choice where Teams sets the theme, which no choice here could change. */
    themeFromTeams: 'The chart follows the theme you chose in Teams.',
    textSize: 'Text size',
    textSizes: { standard: 'Standard', large: 'Large', larger: 'Larger' } satisfies Record<TextSize, string>,
    textSizeHint: 'Larger text makes the cards wider too. The chart always prints in the standard size.',
    showLevels: "Show each person's level",
    levelsHint: "The top of the chart is Level 1. A person's details keep the reporting line either way.",
    startAt: 'When the chart opens',
    startPositions: {
      top: 'At the top',
      me: 'At my own card',
      lastView: 'Where I left off',
    } satisfies Record<StartPosition, string>,
    /** What comes first whatever the choice: a view younger than RECENT_VIEW_MS, in minutes, and a link to a person. */
    startHint: (minutes: number) =>
      `A chart you left less than ${formatNumber('en', minutes)} ${plural('en', minutes, { one: 'minute', other: 'minutes' })} ago ` +
      'opens where you were either way, and a link to a person opens on them.',
  },
});

/** The Account section, whose buttons do what the toolbar's profile and Sign out do and say so in the same words. */
export const ACCOUNT_STRINGS = defineStrings({
  en: {
    title: 'Account',
    showMe: 'Show me in the chart',
    /** For someone with direct reports: the chart narrowed to them and everyone below them. */
    showMyTeam: 'Show my team',
    changePhoto: 'Change profile photo',
    signOut: 'Sign out',
    myAccountHint:
      'Change profile photo opens your Microsoft account page in a new tab. Select your photo there to change it. ' +
      'A new photo can take up to a day to reach the chart.',
    /** Any other page, which the chart can't describe. */
    newTabHint: 'Change profile photo opens in a new tab.',
    /** Where the host page owns the sign-in and there is no Sign out. */
    forget: "Forget this browser's copy",
    /** Teams keeps its own sign-in, so the hint promises only what holds in every host. */
    forgetHint:
      'Deletes what the chart keeps in this browser, such as its copy of the directory, then reloads the chart. ' +
      'Meant for shared computers.',
  },
});

/** Embed this chart, on the chart's own site: code for another page that shows the chart with who is in it now. */
export const EMBED_STRINGS = defineStrings({
  en: {
    title: 'Embed this chart',
    code: 'Embed code',
    copy: 'Copy code',
    copied: 'Copied',
    /** Read out after every copy. */
    announcement: 'Code copied',
    /** What the address keeps (KEPT_PARAMETERS) and what it leaves to each viewer. */
    hint:
      "Paste the code into a SharePoint page's Organization chart web part or Embed web part. It shows the people the chart shows now, " +
      "with the same team and filters, and nobody's details open.",
  },
});

/** The last line of the settings: who developed the chart, with a link to their site. */
export const CREDIT_STRINGS = defineStrings({
  en: {
    developedBy: 'Developed by',
    /** The link's text: a name, the same in every language. */
    developer: 'System Admins',
  },
});

/** The Reports section, which opens the reports in a dialog of their own. */
export const REPORTS_STRINGS = defineStrings({
  en: {
    title: 'Reports',
    directoryHealth: 'Directory health',
    directoryHealthHint:
      'Who is missing what in the directory: a manager, a job title, a department, an office, a phone, an e-mail address ' +
      'or a photo, with lists to copy addresses from and export.',
  },
});
