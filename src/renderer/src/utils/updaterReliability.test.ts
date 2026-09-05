import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdaterCoordinator, type UpdaterDriver } from '../../../main/updaterCoordinator';
import { INITIAL_UPDATER_STATUS, readUpdaterStatus, type UpdaterStatus } from '../../../shared/updaterStatus';
import { resolveAutoUpdatePolicy } from '../../../shared/updatePolicy';
import { UpdaterPresentation, updaterCopy, type UpdaterIpc } from './updaterPresentation';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
type Result = Awaited<ReturnType<UpdaterDriver['checkForUpdates']>>;
class FakeUpdater extends EventEmitter {
  allowPrerelease = false;
  autoDownload = false;
  autoInstallOnAppQuit = false;
  checkForUpdates = vi.fn<UpdaterDriver['checkForUpdates']>();
}
const enabled = { enabled: true, allowPrerelease: false } as const;
const result = (downloadPromise?: Promise<unknown>, version = '1.0.96'): Result => ({ updateInfo: { version }, downloadPromise });
function setup() {
  const driver = new FakeUpdater(); const publish = vi.fn(); const log = vi.fn();
  const coordinator = new UpdaterCoordinator(driver, enabled, publish, log);
  return { driver, publish, log, coordinator };
}
const status = (sequence: number, phase: UpdaterStatus['phase'], version: string | null = null, failure: UpdaterStatus['failure'] = null): UpdaterStatus => ({ sequence, phase, version, failure });
function ipcHarness() {
  const listeners = new Set<(event: unknown, value: unknown) => void>();
  const snapshot = deferred<unknown>();
  const send = vi.fn();
  const ipc: UpdaterIpc = {
    on: (_channel, listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    invoke: vi.fn(() => snapshot.promise), send,
  };
  const emit = (value: unknown) => listeners.forEach((listener) => listener(null, value));
  return { ipc, listeners, snapshot, send, emit };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('main updater check and nested download ownership', () => {
  it('a failed renderer notification does not reject the owned operation', async () => {
    const driver = new FakeUpdater(); const log = vi.fn(); const error = new Error('window closed');
    const coordinator = new UpdaterCoordinator(driver, enabled, () => { throw error; }, log);
    driver.checkForUpdates.mockResolvedValueOnce(result(Promise.resolve([])));
    await expect(coordinator.check()).resolves.toBeUndefined();
    expect(coordinator.getStatus().phase).toBe('ready'); expect(log).toHaveBeenCalledExactlyOnceWith(error);
    coordinator.dispose();
  });

  it('contains an emitted download error and rejected promise once, then retries successfully', async () => {
    const { driver, coordinator, log, publish } = setup();
    const check = deferred<Result>(); const download = deferred<unknown>();
    driver.checkForUpdates.mockReturnValueOnce(check.promise);
    const first = coordinator.check(); await flush();
    expect(coordinator.getStatus()).toEqual(status(1, 'checking'));
    check.resolve(result(download.promise)); await flush();
    expect(coordinator.getStatus()).toEqual(status(2, 'downloading', '1.0.96'));
    const error = new Error('secret URL and detailed diagnostic');
    driver.emit('error', error); download.reject(error); await first;
    expect(coordinator.getStatus()).toEqual(status(3, 'failed', '1.0.96', 'download'));
    expect(log).toHaveBeenCalledExactlyOnceWith(error);
    expect(JSON.stringify(publish.mock.calls)).not.toContain('secret');
    driver.checkForUpdates.mockResolvedValueOnce(result(Promise.resolve(['verified-installer'])));
    await coordinator.check();
    expect(coordinator.getStatus()).toEqual(status(6, 'ready', '1.0.96'));
    coordinator.dispose();
  });

  it.each(['throw', 'reject', 'event-and-reject'])('contains a check %s before a version is known', async (failure) => {
    const { driver, coordinator, log } = setup(); const error = new Error('network failed');
    driver.checkForUpdates.mockImplementation(() => {
      if (failure === 'event-and-reject') driver.emit('error', error);
      if (failure === 'throw') throw error;
      return Promise.reject(error);
    });
    await coordinator.check();
    expect(coordinator.getStatus()).toEqual(status(2, 'failed', null, 'check'));
    expect(log).toHaveBeenCalledTimes(1);
    coordinator.dispose();
  });

  it('serializes repeated manual checks and background ticks across both promises', async () => {
    const { driver, coordinator } = setup(); const check = deferred<Result>(); const download = deferred<unknown>();
    driver.checkForUpdates.mockReturnValueOnce(check.promise);
    coordinator.start(); coordinator.start(); const pending = coordinator.check();
    await vi.advanceTimersByTimeAsync(2 * 60 * 60_000);
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(1);
    check.resolve(result(download.promise)); await flush();
    expect(coordinator.check()).toBe(pending);
    await vi.advanceTimersByTimeAsync(2 * 60 * 60_000);
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(1);
    download.resolve([]); await pending;
    driver.checkForUpdates.mockResolvedValue(result(undefined));
    await vi.advanceTimersByTimeAsync(2 * 60 * 60_000);
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(2);
    coordinator.dispose(); await vi.advanceTimersByTimeAsync(4 * 60 * 60_000);
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it('keeps Ready across duplicate global events, same-version checks and metadata failure', async () => {
    const { driver, coordinator, publish } = setup();
    driver.checkForUpdates.mockResolvedValue(result(Promise.resolve([]))); await coordinator.check();
    const ready = coordinator.getStatus();
    driver.emit('update-available', { version: '1.0.96' });
    driver.emit('update-downloaded', { version: '1.0.95' });
    driver.emit('update-not-available'); driver.emit('error', new Error('unowned event'));
    expect(coordinator.getStatus()).toEqual(ready);
    publish.mockClear(); await coordinator.check();
    expect(publish.mock.calls.map(([value]) => value.phase)).toEqual(['ready']);
    const verified = coordinator.getStatus(); driver.checkForUpdates.mockRejectedValueOnce(new Error('metadata offline'));
    await coordinator.check(); expect(coordinator.getStatus()).toEqual(verified);
    driver.checkForUpdates.mockResolvedValueOnce(result(undefined)); await coordinator.check();
    expect(coordinator.getStatus()).toEqual(verified);
    coordinator.dispose();
  });

  it('a new version replaces Ready and cannot install until its own download finishes', async () => {
    const { driver, coordinator } = setup();
    driver.checkForUpdates.mockResolvedValueOnce(result(Promise.resolve([]))); await coordinator.check();
    const download = deferred<unknown>(); driver.checkForUpdates.mockResolvedValueOnce(result(download.promise, '1.0.97'));
    const pending = coordinator.check(); await flush();
    expect(coordinator.getStatus().phase).toBe('downloading'); expect(coordinator.getStatus().version).toBe('1.0.97');
    driver.emit('update-downloaded', { version: '1.0.96' });
    expect(coordinator.getStatus().phase).toBe('downloading');
    download.reject(new Error('new download failed')); await pending;
    expect(coordinator.getStatus().phase).toBe('failed'); expect(coordinator.getStatus().failure).toBe('download');
    coordinator.dispose();
  });

  it.each(['check', 'download'])('disposal contains a pending %s rejection without publishing or uncaught error', async (stage) => {
    const { driver, coordinator, publish, log } = setup(); const check = deferred<Result>(); const download = deferred<unknown>();
    driver.checkForUpdates.mockReturnValueOnce(check.promise); const pending = coordinator.check(); await flush();
    if (stage === 'download') { check.resolve(result(download.promise)); await flush(); }
    coordinator.dispose(); const calls = publish.mock.calls.length;
    const error = new Error('late failure'); expect(() => driver.emit('error', error)).not.toThrow();
    if (stage === 'check') check.resolve(result(download.promise));
    await flush(); download.reject(error); await pending;
    expect(publish).toHaveBeenCalledTimes(calls); expect(log).toHaveBeenCalledTimes(1);
    expect(driver.listenerCount('error')).toBe(0); await coordinator.check(); expect(driver.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('dispose before the deferred start prevents the check entirely', async () => {
    const { driver, coordinator } = setup(); const pending = coordinator.check(); coordinator.dispose(); await pending;
    expect(driver.checkForUpdates).not.toHaveBeenCalled(); expect(driver.listenerCount('error')).toBe(0);
  });

  it.each([
    { isDevelopment: true, platform: 'win32', version: '1.0.95' },
    { isDevelopment: false, platform: 'linux', version: '1.0.95' },
  ])('preserves disabled policy %j', async (runtime) => {
    const driver = new FakeUpdater(); const publish = vi.fn();
    const coordinator = new UpdaterCoordinator(driver, resolveAutoUpdatePolicy(runtime), publish, vi.fn());
    coordinator.start(); await coordinator.check(); await vi.advanceTimersByTimeAsync(8 * 60 * 60_000);
    expect(driver.checkForUpdates).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
    expect(driver.autoDownload).toBe(false); coordinator.dispose();
  });

  it('retains prerelease and automatic download/install policy', () => {
    const driver = new FakeUpdater();
    const policy = resolveAutoUpdatePolicy({ isDevelopment: false, platform: 'linux', appImagePath: '/app.AppImage', version: '1.0.96-beta.1' });
    const coordinator = new UpdaterCoordinator(driver, policy, vi.fn(), vi.fn());
    expect(driver.allowPrerelease).toBe(true); expect(driver.autoDownload).toBe(true); expect(driver.autoInstallOnAppQuit).toBe(true);
    coordinator.dispose();
  });

  it('contains a bad version and still consumes its failed download promise', async () => {
    const { driver, coordinator, publish } = setup(); const download = deferred<unknown>();
    driver.checkForUpdates.mockResolvedValueOnce(result(download.promise, 'bad'.repeat(100)));
    const pending = coordinator.check(); await flush(); download.reject(new Error('failed')); await pending;
    expect(coordinator.getStatus()).toMatchObject({ phase: 'failed', version: null, failure: 'download' });
    expect(JSON.stringify(publish.mock.calls)).not.toContain('bad'); coordinator.dispose();
  });
});

describe('renderer updater presentation and IPC lifecycle', () => {
  it('a synchronous IPC send failure restores Retry instead of stranding Checking', () => {
    const net = ipcHarness(); const ui = new UpdaterPresentation(); const disconnect = ui.connect(net.ipc);
    net.emit(status(1, 'failed', null, 'check')); net.send.mockImplementation(() => { throw new Error('IPC unavailable'); });
    expect(() => ui.retry()).not.toThrow(); expect(ui.getSnapshot().status.phase).toBe('failed'); disconnect();
  });

  it('retries once, clears failure immediately, and later reaches Ready', async () => {
    const net = ipcHarness(); const ui = new UpdaterPresentation(); const disconnect = ui.connect(net.ipc);
    net.emit(status(1, 'failed', '1.0.96', 'download'));
    expect(updaterCopy(ui.getSnapshot().status).title).toBe('Update download failed');
    ui.retry(); ui.retry(); expect(net.send).toHaveBeenCalledExactlyOnceWith('check-for-updates');
    expect(ui.getSnapshot().status).toMatchObject({ phase: 'checking', failure: null });
    net.emit(status(2, 'checking', '1.0.96')); net.emit(status(3, 'downloading', '1.0.96')); net.emit(status(4, 'ready', '1.0.96'));
    expect(updaterCopy(ui.getSnapshot().status).title).toBe('v1.0.96 Ready');
    expect(net.send).not.toHaveBeenCalledWith('install-update'); disconnect();
  });

  it('an older snapshot response or pushed event cannot overwrite newer Ready', async () => {
    const net = ipcHarness(); const ui = new UpdaterPresentation(); const disconnect = ui.connect(net.ipc);
    net.emit(status(5, 'ready', '1.0.96')); const ready = ui.getSnapshot();
    net.snapshot.resolve(status(1, 'checking')); await flush();
    net.emit(status(4, 'failed', null, 'check')); net.emit(status(5, 'downloading', '1.0.96'));
    expect(ui.getSnapshot()).toEqual(ready); disconnect();
  });

  it('dismissal affects presentation only; failure and Ready still reappear', () => {
    const net = ipcHarness(); const ui = new UpdaterPresentation(); const disconnect = ui.connect(net.ipc);
    net.emit(status(1, 'downloading', '1.0.96')); ui.dismiss();
    net.emit(status(2, 'downloading', '1.0.96')); expect(ui.getSnapshot().dismissed).toBe(true);
    expect(net.send).not.toHaveBeenCalled(); net.emit(status(3, 'failed', '1.0.96', 'download'));
    expect(ui.getSnapshot().dismissed).toBe(false); ui.dismiss(); net.emit(status(4, 'ready', '1.0.96'));
    expect(ui.getSnapshot().dismissed).toBe(false); disconnect();
  });

  it('latest-version flash expires and cannot overlap subsequent checking/error/Ready', async () => {
    const net = ipcHarness(); const ui = new UpdaterPresentation(); const disconnect = ui.connect(net.ipc);
    net.emit(status(1, 'current')); expect(ui.getSnapshot().upToDateFlash).toBe(true);
    await vi.advanceTimersByTimeAsync(3000); expect(ui.getSnapshot().upToDateFlash).toBe(false);
    net.emit(status(2, 'current')); net.emit(status(3, 'checking'));
    expect(ui.getSnapshot().upToDateFlash).toBe(false); net.emit(status(4, 'failed', null, 'check'));
    await vi.advanceTimersByTimeAsync(3000); expect(ui.getSnapshot().status.phase).toBe('failed'); disconnect();
  });

  it('cleanup/remount removes listeners, clears timers and ignores a late initial snapshot', async () => {
    const old = ipcHarness(); const next = ipcHarness(); const ui = new UpdaterPresentation();
    const disconnect = ui.connect(old.ipc); old.emit(status(1, 'current')); disconnect();
    expect(old.listeners.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
    const reconnect = ui.connect(next.ipc); expect(next.listeners.size).toBe(1);
    next.snapshot.resolve(status(3, 'ready', '1.0.96')); await flush(); const current = ui.getSnapshot();
    old.snapshot.resolve(status(99, 'failed', null, 'check')); await flush();
    expect(ui.getSnapshot()).toEqual(current); reconnect(); expect(next.listeners.size).toBe(0);
  });

  it('snapshot IPC failure is visible without exposing the diagnostic', async () => {
    const net = ipcHarness(); const ui = new UpdaterPresentation(); const disconnect = ui.connect(net.ipc);
    net.snapshot.reject(new Error('sensitive diagnostic')); await flush();
    expect(updaterCopy(ui.getSnapshot().status).title).toBe('Could not check for updates');
    expect(JSON.stringify(ui.getSnapshot())).not.toContain('sensitive'); disconnect();
  });

  it.each([null, {}, { sequence: -1 }, { sequence: 1, phase: 'ready', version: null, failure: null },
    { sequence: 1, phase: 'failed', version: null, failure: null },
    { sequence: 1, phase: 'ready', version: '1.0.96', failure: 'check' }])('ignores malformed status %j', (value) => {
    expect(readUpdaterStatus(value)).toBeNull();
  });

  it('projects bounded fields without carrying extra diagnostics', () => {
    expect(readUpdaterStatus({ ...status(1, 'failed', null, 'check'), message: 'private stack' })).toEqual(status(1, 'failed', null, 'check'));
    expect(readUpdaterStatus(INITIAL_UPDATER_STATUS)).toEqual(INITIAL_UPDATER_STATUS);
  });
});

describe('production main-to-renderer updater flow', () => {
  it('connects the real adapters for failure, Retry, coalesced ticks, Ready and remount', async () => {
    const driver = new FakeUpdater(); const net = ipcHarness(); const log = vi.fn();
    const coordinator = new UpdaterCoordinator(driver, enabled, net.emit, log);
    net.ipc.invoke = async () => coordinator.getStatus();
    net.send.mockImplementation(() => { void coordinator.check(); });
    const ui = new UpdaterPresentation(); const disconnect = ui.connect(net.ipc);
    const firstDownload = deferred<unknown>(); driver.checkForUpdates.mockResolvedValueOnce(result(firstDownload.promise));
    const first = coordinator.check(); await flush(); expect(ui.getSnapshot().status.phase).toBe('downloading');
    const error = new Error('download unavailable'); driver.emit('error', error); firstDownload.reject(error); await first;
    expect(ui.getSnapshot().status.phase).toBe('failed');
    const secondDownload = deferred<unknown>(); driver.checkForUpdates.mockResolvedValueOnce(result(secondDownload.promise));
    ui.retry(); ui.retry(); await flush(); const retry = coordinator.check();
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(2); secondDownload.resolve([]); await retry;
    expect(ui.getSnapshot().status.phase).toBe('ready'); expect(log).toHaveBeenCalledTimes(1);
    disconnect(); const remounted = new UpdaterPresentation(); const cleanup = remounted.connect(net.ipc); await flush();
    expect(remounted.getSnapshot().status.phase).toBe('ready'); expect(net.send).toHaveBeenCalledTimes(1);
    cleanup(); coordinator.dispose();
  });
});
