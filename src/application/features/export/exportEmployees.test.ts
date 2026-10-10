import { describe, expect, it, vi } from 'vitest';
import type { EmployeePhotos } from '@/application/abstractions/employeePhotos';
import type { Table, TableFileWriter } from '@/application/abstractions/tableFileWriter';
import type { ExtraField } from '@/application/settings/extraFields';
import type { OrgChartOptions } from '@/domain/orgChart/orgChart';
import { directoryOf } from '@/testing/directory';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { OrgChartProvider } from '../../common/orgChartProvider';
import { ExportEmployeesCommand, ExportEmployeesHandler } from './exportEmployees';

describe('ExportEmployeesHandler', () => {
  const employees = [
    makeEmployee('owner', null, { accountEnabled: false }),
    makeEmployee('ceo', 'owner', { displayName: 'Chief', mobilePhone: '+47 400 00 000', companyName: 'Contoso' }),
    makeEmployee('lead', 'ceo'),
    makeEmployee('dev', 'lead', { mail: null, jobTitle: null }),
    makeEmployee('cfo', 'ceo'),
    makeEmployee('guest', 'ceo', { isGuest: true, isLicensed: false }),
  ];
  const loadedAt = new Date(2026, 8, 29, 12, 0);
  const snapshot = { employees, loadedAt };
  const provider = new OrgChartProvider(directoryOf(() => snapshot));
  const hide = { ...SHOW_EVERYONE, disabledAccounts: true, guests: true };
  const options: OrgChartOptions = { topPersons: ['ceo'], hide };

  /** The CEO has a photo, the CFO has none, and the source gives no answer for the others. */
  const photos: EmployeePhotos = {
    forget: () => Promise.resolve(),
    getPhotoUrl: () => Promise.resolve(null),
    havePhotos: (employeeIds, onProgress) => {
      onProgress?.(employeeIds.length);
      return Promise.resolve(
        new Map([
          ['ceo', true],
          ['cfo', false],
        ]),
      );
    },
  };

  interface ExportSetup {
    readonly onProgress?: (checkedCount: number) => void;
    /** The CEO's chart without disabled accounts and guests, unless the test needs another. */
    readonly chartOptions?: OrgChartOptions;
    /** The directory above, unless the test needs another. */
    readonly charts?: OrgChartProvider;
    /** The organization's own fields that config.json names; none unless the test needs them. */
    readonly extraFields?: readonly ExtraField[];
  }

  async function exportChart({ onProgress, chartOptions = options, charts = provider, extraFields = [] }: ExportSetup = {}): Promise<{
    baseName: string;
    table: Table;
  }> {
    const saved: { baseName: string; table: Table }[] = [];
    const writer: TableFileWriter = {
      save: (baseName, table) => {
        saved.push({ baseName, table });
        return Promise.resolve();
      },
    };
    await new ExportEmployeesHandler(charts, photos, writer, extraFields).handle(new ExportEmployeesCommand(chartOptions, 'en', onProgress));
    const [file] = saved;
    if (!file) throw new Error('Nothing was saved.');
    return file;
  }

  /** Each row as heading and value, in chart order. */
  const rowsOf = (table: Table) =>
    table.rows.map((row) => Object.fromEntries(table.columns.map((column, index) => [column, row[index]])));

  /** One column's values, in chart order. */
  const columnOf = (table: Table, heading: string) => table.rows.map((row) => row[table.columns.indexOf(heading)]);

  it('lists everyone in the chart in reading order, without the people it hides', async () => {
    const { table } = await exportChart();

    expect(columnOf(table, 'User principal name')).toEqual([
      'ceo@contoso.com',
      'cfo@contoso.com',
      'lead@contoso.com',
      'dev@contoso.com',
    ]);
  });

  it('writes every detail, empty where the directory has none, and the manager by UPN and by name', async () => {
    const [ceo, , , dev] = rowsOf((await exportChart()).table);

    expect(ceo).toEqual({
      Name: 'Chief',
      'E-mail': 'ceo@contoso.com',
      'User principal name': 'ceo@contoso.com',
      'Job title': 'Engineer',
      Department: 'Engineering',
      Company: 'Contoso',
      Office: '',
      City: '',
      Country: '',
      'Business phone': '',
      'Mobile phone': '+47 400 00 000',
      // The chart hides the disabled owner, but they are still the CEO's manager in the directory.
      Manager: 'owner@contoso.com',
      'Profile photo': 'Yes',
      'Account enabled': 'Yes',
      Guest: 'No',
      Licensed: 'Yes',
      'Manager name': 'Owner',
      Level: '1',
      'Direct reports': '2',
      'Team size': '3',
      'Top of branch': 'Chief',
      Issues: 'No office',
    });
    expect(dev).toMatchObject({ 'E-mail': '', 'Job title': '', Manager: 'lead@contoso.com', 'Manager name': 'Lead' });
  });

  it('writes no row for an unlisted person\'s place, nor names them as anyone\'s manager or as the top of a branch, while their rule is on', async () => {
    const hidden = employees.map((employee) =>
      employee.id === 'owner' || employee.id === 'lead' ? { ...employee, hiddenFromAddressList: true } : employee,
    );
    const charts = new OrgChartProvider(directoryOf(() => ({ employees: hidden, loadedAt })));
    const hiding = { ...hide, hiddenFromAddressList: true };

    const rows = rowsOf((await exportChart({ chartOptions: { topPersons: ['ceo'], hide: hiding }, charts })).table);
    const top = rowsOf((await exportChart({ chartOptions: { topPersons: ['lead'], hide: hiding }, charts })).table);

    expect(rows.map((row) => [row.Name, row.Manager, row['Manager name']])).toEqual([
      ['Chief', '', ''],
      ['Cfo', 'ceo@contoso.com', 'Chief'],
      ['Dev', '', ''],
    ]);
    // Counted as the rows are: the place under the CEO is no direct report and no one in the team.
    expect(rows.map((row) => [row.Name, row['Direct reports'], row['Team size']])).toEqual([
      ['Chief', '1', '2'],
      ['Cfo', '0', '0'],
      ['Dev', '0', '0'],
    ]);
    expect(top.map((row) => [row.Name, row['Top of branch']])).toEqual([
      ['Dev', ''],
      ['Chief', 'Chief'],
      ['Cfo', 'Chief'],
    ]);
  });

  it('counts each person\'s level, direct reports and whole team, from the top of their branch', async () => {
    const { table } = await exportChart();

    // In chart order: CEO, CFO, lead, dev.
    expect(columnOf(table, 'Level')).toEqual(['1', '2', '2', '3']);
    expect(columnOf(table, 'Direct reports')).toEqual(['2', '0', '1', '0']);
    expect(columnOf(table, 'Team size')).toEqual(['3', '0', '1', '0']);
    expect(columnOf(table, 'Top of branch')).toEqual(['Chief', 'Chief', 'Chief', 'Chief']);
  });

  it('writes the counts as plain digits, which spreadsheets read as numbers', async () => {
    const team = [makeEmployee('head'), ...Array.from({ length: 1000 }, (_, index) => makeEmployee(`member${String(index)}`, 'head'))];
    const charts = new OrgChartProvider(directoryOf(() => ({ employees: team, loadedAt })));
    const chartOptions: OrgChartOptions = { topPersons: ['head'], hide: SHOW_EVERYONE };

    const { table } = await exportChart({ chartOptions, charts });

    expect(table.rows[0]?.[table.columns.indexOf('Direct reports')]).toBe('1000');
    expect(table.rows[0]?.[table.columns.indexOf('Team size')]).toBe('1000');
  });

  it('names the head of each branch, flagged people included, and lists why a flagged person heads one', async () => {
    // The lead is the top person, so the CEO, whose manager the chart hides, heads a branch of their own.
    const { table } = await exportChart({ chartOptions: { topPersons: ['lead'], hide } });

    expect(columnOf(table, 'Name')).toEqual(['Lead', 'Dev', 'Chief', 'Cfo']);
    expect(columnOf(table, 'Top of branch')).toEqual(['Lead', 'Lead', 'Chief', 'Chief']);
    expect(columnOf(table, 'Level')).toEqual(['1', '2', '1', '2']);
    expect(columnOf(table, 'Issues')[2]).toBe('Manager not shown, No office');
  });

  it('answers Yes or No for the account, guest and license columns', async () => {
    const { table } = await exportChart({ chartOptions: { topPersons: ['owner'], hide: SHOW_EVERYONE } });

    expect(rowsOf(table).map((row) => [row.Name, row['Account enabled'], row.Guest, row.Licensed])).toEqual([
      ['Owner', 'No', 'No', 'Yes'],
      ['Chief', 'Yes', 'No', 'Yes'],
      ['Cfo', 'Yes', 'No', 'Yes'],
      ['Guest', 'Yes', 'Yes', 'No'],
      ['Lead', 'Yes', 'No', 'Yes'],
      ['Dev', 'Yes', 'No', 'Yes'],
    ]);
  });

  it('lists what the directory lacks for a person among the issues', async () => {
    const [, , , dev] = rowsOf((await exportChart()).table);

    expect(dev?.Issues).toBe('No job title, No office, No e-mail, No phone');
  });

  it('counts a missing photo only where the photo source said there is none', async () => {
    const { table } = await exportChart();

    // In chart order: CEO (a photo), CFO (none) and two the photo source gave no answer for.
    expect(columnOf(table, 'Issues')).toEqual([
      'No office',
      'No office, No phone, No photo',
      'No office, No phone',
      'No job title, No office, No e-mail, No phone',
    ]);
  });

  it('says who has a profile photo, and Unknown where the photo source gave no answer', async () => {
    const onProgress = vi.fn();

    const { table } = await exportChart({ onProgress });

    // In chart order: CEO, CFO, lead, dev.
    expect(columnOf(table, 'Profile photo')).toEqual(['Yes', 'No', 'Unknown', 'Unknown']);
    expect(onProgress).toHaveBeenCalledWith(4);
  });

  it('adds a column for each of the organization\'s own fields that config.json exports, after its own, headed by its label', async () => {
    const extraFields: ExtraField[] = [
      { property: 'employeeType', label: 'Employee type', search: false, export: true },
      { property: 'employeeOrgData.costCenter', label: 'Cost centre', search: true, export: false },
      { property: 'onPremisesExtensionAttributes.extensionAttribute3', label: 'Badge number', search: false, export: true },
    ];
    const team = [
      makeEmployee('head', null, {
        extra: { employeeType: 'Employee', 'employeeOrgData.costCenter': '4100', 'onPremisesExtensionAttributes.extensionAttribute3': 'B-1' },
      }),
      makeEmployee('temp', 'head', { extra: { employeeType: 'Contractor' } }),
    ];
    const charts = new OrgChartProvider(directoryOf(() => ({ employees: team, loadedAt })));

    const { table } = await exportChart({ chartOptions: { topPersons: ['head'], hide: SHOW_EVERYONE }, charts, extraFields });

    expect(table.columns.slice(-3)).toEqual(['Issues', 'Employee type', 'Badge number']);
    expect(table.columns).not.toContain('Cost centre');
    expect(rowsOf(table).map((row) => [row.Name, row['Employee type'], row['Badge number']])).toEqual([
      ['Head', 'Employee', 'B-1'],
      ['Temp', 'Contractor', ''],
    ]);
  });

  it('leaves the employee ID out', async () => {
    expect((await exportChart()).table.columns).not.toContain('Employee ID');
  });

  it('names the file after the date the directory was read', async () => {
    expect((await exportChart()).baseName).toBe('org-chart-2026-09-29');
  });

  it('heads its columns in a fixed order, which spreadsheets that read columns by position rely on', async () => {
    expect((await exportChart()).table.columns).toEqual([
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
      'Level',
      'Direct reports',
      'Team size',
      'Top of branch',
      'Issues',
    ]);
  });
});
