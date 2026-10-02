export type ClipboardCaptureTarget = {
  isWatching: boolean;
  sessionLifecycle: 'live' | 'historical';
  sessionNonce: number;
  activeSessionId: string | null;
  liveSessionId: string | null;
};

export function isClipboardWatchToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(value);
}

export function isMainClipboardSender(
  sender: unknown, senderFrame: unknown, owner: { mainFrame: unknown } | null,
): boolean {
  return owner !== null && owner.mainFrame != null && sender === owner && senderFrame === owner.mainFrame;
}

/** did-navigate commits a new main document; starts, hashes and child frames do not. */
export function observeClipboardDocumentReplacement(
  contents: { on(event: 'did-navigate', listener: () => void): unknown },
  invalidate: () => void,
): void {
  contents.on('did-navigate', invalidate);
}

const targetKey = (state: ClipboardCaptureTarget): string => JSON.stringify([
  state.sessionLifecycle, state.sessionNonce, state.activeSessionId, state.liveSessionId,
]);

/** Runtime-only correlation over the existing session lifecycle, not stored state. */
export class ClipboardCaptureGuard {
  private token: string | null = null;
  private target: string | null = null;

  constructor(private readonly options: {
    createToken: () => string;
    setWatch: (on: boolean, token?: string) => void;
  }) {}

  sync(state: ClipboardCaptureTarget): void {
    if (!state.isWatching || state.sessionLifecycle !== 'live') {
      if (this.token !== null) this.stop();
      return;
    }
    const key = targetKey(state);
    if (this.token !== null && this.target === key) return;
    const token = this.options.createToken();
    if (!isClipboardWatchToken(token)) throw new Error('Invalid clipboard activation');
    this.target = key;
    this.token = token;
    this.options.setWatch(true, token);
  }

  accepts(token: unknown, state: ClipboardCaptureTarget): boolean {
    return this.token !== null && token === this.token && state.isWatching &&
      state.sessionLifecycle === 'live' && this.target === targetKey(state);
  }

  stop(): void {
    this.token = null;
    this.target = null;
    this.options.setWatch(false);
  }
}
