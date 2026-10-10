import { describe, expect, it, vi } from 'vitest';
import { SignInRequiredError } from '@/application/abstractions/authenticator';
import { ServiceError } from '@/application/abstractions/serviceError';
import { makeEmployee } from '@/testing/makeEmployee';
import { CachedEmployeeDirectory } from './cachedEmployeeDirectory';
import type { EmployeeSource, ReadCheckpoint, ReadPosition } from './employeeSource';
import type { SnapshotStore, StoredDirectory } from './snapshotStore';

const stored: StoredDirectory = {
  employees: [makeEmployee('stored')],
  loadedAt: new Date('2026-01-01'),
  changesLink: null,
  fullReadAt: new Date('2025-12-30'),
};

function setup(store: Partial<SnapshotStore> | null, ensureSignedIn?: () => Promise<unknown>) {
  const loadAll = vi.fn<EmployeeSource['loadAll']>(() =>
    Promise.resolve({ employees: [makeEmployee('fresh')], changesLink: null }),
  );
  const fullStore: SnapshotStore | null = store && {
    read: () => Promise.resolve(null),
    write: () => Promise.resolve(),
    clear: () => Promise.resolve(),
    ...store,
  };
  return { directory: new CachedEmployeeDirectory({ loadAll }, fullStore, ensureSignedIn), loadAll };
}

describe('CachedEmployeeDirectory', () => {
  it('serves the stored snapshot without loading from the source', async () => {
    const { directory, loadAll } = setup({ read: () => Promise.resolve(stored) });

    await expect(directory.getSnapshot()).resolves.toEqual({ employees: stored.employees, loadedAt: stored.loadedAt });
    expect(loadAll).not.toHaveBeenCalled();
  });

  it('loads once, keeps the result in memory and persists it', async () => {
    const write = vi.fn(() => Promise.resolve());
    const { directory, loadAll } = setup({ write });

    const first = await directory.getSnapshot();
    const second = await directory.getSnapshot();

    expect(second).toBe(first);
    expect(loadAll).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({ ...first, changesLink: null, fullReadAt: first.loadedAt });
  });

  it('shares one load between concurrent refreshes', async () => {
    const { directory, loadAll } = setup(null);

    const [a, b] = await Promise.all([directory.refresh(), directory.refresh()]);

    expect(a).toBe(b);
    expect(loadAll).toHaveBeenCalledTimes(1);
  });

  it('keeps working when browser storage fails', async () => {
    const { directory } = setup({
      read: () => Promise.reject(new Error('blocked')),
      write: () => Promise.reject(new Error('quota')),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const snapshot = await directory.getSnapshot();

    expect(snapshot.employees.map((employee) => employee.id)).toEqual(['fresh']);
  });

  it('hands out the stored copy only to a signed-in user, and deletes it when sign-in is required', async () => {
    const clear = vi.fn(() => Promise.resolve());
    const { directory, loadAll } = setup(
      { read: () => Promise.resolve(stored), clear },
      () => Promise.reject(new SignInRequiredError()),
    );

    await expect(directory.getSnapshot()).rejects.toBeInstanceOf(SignInRequiredError);

    expect(clear).toHaveBeenCalledTimes(1);
    expect(loadAll).not.toHaveBeenCalled();
  });

  it('starts reading the stored copy while the sign-in check is still running', async () => {
    const read = vi.fn(() => Promise.resolve(stored));
    let signedIn = (): void => undefined;
    const { directory } = setup({ read }, () => new Promise<void>((resolve) => (signedIn = resolve)));

    const snapshot = directory.getSnapshot();
    await Promise.resolve();

    expect(read).toHaveBeenCalledTimes(1);
    signedIn();
    await expect(snapshot).resolves.toMatchObject({ employees: stored.employees });
  });

  it('forgets the snapshot in memory and in the browser, so the next request loads afresh', async () => {
    const clear = vi.fn(() => Promise.resolve());
    const { directory, loadAll } = setup({ clear });
    await directory.getSnapshot();

    await directory.forget();
    await directory.getSnapshot();

    expect(clear).toHaveBeenCalledTimes(1);
    expect(loadAll).toHaveBeenCalledTimes(2);
  });

  it('keeps the stored copy when the sign-in check fails for another reason, such as being offline', async () => {
    const clear = vi.fn(() => Promise.resolve());
    const { directory } = setup({ read: () => Promise.resolve(stored), clear }, () => Promise.reject(new Error('offline')));

    await expect(directory.getSnapshot()).rejects.toThrow('offline');
    expect(clear).not.toHaveBeenCalled();
  });

  it('does not keep a load that finishes after sign-out', async () => {
    const write = vi.fn(() => Promise.resolve());
    let finish = (): void => undefined;
    const { directory, loadAll } = setup({ write });
    loadAll.mockImplementationOnce(() => new Promise((resolve) => (finish = () => {
      resolve({ employees: [makeEmployee('previous user')], changesLink: null });
    })));

    const running = directory.refresh();
    await directory.forget();
    finish();

    await expect(running).rejects.toBeInstanceOf(SignInRequiredError);
    expect(write).not.toHaveBeenCalled();
    await expect(directory.getSnapshot()).resolves.toMatchObject({ employees: [{ id: 'fresh' }] });
  });

  describe('a full read cut short', () => {
    const OFFLINE = new ServiceError('offline', 'Microsoft Graph could not be reached.');
    const position: ReadPosition = {
      employees: [makeEmployee('read before')],
      nextLink: 'https://graph.microsoft.com/v1.0/users?$skiptoken=2',
      changesLink: 'link-1',
      total: 2,
    };

    /** Each attempt records the place it was given, and the first `failures` stop where `position` says, failing with `error`. */
    function setupCutShort(failures: number, error: Error = OFFLINE, store: Partial<SnapshotStore> | null = null) {
      const given: (ReadPosition | null)[] = [];
      const loadAll = vi.fn<EmployeeSource['loadAll']>((_onProgress, checkpoint?: ReadCheckpoint) => {
        given.push(checkpoint?.position ?? null);
        if (given.length > failures) return Promise.resolve({ employees: [makeEmployee('fresh')], changesLink: null });
        if (checkpoint) checkpoint.position = position;
        return Promise.reject(error);
      });
      const fullStore: SnapshotStore | null = store && {
        read: () => Promise.resolve(null),
        write: () => Promise.resolve(),
        clear: () => Promise.resolve(),
        ...store,
      };
      return { directory: new CachedEmployeeDirectory({ loadAll }, fullStore), given, loadAll };
    }

    it('shows nothing of the half-read directory, and goes on from where it stopped at the next attempt', async () => {
      const write = vi.fn(() => Promise.resolve());
      const { directory, given } = setupCutShort(1, OFFLINE, { write });

      await expect(directory.getSnapshot()).rejects.toBe(OFFLINE);
      expect(write).not.toHaveBeenCalled();
      const snapshot = await directory.getSnapshot();

      expect(given).toEqual([null, position]);
      expect(snapshot.employees.map((employee) => employee.id)).toEqual(['fresh']);
    });

    it('keeps the latest place through further failures, and none once a read completes', async () => {
      const { directory, given } = setupCutShort(2);

      await directory.refresh().catch(() => undefined);
      await directory.refresh().catch(() => undefined);
      await directory.refresh(undefined, true);
      await directory.refresh(undefined, true);

      expect(given).toEqual([null, position, position, null]);
    });

    it('forgets the place with the rest, so that a read after a sign-out starts afresh', async () => {
      const { directory, given } = setupCutShort(1);
      await directory.refresh().catch(() => undefined);

      await directory.forget();
      await directory.refresh();

      expect(given).toEqual([null, null]);
    });

    it('drops the place when a read finds that a sign-in is required, as the pages may not be the next user\'s', async () => {
      const { directory, given, loadAll } = setupCutShort(2);
      await directory.refresh().catch(() => undefined);
      loadAll.mockImplementationOnce((_onProgress, checkpoint) => {
        given.push(checkpoint?.position ?? null);
        return Promise.reject(new SignInRequiredError());
      });

      await expect(directory.refresh()).rejects.toBeInstanceOf(SignInRequiredError);
      await directory.refresh().catch(() => undefined);

      expect(given).toEqual([null, position, null]);
    });

    it('drops the place when the sign-in check before a stored copy finds that a sign-in is required', async () => {
      let signedIn = true;
      const given: (ReadPosition | null)[] = [];
      const loadAll = vi.fn<EmployeeSource['loadAll']>((_onProgress, checkpoint) => {
        given.push(checkpoint?.position ?? null);
        if (checkpoint) checkpoint.position = position;
        return Promise.reject(OFFLINE);
      });
      const store: SnapshotStore = { read: () => Promise.resolve(null), write: () => Promise.resolve(), clear: () => Promise.resolve() };
      const directory = new CachedEmployeeDirectory({ loadAll }, store, () =>
        signedIn ? Promise.resolve() : Promise.reject(new SignInRequiredError()),
      );
      await directory.getSnapshot().catch(() => undefined);

      signedIn = false;
      await expect(directory.getSnapshot()).rejects.toBeInstanceOf(SignInRequiredError);
      signedIn = true;
      await directory.getSnapshot().catch(() => undefined);

      expect(given).toEqual([null, null]);
    });

    it('keeps no place of a read that a sign-out overtook', async () => {
      let fail = (): void => undefined;
      const given: (ReadPosition | null)[] = [];
      const loadAll = vi.fn<EmployeeSource['loadAll']>((_onProgress, checkpoint) => {
        given.push(checkpoint?.position ?? null);
        if (given.length > 1) return Promise.resolve({ employees: [makeEmployee('fresh')], changesLink: null });
        return new Promise((_resolve, reject) => {
          fail = () => {
            if (checkpoint) checkpoint.position = position;
            reject(OFFLINE);
          };
        });
      });
      const directory = new CachedEmployeeDirectory({ loadAll }, null);

      const running = directory.refresh();
      await directory.forget();
      fail();
      await running.catch(() => undefined);
      await directory.refresh();

      expect(given).toEqual([null, null]);
    });
  });

  describe('changes', () => {
    function setupWithChanges(store: Partial<SnapshotStore> = {}) {
      const loadAll = vi.fn<EmployeeSource['loadAll']>(() =>
        Promise.resolve({ employees: [makeEmployee('fresh')], changesLink: 'link-1' }),
      );
      const loadChanges = vi.fn<NonNullable<EmployeeSource['loadChanges']>>(() =>
        Promise.resolve({ employees: [makeEmployee('changed')], changesLink: 'link-2' }),
      );
      const write = vi.fn(() => Promise.resolve());
      const fullStore: SnapshotStore = { read: () => Promise.resolve(null), write, clear: () => Promise.resolve(), ...store };
      return { directory: new CachedEmployeeDirectory({ loadAll, loadChanges }, fullStore), loadAll, loadChanges, write };
    }

    it('loads only what changed once it has a link, and keeps the new link for the next visit', async () => {
      const { directory, loadAll, loadChanges, write } = setupWithChanges();
      await directory.getSnapshot();

      const refreshed = await directory.refresh();

      expect(loadAll).toHaveBeenCalledTimes(1);
      expect(loadChanges).toHaveBeenCalledWith([expect.objectContaining({ id: 'fresh' })], 'link-1');
      expect(refreshed.employees.map((employee) => employee.id)).toEqual(['changed']);
      expect(write).toHaveBeenLastCalledWith(expect.objectContaining({ changesLink: 'link-2' }));
    });

    it('reads everything when asked to, or when the source wants a full load', async () => {
      const { directory, loadAll, loadChanges } = setupWithChanges();
      await directory.getSnapshot();

      await directory.refresh(undefined, true);
      loadChanges.mockResolvedValueOnce(null);
      await directory.refresh();

      expect(loadAll).toHaveBeenCalledTimes(3);
      expect(loadChanges).toHaveBeenCalledTimes(1);
    });

    it('continues from the link stored by an earlier visit', async () => {
      const { directory, loadChanges } = setupWithChanges({
        read: () => Promise.resolve({ ...stored, changesLink: 'stored-link' }),
      });
      await directory.getSnapshot();

      await directory.refresh();

      expect(loadChanges).toHaveBeenCalledWith(stored.employees, 'stored-link');
    });
  });

  describe('status', () => {
    /** A clock an hour on at every reading, so that each load has a time of its own. */
    function clock(): () => Date {
      let hour = 8;
      return () => new Date(2026, 9, 1, hour++);
    }

    function setupStatus(store: Partial<SnapshotStore> | null = {}) {
      const loadAll = vi.fn<EmployeeSource['loadAll']>(() =>
        Promise.resolve({ employees: [makeEmployee('fresh')], changesLink: 'link-1' }),
      );
      const loadChanges = vi.fn<NonNullable<EmployeeSource['loadChanges']>>(() =>
        Promise.resolve({ employees: [makeEmployee('changed')], changesLink: 'link-2' }),
      );
      const write = vi.fn<SnapshotStore['write']>(() => Promise.resolve());
      const fullStore: SnapshotStore | null = store && {
        read: () => Promise.resolve(null),
        write,
        clear: () => Promise.resolve(),
        ...store,
      };
      const directory = new CachedEmployeeDirectory({ loadAll, loadChanges }, fullStore, undefined, clock());
      return { directory, loadChanges, write };
    }

    it('says when everything was read, and that the next refresh can read only what changed', async () => {
      const { directory } = setupStatus();
      expect(directory.status()).toEqual({ fullReadAt: null, tracksChanges: false, browserCopy: 'kept' });

      const { loadedAt } = await directory.getSnapshot();

      expect(directory.status()).toEqual({ fullReadAt: loadedAt, tracksChanges: true, browserCopy: 'kept' });
    });

    it('keeps the time of the full read through a refresh that read only what changed, and stores it with the copy', async () => {
      const { directory, write } = setupStatus();
      const first = await directory.getSnapshot();

      const refreshed = await directory.refresh();

      expect(refreshed.loadedAt.getTime()).toBeGreaterThan(first.loadedAt.getTime());
      expect(directory.status().fullReadAt).toEqual(first.loadedAt);
      expect(write).toHaveBeenLastCalledWith(
        expect.objectContaining({ loadedAt: refreshed.loadedAt, changesLink: 'link-2', fullReadAt: first.loadedAt }),
      );

      const reread = await directory.refresh(undefined, true);
      expect(directory.status().fullReadAt).toEqual(reread.loadedAt);
    });

    it('takes the time of the full read from the copy an earlier visit stored, which an older copy has no record of', async () => {
      const visit = setupStatus({ read: () => Promise.resolve(stored) });
      await visit.directory.getSnapshot();
      expect(visit.directory.status()).toEqual({ fullReadAt: stored.fullReadAt, tracksChanges: false, browserCopy: 'kept' });

      const older = setupStatus({ read: () => Promise.resolve({ ...stored, fullReadAt: null }) });
      await older.directory.getSnapshot();
      expect(older.directory.status().fullReadAt).toBeNull();
    });

    it('says the browser refused the copy until a later one is written, and that none is kept without a store', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { directory, write } = setupStatus();
      write.mockRejectedValueOnce(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));

      await directory.getSnapshot();
      await vi.waitFor(() => {
        expect(directory.status().browserCopy).toBe('failed');
      });

      await directory.refresh();
      await vi.waitFor(() => {
        expect(directory.status().browserCopy).toBe('kept');
      });
      expect(setupStatus(null).directory.status().browserCopy).toBe('off');
    });

    it('forgets all of it with the snapshot, also a copy that the browser refuses after that', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      let refuse = (): void => undefined;
      const { directory, write } = setupStatus();
      write.mockImplementationOnce(() => new Promise((_resolve, reject) => (refuse = () => {
        reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
      })));
      await directory.getSnapshot();

      await directory.forget();
      refuse();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(directory.status()).toEqual({ fullReadAt: null, tracksChanges: false, browserCopy: 'kept' });
    });
  });
});
