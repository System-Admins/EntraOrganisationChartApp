import { formatNumber, plural } from '@/application/common/intl';
import { defineStrings } from '@/application/settings/language';

/** The departments beside the chart, nested as their people report to each other, and each department's people. */
export const DEPARTMENT_STRINGS = defineStrings({
  en: {
    /** The panel's heading and name. */
    title: 'Departments',
    close: 'Close the departments',
    /** Under the panel's heading. */
    count: (count: number) => `${formatNumber('en', count)} ${plural('en', count, { one: 'department', other: 'departments' })}`,
    /** A row's disclosure button, which shows or hides the departments below it; aria-expanded says which. */
    departmentsIn: (department: string) => `Departments in ${department}`,
    /** The panel's last entry, and the heading of its list: the people the directory gives no department. */
    noDepartment: 'No department set',
    /** A department's view: its Close button's name. */
    closeDepartment: 'Close the department',
    /** Back's name: to the panel, to the department before, or to the details the view was opened from. */
    backToDepartments: 'Back to the departments',
    backTo: (department: string) => `Back to ${department}`,
    backToDetails: (name: string) => `Back to the details for ${name}`,
    /** Names the list of the departments above, from the top down. */
    path: 'Department path',
    /** Under the heading, after formatPeople's count of its own people, where departments below it have more. */
    withBelow: (people: string, total: number) => `${people}, ${formatNumber('en', total)} with the departments below it`,
    /** Its leaders, the people who report into it from another department: up to three by name, else how many. */
    ledBy: (names: string) => `Led by ${names}`,
    ledByCount: (count: number) => `Led by ${formatNumber('en', count)} ${plural('en', count, { one: 'person', other: 'people' })}`,
    /** After a row's count, where its warning icon shows that the same department comes higher up its path. */
    alsoHigherUp: 'also higher up its path',
    /** Where the same department comes higher up its own path. */
    insideItself: 'This department also comes higher up its path: people in it report into a department that is below it.',
    /** The heading over the departments below it. */
    below: 'Departments below',
    /** The people list's name for assistive technology. */
    people: (department: string) => `People in ${department}`,
    peopleWithout: 'People without a department',
    /** The panel's button that shows the departments in the chart's place, and the bar over them with the way back. */
    showAsChart: 'Show as chart',
    showing: (count: number) =>
      `Showing the departments, ${formatNumber('en', count)} ${plural('en', count, { one: 'department', other: 'departments' })}.`,
    showPeople: 'Show people',
    /** Said as the people come back in the chart's place. */
    showingPeople: 'Showing the people.',
    /** The chart of departments: the tree's name, with the chart's own. */
    treeName: (chart: string) => `Departments in ${chart}`,
    /** A department card's badge, which folds and unfolds the departments below it: its name, and its tooltip with everyone below. */
    belowCount: (count: number) => `${formatNumber('en', count)} ${plural('en', count, { one: 'department', other: 'departments' })} below`,
    belowInAll: (departments: string, people: string) => `${departments}, ${people} in all`,
    /** On the card of a department that comes higher up its path too, in the warnings' place. */
    alsoHigherUpLine: 'Also higher up its path',
    /** In the chart's place where nobody in it has a department. */
    noDepartments: 'Nobody in this chart has a department in the directory.',
    /** Said as Expand all and the asterisk key unfold the chart of departments, as the people chart's are. */
    expandedPartly: (visibleLevels: number, totalLevels: number) =>
      `Expanded ${formatNumber('en', visibleLevels)} of ${formatNumber('en', totalLevels)} levels to keep the page responsive. ` +
      'Click a department to see more.',
    unfolded: (count: number) => `Unfolded ${formatNumber('en', count)} ${plural('en', count, { one: 'department', other: 'departments' })}.`,
    unfoldedPartly: (unfolded: number, folded: number) =>
      `Unfolded ${formatNumber('en', unfolded)} of ${formatNumber('en', folded)} ` +
      `${plural('en', folded, { one: 'department', other: 'departments' })} to keep the page responsive.`,
    nothingToUnfold: 'No departments to unfold at this level.',
  },
});
