import type { Employee } from '@/domain/employees/employee';
import { ancestorIds, getNode, namedEmployee, type OrgChart, type OrgChartOptions } from '@/domain/orgChart/orgChart';
import { Query, type RequestHandler } from '../../common/mediator';
import type { OrgChartProvider } from '../../common/orgChartProvider';
import type { ExtraField } from '../../settings/extraFields';
import { SearchIndex, type SearchField } from './searchIndex';

export interface EmployeeSearchHit {
  readonly employee: Employee;
  /** The details, other than the name, that the search found the person by. */
  readonly matchedFields: readonly SearchField[];
  /** The organization's own fields that the search found the person by, in config.json's order. */
  readonly matchedExtraFields: readonly ExtraField[];
  /** From the root down to the direct manager; expanding these reveals the hit. */
  readonly path: readonly string[];
  /** Null at the top, and under the place of someone unlisted. */
  readonly managerName: string | null;
}

export interface EmployeeSearchResult {
  /** At most the query's limit, best first. */
  readonly hits: readonly EmployeeSearchHit[];
  /** Everyone who matches, beyond the limit too. */
  readonly total: number;
}

/** Searches only the people visible under the given options. The suggestions take the default limit, the results view more. */
export class SearchEmployeesQuery extends Query<EmployeeSearchResult> {
  constructor(
    readonly options: OrgChartOptions,
    readonly text: string,
    readonly limit = 12,
  ) {
    super();
  }
}

export class SearchEmployeesHandler implements RequestHandler<SearchEmployeesQuery> {
  private readonly indexes = new WeakMap<OrgChart, SearchIndex>();
  /** The organization's own fields that config.json lets search look in. */
  private readonly searched: readonly ExtraField[];

  constructor(
    private readonly charts: OrgChartProvider,
    extraFields: readonly ExtraField[] = [],
  ) {
    this.searched = extraFields.filter((field) => field.search);
  }

  async handle({ options, text, limit }: SearchEmployeesQuery): Promise<EmployeeSearchResult> {
    const { chart } = await this.charts.get(options);
    let index = this.indexes.get(chart);
    if (!index) {
      index = new SearchIndex(chart, this.searched);
      this.indexes.set(chart, index);
    }

    const { best, total } = index.search(text, limit);
    return { hits: best.map(({ id, fields, extraFields }) => searchHit(chart, id, fields, extraFields)), total };
  }
}

/** A person in the chart as Search offers them; the matched fields are the details a search found them by. */
export function searchHit(
  chart: OrgChart,
  id: string,
  matchedFields: readonly SearchField[] = [],
  matchedExtraFields: readonly ExtraField[] = [],
): EmployeeSearchHit {
  const path = ancestorIds(chart, id);
  const managerId = path.at(-1);
  return {
    employee: getNode(chart, id).employee,
    matchedFields,
    matchedExtraFields,
    path,
    managerName: managerId === undefined ? null : (namedEmployee(chart, managerId)?.displayName ?? null),
  };
}
