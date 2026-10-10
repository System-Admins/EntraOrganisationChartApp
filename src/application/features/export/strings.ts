import { defineStrings } from '../../settings/language';

/** The file's name, its column headings and the answers in its Yes or No columns, in the chart's language. */
export const EXPORT_STRINGS = defineStrings({
  en: {
    fileName: 'org-chart',
    columns: {
      name: 'Name',
      mail: 'E-mail',
      userPrincipalName: 'User principal name',
      jobTitle: 'Job title',
      department: 'Department',
      companyName: 'Company',
      officeLocation: 'Office',
      city: 'City',
      country: 'Country',
      businessPhone: 'Business phone',
      mobilePhone: 'Mobile phone',
      /** The manager's user principal name; Manager name has the name. */
      manager: 'Manager',
      profilePhoto: 'Profile photo',
      accountEnabled: 'Account enabled',
      guest: 'Guest',
      licensed: 'Licensed',
      managerName: 'Manager name',
      level: 'Level',
      directReports: 'Direct reports',
      teamSize: 'Team size',
      topOfBranch: 'Top of branch',
      issues: 'Issues',
    },
    yes: 'Yes',
    no: 'No',
    /** The photo column, for people the photo source gave no answer for. */
    unknown: 'Unknown',
  },
});
