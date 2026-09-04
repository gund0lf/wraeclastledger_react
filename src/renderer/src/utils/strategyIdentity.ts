import type { Strategy } from './strategyConstants';

export interface StrategyRowIdentity {
  title: string;
  attribution: string;
}

/**
 * Builds the compact Browser-row identity without changing any authored data.
 * Every published strategy represents at least its original run; older servers
 * may omit evidence_run_count, so zero/missing presentation falls back to one.
 */
export function strategyRowIdentity(
  strategy: Pick<Strategy, 'discord_username' | 'strategy_name'>,
  evidenceRunCount: number,
): StrategyRowIdentity {
  const author = strategy.discord_username.trim() || 'Unknown author';
  const title = strategy.strategy_name?.trim() || `${author}'s strategy`;
  const runCount = Number.isFinite(evidenceRunCount)
    ? Math.max(1, Math.floor(evidenceRunCount))
    : 1;

  return {
    title,
    attribution: `by ${author} · ${runCount} ${runCount === 1 ? 'run' : 'runs'}`,
  };
}
