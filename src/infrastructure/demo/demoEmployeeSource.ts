import type { ProgressListener } from '@/application/abstractions/employeeDirectory';
import type { SignedInUser } from '@/application/abstractions/signedInUser';
import type { ExtraFieldProperty } from '@/application/settings/extraFields';
import type { Employee } from '@/domain/employees/employee';
import type { EmployeeSource, LoadedEmployees } from '../directory/employeeSource';

export const DEMO_DOMAIN = 'contoso.com';

/** Who the demo signs in as: a team lead in the generated company, with a manager above and a team below. */
export const DEMO_SIGNED_IN_USER: SignedInUser = {
  id: '00000000-0000-4000-8000-000000000038',
  displayName: 'Åse Vik',
  userPrincipalName: `ase.vik@${DEMO_DOMAIN}`,
  isGuest: false,
};

/** Co-CEOs; public/config.json lists their addresses as top persons. */
const CEOS = [
  { name: 'Ingrid Solberg', area: 'Retail' },
  { name: 'Erik Haugen', area: 'Energy' },
  { name: 'Maria Garcia', area: 'Health' },
  { name: 'Jonas Berg', area: 'Digital' },
];

const FIRST_NAMES = [
  'Anna', 'Erik', 'Lars', 'Sofia', 'Henrik', 'Emma', 'Ola', 'Nora', 'Mats', 'Ida', 'Kristian', 'Sara',
  'Thomas', 'Hanna', 'Martin', 'Julie', 'Anders', 'Eva', 'Magnus', 'Liv', 'Peter', 'Camilla', 'Fredrik',
  'Karin', 'Oskar', 'Marte', 'Daniel', 'Aisha', 'Mohammed', 'Chen', 'Priya', 'Lucas', 'Olivia', 'Noah',
  'Zofia', 'Mateo', 'Yuki', 'Siri', 'Jørgen', 'Åse',
];

const LAST_NAMES = [
  'Hansen', 'Johansen', 'Olsen', 'Larsen', 'Andersen', 'Pedersen', 'Nilsen', 'Kristiansen', 'Jensen',
  'Karlsen', 'Dahl', 'Lie', 'Moen', 'Strand', 'Eriksen', 'Bakke', 'Lund', 'Nguyen', 'Ali', 'Kowalski',
  'Müller', 'Rossi', 'Novak', 'Silva', 'Tanaka', 'Øverland', 'Åsheim', 'Brekke', 'Holm', 'Vik',
];

const UNITS = ['Sales', 'Operations', 'Finance', 'Marketing', 'Engineering', 'Customer Service', 'Logistics', 'HR'];

const MEMBER_TITLES = ['Specialist', 'Senior Specialist', 'Analyst', 'Coordinator', 'Engineer', 'Consultant'];

const OFFICES = [
  { city: 'Oslo', country: 'Norway' },
  { city: 'Stockholm', country: 'Sweden' },
  { city: 'Copenhagen', country: 'Denmark' },
  { city: 'London', country: 'United Kingdom' },
] as const;

/** The employee type of the people with these job titles; everyone else with a job title is an employee. */
const EMPLOYEE_TYPES: Readonly<Record<string, string>> = { Consultant: 'Contractor', Trainee: 'Intern', 'Seasonal Worker': 'Seasonal' };

const SIMULATED_PAGE_SIZE = 100;
const SIMULATED_PAGE_DELAY_MS = 120;

/** Deterministic fictitious company for local development and demos; no sign-in required. */
export class DemoEmployeeSource implements EmployeeSource {
  /** `extraFields` are the organization's own fields that config.json names; the people carry only those, as a read from Graph would. */
  constructor(private readonly extraFields: readonly ExtraFieldProperty[] = []) {}

  /** Reports the total as Graph's count does, so the loading screen shows its bar and estimate in demos too. */
  async loadAll(onProgress?: ProgressListener): Promise<LoadedEmployees> {
    const employees = generateDemoCompany().map((employee) => ({ ...employee, extra: readWith(employee.extra, this.extraFields) }));
    onProgress?.(0, employees.length);
    for (let loaded = 0; loaded < employees.length; loaded += SIMULATED_PAGE_SIZE) {
      await new Promise((resolve) => setTimeout(resolve, SIMULATED_PAGE_DELAY_MS));
      onProgress?.(Math.min(loaded + SIMULATED_PAGE_SIZE, employees.length), employees.length);
    }
    return { employees, changesLink: null };
  }
}

type Overrides = Partial<Omit<Employee, 'id' | 'displayName' | 'userPrincipalName'>>;

export function generateDemoCompany(): Employee[] {
  const random = mulberry32(20240901);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const employees: Employee[] = [];
  const usedNames = new Set<string>();
  // In the order the departments first appear, which keeps their cost centres apart and the same on every load.
  const costCenters = new Map<string, string>();
  const costCenterOf = (department: string) => {
    const costCenter = costCenters.get(department) ?? String(4100 + costCenters.size * 10);
    costCenters.set(department, costCenter);
    return costCenter;
  };

  const add = (
    name: string,
    jobTitle: string | null,
    department: string | null,
    managerId: string | null,
    overrides: Overrides = {},
  ) => {
    usedNames.add(name);
    const alias = toAlias(name);
    const index = employees.length;
    const office = OFFICES[index % OFFICES.length] ?? OFFICES[0];
    const employee: Employee = {
      id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
      displayName: name,
      mail: `${alias}@${DEMO_DOMAIN}`,
      userPrincipalName: `${alias}@${DEMO_DOMAIN}`,
      businessPhone: index % 9 === 4 ? null : `+1 555 01${String(index % 100).padStart(2, '0')}`,
      mobilePhone: index % 3 === 0 ? `+1 555 02${String(index % 100).padStart(2, '0')}` : null,
      jobTitle,
      department,
      companyName: 'Contoso',
      employeeId: `E${String(1000 + index)}`,
      officeLocation: index % 7 === 0 ? null : `${office.city} HQ, floor ${String(1 + (index % 6))}`,
      city: office.city,
      country: office.country,
      managerId,
      accountEnabled: true,
      isGuest: false,
      isLicensed: true,
      hiddenFromAddressList: false,
      // Accounts without a job, such as rooms and services, have none of the organization's own fields; a cost centre needs a department.
      extra: {
        ...(jobTitle === null ? {} : { employeeType: EMPLOYEE_TYPES[jobTitle] ?? 'Employee' }),
        ...(jobTitle === null || department === null ? {} : { 'employeeOrgData.costCenter': costCenterOf(department) }),
      } satisfies Partial<Record<ExtraFieldProperty, string>>,
      ...overrides,
    };
    employees.push(employee);
    return employee;
  };

  const person = (jobTitle: string | null, department: string | null, managerId: string | null, overrides?: Overrides) => {
    let name: string;
    do name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    while (usedNames.has(name));
    return add(name, jobTitle, department, managerId, overrides);
  };

  const team = (managerId: string, size: number, department: string, titles: readonly string[]) => {
    for (let i = 0; i < size; i++) person(pick(titles), department, managerId);
  };

  const chiefs: Employee[] = [];
  for (const ceo of CEOS) {
    const chief = add(ceo.name, `CEO ${ceo.area}`, 'Executive Management', null);
    chiefs.push(chief);
    for (let d = 0, directors = between(3, 5); d < directors; d++) {
      const unit = pick(UNITS);
      const department = `${ceo.area} ${unit}`;
      const director = person(`Director of ${unit}`, department, chief.id);
      for (let l = 0, leads = between(2, 4); l < leads; l++) {
        team(person('Team Lead', department, director.id).id, between(2, 8), department, MEMBER_TITLES);
      }
      if (random() < 0.5) team(director.id, between(1, 3), department, ['Senior Advisor', 'Business Controller']);
    }
  }

  const [retailCeo, energyCeo, healthCeo, digitalCeo] = chiefs;
  if (!retailCeo || !energyCeo || !healthCeo || !digitalCeo) throw new Error('Demo company has no CEOs.');

  // Managerless people with reports: flagged as "no manager set".
  const research = person('Head of Research', 'Research', null);
  team(person('Research Lead', 'Research', research.id).id, 3, 'Research', ['Researcher', 'Senior Researcher']);
  team(research.id, 2, 'Research', ['Research Assistant']);

  // A departed manager whose account is disabled but still set as manager.
  const departed = person('Former Director', 'Energy Strategy', energyCeo.id, { accountEnabled: false });
  team(departed.id, 2, 'Energy Strategy', ['Analyst']);

  // Circular manager chain (bad directory data).
  const loopA = person('Project Manager', 'Projects', null);
  const loopB = person('Project Manager', 'Projects', loopA.id);
  employees[employees.indexOf(loopA)] = { ...loopA, managerId: loopB.id };
  person('Project Coordinator', 'Projects', loopB.id);

  person(null, null, retailCeo.id);
  person('Consultant', 'Retail Marketing', retailCeo.id, { isGuest: true, mail: 'consultant@fabrikam.com' });
  person('Chair of the Board', 'Board of Directors', null);
  add('Backup Service', null, null, null, { isLicensed: false, businessPhone: null, mobilePhone: null });
  add('Meeting Room Oslo', null, null, null, { accountEnabled: false, isLicensed: false, businessPhone: null });
  add('Sales Shared Mailbox', null, null, null, { accountEnabled: false, isLicensed: false, businessPhone: null });

  // Added last, so that everyone above keeps their generated name.
  person('Trainee', 'Retail Marketing', retailCeo.id, { isLicensed: false });
  // A recorded manager that no user in the directory has: deleted, or a contact.
  person('Analyst', 'Energy Strategy', '00000000-0000-4000-8000-ffffffffffff');
  // Too many for a group chat, a meeting or an e-mail link: the team's addresses are copied instead.
  const support = person('Head of Customer Support', 'Health Customer Support', healthCeo.id);
  team(support.id, 52, 'Health Customer Support', ['Support Agent', 'Senior Support Agent']);
  // More people without a manager than a page holds, whose heading starts folded once the filters show them.
  for (let i = 0; i < 55; i++) person('Seasonal Worker', 'Retail Operations', null);
  // Entries nobody finished, and a department spelled two ways, for the directory health report.
  const facilities = person('Facilities Manager', 'Energy Facilities', energyCeo.id);
  person('Facilities Coordinator', null, facilities.id, { officeLocation: null });
  person('Caretaker', 'Energy facilities', facilities.id, { businessPhone: null, mobilePhone: null });
  person('Caretaker', 'Energy Facilities', facilities.id, { officeLocation: null, businessPhone: null, mobilePhone: null });
  // Departments three deep, an assistant whose department comes again below itself, and a developer apart from their department.
  const strategy = person('Head of Strategy and M&A', 'Strategy M&A', digitalCeo.id);
  person('Strategy Manager', 'Strategy M&A', strategy.id);
  const development = person('Head of Business Development', 'Business Development', strategy.id);
  team(development.id, 3, 'Business Development', ['Business Developer', 'Partnership Manager']);
  person('Executive Assistant', 'Executive Management', strategy.id);
  person('Business Developer', 'Business Development', energyCeo.id);
  // Hidden from the address list: a head whose team stays under a nameless place, and an advisor whom the chart leaves out.
  const audit = person('Head of Internal Audit', 'Internal Audit', retailCeo.id, { hiddenFromAddressList: true });
  team(audit.id, 2, 'Internal Audit', ['Internal Auditor']);
  person('Executive Advisor', 'Executive Management', digitalCeo.id, { hiddenFromAddressList: true });

  return employees;
}

/** A person's fields as a read of only these would have them. */
function readWith(extra: Employee['extra'], extraFields: readonly ExtraFieldProperty[]): Record<string, string> {
  return Object.fromEntries(
    extraFields.flatMap((property) => {
      const value = extra[property];
      return value === undefined ? [] : [[property, value] as const];
    }),
  );
}

function toAlias(name: string): string {
  return name
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '.');
}

/** Small seeded PRNG so the demo company is identical on every load. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
