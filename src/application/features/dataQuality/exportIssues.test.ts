import { describe, expect, it } from 'vitest';
import type { Table, TableFileWriter } from '@/application/abstractions/tableFileWriter';
import type { ExtraField } from '@/application/settings/extraFields';
import { makeEmployee } from '@/testing/makeEmployee';
import { ExportIssuesCommand, ExportIssuesHandler } from './exportIssues';
import type { ReportedPerson } from './getDirectoryHealth';

const FORMER = makeEmployee('former', null, { displayName: 'Former Director', accountEnabled: false });

const PEOPLE: readonly ReportedPerson[] = [
  {
    employee: makeEmployee('analyst', 'former', { displayName: 'Ana Lyst', mail: null, extra: { 'employeeOrgData.costCenter': '4170' } }),
    manager: FORMER,
    managerUnlisted: false,
    issues: ['managerGone', 'mail', 'photo'],
    hasPhoto: false,
    usualSpelling: null,
    reports: 0,
    department: null,
  },
  {
    employee: makeEmployee('orphan', 'deleted', { displayName: 'Or Phan' }),
    manager: null,
    managerUnlisted: false,
    issues: ['managerGone'],
    hasPhoto: undefined,
    usualSpelling: null,
    reports: 0,
    department: null,
  },
];

async function exportList(extraFields: readonly ExtraField[] = []) {
  const saved: { baseName: string; table: Table }[] = [];
  const writer: TableFileWriter = {
    save: (baseName, table) => {
      saved.push({ baseName, table });
      return Promise.resolve();
    },
  };
  await new ExportIssuesHandler(writer, extraFields).handle(
    new ExportIssuesCommand('managerGone', PEOPLE, new Date(2026, 8, 30, 9, 5), 'en'),
  );
  const [file] = saved;
  if (!file) throw new Error('Nothing was saved.');
  return file;
}

/** Each row as heading and value. */
const rowsOf = (table: Table) => table.rows.map((row) => Object.fromEntries(table.columns.map((column, index) => [column, row[index]])));

describe('ExportIssuesHandler', () => {
  it('names the file after the report, the issue and the date the directory was read', async () => {
    expect((await exportList()).baseName).toBe('directory-health-manager-disabled-or-missing-2026-09-30');
  });

  it('has the export\'s columns that need no place in the chart, and its Issues column in the shared words, last', async () => {
    const { table } = await exportList();

    expect(table.columns).toEqual([
      'Name',
      'E-mail',
      'User principal name',
      'Job title',
      'Department',
      'Company',
      'Office',
      'City',
      'Country',
      'Business phone',
      'Mobile phone',
      'Manager',
      'Profile photo',
      'Account enabled',
      'Guest',
      'Licensed',
      'Manager name',
      'Issues',
    ]);
    expect(rowsOf(table)).toMatchObject([
      {
        Name: 'Ana Lyst',
        'E-mail': '',
        Manager: 'former@contoso.com',
        'Manager name': 'Former Director',
        'Profile photo': 'No',
        Issues: 'Manager disabled or missing, No e-mail, No photo',
      },
      // No user has the recorded manager's id, and the photo check has no answer for them yet.
      { Name: 'Or Phan', Manager: '', 'Manager name': '', 'Profile photo': 'Unknown', Issues: 'Manager disabled or missing' },
    ]);
  });

  it('adds the organization\'s own fields that config.json exports, as the export does', async () => {
    const { table } = await exportList([
      { property: 'employeeOrgData.costCenter', label: 'Cost centre', search: false, export: true },
      { property: 'employeeType', label: 'Employee type', search: true, export: false },
    ]);

    expect(table.columns.slice(-2)).toEqual(['Issues', 'Cost centre']);
    expect(table.rows.map((row) => row.at(-1))).toEqual(['4170', '']);
  });
});
