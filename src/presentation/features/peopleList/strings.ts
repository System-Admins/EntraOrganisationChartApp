import { formatNumber } from '@/application/common/intl';
import { defineStrings } from '@/application/settings/language';
import type { PeopleLayout } from './PeopleList';

/** A list of people beside the chart, such as a search's matches or a manager's whole team. */
export const PEOPLE_LIST_STRINGS = defineStrings({
  en: {
    /** Goes back to what the panel showed before the list; its name says where. */
    back: 'Back',
    /** The field's name and placeholder. */
    narrow: 'Narrow the list',
    /** Its description: what it compares. */
    narrowHint: 'Finds people in the list by name, job title or department.',
    /** Shown and said while the field narrows the list, with formatPeople's count of everyone in it. */
    narrowed: (count: number, people: string) => `${formatNumber('en', count)} of ${people}`,
    noneMatch: 'No one in the list matches.',
    /** Above the rows, where more people match than the list shows. */
    capped: (shown: number, people: string) =>
      `The first ${formatNumber('en', shown)} of ${people} are listed. Narrow the list to find the others.`,
    /** The legend of the choice between rows and a board of photos, and the choices. */
    layout: 'Show as',
    layouts: { list: 'List', board: 'Photo board' } satisfies Record<PeopleLayout, string>,
  },
});
