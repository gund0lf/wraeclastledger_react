import type { Strategy } from './strategyConstants';

/**
 * The list endpoint intentionally omits raw_export while the detail endpoint
 * includes it. A background list refresh may reuse that loaded detail only
 * while the authored revision and evidence generation are unchanged.
 */
export function hasSameStrategyDetailVersion(
  current: Strategy,
  refreshed: Strategy,
): boolean {
  return (current.current_revision ?? 1) === (refreshed.current_revision ?? 1)
    && (current.evidence_generation ?? 0) === (refreshed.evidence_generation ?? 0)
    && (current.updated_at ?? null) === (refreshed.updated_at ?? null)
    && current.posted_at === refreshed.posted_at;
}

/** Preserve detail-only data without retaining stale list metrics or votes. */
export function mergeRefreshedStrategyPage(
  current: Strategy[],
  refreshed: Strategy[],
): Strategy[] {
  const currentById = new Map(current.map((strategy) => [strategy.id, strategy]));
  return refreshed.map((strategy) => {
    const existing = currentById.get(strategy.id);
    if (
      !existing?.raw_export
      || strategy.raw_export
      || !hasSameStrategyDetailVersion(existing, strategy)
    ) return strategy;
    return { ...strategy, raw_export: existing.raw_export };
  });
}
