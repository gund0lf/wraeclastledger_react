import { describe, expect, it, vi } from 'vitest';
import {
  completeRepositoryQuit,
  decideRepositoryClose,
  type RendererFlushResult,
  type RepositoryCloseDecisionDependencies,
  type RepositoryQuitCompletionDependencies,
} from '../../../main/sessionRepositoryClose';

const result = (ok: boolean, extra: Partial<RendererFlushResult> = {}): RendererFlushResult => ({
  requestId: `request-${ok ? 'ok' : 'failed'}`,
  ok,
  ...extra,
});

function dependencies(
  overrides: Partial<RepositoryCloseDecisionDependencies> = {},
): RepositoryCloseDecisionDependencies {
  return {
    wait: async (pending) => ({ timedOut: false, value: await pending }),
    prompt: vi.fn().mockResolvedValue(0),
    requestFlush: vi.fn().mockResolvedValue(result(true)),
    exportPending: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('WP14 main-process close decision', () => {
  it('continues immediately after a clean durable acknowledgement', async () => {
    const deps = dependencies();
    await expect(decideRepositoryClose(Promise.resolve(result(true)), deps)).resolves.toBe('saved');
    expect(deps.prompt).not.toHaveBeenCalled();
  });

  it('keeps waiting on the same in-flight save by default after five seconds', async () => {
    const wait = vi.fn()
      .mockResolvedValueOnce({ timedOut: true })
      .mockResolvedValueOnce({ timedOut: false, value: result(true) });
    const deps = dependencies({ wait, prompt: vi.fn().mockResolvedValue(0) });
    await expect(decideRepositoryClose(Promise.resolve(result(true)), deps)).resolves.toBe('saved');
    expect(wait).toHaveBeenCalledTimes(2);
    expect(deps.requestFlush).not.toHaveBeenCalled();
  });

  it('retries a failed save and requires a later successful acknowledgement', async () => {
    const requestFlush = vi.fn().mockResolvedValue(result(true));
    const deps = dependencies({ prompt: vi.fn().mockResolvedValue(1), requestFlush });
    await expect(decideRepositoryClose(
      Promise.resolve(result(false, { error: 'disk full' })),
      deps,
    )).resolves.toBe('saved');
    expect(requestFlush).toHaveBeenCalledOnce();
  });

  it('exports known pending state without treating the export as a successful save', async () => {
    const exportPending = vi.fn().mockResolvedValue(undefined);
    const requestFlush = vi.fn().mockResolvedValue(result(true));
    const deps = dependencies({ prompt: vi.fn().mockResolvedValue(2), exportPending, requestFlush });
    await expect(decideRepositoryClose(
      Promise.resolve(result(false, { recoveryDocument: '{"pending":true}' })),
      deps,
    )).resolves.toBe('saved');
    expect(exportPending).toHaveBeenCalledWith('{"pending":true}');
    expect(requestFlush).toHaveBeenCalledOnce();
  });

  it('exits without latest changes only through the explicit force choice', async () => {
    const deps = dependencies({
      wait: vi.fn().mockResolvedValue({ timedOut: true }),
      prompt: vi.fn().mockResolvedValue(3),
    });
    await expect(decideRepositoryClose(new Promise(() => undefined), deps)).resolves.toBe('force');
  });
});

describe('WP14 main-process close completion', () => {
  function completionDependencies(events: string[]): RepositoryQuitCompletionDependencies {
    return {
      releaseLock: vi.fn(async () => { events.push('release-lock'); }),
      unregister: vi.fn(() => { events.push('unregister-ipc'); }),
      prepareFinalAction: vi.fn(() => { events.push('prepare-final-action'); }),
      closeWindow: vi.fn(() => { events.push('close-window'); }),
      quitApp: vi.fn(() => { events.push('quit-app'); }),
      installUpdate: vi.fn(() => { events.push('install-update'); }),
      onReleaseError: vi.fn(() => { events.push('release-error'); }),
    };
  }

  it.each([
    ['window-close', 'close-window'],
    ['app-quit', 'quit-app'],
    ['updater', 'install-update'],
  ] as const)('routes %s only after releasing repository ownership', async (reason, action) => {
    const events: string[] = [];
    await completeRepositoryQuit(reason, completionDependencies(events));
    expect(events).toEqual(['release-lock', 'unregister-ipc', 'prepare-final-action', action]);
  });

  it('surfaces lock release failure and still allows the recoverable close path', async () => {
    const events: string[] = [];
    const deps = completionDependencies(events);
    deps.releaseLock = vi.fn(async () => { throw new Error('lock release failed'); });
    await completeRepositoryQuit('updater', deps);
    expect(events).toEqual(['release-error', 'unregister-ipc', 'prepare-final-action', 'install-update']);
  });
});
