import { INITIAL_UPDATER_STATUS, isUpdaterVersion, type UpdaterStatus } from '../shared/updaterStatus';
import type { AutoUpdatePolicy } from '../shared/updatePolicy';

interface UpdateResult {
  updateInfo: { version: string };
  downloadPromise?: Promise<unknown> | null;
}
export interface UpdaterDriver {
  allowPrerelease: boolean;
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates: () => Promise<UpdateResult | null>;
  on: (event: 'error', listener: (error: Error) => void) => unknown;
  removeListener: (event: 'error', listener: (error: Error) => void) => unknown;
}

/** Own both promises returned by electron-updater as one serialized operation.
 * Global updater events carry no attempt identity: they are diagnostic only.
 * Only the operation's settled promises can publish completion or failure. */
export class UpdaterCoordinator {
  private status: UpdaterStatus = INITIAL_UPDATER_STATUS;
  private pending: Promise<void> | null = null;
  private disposed = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private loggedErrors = new WeakSet<object>();
  constructor(
    private driver: UpdaterDriver,
    private policy: AutoUpdatePolicy,
    private publish: (status: UpdaterStatus) => void,
    private log: (error: unknown) => void,
  ) {
    // Keep an error listener until pending work settles, including on disposal:
    // EventEmitter's error event must never become an uncaught exception.
    driver.on('error', this.logError);
    if (policy.enabled) {
      driver.allowPrerelease = policy.allowPrerelease;
      driver.autoDownload = true;
      driver.autoInstallOnAppQuit = true;
    }
  }
  getStatus = (): UpdaterStatus => this.status;
  private logError = (error: unknown): void => {
    if (error && typeof error === 'object') {
      if (this.loggedErrors.has(error)) return;
      this.loggedErrors.add(error);
    }
    this.log(error);
  };
  private setStatus(phase: UpdaterStatus['phase'], version: string | null, failure: UpdaterStatus['failure'] = null): void {
    if (this.disposed) return;
    this.status = { sequence: this.status.sequence + 1, phase, version, failure };
    try {
      this.publish(this.status);
    } catch (error) {
      // A closing/crashed renderer cannot turn a handled updater outcome into
      // an unhandled promise. The snapshot remains available after reconnect.
      this.logError(error);
    }
  }
  start(): void {
    if (this.disposed || !this.policy.enabled || this.timer !== undefined) return;
    void this.check();
    this.timer = setInterval(() => { void this.check(); }, 2 * 60 * 60_000);
  }
  check = (): Promise<void> => {
    if (this.disposed || !this.policy.enabled) return Promise.resolve();
    if (this.pending) return this.pending;
    // Defer invocation until pending owns the operation, including synchronous
    // driver throws and reentrant manual checks triggered by status listeners.
    this.pending = Promise.resolve().then(async () => {
      if (this.disposed) return;
      let stage: 'check' | 'download' = 'check';
      let version = this.status.version;
      const ready = this.status.phase === 'ready' ? version : null;
      if (!ready) this.setStatus('checking', version);
      try {
        const result = await this.driver.checkForUpdates();
        // Always attach to the nested promise, even if the window closed while
        // the check was pending. It can reject independently of the check.
        if (result?.downloadPromise) {
          stage = 'download';
          version = isUpdaterVersion(result.updateInfo.version) ? result.updateInfo.version : null;
          if (version && version !== ready) this.setStatus('downloading', version);
          await result.downloadPromise;
          if (!version) throw new Error('Updater returned an invalid version.');
          this.setStatus('ready', version);
        } else if (!ready) {
          this.setStatus(result ? 'current' : 'idle', null);
        }
      } catch (error) {
        this.logError(error);
        // A failed metadata check does not discard a previously verified download.
        if (!(ready && stage === 'check')) this.setStatus('failed', version, stage);
      }
    }).finally(() => {
      this.pending = null;
      if (this.disposed) this.driver.removeListener('error', this.logError);
    });
    return this.pending;
  };
  dispose(): void {
    this.disposed = true;
    clearInterval(this.timer);
    this.timer = undefined;
    if (!this.pending) this.driver.removeListener('error', this.logError);
  }
}
