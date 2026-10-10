import { describe, expect, it, vi } from 'vitest';
import { SignInRequiredError } from '@/application/abstractions/authenticator';
import type { ExtraFieldProperty } from '@/application/settings/extraFields';
import { makeEmployee } from '@/testing/makeEmployee';
import type { ReadCheckpoint } from '../directory/employeeSource';
import { GraphClient, type Connection, type Fetch } from './graphClient';
import { GraphEmployeeSource } from './graphEmployeeSource';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const user = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  displayName: `User ${id}`,
  mail: `${id}@contoso.com`,
  userPrincipalName: `${id}@contoso.com`,
  businessPhones: [],
  mobilePhone: null,
  jobTitle: null,
  department: null,
  accountEnabled: true,
  userType: 'Member',
  assignedLicenses: [{ skuId: 'e5' }],
  ...extra,
});

const DELTA = 'https://graph.microsoft.com/v1.0/users/delta?$deltatoken=';
const PAGE = 'https://graph.microsoft.com/v1.0/users?$skiptoken=';
/** The answer to the "changes from now" request that starts every full read. */
const trackingStarted = (token = 'start') => json({ value: [], '@odata.deltaLink': DELTA + token });
/** The answer to the count of the users that starts every full read too. */
const counted = (count: number) => json({ '@odata.count': count, value: [{ id: 'any' }] });

/** Browsers that know of no network trouble. */
const ONLINE: Connection = { isOnline: () => true, whenOnline: () => Promise.resolve(true) };

interface SourceSetup {
  readonly tracking?: Response;
  readonly count?: Response;
  /** The organization's own fields that config.json names; none without it. */
  readonly extraFields?: readonly ExtraFieldProperty[];
}

/** Answers the two requests that start a full read by their addresses, and every other request with the next of `responses`. */
function sourceWith(responses: Response[], { tracking = trackingStarted(), count = counted(2), extraFields = [] }: SourceSetup = {}) {
  const fetchFn = vi.fn<Fetch>((url) => {
    if (url.includes('$deltatoken=latest')) return Promise.resolve(tracking);
    if (url.includes('$count=true')) return Promise.resolve(count);
    return Promise.resolve(responses.shift() ?? json({}, 500));
  });
  const delay = vi.fn(() => Promise.resolve());
  const client = new GraphClient(() => Promise.resolve('token'), () => false, fetchFn, delay, ONLINE);
  /** The requests for pages of users, in order. */
  const pageRequests = () => fetchFn.mock.calls.map(([url]) => url).filter((url) => url.includes('/users?') && !url.includes('$count'));
  return { source: new GraphEmployeeSource(client, extraFields), fetchFn, delay, pageRequests };
}

/** A cost centre and an employee type, as config.json can name them, and an extension attribute that holds a badge number. */
const FIELDS: readonly ExtraFieldProperty[] = [
  'employeeOrgData.costCenter',
  'employeeType',
  'onPremisesExtensionAttributes.extensionAttribute3',
];

describe('GraphEmployeeSource', () => {
  it('starts tracking changes and counts the users, then follows nextLink across pages, reports progress and maps users', async () => {
    const { source, fetchFn, pageRequests } = sourceWith([
      json({
        value: [user('a', { businessPhones: ['+47 1'], jobTitle: ' CEO ', manager: null })],
        '@odata.nextLink': `${PAGE}x`,
      }),
      json({ value: [user('b', { mobilePhone: '+47 2', userType: 'Guest', assignedLicenses: [], manager: { id: 'a' } })] }),
    ]);
    const progress = vi.fn();

    const { employees, changesLink } = await source.loadAll(progress);

    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(fetchFn.mock.calls[0]?.[0]).toMatch(/\/users\/delta\?\$select=.*,manager&\$deltatoken=latest$/);
    expect(fetchFn.mock.calls.find(([url]) => url.includes('$count'))).toEqual([
      'https://graph.microsoft.com/v1.0/users?$select=id&$count=true&$top=1',
      { headers: { ConsistencyLevel: 'eventual', Authorization: 'Bearer token' } },
    ]);
    expect(pageRequests()).toEqual([expect.stringContaining('$expand=manager($select=id)'), `${PAGE}x`]);
    expect(fetchFn.mock.calls.find(([url]) => url.includes('$expand'))?.[1].headers).toEqual({ Authorization: 'Bearer token' });
    expect(changesLink).toBe(`${DELTA}start`);
    expect(progress.mock.calls).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
    expect(employees).toEqual([
      expect.objectContaining({
        id: 'a',
        businessPhone: '+47 1',
        mobilePhone: null,
        jobTitle: 'CEO',
        department: null,
        managerId: null,
        isGuest: false,
        isLicensed: true,
      }),
      expect.objectContaining({ id: 'b', businessPhone: null, mobilePhone: '+47 2', managerId: 'a', isGuest: true, isLicensed: false }),
    ]);
  });

  it('reads the organization\'s own fields that config.json names, selecting a complex property once and whole, and leaves out empty ones', async () => {
    const { source, fetchFn, pageRequests } = sourceWith(
      [
        json({
          value: [
            user('a', {
              employeeType: ' Contractor ',
              employeeOrgData: { division: 'Retail', costCenter: '4170' },
              onPremisesExtensionAttributes: { extensionAttribute1: 'Oslo', extensionAttribute3: ' ' },
            }),
            user('b', { employeeType: null, employeeOrgData: null }),
          ],
        }),
      ],
      { extraFields: [...FIELDS, 'employeeOrgData.division'] },
    );

    const { employees } = await source.loadAll();

    expect(fetchFn.mock.calls.find(([url]) => url.includes('$deltatoken=latest'))?.[0]).toMatch(
      /,assignedLicenses,showInAddressList,employeeOrgData,employeeType,onPremisesExtensionAttributes,manager&\$deltatoken=latest$/,
    );
    expect(pageRequests()).toEqual([
      expect.stringContaining(',assignedLicenses,showInAddressList,employeeOrgData,employeeType,onPremisesExtensionAttributes&$expand=manager($select=id)'),
    ]);
    expect(employees.map(({ id, extra }) => [id, extra])).toEqual([
      ['a', { 'employeeOrgData.costCenter': '4170', employeeType: 'Contractor', 'employeeOrgData.division': 'Retail' }],
      ['b', {}],
    ]);
  });

  it('reads whom the address list hides, which only a value of false says, as nobody set it otherwise', async () => {
    const { source, pageRequests } = sourceWith([
      json({
        value: [user('a', { showInAddressList: false }), user('b', { showInAddressList: null }), user('c', { showInAddressList: true }), user('d')],
      }),
    ]);

    const { employees } = await source.loadAll();

    expect(pageRequests()[0]).toContain(',showInAddressList');
    expect(employees.map(({ id, hiddenFromAddressList }) => [id, hiddenFromAddressList])).toEqual([
      ['a', true],
      ['b', false],
      ['c', false],
      ['d', false],
    ]);
  });

  it('waits as told by Retry-After when throttled', async () => {
    const { source, delay } = sourceWith([json({}, 429, { 'Retry-After': '7' }), json({ value: [user('a')] })]);

    expect((await source.loadAll()).employees).toHaveLength(1);
    expect(delay).toHaveBeenCalledWith(7000);
  });

  it('still reads everyone when neither change tracking nor the count can start, only without a total', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { source } = sourceWith([json({ value: [user('a')] })], {
      tracking: json({ error: { code: 'BadRequest' } }, 400),
      count: json({ error: { code: 'Request_UnsupportedQuery' } }, 400),
    });
    const progress = vi.fn();

    await expect(source.loadAll(progress)).resolves.toMatchObject({ employees: [{ id: 'a' }], changesLink: null });
    expect(progress.mock.calls).toEqual([
      [0, null],
      [1, null],
    ]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('turns 401 into SignInRequiredError', async () => {
    const { source } = sourceWith([], { tracking: json({}, 401) });

    await expect(source.loadAll()).rejects.toBeInstanceOf(SignInRequiredError);
  });

  it('explains a 403 as missing admin consent', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const denied = () => json({ error: { code: 'Authorization_RequestDenied' } }, 403);
    const { source } = sourceWith([denied()], { tracking: denied(), count: denied() });

    await expect(source.loadAll()).rejects.toThrow('grant consent for the User.Read.All permission');
  });

  it('starts no read without a network, rather than reading on without change tracking', async () => {
    const fetchFn = vi.fn<Fetch>(() => Promise.reject(new TypeError('Failed to fetch')));
    const offline: Connection = { isOnline: () => false, whenOnline: () => Promise.resolve(false) };
    const source = new GraphEmployeeSource(new GraphClient(() => Promise.resolve('token'), () => false, fetchFn, vi.fn(), offline));

    await expect(source.loadAll()).rejects.toMatchObject({ failure: 'offline' });
    // The tracking and the count, each tried once before the browser stayed offline, and no page.
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  describe('a read cut short', () => {
    const firstPage = () => json({ value: [user('a'), user('b')], '@odata.nextLink': `${PAGE}2` });
    const dropped = () => json({ error: { message: 'The service is unavailable.' } }, 500);

    it('leaves the people read so far and the page to go on from, with what the read started with', async () => {
      const { source } = sourceWith([firstPage(), dropped()], { count: counted(5) });
      const checkpoint: ReadCheckpoint = { position: null };

      await expect(source.loadAll(undefined, checkpoint)).rejects.toMatchObject({ failure: 'other' });

      expect(checkpoint.position).toEqual({
        employees: [expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'b' })],
        nextLink: `${PAGE}2`,
        changesLink: `${DELTA}start`,
        total: 5,
      });
    });

    it('leaves nowhere to go on from when even the first page failed', async () => {
      const { source } = sourceWith([dropped()]);
      const checkpoint: ReadCheckpoint = { position: null };

      await expect(source.loadAll(undefined, checkpoint)).rejects.toBeInstanceOf(Error);

      expect(checkpoint.position).toBeNull();
    });

    it('goes on from the page it stopped at, counting the people read before, without starting tracking or the count again', async () => {
      const first = sourceWith([firstPage(), dropped()], { count: counted(5) });
      const checkpoint: ReadCheckpoint = { position: null };
      await first.source.loadAll(undefined, checkpoint).catch(() => undefined);
      const { source, fetchFn } = sourceWith([json({ value: [user('c')] })], { tracking: json({}, 500), count: json({}, 500) });
      const progress = vi.fn();

      const { employees, changesLink } = await source.loadAll(progress, checkpoint);

      expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([`${PAGE}2`]);
      expect(employees.map((employee) => employee.id)).toEqual(['a', 'b', 'c']);
      expect(changesLink).toBe(`${DELTA}start`);
      expect(progress.mock.calls).toEqual([
        [2, 5],
        [3, 5],
      ]);
    });

    it('starts afresh where the page link it would go on from has expired', async () => {
      const position = { employees: [makeEmployee('old')], nextLink: `${PAGE}stale`, changesLink: `${DELTA}old`, total: 9 };
      const checkpoint: ReadCheckpoint = { position };
      const expired = json({ error: { code: 'Directory_ExpiredPageToken' } }, 400);
      const { source, pageRequests } = sourceWith([expired, json({ value: [user('a')] })], { tracking: trackingStarted('new') });
      const progress = vi.fn();

      const { employees, changesLink } = await source.loadAll(progress, checkpoint);

      expect(pageRequests()).toEqual([`${PAGE}stale`, expect.stringContaining('$expand=manager($select=id)')]);
      expect(employees.map((employee) => employee.id)).toEqual(['a']);
      expect(changesLink).toBe(`${DELTA}new`);
      expect(progress.mock.calls.at(-1)).toEqual([1, 2]);
    });

    it('reads the organization\'s own fields on every page, those of the people it read before it stopped included', async () => {
      const contractor = (id: string) => user(id, { employeeType: 'Contractor' });
      const first = sourceWith([json({ value: [contractor('a'), contractor('b')], '@odata.nextLink': `${PAGE}2` }), dropped()], {
        extraFields: ['employeeType'],
      });
      const checkpoint: ReadCheckpoint = { position: null };
      await first.source.loadAll(undefined, checkpoint).catch(() => undefined);
      const { source } = sourceWith([json({ value: [contractor('c')] })], { extraFields: ['employeeType'] });

      const { employees } = await source.loadAll(undefined, checkpoint);

      expect(employees.map(({ id, extra }) => [id, extra])).toEqual([
        ['a', { employeeType: 'Contractor' }],
        ['b', { employeeType: 'Contractor' }],
        ['c', { employeeType: 'Contractor' }],
      ]);
    });

    it('stops on another failure of the page it would go on from, keeping its place', async () => {
      const position = { employees: [makeEmployee('kept')], nextLink: `${PAGE}2`, changesLink: null, total: 4 };
      const checkpoint: ReadCheckpoint = { position };
      const { source, pageRequests } = sourceWith([json({}, 403)]);

      await expect(source.loadAll(undefined, checkpoint)).rejects.toMatchObject({ failure: 'accessDenied' });

      expect(pageRequests()).toEqual([`${PAGE}2`]);
      expect(checkpoint.position).toEqual(position);
    });
  });

  describe('changes', () => {
    const known = [
      makeEmployee('a', null, { mobilePhone: '+47 1' }),
      makeEmployee('b', 'a', { jobTitle: 'Developer', mobilePhone: '+47 2' }),
      makeEmployee('c', 'a'),
    ];

    it('applies additions, partial changes, manager moves and removals, in order, across pages', async () => {
      const { source, fetchFn } = sourceWith([
        json({
          value: [
            { id: 'b', jobTitle: 'Lead' },
            { id: 'c', '@removed': { reason: 'deleted' } },
          ],
          '@odata.nextLink': `${DELTA}start&$skiptoken=p2`,
        }),
        json({
          value: [
            { ...user('d'), 'manager@delta': [{ id: 'b' }] },
            { id: 'b', 'manager@delta': [{ id: 'a', '@removed': { reason: 'deleted' } }] },
            { id: 'a', mobilePhone: null },
          ],
          '@odata.deltaLink': `${DELTA}next`,
        }),
      ]);

      const changes = await source.loadChanges(known, `${DELTA}start`);

      expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([`${DELTA}start`, `${DELTA}start&$skiptoken=p2`]);
      expect(changes?.changesLink).toBe(`${DELTA}next`);
      const byId = new Map(changes?.employees.map((employee) => [employee.id, employee]));
      expect([...byId.keys()]).toEqual(['a', 'b', 'd']);
      expect(byId.get('a')).toMatchObject({ mobilePhone: null, managerId: null, jobTitle: 'Engineer' });
      expect(byId.get('b')).toMatchObject({ jobTitle: 'Lead', mobilePhone: '+47 2', managerId: null, isLicensed: true });
      expect(byId.get('d')).toMatchObject({ displayName: 'User d', managerId: 'b', isLicensed: true });
    });

    it('keeps every other field of a person whose change carries only what changed', async () => {
      const lead = makeEmployee('b', 'a', {
        displayName: 'Åse Vik',
        businessPhone: '+47 21 00 00 00',
        mobilePhone: '+47 900 00 000',
        jobTitle: 'Team Lead',
        companyName: 'Contoso',
        employeeId: 'E1056',
        officeLocation: 'Oslo HQ, floor 3',
        city: 'Oslo',
        country: 'Norway',
        isGuest: false,
        isLicensed: true,
        hiddenFromAddressList: true,
      });
      const { source, fetchFn } = sourceWith([
        json({ value: [{ id: 'b', department: 'Retail Logistics', officeLocation: null }], '@odata.deltaLink': `${DELTA}next` }),
      ]);

      const changes = await source.loadChanges([makeEmployee('a'), lead], `${DELTA}start`);

      expect(fetchFn.mock.calls[0]?.[1].headers).toMatchObject({ Prefer: 'return=minimal' });
      expect(changes?.employees.find((employee) => employee.id === 'b')).toEqual({
        ...lead,
        department: 'Retail Logistics',
        officeLocation: null,
      });
    });

    it('hides a person from the address list, and shows them again, as a change says', async () => {
      const { source } = sourceWith([
        json({
          value: [
            { id: 'a', showInAddressList: false },
            { id: 'b', showInAddressList: null },
          ],
          '@odata.deltaLink': `${DELTA}next`,
        }),
      ]);

      const changes = await source.loadChanges([makeEmployee('a'), makeEmployee('b', 'a', { hiddenFromAddressList: true })], `${DELTA}start`);

      expect(changes?.employees.map(({ id, hiddenFromAddressList }) => [id, hiddenFromAddressList])).toEqual([
        ['a', true],
        ['b', false],
      ]);
    });

    it('keeps a person\'s own fields where a change carries only other properties', async () => {
      const lead = makeEmployee('b', 'a', {
        extra: { 'employeeOrgData.costCenter': '4170', employeeType: 'Employee', 'onPremisesExtensionAttributes.extensionAttribute3': 'B-1056' },
      });
      const { source } = sourceWith([json({ value: [{ id: 'b', jobTitle: 'Lead' }], '@odata.deltaLink': `${DELTA}next` })], {
        extraFields: FIELDS,
      });

      const changes = await source.loadChanges([makeEmployee('a'), lead], `${DELTA}start`);

      expect(changes?.employees.find((employee) => employee.id === 'b')).toEqual({ ...lead, jobTitle: 'Lead' });
    });

    it('lays a changed complex property over the members it knows, drops what a change clears and reads a new person\'s', async () => {
      const extra = { 'employeeOrgData.costCenter': '4100', 'employeeOrgData.division': 'Retail', employeeType: 'Employee' };
      const { source } = sourceWith(
        [
          json({
            value: [
              { id: 'a', employeeOrgData: { costCenter: '4170' } },
              { id: 'b', employeeOrgData: { division: 'Energy', costCenter: null }, employeeType: null },
              { ...user('c', { employeeOrgData: { division: null, costCenter: '4300' } }), 'manager@delta': [{ id: 'a' }] },
            ],
            '@odata.deltaLink': `${DELTA}next`,
          }),
        ],
        { extraFields: ['employeeOrgData.costCenter', 'employeeOrgData.division', 'employeeType'] },
      );

      const changes = await source.loadChanges([makeEmployee('a', null, { extra }), makeEmployee('b', 'a', { extra })], `${DELTA}start`);

      const extraOf = (id: string) => changes?.employees.find((employee) => employee.id === id)?.extra;
      // A change that names one member of a complex property keeps the others, whether or not Graph sends the rest.
      expect(extraOf('a')).toEqual({ ...extra, 'employeeOrgData.costCenter': '4170' });
      expect(extraOf('b')).toEqual({ 'employeeOrgData.division': 'Energy' });
      expect(extraOf('c')).toEqual({ 'employeeOrgData.costCenter': '4300' });
    });

    it.each([
      ['a sync reset', 410, 'resyncRequired'],
      ['an expired link', 400, 'syncStateNotFound'],
    ])('asks for a full load after %s', async (_case, status, code) => {
      const { source } = sourceWith([json({ error: { code } }, status)]);

      await expect(source.loadChanges(known, `${DELTA}old`)).resolves.toBeNull();
    });

    it('fails on a permission error instead of reading everything', async () => {
      const { source } = sourceWith([json({ error: { code: 'Authorization_RequestDenied' } }, 403)]);

      await expect(source.loadChanges(known, `${DELTA}old`)).rejects.toThrow('grant consent');
    });

    it('never sends the token to a stored link that is not a Graph delta link', async () => {
      const { source, fetchFn } = sourceWith([]);

      await expect(source.loadChanges(known, 'https://attacker.example/users/delta?x')).resolves.toBeNull();
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });
});
