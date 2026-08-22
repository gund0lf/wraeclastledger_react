import { SESSION_REPOSITORY_CHANNEL } from '../shared/sessionRepositoryIpc';
import type { SessionRepositoryAdapter } from './sessionRepositoryAdapter';

export interface SessionRepositoryIpcMain {
  handle(
    channel: string,
    listener: (event: unknown, input: unknown) => Promise<unknown>,
  ): void;
  removeHandler(channel: string): void;
}

/**
 * Bind the already validated repository adapter to Electron's request channel.
 * The factory takes an IPC-shaped port so its registration and teardown can be
 * tested without loading Electron in Vitest.
 *
 * Phase 4 registers this once from main/index.ts, after every advertised
 * operation became concrete and the file repository became authoritative.
 */
export function registerSessionRepositoryIpc(
  ipcMain: SessionRepositoryIpcMain,
  adapter: SessionRepositoryAdapter,
): () => void {
  ipcMain.handle(SESSION_REPOSITORY_CHANNEL, (_event, input) => adapter(input));
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    ipcMain.removeHandler(SESSION_REPOSITORY_CHANNEL);
  };
}
