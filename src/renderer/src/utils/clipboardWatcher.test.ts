import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClipboardWatcher } from '../../../main/clipboardWatcher';
import {
  ClipboardCaptureGuard, isClipboardWatchToken, isMainClipboardSender,
  type ClipboardCaptureTarget,
} from '../../../shared/clipboardCapture';

afterEach(() => vi.useRealTimers());
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const target = (): ClipboardCaptureTarget => ({
  isWatching: true, sessionLifecycle: 'live', sessionNonce: 0,
  activeSessionId: null, liveSessionId: null,
});

describe('asynchronous OS clipboard watcher', () => {
  it('primes without capture, suppresses unchanged text, and preserves subsequent copy order', async () => {
    vi.useFakeTimers();
    const readText = vi.fn().mockResolvedValue('old map');
    const publish = vi.fn();
    const watcher = new ClipboardWatcher({ readText, publish });
    watcher.start('first', () => true);
    await settle();
    expect(publish).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(publish).not.toHaveBeenCalled();
    readText.mockResolvedValue('new map');
    await vi.advanceTimersByTimeAsync(200);
    expect(publish.mock.calls).toEqual([['new map', 'first']]);
    await vi.advanceTimersByTimeAsync(200);
    expect(publish).toHaveBeenCalledTimes(1);
    readText.mockResolvedValue('another map');
    await vi.advanceTimersByTimeAsync(200);
    expect(publish.mock.calls).toEqual([['new map', 'first'], ['another map', 'first']]);
    watcher.stop();
  });

  it('never overlaps slow or hanging reads, including a stop/restart', async () => {
    vi.useFakeTimers();
    const first = deferred<string>();
    const readText = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue('new baseline');
    const publish = vi.fn();
    const watcher = new ClipboardWatcher({ readText, publish });
    watcher.start('old', () => true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(readText).toHaveBeenCalledTimes(1);
    watcher.stop();
    watcher.start('new', () => true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(readText).toHaveBeenCalledTimes(1);
    first.resolve('old result');
    await vi.advanceTimersByTimeAsync(1);
    expect(readText).toHaveBeenCalledTimes(2);
    expect(publish).not.toHaveBeenCalled();
    readText.mockResolvedValue('new capture');
    await vi.advanceTimersByTimeAsync(200);
    expect(publish.mock.calls).toEqual([['new capture', 'new']]);
    watcher.stop();
  });

  it.each(['stop', 'target-change'] as const)('drops a delayed captured map after %s', async transition => {
    vi.useFakeTimers();
    const next = deferred<string>();
    const readText = vi.fn().mockResolvedValueOnce('baseline').mockReturnValueOnce(next.promise)
      .mockResolvedValue('replacement baseline');
    const publish = vi.fn();
    const watcher = new ClipboardWatcher({ readText, publish });
    watcher.start('old', () => true);
    await settle();
    await vi.advanceTimersByTimeAsync(200);
    if (transition === 'stop') watcher.stop();
    else watcher.start('new', () => true);
    next.resolve('stale map');
    await vi.advanceTimersByTimeAsync(1);
    expect(publish).not.toHaveBeenCalled();
    if (transition === 'stop') {
      await vi.advanceTimersByTimeAsync(1000);
      expect(readText).toHaveBeenCalledTimes(2);
    } else expect(readText).toHaveBeenCalledTimes(3);
    watcher.stop();
  });

  it.each(['before-read', 'during-read'] as const)('stops on a destroyed/replaced window %s', async stage => {
    vi.useFakeTimers();
    const first = deferred<string>();
    const readText = vi.fn(() => first.promise), publish = vi.fn();
    let current = stage !== 'before-read';
    const watcher = new ClipboardWatcher({ readText, publish });
    watcher.start('owner', () => current);
    if (stage === 'during-read') {
      current = false;
      first.resolve('stale baseline');
    }
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    expect(readText).toHaveBeenCalledTimes(stage === 'before-read' ? 0 : 1);
    expect(publish).not.toHaveBeenCalled();
    watcher.stop();
  });

  it('retries rejected priming and poll reads without inventing a baseline or duplicating captures', async () => {
    vi.useFakeTimers();
    const readText = vi.fn().mockRejectedValueOnce(new Error('OS unavailable'))
      .mockResolvedValueOnce('actual baseline').mockRejectedValueOnce(new Error('busy clipboard'))
      .mockResolvedValue('captured');
    const publish = vi.fn();
    const watcher = new ClipboardWatcher({ readText, publish });
    watcher.start('first', () => true);
    await settle();
    await vi.advanceTimersByTimeAsync(400);
    expect(publish).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(publish.mock.calls).toEqual([['captured', 'first']]);
    await vi.advanceTimersByTimeAsync(200);
    expect(publish).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it('duplicate activation messages do not re-prime or reset a live read', async () => {
    vi.useFakeTimers();
    const readText = vi.fn().mockResolvedValueOnce('baseline').mockResolvedValue('capture');
    const publish = vi.fn();
    const watcher = new ClipboardWatcher({ readText, publish });
    watcher.start('first', () => true);
    await settle();
    watcher.start('first', () => true);
    expect(readText).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(publish.mock.calls).toEqual([['capture', 'first']]);
    watcher.stop();
  });
});

describe('capture IPC/session correlation', () => {
  const fixture = () => {
    const setWatch = vi.fn();
    let activation = 0;
    const guard = new ClipboardCaptureGuard({ createToken: () => `activation-${++activation}`, setWatch });
    return { guard, setWatch };
  };

  it.each(['sessionNonce', 'activeSessionId', 'liveSessionId'] as const)(
    're-primes after an authoritative %s change and refuses old queued captures', field => {
      const { guard, setWatch } = fixture(), state = target();
      guard.sync(state);
      expect(guard.accepts('activation-1', state)).toBe(true);
      const next = { ...state, [field]: field === 'sessionNonce' ? 1 : 'another-session' };
      // Reject before the renderer subscription even gets a chance to sync.
      expect(guard.accepts('activation-1', next)).toBe(false);
      guard.sync(next);
      expect(setWatch.mock.calls).toEqual([[true, 'activation-1'], [true, 'activation-2']]);
      expect(guard.accepts('activation-1', next)).toBe(false);
      expect(guard.accepts('activation-2', next)).toBe(true);
      guard.stop();
    },
  );

  it('Capture OFF, historical viewing, and unmount reject queued events and require a new activation', () => {
    const { guard, setWatch } = fixture(), state = target();
    guard.sync(state);
    const off = { ...state, isWatching: false };
    expect(guard.accepts('activation-1', off)).toBe(false);
    guard.sync(off);
    guard.sync(state);
    expect(guard.accepts('activation-1', state)).toBe(false);
    expect(guard.accepts('activation-2', state)).toBe(true);
    const historical = { ...state, sessionLifecycle: 'historical' as const };
    guard.sync(historical);
    expect(guard.accepts('activation-2', historical)).toBe(false);
    guard.sync(state);
    guard.stop();
    expect(guard.accepts('activation-3', state)).toBe(false);
    expect(setWatch.mock.calls).toEqual([
      [true, 'activation-1'], [false], [true, 'activation-2'], [false], [true, 'activation-3'], [false],
    ]);
  });

  it('ordinary save/notes/data changes do not reset the capture activation', () => {
    const { guard, setWatch } = fixture(), state = target();
    guard.sync(state);
    guard.sync({ ...state });
    expect(setWatch).toHaveBeenCalledTimes(1);
    expect(guard.accepts('activation-1', state)).toBe(true);
    expect(guard.accepts(undefined, state)).toBe(false);
    guard.stop();
  });

  it('accepts only bounded internal activation tokens', () => {
    expect(isClipboardWatchToken('1234-5678')).toBe(true);
    for (const token of [undefined, null, 1, '', 'a'.repeat(81), 'line\nbreak', 'path/name', {}])
      expect(isClipboardWatchToken(token)).toBe(false);
    const setWatch = vi.fn();
    const guard = new ClipboardCaptureGuard({ createToken: () => '', setWatch });
    expect(() => guard.sync(target())).toThrow('Invalid clipboard activation');
    expect(setWatch).not.toHaveBeenCalled();
  });

  it('accepts only the actual main window main frame, not an overlay, guest, stale window or unknown frame', () => {
    const main = { mainFrame: {} }, overlay = { mainFrame: {} }, old = { mainFrame: {} };
    expect(isMainClipboardSender(main, main.mainFrame, main)).toBe(true);
    expect(isMainClipboardSender(overlay, overlay.mainFrame, main)).toBe(false);
    expect(isMainClipboardSender(main, {}, main)).toBe(false);
    expect(isMainClipboardSender(old, old.mainFrame, main)).toBe(false);
    expect(isMainClipboardSender(main, null, main)).toBe(false);
    expect(isMainClipboardSender(main, main.mainFrame, null)).toBe(false);
    const malformed = { mainFrame: undefined };
    expect(isMainClipboardSender(malformed, undefined, malformed)).toBe(false);
  });
});
