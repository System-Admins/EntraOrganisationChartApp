import { directoryIssues, ISSUES, reportScope, type DepartmentPlace, type Issue } from '@/domain/dataQuality/directoryIssues';
import type { Employee } from '@/domain/employees/employee';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import { isUnlisted } from '@/domain/orgChart/hideRules';
import { chartHideRules, type OrgChartOptions } from '@/domain/orgChart/orgChart';
import { Query, type RequestHandler } from '../../common/mediator';
import type { OrgChartProvider } from '../../common/orgChartProvider';
import type { PhotoAnswers } from './photoAnswers';

/** A person the report lists, with what its lists and their files say beside the name. */
export interface ReportedPerson {
  readonly employee: Employee;
  /** The manager the directory records, where a user has that id and the rules don't keep them unlisted. */
  readonly manager: Employee | null;
  /** Whether the directory records a manager whom the rules keep unlisted, who is then named nowhere. */
  readonly managerUnlisted: boolean;
  /** Everything the report finds for the person, in ISSUES' order. */
  readonly issues: readonly Issue[];
  /** Undefined until the photo check has an answer for the person. */
  readonly hasPhoto: boolean | undefined;
  /** How most of the people in the person's department spell it, where the person spells it otherwise. */
  readonly usualSpelling: string | null;
  /** How many of the people checked the directory names the person as manager for. */
  readonly reports: number;
  /** Where the person's department is, where it is inside itself or in more than one place. */
  readonly department: DepartmentPlace | null;
}

export interface DirectoryHealth {
  /** When the directory was read, which also dates the files of the lists. */
  readonly loadedAt: Date;
  /** Everyone checked, whom the photo check asks about. */
  readonly checkedIds: readonly string[];
  /** The people with each issue, in name order. */
  readonly people: Readonly<Record<Issue, readonly ReportedPerson[]>>;
  /** How many of the people checked the photo check has an answer for so far. */
  readonly photosAnswered: number;
}

/** Who is missing what in the directory, among the people of the chart as `options` set it up, whatever its filters hide; the address list's still keeps the unlisted unnamed. */
export class GetDirectoryHealthQuery extends Query<DirectoryHealth> {
  constructor(readonly options: OrgChartOptions) {
    super();
  }
}

export class GetDirectoryHealthHandler implements RequestHandler<GetDirectoryHealthQuery> {
  constructor(
    private readonly charts: OrgChartProvider,
    private readonly photos: PhotoAnswers,
  ) {}

  async handle({ options }: GetDirectoryHealthQuery): Promise<DirectoryHealth> {
    const { snapshot } = await this.charts.get(options);
    const { employees } = snapshot;
    const rules = chartHideRules(options);
    // Built here, not through the provider, which keeps only the page's chart.
    const scope = buildOrgChart(employees, reportScope(options));
    const { answers } = this.photos;
    const found = directoryIssues(employees, scope, rules, answers);
    const byId = new Map(employees.map((employee) => [employee.id, employee]));
    const reported = new Map<string, ReportedPerson>();
    // One object per person, whichever lists they are in.
    const report = (employee: Employee): ReportedPerson => {
      let person = reported.get(employee.id);
      if (!person) {
        const manager = (employee.managerId === null ? undefined : byId.get(employee.managerId)) ?? null;
        const managerUnlisted = manager !== null && isUnlisted(manager, rules);
        person = {
          employee,
          manager: managerUnlisted ? null : manager,
          managerUnlisted,
          issues: found.issuesOf.get(employee.id) ?? [],
          hasPhoto: answers.get(employee.id),
          usualSpelling: found.usualSpellings.get(employee.id) ?? null,
          reports: found.reportCounts.get(employee.id) ?? 0,
          department: found.departmentPlaces.get(employee.id) ?? null,
        };
        reported.set(employee.id, person);
      }
      return person;
    };
    const people = {} as Record<Issue, readonly ReportedPerson[]>;
    for (const issue of ISSUES) people[issue] = found.people[issue].map(report);
    return {
      loadedAt: snapshot.loadedAt,
      checkedIds: found.checked.map(({ id }) => id),
      people,
      photosAnswered: found.checked.filter(({ id }) => answers.has(id)).length,
    };
  }
}
