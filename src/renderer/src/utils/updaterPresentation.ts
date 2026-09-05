import { INITIAL_UPDATER_STATUS, readUpdaterStatus, type UpdaterStatus } from '../../../shared/updaterStatus';

export interface UpdaterIpc {
  on: (channel: string, listener: (event: unknown, status: unknown) => void) => () => void;
  invoke: (channel: string) => Promise<unknown>;
  send: (channel: string) => void;
}
interface Presentation {
  status: UpdaterStatus;
  dismissed: boolean;
  upToDateFlash: boolean;
}
export class UpdaterPresentation {
  private state: Presentation = { status: INITIAL_UPDATER_STATUS, dismissed: false, upToDateFlash: false };
  private lastSequence = -1;
  private listeners = new Set<() => void>();
  private lifetime = 0;
  private flashTimer: ReturnType<typeof setTimeout> | undefined;
  private ipc: UpdaterIpc | null = null;
  getSnapshot = (): Presentation => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<Presentation>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  connect(ipc: UpdaterIpc): () => void {
    const lifetime = ++this.lifetime;
    this.ipc = ipc;
    const accept = (value: unknown) => {
      if (lifetime !== this.lifetime) return;
      const status = readUpdaterStatus(value);
      if (!status || status.sequence <= this.lastSequence) return;
      this.lastSequence = status.sequence;
      clearTimeout(this.flashTimer);
      const samePresentation = status.phase === this.state.status.phase && status.version === this.state.status.version;
      this.update({ status, dismissed: samePresentation ? this.state.dismissed : false, upToDateFlash: status.phase === 'current' });
      if (status.phase === 'current') {
        this.flashTimer = setTimeout(() => {
          if (lifetime === this.lifetime) this.update({ upToDateFlash: false });
        }, 3000);
      }
    };
    const unsubscribe = ipc.on('updater-state', (_event, status) => accept(status));
    // Subscribe first: an older snapshot must not overwrite a newer pushed event.
    void ipc.invoke('updater:get-state').then(accept).catch(() => {
      if (lifetime === this.lifetime && this.lastSequence < 0) {
        this.update({ status: { ...INITIAL_UPDATER_STATUS, phase: 'failed', failure: 'check' } });
      }
    });
    return () => {
      unsubscribe();
      if (lifetime !== this.lifetime) return;
      this.lifetime += 1;
      this.ipc = null;
      clearTimeout(this.flashTimer);
      this.update({ upToDateFlash: false });
    };
  }
  dismiss = (): void => { this.update({ dismissed: true }); };
  retry = (): void => {
    if (!this.ipc || this.state.status.phase !== 'failed') return;
    this.update({ status: { ...this.state.status, phase: 'checking', failure: null }, dismissed: false, upToDateFlash: false });
    try {
      this.ipc.send('check-for-updates');
    } catch {
      this.update({ status: { ...this.state.status, phase: 'failed', failure: 'check' } });
    }
  };
}

export function updaterCopy(status: UpdaterStatus): { title: string; body: string } {
  switch (status.phase) {
    case 'failed': return status.failure === 'download'
      ? { title: 'Update download failed', body: 'The update could not finish downloading. Try again.' }
      : { title: 'Could not check for updates', body: 'The update check failed. Try again.' };
    case 'ready': return { title: `v${status.version} Ready`, body: 'Downloaded and ready to install.' };
    case 'downloading': return { title: `v${status.version} Downloading…`, body: 'Downloading in background…' };
    default: return { title: 'Checking for updates…', body: 'Checking for the latest version.' };
  }
}
