import { describe, expect, it, vi } from 'vitest';
import type { OverlayShortcutStatus } from '../../../shared/overlay';
import { OverlayShortcutCapture } from './overlayShortcutCapture';

const empty: OverlayShortcutStatus = { timer: null, counters: {} };
const restored: OverlayShortcutStatus = { timer: { accelerator: 'F9', registered: true, error: null }, counters: {} };
const key = (key: string, code = key, options: Partial<KeyboardEvent> = {}) => ({
  key, code, repeat: false, isComposing: false, getModifierState: () => false, ...options,
}) as KeyboardEvent;
const noConflict = () => undefined;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture(begin = Promise.resolve(empty), end = Promise.resolve(restored)) {
  const display = vi.fn(), status = vi.fn(), save = vi.fn();
  const send = vi.fn((_token: string, recording: boolean) => recording ? begin : end);
  const capture = new OverlayShortcutCapture(send, display, status);
  return { capture, send, display, status, save };
}

describe('overlay shortcut recording', () => {
  it('waits for the suspension acknowledgement, then commits exactly once on release of the recorded key', async () => {
    const response = deferred<OverlayShortcutStatus>();
    const { capture, send, save, status } = fixture(response.promise);
    const start = capture.begin('first');
    await capture.begin('duplicate click');
    const f9 = key('F9', 'F9', { ctrlKey: true });
    expect(capture.keyDown(f9, false)).toBe(true);
    capture.keyUp(f9, noConflict, save);
    expect(save).not.toHaveBeenCalled();
    response.resolve(empty);
    await start;
    capture.keyDown(f9, false);
    capture.keyDown(key('F9', 'F9', { repeat: true, ctrlKey: true }), false);
    capture.keyUp(key('Control', 'ControlLeft'), noConflict, save);
    expect(send.mock.calls).toEqual([['first', true]]);
    expect(save).not.toHaveBeenCalled();
    expect(capture.keyUp(key('F9'), noConflict, save)).toBe(true);
    expect(save.mock.calls).toEqual([['Control+F9']]);
    expect(send.mock.calls).toEqual([['first', true], ['first', false]]);
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[1]);
    expect(capture.keyUp(f9, noConflict, save)).toBe(false);
    await endOfTask();
    expect(status).toHaveBeenCalledWith(restored);
  });

  it('matches the physical keyup when releasing Shift changes the key text', async () => {
    const { capture, save } = fixture();
    await capture.begin('first');
    capture.keyDown(key('§', 'Digit3', { shiftKey: true }), false);
    capture.keyUp(key('3', 'Digit3'), noConflict, save);
    expect(save).toHaveBeenCalledWith('Shift+3');
  });

  it.each([
    ['Escape', false, true], ['Tab', false, false], ['Tab', true, false],
  ] as const)('cancels on %s (shift=%s) and preserves ordinary Tab navigation', async (name, shiftKey, handled) => {
    const { capture, save, send } = fixture();
    await capture.begin('first');
    capture.keyDown(key('F9'), false);
    expect(capture.keyDown(key(name, name, { shiftKey }), false)).toBe(handled);
    expect(capture.keyUp(key('F9'), noConflict, save)).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(send.mock.calls).toEqual([['first', true], ['first', false]]);
  });

  it('blur while waiting for acknowledgement cannot re-arm a canceled recorder', async () => {
    const response = deferred<OverlayShortcutStatus>();
    const { capture, send, display, save } = fixture(response.promise);
    const start = capture.begin('pending');
    capture.cancel();
    response.resolve(empty);
    await start;
    expect(display.mock.lastCall).toEqual([{ recording: false, message: '' }]);
    expect(capture.keyDown(key('F9'), false)).toBe(false);
    expect(capture.keyUp(key('F9'), noConflict, save)).toBe(false);
    expect(send.mock.calls).toEqual([['pending', true], ['pending', false]]);
  });

  it('unmount releases the token once without updating the unmounted recorder', async () => {
    const { capture, display, send } = fixture();
    await capture.begin('first');
    display.mockClear();
    capture.cancel(false);
    capture.cancel(false);
    expect(display).not.toHaveBeenCalled();
    expect(send.mock.calls).toEqual([['first', true], ['first', false]]);
  });

  it('ignores modifier presses, repeat events and composition without replacing the old binding', async () => {
    const { capture, save } = fixture();
    await capture.begin('first');
    for (const event of [key('Control'), key('F9', 'F9', { repeat: true }), key('a', 'KeyA', { isComposing: true })]) {
      expect(capture.keyDown(event, false)).toBe(true);
      capture.keyUp(event, noConflict, save);
    }
    expect(save).not.toHaveBeenCalled();
    capture.cancel();
  });

  it('keeps recording on an unsupported input or an existing in-app binding and accepts another choice', async () => {
    const { capture, display, save, send } = fixture();
    await capture.begin('first');
    capture.keyDown(key('Dead', 'Quote'), false);
    expect(display.mock.lastCall?.[0].message).toContain('cannot be recorded');
    expect(capture.sideButton()).toBe(true);
    expect(display.mock.lastCall?.[0].message).toContain('Mouse side buttons');
    capture.keyDown(key('F9'), false);
    capture.keyUp(key('F9'), () => 'Starfall Craters', save);
    expect(display.mock.lastCall?.[0].message).toContain('Already assigned to Starfall Craters');
    expect(save).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    capture.keyDown(key('F10'), false);
    capture.keyUp(key('F10'), noConflict, save);
    expect(save).toHaveBeenCalledWith('F10');
    expect(capture.sideButton()).toBe(false);
  });

  it('keeps a failed suspension out of recording mode and reports the failure', async () => {
    const { capture, send, display } = fixture(Promise.reject(new Error('denied')));
    await capture.begin('first');
    expect(send.mock.calls).toEqual([['first', true], ['first', false]]);
    expect(display.mock.lastCall?.[0]).toEqual({ recording: false, message: 'Recording could not start. Try again.' });
    expect(capture.keyDown(key('F9'), false)).toBe(false);
  });

  it('an old release cannot replace a newer recording status', async () => {
    const release = deferred<OverlayShortcutStatus>();
    const { capture, status, display } = fixture(Promise.resolve(empty), release.promise);
    await capture.begin('first');
    capture.cancel();
    await capture.begin('second');
    release.resolve(restored);
    await endOfTask();
    expect(status).not.toHaveBeenCalled();
    expect(display.mock.lastCall?.[0].recording).toBe(true);
    capture.cancel();
  });
});

function endOfTask(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
