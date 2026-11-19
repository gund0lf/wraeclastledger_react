import type { OverlayShortcutStatus } from '../../../shared/overlay';
import { parseOverlayShortcutEvent } from './overlayShortcutRecorder';

interface Recording {
  token: string;
  ready: boolean;
  pending?: { key: string; accelerator: string };
}

export interface ShortcutCaptureView {
  recording: boolean;
  message: string;
}

const idle: ShortcutCaptureView = { recording: false, message: '' };
const listen = 'Press a shortcut. Escape cancels.';
const keyIdentity = (event: KeyboardEvent) => event.code || event.key.toLowerCase();

export class OverlayShortcutCapture {
  private recording?: Recording;
  private generation = 0;

  constructor(
    private setRecording: (token: string, recording: boolean) => Promise<OverlayShortcutStatus>,
    private display: (view: ShortcutCaptureView) => void,
    private showStatus: (status: OverlayShortcutStatus) => void,
  ) {}

  async begin(token: string): Promise<void> {
    if (this.recording) return;
    const recording = { token, ready: false };
    this.recording = recording;
    this.generation++;
    this.display({ recording: true, message: 'Preparing to record…' });
    try {
      await this.setRecording(token, true);
      if (this.recording !== recording) return;
      recording.ready = true;
      this.display({ recording: true, message: listen });
    } catch {
      if (this.recording === recording) this.finish('Recording could not start. Try again.');
    }
  }

  cancel(notify = true): void {
    this.finish('', notify);
  }

  private finish(message: string, notify = true): void {
    const recording = this.recording;
    if (!recording) return;
    this.recording = undefined;
    const generation = this.generation;
    if (notify) this.display(message ? { ...idle, message } : idle);
    void this.setRecording(recording.token, false).then(status => {
      if (this.generation === generation) this.showStatus(status);
    }).catch(() => {
      if (notify && this.generation === generation) {
        this.display({ ...idle, message: 'Shortcut availability could not be checked. Record the shortcut again to retry.' });
      }
    });
  }

  keyDown(event: KeyboardEvent, isMac: boolean): boolean {
    const recording = this.recording;
    if (!recording) return false;
    const parsed = parseOverlayShortcutEvent(event, isMac);
    if (parsed.kind === 'tab' || parsed.kind === 'cancel') {
      this.cancel();
      return parsed.kind === 'cancel';
    }
    if (!recording.ready || recording.pending || parsed.kind === 'modifier' || parsed.kind === 'ignored') return true;
    if (parsed.kind === 'accelerator') {
      recording.pending = { key: keyIdentity(event), accelerator: parsed.accelerator };
      this.display({ recording: true, message: 'Release ' + parsed.accelerator + ' to save.' });
    } else {
      this.display({ recording: true, message: 'This key cannot be recorded. Try another keyboard shortcut.' });
    }
    return true;
  }

  keyUp(event: KeyboardEvent, conflict: (value: string) => string | undefined, save: (value: string) => void): boolean {
    const recording = this.recording;
    if (!recording) return false;
    const pending = recording.pending;
    if (!pending || keyIdentity(event) !== pending.key) return true;
    recording.pending = undefined;
    const other = conflict(pending.accelerator);
    if (other) {
      this.display({ recording: true, message: 'Already assigned to ' + other + '. Press a different shortcut.' });
      return true;
    }
    // Updating preferences here queues the normal registration sync before release.
    // The triggering key is already up when the main process resumes shortcuts.
    try {
      save(pending.accelerator);
    } finally {
      this.finish('');
    }
    return true;
  }

  sideButton(): boolean {
    if (!this.recording) return false;
    this.display({ recording: true, message: 'Mouse side buttons cannot be recorded directly. Press a keyboard shortcut.' });
    return true;
  }
}
