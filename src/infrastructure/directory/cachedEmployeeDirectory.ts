import { SignInRequiredError } from '@/application/abstractions/authenticator';
import type {
  DirectorySnapshot,
  DirectoryStatus,
  EmployeeDirectory,
  ProgressListener,
} from '@/application/abstractions/employeeDirectory';
import type { SignedInUserSource } from '@/application/abstractions/signedInUser';
import type { EmployeeSource, LoadedEmployees, ReadPosition } from './employeeSource';
import type { SnapshotStore, StoredDirectory } from './snapshotStore';

/** Without a source of the signed-in user, no stored copy can be told whose it is, so none is handed out. */
const NOBODY: SignedInUserSource = { getSignedInUser: () => null };

/** The stored copy is only handed out after `ensureSignedIn` succeeds, and only to the account that loaded it; it is deleted when a sign-in is required. */
export class CachedEmployeeDirectory implements EmployeeDirectory {
  private snapshot: DirectorySnapshot | null = null;
  private changesLink: string | null = null;
  private fullReadAt: Date | null = null;
  /** Whether the browser refused the latest copy, until one is written again. */
  private writeFailed = false;
  private pendingLoad: Promise<DirectorySnapshot> | null = null;
  /** Grows with every sign-out, so a load that was running then doesn't keep the previous user's directory. */
  private generation = 0;
  /** Where a full read that failed stopped, for the next attempt; in memory only, and never shown. */
  private partialRead: ReadPosition | null = null;

  constructor(
    private readonly source: EmployeeSource,
    private readonly store: SnapshotStore | null,
    private readonly ensureSignedIn: () => Promise<unknown> = () => Promise.resolve(),
    private readonly signedInUser: SignedInUserSource = NOBODY,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getSnapshot(onProgress?: ProgressListener): Promise<DirectorySnapshot> {
    if (!this.snapshot && this.store) {
      const generation = this.generation;
      // Read alongside the sign-in check; the result is only used once the check passes.
      const reading = this.readStore();
      try {
        await this.ensureSignedIn();
      } catch (error) {
        if (error instanceof SignInRequiredError) {
          this.partialRead = null;
          await this.store.clear().catch(() => undefined);
        }
        throw error;
      }
      const stored = await reading;
      if (stored && generation === this.generation && this.isOwn(stored)) this.adopt(stored);
    }
    return this.snapshot ?? this.refresh(onProgress);
  }

  /** A copy that another account loaded on this browser profile stays unseen; the load that follows writes this account's over it. */
  private isOwn(stored: StoredDirectory): boolean {
    const id = this.signedInUser.getSignedInUser()?.id;
    return id !== undefined && stored.loadedBy === id;
  }

  async forget(): Promise<void> {
    this.generation++;
    this.snapshot = null;
    this.changesLink = null;
    this.fullReadAt = null;
    this.writeFailed = false;
    this.pendingLoad = null;
    this.partialRead = null;
    await this.store?.clear().catch((error: unknown) => {
      console.warn('Could not delete the cached directory.', error);
    });
  }

  refresh(onProgress?: ProgressListener, full = false): Promise<DirectorySnapshot> {
    if (!this.pendingLoad) {
      const load: Promise<DirectorySnapshot> = this.load(onProgress, full).finally(() => {
        // A sign-out in the meantime may have let another load start; that one stays shared.
        if (this.pendingLoad === load) this.pendingLoad = null;
      });
      this.pendingLoad = load;
    }
    return this.pendingLoad;
  }

  status(): DirectoryStatus {
    return {
      fullReadAt: this.fullReadAt,
      tracksChanges: this.changesLink !== null,
      browserCopy: !this.store ? 'off' : this.writeFailed ? 'failed' : 'kept',
    };
  }

  private async load(onProgress: ProgressListener | undefined, full: boolean): Promise<DirectorySnapshot> {
    const generation = this.generation;
    const changes = full ? null : await this.loadChanges();
    const loaded = changes ?? (await this.loadAll(onProgress, generation));
    const snapshot = { employees: loaded.employees, loadedAt: this.now() };
    // Signed out meanwhile: the result belongs to the previous user and goes nowhere.
    if (generation !== this.generation) throw new SignInRequiredError();
    this.snapshot = snapshot;
    this.changesLink = loaded.changesLink;
    if (!changes) this.fullReadAt = snapshot.loadedAt;
    const stored: StoredDirectory = {
      ...snapshot,
      changesLink: loaded.changesLink,
      fullReadAt: this.fullReadAt,
      loadedBy: this.signedInUser.getSignedInUser()?.id ?? null,
    };
    // Not awaited: the chart can show while the browser writes the copy for the next visit.
    this.store?.write(stored).then(
      () => {
        if (generation === this.generation) this.writeFailed = false;
      },
      (error: unknown) => {
        if (generation === this.generation) this.writeFailed = true;
        console.warn('Could not cache the directory in the browser.', error);
      },
    );
    return snapshot;
  }

  /** A refresh may have completed while the store was being read; its result is newer and stays. */
  private adopt(stored: StoredDirectory): void {
    if (this.snapshot) return;
    this.snapshot = { employees: stored.employees, loadedAt: stored.loadedAt };
    this.changesLink = stored.changesLink;
    this.fullReadAt = stored.fullReadAt;
  }

  /** Goes on where a failed attempt stopped. A sign-in that is required drops the pages, which the next user mustn't get, and an attempt that a sign-out overtook keeps nothing. */
  private async loadAll(onProgress: ProgressListener | undefined, generation: number): Promise<LoadedEmployees> {
    const checkpoint = { position: this.partialRead };
    try {
      const loaded = await this.source.loadAll(onProgress, checkpoint);
      if (generation === this.generation) this.partialRead = null;
      return loaded;
    } catch (error) {
      if (error instanceof SignInRequiredError) this.partialRead = null;
      else if (generation === this.generation) this.partialRead = checkpoint.position;
      throw error;
    }
  }

  /** Null when everything has to be read: nothing known yet, no link, or the source asks for a full load. */
  private async loadChanges(): Promise<LoadedEmployees | null> {
    const { snapshot, changesLink, source } = this;
    if (!snapshot || !changesLink || !source.loadChanges) return null;
    return source.loadChanges(snapshot.employees, changesLink);
  }

  /** A broken or blocked browser store must not stop the chart from loading. */
  private async readStore(): Promise<StoredDirectory | null> {
    try {
      return (await this.store?.read()) ?? null;
    } catch (error) {
      console.warn('Could not read the cached directory.', error);
      return null;
    }
  }
}
