import type { Issue } from '@/domain/dataQuality/directoryIssues';
import { defineStrings } from '../../settings/language';

/** The names of the files of the directory health report's lists, in the chart's language: the report's, then the issue's. */
export const REPORT_FILE_STRINGS = defineStrings({
  en: {
    fileName: 'directory-health',
    issues: {
      noManager: 'no-manager',
      managerGone: 'manager-disabled-or-missing',
      disabledManager: 'disabled-with-reports',
      managerCycle: 'circular-manager-chain',
      jobTitle: 'no-job-title',
      department: 'no-department',
      officeLocation: 'no-office',
      mail: 'no-e-mail',
      phone: 'no-phone',
      photo: 'no-photo',
      departmentSpelling: 'department-spelled-differently',
      departmentInItself: 'department-inside-itself',
      departmentElsewhere: 'department-in-more-than-one-place',
    } satisfies Record<Issue, string>,
  },
});
