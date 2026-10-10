import type { Issue } from '@/domain/dataQuality/directoryIssues';
import type { Employee } from '@/domain/employees/employee';
import type { TableFileWriter } from '../../abstractions/tableFileWriter';
import { formatLocalDate } from '../../common/formatLocalDate';
import { Command, type RequestHandler } from '../../common/mediator';
import { issueLabels } from '../../common/strings';
import type { ExtraField } from '../../settings/extraFields';
import type { Language } from '../../settings/language';
import { employeeTable, ENTRY_COLUMNS, ISSUES_COLUMN, type EntryDetails } from '../export/exportEmployees';
import { EXPORT_STRINGS } from '../export/strings';
import type { ReportedPerson } from './getDirectoryHealth';
import { REPORT_FILE_STRINGS } from './strings';

/** One list of the directory health report as a file, with the export's columns that need no place in the chart. */
export class ExportIssuesCommand extends Command {
  constructor(
    readonly issue: Issue,
    /** The list's people, as GetDirectoryHealthQuery answered them. */
    readonly people: readonly ReportedPerson[],
    /** When the directory was read, which dates the file as the export dates its own. */
    readonly loadedAt: Date,
    /** The language of the file's name, headings and answers: the chart's. */
    readonly language: Language,
  ) {
    super();
  }
}

export class ExportIssuesHandler implements RequestHandler<ExportIssuesCommand> {
  /** `extraFields` are the organization's own fields; those config.json exports get a column, as in the export. */
  constructor(
    private readonly writer: TableFileWriter,
    private readonly extraFields: readonly ExtraField[] = [],
  ) {}

  async handle({ issue, people, loadedAt, language }: ExportIssuesCommand): Promise<void> {
    const labels = issueLabels(language);
    const files = REPORT_FILE_STRINGS[language];
    const rows = people.map(({ employee, manager, hasPhoto, issues }): readonly [Employee, EntryDetails] => [
      employee,
      { manager: manager ?? undefined, hasPhoto, issues: issues.map((found) => labels[found]) },
    ]);
    await this.writer.save(
      `${files.fileName}-${files.issues[issue]}-${formatLocalDate(loadedAt)}`,
      employeeTable([...ENTRY_COLUMNS, ISSUES_COLUMN], this.extraFields, rows, EXPORT_STRINGS[language]),
    );
  }
}
