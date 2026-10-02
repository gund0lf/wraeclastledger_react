type ClipboardActivation = {
  token: string;
  isCurrent: () => boolean;
  primed: boolean;
  lastText: string;
};

/** One asynchronous OS read at a time, including across stop/restart. */
export class ClipboardWatcher {
  private active: ClipboardActivation | null = null;
  private reading = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: {
    readText: () => string | Promise<string>;
    publish: (text: string, token: string) => void;
    intervalMs?: number;
  }) {}

  start(token: string, isCurrent: () => boolean): void {
    if (this.active?.token === token) return;
    this.stop();
    this.active = { token, isCurrent, primed: false, lastText: '' };
    void this.poll();
  }

  stop(): void {
    this.active = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    const activation = this.active;
    if (!activation || this.reading) return;
    if (!activation.isCurrent()) { this.stop(); return; }
    this.reading = true;
    try {
      const text = await this.options.readText();
      if (this.active !== activation) return;
      if (!activation.isCurrent()) { this.stop(); return; }
      if (!activation.primed) {
        // The initial clipboard is a baseline, never a newly captured map.
        activation.primed = true;
        activation.lastText = text;
      } else if (text !== activation.lastText) {
        activation.lastText = text;
        this.options.publish(text, activation.token);
      }
    } catch {
      // OS read failures are retryable. Do not emit stale text or an unhandled
      // rejection; a failed initial read must not count as successful priming.
    } finally {
      this.reading = false;
      if (this.active) {
        // A replacement activation waits for an old read to settle, then gets
        // its own baseline. A hanging read never spawns overlapping OS work.
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.poll();
        }, this.active === activation ? this.options.intervalMs ?? 200 : 0);
      }
    }
  }
}
