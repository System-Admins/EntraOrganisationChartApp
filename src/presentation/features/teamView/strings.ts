import { formatNumber, plural } from '@/application/common/intl';
import { defineStrings } from '@/application/settings/language';

/** A manager's whole team, everyone below them, beside the chart, or its people in one department or city. */
export const TEAM_VIEW_STRINGS = defineStrings({
  en: {
    /** The view's heading and the panel's name. */
    title: (manager: string) => `${manager}'s team`,
    /** The same for the team's people in one department or city, from its row in the Team section. */
    titleIn: (manager: string, place: string) => `${manager}'s team in ${place}`,
    /** Widens a department's or a city's list to the whole team. */
    seeWholeTeam: 'See the whole team',
    /** The Close button's name; the details' says "Close details". */
    close: 'Close the team list',
    /** Back's name: to the details the view was opened from. */
    backTo: (manager: string) => `Back to the details for ${manager}`,
    /** The rows' name for assistive technology. */
    people: (manager: string) => `People in ${manager}'s team`,
    peopleIn: (manager: string, place: string) => `People in ${manager}'s team in ${place}`,
  },
});

/** The team at a glance, at the top of the details' Team section: its numbers, then its largest departments and cities. */
export const TEAM_GLANCE_STRINGS = defineStrings({
  en: {
    /** Names the list of tiles, each read as its number and the word under it: "111 people". */
    numbers: 'The team in numbers',
    /** The words under the numbers of levels and managers; the people's is SHARED_STRINGS.people. */
    levels: { one: 'level', other: 'levels' },
    managers: { one: 'manager', other: 'managers' },
    departments: 'Departments',
    cities: 'Cities',
    /** The button under a list that names only the largest: the rest on request, and back; it keeps the focus as its words change. */
    moreDepartments: (count: number) =>
      `Show ${formatNumber('en', count)} more ${plural('en', count, { one: 'department', other: 'departments' })}`,
    fewerDepartments: 'Show fewer departments',
    moreCities: (count: number) => `Show ${formatNumber('en', count)} more ${plural('en', count, { one: 'city', other: 'cities' })}`,
    fewerCities: 'Show fewer cities',
  },
});
