import { missingDetailsOf, type Employee } from '@/domain/employees/employee';
import { isUnlisted } from '@/domain/orgChart/hideRules';
import { chartHideRules, getNode, type OrgChart, type OrgChartOptions, type OrgNode } from '@/domain/orgChart/orgChart';
import type { EmployeePhotos } from '../../abstractions/employeePhotos';
import type { Table, TableFileWriter } from '../../abstractions/tableFileWriter';
import { formatLocalDate } from '../../common/formatLocalDate';
import { Command, type RequestHandler } from '../../common/mediator';
import type { OrgChartProvider } from '../../common/orgChartProvider';
import { FLAG_LABELS, MISSING_DETAIL_LABELS } from '../../common/strings';
import type { ExtraField } from '../../settings/extraFields';
import type { Language } from '../../settings/language';
import { EXPORT_STRINGS } from './strings';

/** Everyone in the chart, including folded teams; not the people the hide rules leave out, nor the places of the unlisted. */
export class ExportEmployeesCommand extends Command {
  constructor(
    readonly options: OrgChartOptions,
    /** The language of the file's name, headings and answers: the chart's. */
    readonly language: Language,
    /** Gets the number of people checked for a photo so far, which is the slow part of a large export. */
    readonly onProgress?: (checkedCount: number) => void,
  ) {
    super();
  }
}

/** A person's place in the chart: their node, the root of the chart at the top of their branch, and how many of their direct reports it names. */
interface Placed {
  readonly node: OrgNode;
  readonly root: Employee;
  readonly directReports: number;
}

/** What a row says beside the person's own entry, which needs no place in the chart. */
export interface EntryDetails {
  /** The manager the directory records, wherever the chart has them; none where the rules keep them unlisted. */
  readonly manager: Employee | undefined;
  /** Undefined when the photo source gave no answer for the person. */
  readonly hasPhoto: boolean | undefined;
  /** In the file's language: what is wrong with the person's entry. */
  readonly issues: readonly string[];
}

interface Details extends Placed, EntryDetails {}

export type ExportStrings = (typeof EXPORT_STRINGS)['en'];

/** A column: its heading in EXPORT_STRINGS, and its value in a person's row. */
export type Column<D> = readonly [
  heading: keyof ExportStrings['columns'],
  value: (employee: Employee, details: D, strings: ExportStrings) => string | null,
];

const yesOrNo = (value: boolean, strings: ExportStrings) => (value ? strings.yes : strings.no);

/** The export's columns that need no place in the chart, in its order; the directory health report's lists have them too. */
export const ENTRY_COLUMNS: readonly Column<EntryDetails>[] = [
  ['name', (employee) => employee.displayName],
  ['mail', (employee) => employee.mail],
  ['userPrincipalName', (employee) => employee.userPrincipalName],
  ['jobTitle', (employee) => employee.jobTitle],
  ['department', (employee) => employee.department],
  ['companyName', (employee) => employee.companyName],
  ['officeLocation', (employee) => employee.officeLocation],
  ['city', (employee) => employee.city],
  ['country', (employee) => employee.country],
  ['businessPhone', (employee) => employee.businessPhone],
  ['mobilePhone', (employee) => employee.mobilePhone],
  ['manager', (_employee, { manager }) => manager?.userPrincipalName ?? null],
  [
    'profilePhoto',
    (_employee, { hasPhoto }, strings) => (hasPhoto === undefined ? strings.unknown : yesOrNo(hasPhoto, strings)),
  ],
  ['accountEnabled', (employee, _details, strings) => yesOrNo(employee.accountEnabled, strings)],
  ['guest', (employee, _details, strings) => yesOrNo(employee.isGuest, strings)],
  ['licensed', (employee, _details, strings) => yesOrNo(employee.isLicensed, strings)],
  ['managerName', (_employee, { manager }) => manager?.displayName ?? null],
];

/** The last of the export's own columns, which the directory health report's lists end with too. */
export const ISSUES_COLUMN: Column<EntryDetails> = ['issues', (_employee, { issues }) => issues.join(', ')];

// Columns added later go at the end, so a spreadsheet that reads columns by position keeps working.
const COLUMNS: readonly Column<Details>[] = [
  ...ENTRY_COLUMNS,
  // Plain digits, which spreadsheets read as numbers in every language.
  ['level', (_employee, { node }) => String(node.depth + 1)],
  ['directReports', (_employee, { directReports }) => String(directReports)],
  ['teamSize', (_employee, { node }) => String(node.teamSize)],
  ['topOfBranch', (_employee, { root }) => root.displayName],
  ISSUES_COLUMN,
];

/** A file's table: the columns, then the organization's own fields that config.json exports, headed by their labels. */
export function employeeTable<D>(
  columns: readonly Column<D>[],
  extraFields: readonly ExtraField[],
  rows: readonly (readonly [employee: Employee, details: D])[],
  strings: ExportStrings,
): Table {
  const extraColumns = extraFields.filter((field) => field.export);
  return {
    columns: [...columns.map(([heading]) => strings.columns[heading]), ...extraColumns.map(({ label }) => label)],
    rows: rows.map(([employee, details]) => [
      ...columns.map(([, value]) => value(employee, details, strings) ?? ''),
      ...extraColumns.map(({ property }) => employee.extra[property] ?? ''),
    ]),
  };
}

export class ExportEmployeesHandler implements RequestHandler<ExportEmployeesCommand> {
  /** `extraFields` are the organization's own fields; those config.json exports get a column after the export's own. */
  constructor(
    private readonly charts: OrgChartProvider,
    private readonly photos: EmployeePhotos,
    private readonly writer: TableFileWriter,
    private readonly extraFields: readonly ExtraField[] = [],
  ) {}

  async handle({ options, language, onProgress }: ExportEmployeesCommand): Promise<void> {
    const strings = EXPORT_STRINGS[language];
    const flags = FLAG_LABELS[language];
    const missing = MISSING_DETAIL_LABELS[language];
    const { chart, snapshot } = await this.charts.get(options);
    const exported = chartOrder(chart);
    const photos = await this.photos.havePhotos(
      exported.map(({ node }) => node.employee.id),
      onProgress,
    );
    // From the whole directory, so a manager the chart leaves out is still named, but for one the rules keep unlisted.
    const byId = new Map(snapshot.employees.map((employee) => [employee.id, employee]));
    const rules = chartHideRules(options);
    const rows = exported.map((placed): readonly [Employee, Details] => {
      const { employee, flag } = placed.node;
      const recorded = employee.managerId === null ? undefined : byId.get(employee.managerId);
      const manager = recorded && !isUnlisted(recorded, rules) ? recorded : undefined;
      const hasPhoto = photos.get(employee.id);
      const issues = [
        ...(flag === null ? [] : [flags[flag]]),
        ...missingDetailsOf(employee, hasPhoto).map((detail) => missing[detail]),
      ];
      return [employee, { ...placed, manager, hasPhoto, issues }];
    });
    await this.writer.save(
      `${strings.fileName}-${formatLocalDate(snapshot.loadedAt)}`,
      employeeTable(COLUMNS, this.extraFields, rows, strings),
    );
  }
}

/** Top to bottom as the chart reads, so each team follows its manager; an unlisted person's place is no row, but the team below it is. */
function chartOrder(chart: OrgChart): Placed[] {
  const ordered: Placed[] = [];
  const visit = (id: string, root: Employee) => {
    const node = getNode(chart, id);
    if (!node.unlisted) ordered.push({ node, root, directReports: node.childIds.filter((childId) => !getNode(chart, childId).unlisted).length });
    for (const childId of node.childIds) visit(childId, root);
  };
  for (const rootId of chart.rootIds) visit(rootId, getNode(chart, rootId).employee);
  return ordered;
}
