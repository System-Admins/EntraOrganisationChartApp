import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignInRequiredError } from '@/application/abstractions/authenticator';
import { ServiceError } from '@/application/abstractions/serviceError';
import {
  BROWSER_CONNECTION,
  GraphClient,
  GraphRequestError,
  ONLINE_WAIT_MS,
  type Connection,
  type Delay,
  type Fetch,
} from './graphClient';

const answer = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function clientWith(fetchFn: Fetch, getAccessToken = () => Promise.resolve('token'), isGuest = () => false) {
  return new GraphClient(getAccessToken, isGuest, fetchFn, () => Promise.resolve());
}

describe('GraphClient failures', () => {
  it.each([
    [403, 'accessDenied'],
    [404, 'notFound'],
    [429, 'busy'],
    [503, 'busy'],
    [504, 'busy'],
    [400, 'other'],
    [500, 'other'],
  ])('reports %i as a failure the UI can explain (%s)', async (status, failure) => {
    const client = clientWith(() => Promise.resolve(answer(status, { error: { code: 'Code', message: 'Graph says no' } })));

    const error: unknown = await client.postJson('/x', {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GraphRequestError);
    expect(error).toMatchObject({ failure, status, code: 'Code' });
  });

  it('blames the missing consent for a refusal, which an administrator can grant', async () => {
    const client = clientWith(() => Promise.resolve(answer(403, { error: { code: 'Authorization_RequestDenied' } })));

    const refused: unknown = await client.postJson('/x', {}).catch((caught: unknown) => caught);

    expect(refused).toMatchObject({ failure: 'accessDenied' });
    expect((refused as Error).message).toContain('An administrator must grant consent for the User.Read.All permission');
  });

  it('tells a guest\'s refusal apart, which no consent changes, and only a refusal', async () => {
    let guest = true;
    let status = 403;
    const client = clientWith(
      () => Promise.resolve(answer(status, { error: { code: 'Authorization_RequestDenied', message: 'Graph says no' } })),
      () => Promise.resolve('token'),
      () => guest,
    );
    const failure = () => client.postJson('/x', {}).catch((caught: unknown) => caught);

    const refused = await failure();
    expect(refused).toBeInstanceOf(GraphRequestError);
    expect(refused).toMatchObject({ failure: 'guestDenied', status: 403, code: 'Authorization_RequestDenied' });
    expect((refused as Error).message).toContain('denied a guest account access to the user directory');
    expect((refused as Error).message).not.toContain('consent');

    status = 500;
    expect(await failure()).toMatchObject({ failure: 'other', message: 'Microsoft Graph request failed (500): Graph says no' });

    status = 403;
    guest = false;
    expect(await failure()).toMatchObject({ failure: 'accessDenied' });
  });

  it('keeps what Graph said as the technical detail', async () => {
    const client = clientWith(() => Promise.resolve(answer(500, { error: { message: 'Graph says no' } })));

    await expect(client.postJson('/x', {})).rejects.toThrow('Microsoft Graph request failed (500): Graph says no');
  });

  it('leaves a failing token request as it is, without calling Graph', async () => {
    const fetchFn = vi.fn<Fetch>();
    const client = clientWith(fetchFn, () => Promise.reject(new SignInRequiredError()));

    await expect(client.postJson('/x', {})).rejects.toBeInstanceOf(SignInRequiredError);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('GraphClient delta rounds', () => {
  const DELTA = 'https://graph.microsoft.com/v1.0/users/delta?';

  it('asks every page of a round for only the properties that changed', async () => {
    const fetchFn = vi
      .fn<Fetch>()
      .mockResolvedValueOnce(answer(200, { value: [{ id: 'a' }], '@odata.nextLink': `${DELTA}$skiptoken=2` }))
      .mockResolvedValueOnce(answer(200, { value: [{ id: 'b', jobTitle: null }], '@odata.deltaLink': `${DELTA}$deltatoken=3` }));
    const client = clientWith(fetchFn);

    const round = await client.readDelta<{ id: string }>(`${DELTA}$deltatoken=1`);

    expect(round).toEqual({ items: [{ id: 'a' }, { id: 'b', jobTitle: null }], deltaLink: `${DELTA}$deltatoken=3` });
    expect(fetchFn.mock.calls.map(([url, init]) => [url, init.headers])).toEqual([
      [`${DELTA}$deltatoken=1`, { Prefer: 'return=minimal', Authorization: 'Bearer token' }],
      [`${DELTA}$skiptoken=2`, { Prefer: 'return=minimal', Authorization: 'Bearer token' }],
    ]);
  });

  it('asks nothing of the kind of the other requests', async () => {
    const fetchFn = vi.fn<Fetch>(() => Promise.resolve(answer(200, { value: [] })));
    const client = clientWith(fetchFn);

    await client.postJson('/x', {});
    for await (const page of client.pages('/users')) expect(page).toEqual({ items: [], nextLink: null });

    expect(fetchFn.mock.calls.map(([, init]) => init.headers)).toEqual([
      { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      { Authorization: 'Bearer token' },
    ]);
  });
});

describe('GraphClient pages and counts', () => {
  const USERS = 'https://graph.microsoft.com/v1.0/users?';

  it('goes through the pages from a link it is given, saying where each page leads', async () => {
    const fetchFn = vi
      .fn<Fetch>()
      .mockResolvedValueOnce(answer(200, { value: [{ id: 'b' }], '@odata.nextLink': `${USERS}$skiptoken=3` }))
      .mockResolvedValueOnce(answer(200, { value: [{ id: 'c' }] }));
    const client = clientWith(fetchFn);

    const pages = [];
    for await (const page of client.pages('/users?$top=999', `${USERS}$skiptoken=2`)) pages.push(page);

    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([`${USERS}$skiptoken=2`, `${USERS}$skiptoken=3`]);
    expect(pages).toEqual([
      { items: [{ id: 'b' }], nextLink: `${USERS}$skiptoken=3` },
      { items: [{ id: 'c' }], nextLink: null },
    ]);
  });

  it('sends the headers a request asks for, such as the eventual consistency that a count needs', async () => {
    const fetchFn = vi.fn<Fetch>(() => Promise.resolve(answer(200, { '@odata.count': 5123, value: [] })));
    const client = clientWith(fetchFn);

    await expect(client.getJson('/users?$count=true', { ConsistencyLevel: 'eventual' })).resolves.toMatchObject({
      '@odata.count': 5123,
    });
    expect(fetchFn.mock.calls).toEqual([
      [`${USERS}$count=true`, { headers: { ConsistencyLevel: 'eventual', Authorization: 'Bearer token' } }],
    ]);
  });
});

describe('GraphClient without an answer', () => {
  const dropped = new TypeError('NetworkError when attempting to fetch resource.');

  /** `online` is what the browser knows; comeBack and stayAway end a wait for it to come online. */
  function setup(fetchFn: Fetch, online = true) {
    const delay = vi.fn<Delay>(() => Promise.resolve());
    let endWait: (back: boolean) => void = () => undefined;
    const whenOnline = vi.fn<Connection['whenOnline']>(
      () =>
        new Promise<boolean>((resolve) => {
          endWait = resolve;
        }),
    );
    const client = new GraphClient(() => Promise.resolve('token'), () => false, fetchFn, delay, {
      isOnline: () => online,
      whenOnline,
    });
    return {
      client,
      delay,
      whenOnline,
      comeBack: () => {
        endWait(true);
      },
      stayAway: () => {
        endWait(false);
      },
    };
  }

  it('tries a request that got no answer four times more, 1, 2, 4 and 8 seconds apart, then says it is offline', async () => {
    const fetchFn = vi.fn<Fetch>(() => Promise.reject(dropped));
    const { client, delay } = setup(fetchFn);

    const error: unknown = await client.postJson('/x', {}).catch((caught: unknown) => caught);

    expect(fetchFn).toHaveBeenCalledTimes(5);
    expect(delay.mock.calls).toEqual([[1000], [2000], [4000], [8000]]);
    expect(error).toBeInstanceOf(ServiceError);
    expect(error).toMatchObject({
      failure: 'offline',
      message: 'Microsoft Graph could not be reached: TypeError: NetworkError when attempting to fetch resource.',
      cause: dropped,
    });
  });

  it('goes on once a dropped connection answers again, also one that dropped while the answer arrived', async () => {
    const cutOff = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new TypeError('The connection was reset.'));
        },
      }),
    );
    const fetchFn = vi
      .fn<Fetch>()
      .mockRejectedValueOnce(dropped)
      .mockResolvedValueOnce(cutOff)
      .mockResolvedValue(answer(200, { value: 'ok' }));
    const { client, delay } = setup(fetchFn);

    await expect(client.postJson('/x', {})).resolves.toEqual({ value: 'ok' });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(delay.mock.calls).toEqual([[1000], [2000]]);
  });

  it('waits for a browser that knows it is offline to come back, then tries again at once', async () => {
    const fetchFn = vi.fn<Fetch>().mockRejectedValueOnce(dropped).mockResolvedValue(answer(200, { value: 'ok' }));
    const { client, delay, whenOnline, comeBack } = setup(fetchFn, false);

    const request = client.postJson('/x', {});
    await vi.waitFor(() => {
      expect(whenOnline).toHaveBeenCalledExactlyOnceWith(ONLINE_WAIT_MS);
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    comeBack();

    await expect(request).resolves.toEqual({ value: 'ok' });
    expect(delay).not.toHaveBeenCalled();
  });

  it('says it is offline once the browser stays offline for as long as a request waits', async () => {
    const fetchFn = vi.fn<Fetch>(() => Promise.reject(dropped));
    const { client, whenOnline, stayAway } = setup(fetchFn, false);

    const request = client.postJson('/x', {}).catch((caught: unknown) => caught);
    await vi.waitFor(() => {
      expect(whenOnline).toHaveBeenCalledOnce();
    });
    stayAway();

    expect(await request).toMatchObject({ failure: 'offline', cause: dropped });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('leaves an answer that is no JSON as it came, as another try would only fetch it again', async () => {
    const fetchFn = vi.fn<Fetch>(() => Promise.resolve(new Response('<html>', { status: 200 })));
    const { client, delay } = setup(fetchFn);

    await expect(client.postJson('/x', {})).rejects.toBeInstanceOf(SyntaxError);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(delay).not.toHaveBeenCalled();
  });
});

describe('the browser connection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('is offline only where the browser knows it is', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(BROWSER_CONNECTION.isOnline()).toBe(false);

    vi.stubGlobal('navigator', { onLine: true });
    expect(BROWSER_CONNECTION.isOnline()).toBe(true);

    vi.stubGlobal('navigator', {});
    expect(BROWSER_CONNECTION.isOnline()).toBe(true);
  });

  it('waits for the browser to go online, or until the time is up, and stops listening either way', async () => {
    vi.useFakeTimers();
    const page = new EventTarget();
    vi.stubGlobal('window', page);
    const stopped = vi.spyOn(page, 'removeEventListener');

    const back = BROWSER_CONNECTION.whenOnline(ONLINE_WAIT_MS);
    page.dispatchEvent(new Event('online'));
    await expect(back).resolves.toBe(true);

    const away = BROWSER_CONNECTION.whenOnline(ONLINE_WAIT_MS);
    await vi.advanceTimersByTimeAsync(ONLINE_WAIT_MS);
    await expect(away).resolves.toBe(false);
    expect(stopped.mock.calls.map(([type]) => type)).toEqual(['online', 'online']);
  });
});
