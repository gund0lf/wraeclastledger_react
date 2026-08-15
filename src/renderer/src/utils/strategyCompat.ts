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
 *   - atlas ?v=: compared against manifest.atlasTreeVersion when both are
 *     known. The viewing layer may retarget this version without mutating the
 *     authored URL; compatibility continues to report authored provenance.
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
  if (!m) return '';
  try { return decodeURIComponent(m[1]); }
  catch { return ''; }
}

/**
 * Retarget a Path of Pathing-style URL to the active atlas version for viewing.
 * Only the v= value is replaced: all other bytes, including the allocation
 * hash, remain untouched. This function never mutates its input.
 */
export function retargetAtlasUrl(url: string, currentVersion: string): string {
  if (!url || !currentVersion) return url;
  const match = /([?&]v=)([^&#]+)/.exec(url);
  if (!match) return url;
  let authoredVersion: string;
  try { authoredVersion = decodeURIComponent(match[2]); }
  catch { return url; }
  if (!authoredVersion || authoredVersion === currentVersion) return url;
  return `${url.slice(0, match.index)}${match[1]}${encodeURIComponent(currentVersion)}${url.slice(match.index + match[0].length)}`;
}

function checkName(
  kind: 'scarab' | 'chisel',
  list: 'scarabs' | 'chisels',
  stored: string,
  includeReworked: boolean,
): CompatIssue | null {
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
  if (entity.status === 'reworked' && includeReworked) {
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
  const manifest = getManifest();
  const issues: CompatIssue[] = [];
  // A reworked entity describes the transition INTO the active patch. A card
  // explicitly authored on that same patch already used the reworked item, so
  // warning it is backwards. Missing provenance remains conservatively noisy
  // because it may represent an older pre-metadata card.
  const includeReworked = strategy.game_data_patch_version !== manifest.patchVersion;

  for (const s of strategy.scarabs ?? []) {
    const issue = checkName('scarab', 'scarabs', s.name, includeReworked);
    if (issue) issues.push(issue);
  }
  const chiselIssue = checkName('chisel', 'chisels', strategy.chisel ?? '', includeReworked);
  if (chiselIssue) issues.push(chiselIssue);

  // Atlas ?v= — best-effort, and ONLY when both sides are known. Manifest '' =
  // we haven't observed this patch's tree version, so we cannot judge; stay
  // silent rather than guess (loud-unknown discipline, not a false alarm).
  const manifestV = manifest.atlasTreeVersion;
  const stratV = atlasVersionOf(strategy.atlas_tree_url);
  const atlasOutdated = !!manifestV && !!stratV && manifestV !== stratV;
  if (atlasOutdated) {
    issues.push({ kind: 'atlas', storedName: stratV, level: 'changed',
      detail: `Atlas tree is version ${stratV}; current is ${manifestV}` });
  }

  const deduplicatedIssues = Array.from(new Map(issues.map((issue) => [
    `${issue.kind}\u0000${issue.storedName}\u0000${issue.currentName ?? ''}\u0000${issue.detail}`,
    issue,
  ])).values());

  const level: CompatLevel =
    deduplicatedIssues.some((i) => i.level === 'removed') ? 'removed'
    : deduplicatedIssues.length > 0 ? 'changed'
    : 'ok';

  return { level, issues: deduplicatedIssues, atlasOutdated };
}
