import { formatNumber, plural } from '@/application/common/intl';
import { defineStrings } from '@/application/settings/language';

/** The page around the chart: the skip link, the toolbar, the panels that stand in for the chart and what it announces. */
export const PAGE_STRINGS = defineStrings({
  en: {
    skipToChart: 'Skip to chart',
    toolbar: {
      name: 'Chart tools',
      expandAll: 'Expand all',
      collapseAll: 'Collapse all',
      departments: 'Departments',
      zoomOut: 'Zoom out',
      zoomIn: 'Zoom in',
      /** What the button that resets the zoom shows. */
      zoomLevel: (percent: number) => `${formatNumber('en', percent)}%`,
      /** The zoom as screen readers hear it, also the start of that button's name. */
      zoom: (percent: number) => `Zoom ${formatNumber('en', percent)} percent`,
      resetZoom: 'Reset zoom',
      fitToScreen: 'Fit to screen',
      print: 'Print',
      printInBrowser: 'Print in browser',
      preparingPrint: 'Preparing the print...',
      exportToCsv: 'Export to CSV (comma-separated values)',
      reload: 'Reload from the directory',
      settings: 'Settings',
      help: 'Help',
      signOut: 'Sign out',
    },
    /** Announced as an export starts; until it ends, also the export button's name and a line in the status bar. */
    preparingExport: 'Preparing the export...',
    exportReady: 'The export is ready.',
    exportFailed: (reason: string) => `Export failed: ${reason}`,
    signOutFailed: (reason: string) => `Sign-out failed: ${reason}`,
    forgetFailed: (reason: string) => `Forgetting this browser's copy failed: ${reason}`,
    notInChart: 'You are not shown in this chart.',
    detailsShown: (name: string) => `Details for ${name} shown`,
    /** Show in chart from the directory health report, where the filters hid the person: describeFilterChanges' words follow. */
    shownWithFilters: (name: string, changes: string) => `Details for ${name} shown. ${changes}`,
    /** Show in chart for someone no filters would show, as after a refresh that took them out of the directory. */
    notShown: (name: string) => `${name} could not be shown in this chart.`,
    showFailed: (name: string, reason: string) => `Could not show ${name} in the chart: ${reason}`,
    expandedPartly: (visibleLevels: number, totalLevels: number) =>
      `Expanded ${formatNumber('en', visibleLevels)} of ${formatNumber('en', totalLevels)} levels to keep the page responsive. ` +
      'Click a person to see more.',
    /** What the '*' key unfolded beside the card, which keeps the focus. */
    unfoldedTeams: (count: number) =>
      `Unfolded ${formatNumber('en', count)} ${plural('en', count, { one: 'team', other: 'teams' })}.`,
    unfoldedTeamsPartly: (unfolded: number, folded: number) =>
      `Unfolded ${formatNumber('en', unfolded)} of ${formatNumber('en', folded)} ` +
      `${plural('en', folded, { one: 'team', other: 'teams' })} to keep the page responsive.`,
    nothingToUnfold: 'No teams to unfold at this level.',
    /** The same for '*' on a heading, which unfolds the groups under the headings beside it. */
    unfoldedGroups: (count: number) =>
      `Unfolded ${formatNumber('en', count)} ${plural('en', count, { one: 'group', other: 'groups' })}.`,
    unfoldedGroupsPartly: (unfolded: number, folded: number) =>
      `Unfolded ${formatNumber('en', unfolded)} of ${formatNumber('en', folded)} ` +
      `${plural('en', folded, { one: 'group', other: 'groups' })} to keep the page responsive.`,
    nothingToUnfoldInGroups: 'No groups to unfold.',
    /** Said as a team's chart, or everyone's again, arrives, with formatPeople's count of who is in it. */
    showingTeam: (name: string, people: string) => `Showing only ${name}'s team, ${people}.`,
    showingEveryone: (people: string) => `Showing everyone, ${people}.`,
    signInToSee: 'Sign in to see the organization chart.',
    noPeople: {
      title: 'No people to show',
      /** The text's tooltip, for whoever set the chart up; config.json's keys are the same in every language. */
      forAdministrators: 'Administrators: see chart.topPersons and chart.hide in config.json.',
      text: "Nobody matches the chart's settings. If you expected to see people here, please contact IT.",
    },
    loadFailed: 'Could not load the organization',
    tryAgain: 'Try again',
    loading: 'Loading the organization...',
  },
});

/** How far a full read of the directory is: on the loading screen, and in the status bar while the directory updates. */
export const PROGRESS_STRINGS = defineStrings({
  en: {
    /** With formatPeople's count, where the total is unknown or reached. */
    loaded: (people: string) => `${people} loaded`,
    /** With formatPeople's total, which is only about: Graph counts eventually consistently. */
    loadedOfAbout: (loaded: number, total: string) => `${formatNumber('en', loaded)} of about ${total} loaded`,
    lessThanAMinuteLeft: 'less than a minute left',
    minutesLeft: (minutes: number) =>
      `about ${formatNumber('en', minutes)} ${plural('en', minutes, { one: 'minute', other: 'minutes' })} left`,
    withTimeLeft: (progress: string, timeLeft: string) => `${progress}, ${timeLeft}`,
  },
});

/** The bar over a chart that shows one person's team alone (TeamBar); PAGE_STRINGS.showingTeam says which. */
export const TEAM_BAR_STRINGS = defineStrings({
  en: {
    /** In place of the team's name where the person was not found; the chart then shows everyone it can. */
    teamMissing: 'The person whose team this chart shows was not found or is hidden.',
    showEveryone: 'Show everyone',
  },
});

/** The status bar's notes and warnings, between the people count and the time the directory was read. */
export const STATUS_STRINGS = defineStrings({
  en: {
    /** The people count's tooltip: people in folded teams and past a long list's page count, people the filters leave out don't. */
    countTooltip: 'Everyone in the chart, including people in folded teams and in the part of a long list not shown',
    /** While the directory updates, with describeProgress's words where a full read reports how far it is. */
    updating: (progress: string | null) => (progress === null ? 'Updating...' : `Updating... ${progress}`),
    topPersonFromLinkMissing:
      'A person this link puts at the top of the chart was not found or is hidden. ' +
      'Ask whoever shared the link to check it.',
    linkedPersonMissing: 'The person in this link is not in the chart. Search for them by name.',
    topPersonsMissing: (topPersons: string) =>
      `The chart is set to start from ${topPersons}, but they were not found or are hidden. Please tell IT.`,
    presenceNeedsConsent: 'Teams status (Available, Busy...) is not shown: the app needs permission to see it.',
    turnOn: 'Turn on',
    presenceDenied:
      'Teams status (Available, Busy...) is not shown: your organization does not allow it. Ask IT if you need it.',
    /** The Teams status notes' tooltip: staff read the notes; the permission's name is for the administrator they turn to. */
    presencePermission: 'Microsoft Graph permission: Presence.Read.All',
    updated: (time: string) => `Updated ${time}`,
  },
});

/** A reload of the directory: its start and end when a person asked for it, and a failure, which the status bar shows. */
export const REFRESH_STRINGS = defineStrings({
  en: {
    updating: 'Updating the directory...',
    updated: 'Directory updated.',
    showingSavedData: 'Showing saved data.',
    signInToUpdate: 'Sign in to update',
    failed: (reason: string) => `Update failed: ${reason}`,
    retry: 'Retry',
  },
});

/** The tree's items that are nobody: a heading over the people with one flag, and the end of a page of a long list. */
export const TREE_STRINGS = defineStrings({
  en: {
    /** A heading's text and name: the warning in the cards' words (FLAG_LABELS), with formatPeople's count of the people under it. */
    heading: (flag: string, people: string) => `${flag} (${people})`,
    /** Where a list goes on: the next page, then how many it leaves out where that is more than the page. */
    showMore: (next: number, hidden: number) =>
      next < hidden
        ? `Show ${formatNumber('en', next)} more (${formatNumber('en', hidden)} not shown)`
        : `Show ${formatNumber('en', next)} more`,
    /** In its place on paper, which can't show more. */
    notShown: (hidden: number) => `${formatNumber('en', hidden)} not shown`,
    /** Under the chart on paper, where a list goes on. */
    printNotice:
      'Only the people shown on screen are printed. Where a long list goes on, the number of people not shown takes their place.',
  },
});

export const CARD_STRINGS = defineStrings({
  en: {
    /** The report badge's name. */
    directReports: (count: number) =>
      `${formatNumber('en', count)} ${plural('en', count, { one: 'direct report', other: 'direct reports' })}`,
    /** The report badge's tooltip, which starts with its name. */
    reportsInTotal: (directReports: string, teamSize: number) => `${directReports}, ${formatNumber('en', teamSize)} in total`,
    /** The contact lines' tooltips, which say what a press does. */
    email: (address: string) => `E-mail ${address}`,
    call: (phoneNumber: string) => `Call ${phoneNumber}`,
    /** What screen readers hear before a contact line, which its icon says on screen. */
    contactLabels: { mail: 'E-mail', phone: 'Phone', office: 'Office' },
  },
});
