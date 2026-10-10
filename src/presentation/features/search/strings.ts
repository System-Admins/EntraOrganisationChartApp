import { formatNumber, plural } from '@/application/common/intl';
import type { SearchField } from '@/application/features/employeeSearch/searchIndex';
import { defineStrings } from '@/application/settings/language';

export const SEARCH_STRINGS = defineStrings({
  en: {
    /** The field's name and placeholder: only the word, on purpose; its description says what it looks in. */
    label: 'Search',
    /** The suggestion list's name. */
    people: 'People',
    noMatches: 'No matches',
    /** How many people match, the ones beyond the suggestions too: above the suggestions, and said as it changes. */
    matches: (count: number) => `${formatNumber('en', count)} ${plural('en', count, { one: 'match', other: 'matches' })}`,
    /** The last suggestion, where more match than are suggested: lists every match beside the chart. */
    showAll: (count: number) => `Show all ${formatNumber('en', count)}`,
    /** The last detail of a suggestion. */
    reportsTo: (manager: string) => `Reports to ${manager}`,
    /** A detail of a suggestion found by one of the organization's own fields, which says which: their values are codes as often as words. */
    extraDetail: (label: string, value: string) => `${label}: ${value}`,
    /** Before anything is typed: the first detail of the signed-in user's suggestion, and the name of a group of them alone. */
    you: 'You',
    /** The first detail of their manager's suggestion, and the name of a group of the manager alone. */
    yourManager: 'Your manager',
    youAndYourManager: 'You and your manager',
    /** The group of the people opened lately. */
    recent: 'Recent',
    /** The last option before anything is typed: forgets the people opened lately. */
    clearRecent: 'Clear recent',
    /** Said once they are forgotten. */
    recentCleared: 'Recent people cleared.',
  },
});

/** Every match of a search beside the chart, which Show all opens. */
export const SEARCH_RESULTS_STRINGS = defineStrings({
  en: {
    /** The heading, which also names the panel. */
    title: 'Search results',
    close: 'Close search results',
    searching: 'Searching...',
    /** Under the heading, with the words of `matches` above: how many match what was searched for. */
    matchesFor: (matches: string, term: string) => `${matches} for "${term}"`,
    /** Above the rows, where more match than the search lists. */
    best: (shown: number) => `The best ${formatNumber('en', shown)} are listed. Search for more words to find the others.`,
    /** The rows' name for assistive technology. */
    people: 'People found',
    tryAgain: 'Try again',
  },
});

/** Each detail the search covers as people call it, what they look up most first; a new field needs a word per language. */
export const SEARCH_HINT_STRINGS = defineStrings({
  en: {
    name: 'name',
    fields: {
      businessPhone: 'phone',
      mobilePhone: 'phone',
      mail: 'e-mail',
      userPrincipalName: 'e-mail',
      officeLocation: 'office',
      companyName: 'company',
      jobTitle: 'job title',
      department: 'department',
      city: 'city',
      country: 'country',
    } satisfies Record<SearchField, string>,
    hint: (details: string) => `Finds people by ${details}.`,
  },
});
