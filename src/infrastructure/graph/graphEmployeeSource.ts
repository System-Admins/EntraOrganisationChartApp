import { SignInRequiredError } from '@/application/abstractions/authenticator';
import type { ProgressListener } from '@/application/abstractions/employeeDirectory';
import { ServiceError } from '@/application/abstractions/serviceError';
import type { ExtraFieldProperty } from '@/application/settings/extraFields';
import type { Employee } from '@/domain/employees/employee';
import type { EmployeeSource, LoadedEmployees, ReadCheckpoint, ReadPosition } from '../directory/employeeSource';
import { GRAPH_ROOT, GraphRequestError, type GraphClient } from './graphClient';

/** A complex property's members, such as employeeOrgData's costCenter. */
type GraphMembers = Readonly<Record<string, string | null>>;

interface GraphUser {
  readonly id: string;
  readonly displayName: string | null;
  readonly mail: string | null;
  readonly userPrincipalName: string;
  readonly businessPhones: readonly string[] | null;
  readonly mobilePhone: string | null;
  readonly jobTitle: string | null;
  readonly department: string | null;
  readonly companyName: string | null;
  readonly employeeId: string | null;
  readonly officeLocation: string | null;
  readonly city: string | null;
  readonly country: string | null;
  readonly accountEnabled: boolean | null;
  readonly userType: string | null;
  readonly assignedLicenses: readonly unknown[] | null;
  /** Null where nobody set it, which leaves the person in the address list. */
  readonly showInAddressList: boolean | null;
  readonly manager?: { readonly id: string } | null;
  // Selected only where config.json names one of the organization's own fields that they hold (ExtraFieldProperty).
  readonly employeeType?: string | null;
  readonly employeeOrgData?: GraphMembers | null;
  readonly onPremisesExtensionAttributes?: GraphMembers | null;
}

/** New users arrive whole, changed ones with at least the changed properties, removed ones with @removed. */
type GraphUserChange = Partial<Omit<GraphUser, 'id'>> & {
  readonly id: string;
  readonly '@removed'?: unknown;
  readonly 'manager@delta'?: readonly { readonly id: string; readonly '@removed'?: unknown }[];
};

/** The property that holds one of the organization's own fields: for a member of a complex property, the part before the dot. */
type HolderOf<Property> = Property extends `${infer Holder}.${string}` ? Holder : Property;

type ExtraHolder = HolderOf<ExtraFieldProperty>;

const SELECT = [
  'id',
  'displayName',
  'mail',
  'userPrincipalName',
  'businessPhones',
  'mobilePhone',
  'jobTitle',
  'department',
  'companyName',
  'employeeId',
  'officeLocation',
  'city',
  'country',
  'accountEnabled',
  'userType',
  'assignedLicenses',
  'showInAddressList',
];

/** The link is kept in the browser, so only a Graph delta link ever gets the access token. */
const DELTA_LINK_PREFIX = `${GRAPH_ROOT}/users/delta?`;
/** Counts the users without reading them; Graph counts only eventually consistently, so the number can be a little off. */
const USER_COUNT = '/users?$select=id&$count=true&$top=1';
const EVENTUALLY_CONSISTENT = { ConsistencyLevel: 'eventual' };

/** Where a read starts: afresh, without a page link, or where an earlier attempt stopped. */
type ReadStart = Omit<ReadPosition, 'nextLink'> & { readonly nextLink: string | null };

export class GraphEmployeeSource implements EmployeeSource {
  /** The first page of the users, with their managers and the fields config.json names. */
  private readonly usersWithManager: string;
  /** Starts tracking changes to the same properties. */
  private readonly changesFromNow: string;

  /** `extraFields` are the organization's own fields that config.json names, which every person is read with. */
  constructor(
    private readonly graph: GraphClient,
    private readonly extraFields: readonly ExtraFieldProperty[] = [],
  ) {
    // A complex property is selected whole, once for all its members.
    const select = [...new Set([...SELECT, ...extraFields.map((property) => placeOf(property)[0])])].join(',');
    // With $expand, Graph returns at most 100 users per page regardless of $top.
    this.usersWithManager = `/users?$select=${select}&$expand=manager($select=id)&$top=999`;
    // Delta queries can't $expand; selecting manager tracks it instead.
    this.changesFromNow = `${GRAPH_ROOT}/users/delta?$select=${select},manager&$deltatoken=latest`;
  }

  async loadAll(onProgress?: ProgressListener, checkpoint: ReadCheckpoint = { position: null }): Promise<LoadedEmployees> {
    const resumed = checkpoint.position;
    if (resumed) {
      try {
        return await this.read(resumed, onProgress, checkpoint);
      } catch (error) {
        // Graph lets a page link expire, as it does a delta link: one that fails as it is used starts the read afresh.
        if (!isExpiredLink(error) || checkpoint.position?.nextLink !== resumed.nextLink) throw error;
        checkpoint.position = null;
      }
    }
    // Taken before the read, so what changes during it is replayed by the next loadChanges instead of missed.
    const [changesLink, total] = await Promise.all([
      optional(
        this.graph.readDelta<unknown>(this.changesFromNow).then(({ deltaLink }) => deltaLink),
        'Could not start tracking directory changes; refreshes will read everything.',
      ),
      optional(
        this.graph.getJson<{ readonly '@odata.count'?: unknown }>(USER_COUNT, EVENTUALLY_CONSISTENT).then(countIn),
        'Could not count the users; the progress shows no total.',
      ),
    ]);
    return this.read({ employees: [], nextLink: null, changesLink, total }, onProgress, checkpoint);
  }

  async loadChanges(employees: readonly Employee[], changesLink: string): Promise<LoadedEmployees | null> {
    if (!changesLink.startsWith(DELTA_LINK_PREFIX)) return null;
    let round: { readonly items: readonly GraphUserChange[]; readonly deltaLink: string };
    try {
      round = await this.graph.readDelta<GraphUserChange>(changesLink);
    } catch (error) {
      if (isExpiredLink(error)) return null;
      throw error;
    }
    const byId = new Map(employees.map((employee) => [employee.id, employee]));
    // In order: the same user can appear more than once in a round, and the last appearance wins.
    for (const change of round.items) {
      if (change['@removed']) byId.delete(change.id);
      else byId.set(change.id, applyChange(byId.get(change.id), change, this.extraFields));
    }
    return { employees: [...byId.values()], changesLink: round.deltaLink };
  }

  /** Page after page from `start`; an attempt that fails leaves the checkpoint where it stopped. */
  private async read(start: ReadStart, onProgress: ProgressListener | undefined, checkpoint: ReadCheckpoint): Promise<LoadedEmployees> {
    const employees = [...start.employees];
    const { changesLink, total } = start;
    let next = start.nextLink;
    onProgress?.(employees.length, total);
    try {
      for await (const page of this.graph.pages<GraphUser>(this.usersWithManager, next)) {
        employees.push(...page.items.map((user) => toEmployee(user, this.extraFields)));
        next = page.nextLink;
        onProgress?.(employees.length, total);
      }
    } catch (error) {
      // Without a page read, there is no link to go on from, and the next attempt starts afresh.
      checkpoint.position = next === null ? null : { employees, nextLink: next, changesLink, total };
      throw error;
    }
    return { employees, changesLink };
  }
}

/** Change tracking and the count only help, so the read goes on without them, unless a sign-in is needed or nothing answers. */
async function optional<T>(request: Promise<T | null>, warning: string): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof SignInRequiredError || (error instanceof ServiceError && error.failure === 'offline')) throw error;
    console.warn(warning, error);
    return null;
  }
}

function countIn({ '@odata.count': count }: { readonly '@odata.count'?: unknown }): number | null {
  return typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : null;
}

/** 410 Gone, or a 4xx such as syncStateNotFound, means Graph no longer knows a delta link or a page link: it expired. */
function isExpiredLink(error: unknown): boolean {
  return (
    error instanceof GraphRequestError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![401, 403, 429].includes(error.status)
  );
}

/** The change's properties laid over the known user, in Graph's terms, so both go through toEmployee alike. */
function applyChange(previous: Employee | undefined, change: GraphUserChange, extraFields: readonly ExtraFieldProperty[]): Employee {
  const managerId = change['manager@delta']
    ? (change['manager@delta'].find((reference) => !reference['@removed'])?.id ?? null)
    : (previous?.managerId ?? null);
  const known: Partial<GraphUser> = previous ? asGraphUser(previous, extraFields) : {};
  return toEmployee(
    {
      ...known,
      ...change,
      ...keptMembers(known, change, extraFields),
      manager: managerId === null ? null : { id: managerId },
    } as GraphUser,
    extraFields,
  );
}

/** Members of a complex property that a change leaves out keep their values, whether Graph sends the property whole or only what changed in it. */
function keptMembers(known: Partial<GraphUser>, change: GraphUserChange, extraFields: readonly ExtraFieldProperty[]): Partial<GraphUser> {
  const kept: Record<string, GraphMembers> = {};
  for (const property of extraFields) {
    const [holder] = placeOf(property);
    const before = known[holder];
    const after = change[holder];
    if (typeof before === 'object' && before !== null && typeof after === 'object' && after !== null) {
      kept[holder] = { ...before, ...after };
    }
  }
  return kept;
}

function asGraphUser(employee: Employee, extraFields: readonly ExtraFieldProperty[]): GraphUser {
  return {
    id: employee.id,
    displayName: employee.displayName,
    mail: employee.mail,
    userPrincipalName: employee.userPrincipalName,
    businessPhones: employee.businessPhone ? [employee.businessPhone] : [],
    mobilePhone: employee.mobilePhone,
    jobTitle: employee.jobTitle,
    department: employee.department,
    companyName: employee.companyName,
    employeeId: employee.employeeId,
    officeLocation: employee.officeLocation,
    city: employee.city,
    country: employee.country,
    accountEnabled: employee.accountEnabled,
    userType: employee.isGuest ? 'Guest' : 'Member',
    assignedLicenses: employee.isLicensed ? [{}] : [],
    showInAddressList: !employee.hiddenFromAddressList,
    manager: employee.managerId ? { id: employee.managerId } : null,
    ...graphFieldsOf(employee, extraFields),
  };
}

/** The organization's own fields kept for a person, back where Graph holds them: a member goes into its complex property beside the others. */
function graphFieldsOf(employee: Employee, extraFields: readonly ExtraFieldProperty[]): Pick<GraphUser, ExtraHolder> {
  const user: Record<string, string | Record<string, string>> = {};
  for (const property of extraFields) {
    const value = employee.extra[property];
    if (value === undefined) continue;
    const [holder, member] = placeOf(property);
    const members = user[holder];
    user[holder] = member === null ? value : { ...(typeof members === 'object' ? members : {}), [member]: value };
  }
  return user;
}

export function toEmployee(user: GraphUser, extraFields: readonly ExtraFieldProperty[] = []): Employee {
  return {
    id: user.id,
    displayName: user.displayName?.trim() || user.userPrincipalName,
    mail: text(user.mail),
    userPrincipalName: user.userPrincipalName,
    businessPhone: text(user.businessPhones?.[0]),
    mobilePhone: text(user.mobilePhone),
    jobTitle: text(user.jobTitle),
    department: text(user.department),
    companyName: text(user.companyName),
    employeeId: text(user.employeeId),
    officeLocation: text(user.officeLocation),
    city: text(user.city),
    country: text(user.country),
    managerId: user.manager?.id ?? null,
    accountEnabled: user.accountEnabled ?? true,
    isGuest: user.userType === 'Guest',
    isLicensed: (user.assignedLicenses?.length ?? 0) > 0,
    hiddenFromAddressList: user.showInAddressList === false,
    extra: extraOf(user, extraFields),
  };
}

/** The fields of `extraFields` that the user has set, by property, as Employee.extra keeps them. */
function extraOf(user: GraphUser, extraFields: readonly ExtraFieldProperty[]): Record<string, string> {
  const extra: Record<string, string> = {};
  for (const property of extraFields) {
    const value = text(valueAt(user, property));
    if (value !== null) extra[property] = value;
  }
  return extra;
}

/** What Graph sent for a field: the property itself, or its member where the property is complex. */
function valueAt(user: GraphUser, property: ExtraFieldProperty): string | null | undefined {
  const [holder, member] = placeOf(property);
  const held = user[holder];
  if (member === null) return typeof held === 'string' ? held : null;
  return typeof held === 'object' ? held?.[member] : null;
}

/** Where Graph holds a field: the property that $select names, and the member within it where that property is complex. */
function placeOf(property: ExtraFieldProperty): readonly [holder: ExtraHolder, member: string | null] {
  const dot = property.indexOf('.');
  return dot === -1 ? [property as ExtraHolder, null] : [property.slice(0, dot) as ExtraHolder, property.slice(dot + 1)];
}

/** Entra ID returns empty strings as well as null for unset attributes. */
function text(value: string | null | undefined): string | null {
  return value?.trim() || null;
}
