/**
 * Strategy compatibility check (LEAGUE_ROLLOVER_PLAN Phase 1 step 4, §2.2/§5).
 *
 * Answers "does this shared strategy still work under the CURRENT game-data
 * manifest?" by diffing its stored item names against the manifest via the
 * read-time alias resolver. This is the SINGLE consumer the D3 audit identified
 * as needing aliasing — old strategies carry pre-rename names, and a rename
 * must read as compatible, not broken.
 *
 * SCOPE (D2 wire-shape finding, verified in strategyConstants.ts):
 *   - scarabs: `Strategy.scarabs[].name` — checked.
 *   - chisel:  `Strategy.chisel` (short name) — checked.
 *   - atlas ?v=: compared against manifest.atlasTreeVersion — checked, but ONLY
 *     when both sides are known (manifest '' = unobserved -> we stay silent,
 *     never cry "outdated" on our own missing data).
 *   - delirium orbs / astrolabes: NOT on the wire (they live only in
 *     raw_export free text). A reliable badge needs a server/wire change
 *     (held Traceur queue) — deliberately OUT of scope. See D2.
 *
 * Philosophy: this is an ADVISORY hint, tuned to under-warn. A false "broken"
 * on a working strategy is worse than staying quiet, so anything we cannot
 * resolve is treated as compatible (unknown-name -> ignored, not flagged),
 * because unknown could equally mean "custom/typo'd name we never had" as
 * "removed". Only names that resolve to a genuinely 'removed' entity flag.
 */
import { Strategy } from './strategyConstants';
import { getManifest } from './gameData';
import { resolveEntity } from './aliasResolver';

export type CompatLevel = 'ok' | 'changed' | 'removed';

export interface CompatIssue {
  kind: 'scarab' | 'chisel' | 'atlas';
  /** The name as STORED in the strategy (what the user will recognise). */
  storedName: string;
  /** Present for 'renamed': the current name it maps to. */
  currentName?: string;
  level: 'changed' | 'removed';
  detail: string;
}

export interface CompatResult {
  level: CompatLevel;             // worst issue level ('removed' > 'changed' > 'ok')
  issues: CompatIssue[];
  atlasOutdated: boolean;         // tree ?v= differs from the current patch (best-effort)
}

/** Extract the pathofpathing ?v= value from a stored atlas tree URL, or ''. */
export function atlasVersionOf(url?: string | null): string {
  if (!url) return '';
  const m = url.match(/[?&]v=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function checkName(kind: 'scarab' | 'chisel', list: 'scarabs' | 'chisels', stored: string): CompatIssue | null {
  const trimmed = stored?.trim();
  if (!trimmed || trimmed === 'None') return null;
  const { entity, viaAlias } = resolveEntity(list, trimmed);
  // Unknown name -> treat as compatible (could be custom/typo, not necessarily
  // removed). Under-warn by design.
  if (!entity) return null;
  if (entity.status === 'removed') {
    return { kind, storedName: trimmed, level: 'removed',
      detail: `${trimmed} no longer exists in ${getManifest().patchVersion}` };
  }
  // Genuine rename: resolved to a DIFFERENT current name. The name-differs guard
  // also swallows the dangling-aliasOf edge case (resolver returns the renamed
  // node itself when aliasOf points nowhere) so we never render 'X is now "X"'.
  if ((entity.status === 'renamed' || viaAlias) && entity.name !== trimmed) {
    return { kind, storedName: trimmed, currentName: entity.name, level: 'changed',
      detail: `${trimmed} is now "${entity.name}"` };
  }
  if (entity.status === 'reworked') {
    return { kind, storedName: trimmed, level: 'changed',
      detail: entity.note ? `${trimmed} was reworked: ${entity.note}` : `${trimmed} was reworked` };
  }
  return null;
}

/**
 * Compute a strategy's compatibility against the active manifest.
 * Pure w.r.t. its inputs (reads the module-level active manifest); safe to call
 * per-card in render.
 */
export function checkStrategyCompat(strategy: Strategy): CompatResult {
  const issues: CompatIssue[] = [];

  for (const s of strategy.scarabs ?? []) {
    const issue = checkName('scarab', 'scarabs', s.name);
    if (issue) issues.push(issue);
  }
  const chiselIssue = checkName('chisel', 'chisels', strategy.chisel ?? '');
  if (chiselIssue) issues.push(chiselIssue);

  // Atlas ?v= — best-effort, and ONLY when both sides are known. Manifest '' =
  // we haven't observed this patch's tree version, so we cannot judge; stay
  // silent rather than guess (loud-unknown discipline, not a false alarm).
  const manifestV = getManifest().atlasTreeVersion;
  const stratV = atlasVersionOf(strategy.atlas_tree_url);
  const atlasOutdated = !!manifestV && !!stratV && manifestV !== stratV;
  if (atlasOutdated) {
    issues.push({ kind: 'atlas', storedName: stratV, level: 'changed',
      detail: `Atlas tree is version ${stratV}; current is ${manifestV}` });
  }

  const level: CompatLevel =
    issues.some((i) => i.level === 'removed') ? 'removed'
    : issues.length > 0 ? 'changed'
    : 'ok';

  return { level, issues, atlasOutdated };
}
