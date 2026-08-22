export interface RendererFlushResult {
  requestId: string;
  ok: boolean;
  error?: string;
  recoveryDocument?: string;
}

export type FlushWaitResult =
  | { timedOut: false; value: RendererFlushResult }
  | { timedOut: true };

export interface RepositoryCloseDecisionDependencies {
  wait: (pending: Promise<RendererFlushResult>) => Promise<FlushWaitResult>;
  prompt: (failure: RendererFlushResult | null) => Promise<0 | 1 | 2 | 3>;
  requestFlush: () => Promise<RendererFlushResult>;
  exportPending: (knownDocument?: string) => Promise<void>;
}

/**
 * Pure close-decision loop shared by user close, app.quit, and updater install.
 * Keep-waiting retains an unresolved save; Retry starts a fresh renderer flush;
 * export never implies success; force is the only path that accepts data loss.
 */
export async function decideRepositoryClose(
  initial: Promise<RendererFlushResult>,
  dependencies: RepositoryCloseDecisionDependencies,
): Promise<'saved' | 'force'> {
  let pending = initial;
  let knownFailure: RendererFlushResult | null = null;
  while (true) {
    const settled = await dependencies.wait(pending);
    if (!settled.timedOut) {
      if (settled.value.ok) return 'saved';
      knownFailure = settled.value;
    }
    const response = await dependencies.prompt(knownFailure);
    if (response === 0) {
      if (knownFailure) pending = dependencies.requestFlush();
    } else if (response === 1) {
      knownFailure = null;
      pending = dependencies.requestFlush();
    } else if (response === 2) {
      await dependencies.exportPending(knownFailure?.recoveryDocument);
      if (knownFailure) pending = dependencies.requestFlush();
    } else {
      return 'force';
    }
  }
}
