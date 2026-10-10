import { formatNumber, plural } from '@/application/common/intl';
import { defineStrings } from '@/application/settings/language';
import type { Issue } from '@/domain/dataQuality/directoryIssues';

/** The directory health report: who is missing what, each issue with its people and what can be done with the list. */
export const HEALTH_STRINGS = defineStrings({
  en: {
    title: 'Directory health',
    close: 'Close directory health',
    loading: 'Checking the directory...',
    failed: 'The directory could not be checked.',
    tryAgain: 'Try again',
    /** With formatPeople's count of the people checked and the time the directory was read. */
    summary: (people: string, time: string) => `${people} checked, in the directory as it was read at ${time}.`,
    /** Who is checked: the filters decide which kinds of account count, but never hide what the report looks for. */
    scope:
      'The report covers everyone this chart can show, the people its filters hide included, ' +
      'but not the kinds of account the filters leave out, such as disabled accounts. Choose an issue to see who has it.',
    /** An issue's heading as screen readers say it, with formatPeople's count or what stands in for it. */
    heading: (issue: string, count: string) => `${issue}, ${count}`,
    /** The photo check's count before it has answered for anyone. */
    notChecked: 'Not checked',
    /** Under an issue's heading, once its people are shown: what it means. */
    explanations: {
      noManager: 'The directory names no manager for these people, who are not at the top of the chart.',
      managerGone: 'The manager the directory names for these people is a disabled account, or no user has that ID.',
      disabledManager: 'Disabled accounts that the directory still names as the manager of people the report checks.',
      managerCycle: "These people's managers lead back to them, so the chart can only start the chain from one of them.",
      jobTitle: 'The directory has no job title for these people.',
      department: 'The directory has no department for these people.',
      officeLocation: 'The directory has no office for these people.',
      mail: 'These people have no e-mail address in the directory.',
      phone: 'These people have neither a work phone nor a mobile in the directory.',
      photo: 'Microsoft 365 has no profile photo for these people.',
      departmentSpelling: 'These people spell their department otherwise than most of the people in it, which splits it in two.',
      departmentInItself:
        "These people's department comes again higher up their reporting line, with another department between, so the chart's " +
        'departments place it inside itself. Check their department, or whom they or their managers report to.',
      departmentElsewhere:
        'The chart places departments by whom their people report to. Most of the department of these people is elsewhere, ' +
        'and they are a few apart from it. If it is one department, check whom they report to; if it is another one of the same name, ' +
        'a name of its own keeps them apart.',
    } satisfies Record<Issue, string>,
    /** At the end of each person in a list, and in their description: a press shows them in the chart. */
    showInChart: 'Show in chart',
    copyAddresses: 'Copy e-mail addresses',
    copyManagerAddresses: "Copy their managers' addresses",
    copied: 'Copied',
    /** Read out after every copy. */
    addressesCopied: 'E-mail addresses copied',
    managerAddressesCopied: "Managers' addresses copied",
    /** Labels the field with the addresses where nothing could copy them. */
    manualAddresses: 'Copy these addresses',
    /** Says the copied addresses leave out disabled accounts, as an e-mail to a team does. */
    copyHint: 'The addresses leave out disabled accounts, and are separated by semicolons, ready to paste into a message.',
    exportList: 'Export this list',
    /** Said once the file has been handed to the browser, with the issue's words. */
    listExported: (issue: string) => `The list "${issue}" is exported.`,
    exportFailed: (reason: string) => `Export failed: ${reason}`,
    /** Under a person's name in a list. */
    manager: (name: string) => `Manager: ${name}`,
    disabledManager: (name: string) => `Manager: ${name}, a disabled account`,
    missingManager: 'Manager: no longer in the directory, or not a user',
    /** For a manager whom the address list hides while its filter is on, who is named nowhere. */
    unlistedManager: 'Manager: not in the address list',
    unlistedDisabledManager: 'Manager: not in the address list, a disabled account',
    reports: (count: number) =>
      `${formatNumber('en', count)} ${plural('en', count, { one: 'direct report', other: 'direct reports' })}`,
    spelling: (spelling: string, usual: string) => `Spelled "${spelling}", where most write "${usual}"`,
    /** A department inside itself: its departments from the top down, joined by pathSeparator. */
    inDepartment: (path: string) => `In ${path}`,
    pathSeparator: ' > ',
    /** A department in more than one place: where these people's part is, then where most of it is, with formatPeople's count. */
    elsewhere: (here: string, there: string, people: string) => `${here}; most of it, ${people}, ${there}`,
    hereUnder: (department: string) => `Under ${department}`,
    hereAtTop: 'At the top',
    thereUnder: (department: string) => `under ${department}`,
    thereAtTop: 'at the top',
    /** The photo check, which asks Microsoft 365 about everyone checked. */
    photosHint: 'Checking asks Microsoft 365 about each person, 20 at a time, so it takes a moment in a large directory.',
    checkPhotos: 'Check photos',
    cancel: 'Cancel',
    checkRest: 'Check the rest',
    checkAgain: 'Check again',
    /** With formatPeople's count of everyone checked. */
    checking: (checked: number, people: string) => `Checking photos: ${formatNumber('en', checked)} of ${people}`,
    checkedPartly: (checked: number, people: string) => `Photos checked for ${formatNumber('en', checked)} of ${people}.`,
    cancelled: (checked: number, people: string) => `Cancelled with ${formatNumber('en', checked)} of ${people} checked.`,
    /** Where Microsoft 365 gave no answer for some, with formatPeople's count of them. */
    unanswered: (people: string) => `Could not check ${people}. Try again later.`,
    checkFailed: (reason: string) => `The photos could not be checked: ${reason}`,
    /** Said as a check starts and ends, with formatPeople's counts. */
    checkStarted: 'Checking photos...',
    checkDone: (withoutPhoto: string) => `Photos checked: ${withoutPhoto} without a photo.`,
    checkDoneUnanswered: (withoutPhoto: string, unanswered: string) =>
      `Photos checked: ${withoutPhoto} without a photo. Could not check ${unanswered}.`,
    checkCancelled: 'Photo check cancelled.',
  },
});
