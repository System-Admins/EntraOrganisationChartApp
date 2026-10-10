import type { Issue } from '@/domain/dataQuality/directoryIssues';
import type { AccountState, MissingDetail } from '@/domain/employees/employee';
import type { RootFlag } from '@/domain/orgChart/orgChart';
import { defineStrings, type Language } from '../settings/language';

/** Why a person who is no top person heads a branch: the warning on their card, in their details and in the export. */
export const FLAG_LABELS = defineStrings({
  en: {
    noManager: 'No manager set',
    managerNotShown: 'Manager not shown',
    managerCycle: 'Circular manager chain',
  } satisfies Record<RootFlag, string>,
});

/** The mark in the details of a person whose account is no ordinary member's. */
export const ACCOUNT_STATE_LABELS = defineStrings({
  en: {
    disabled: 'Disabled account',
    guest: 'Guest',
    unlicensed: 'No license',
  } satisfies Record<AccountState, string>,
});

/** What the directory lacks for a person, as the export's Issues column lists it. */
export const MISSING_DETAIL_LABELS = defineStrings({
  en: {
    jobTitle: 'No job title',
    department: 'No department',
    officeLocation: 'No office',
    mail: 'No e-mail',
    phone: 'No phone',
    photo: 'No photo',
  } satisfies Record<MissingDetail, string>,
});

/** What the directory health report finds besides a flag or a missing detail, which keep the words above. */
export const DIRECTORY_ISSUE_LABELS = defineStrings({
  en: {
    managerGone: 'Manager disabled or missing',
    disabledManager: 'Disabled account with direct reports',
    departmentSpelling: 'Department spelled differently',
    departmentInItself: 'Department inside itself',
    departmentElsewhere: 'Department in more than one place',
  } satisfies Record<Exclude<Issue, RootFlag | MissingDetail>, string>,
});

/** Every issue of the directory health report in words: its headings, and the Issues column of the files of its lists. */
export function issueLabels(language: Language): Readonly<Record<Issue, string>> {
  const { noManager, managerCycle } = FLAG_LABELS[language];
  return { noManager, managerCycle, ...MISSING_DETAIL_LABELS[language], ...DIRECTORY_ISSUE_LABELS[language] };
}
