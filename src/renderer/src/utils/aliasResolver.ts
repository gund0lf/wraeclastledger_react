/**
 * Alias resolution — read-time historical-name -> current-entity mapping
 * (LEAGUE_ROLLOVER_PLAN Phase 1 step 3, §2.2 "resolved through aliases at
 * READ time; stored user history is never rewritten").
 *
 * WHY read-time: when a scarab is renamed at 3.29, old saved strategies and
 * old session logs still carry the OLD name. We never migrate that stored
 * text (it is the user's record of what they actually ran). Instead, whenever
 * we need to line an old name up against the current manifest — for icon
 * lookup, compatibility badges, matching — we resolve through the alias table
 * first.
 *
 * The alias table is DERIVED from the manifest, not maintained separately: any
 * entity with status 'renamed' + aliasOf IS an alias edge (oldName -> surviving
 * entity). Revision 1 has zero renames, so today every resolve() is an identity
 * pass-through; the machinery is in place for 3.29 to light up by data alone.
 *
 * SCOPE (from the D3 read-site audit, session 12 — see the plan checklist):
 * this resolver is for surfaces that MATCH a stored name against the manifest.
 * It is deliberately NOT wired into:
 *   - the pickers (InvestmentModule Selects) — they write CURRENT names; a
 *     renamed old value still displays as free text, which is correct.
 *   - autoTag / astrolabe-tag keyword matching (StrategyBrowserModule) — keys
 *     on category SUBSTRINGS ('delirium', 'breach', 'templar'), not full item
 *     names, so a rename of a specific scarab does not change its category word.
 *   - itemIcons.ts — already has its own generic-fallback resolution and keys
 *     on poe.ninja's own current names, not our manifest.
 * Wiring targets ARE: compatibility badges (step 4) and any future exact-name
 * manifest lookup. Keeping the blast radius small is the point.
 */
import { GameEntity, GameDataManifest } from '../../../shared/gameData/types';
import { getManifest } from './gameData';

/** One resolved lookup result. `entity` is null when the name is unknown to the manifest. */
export interface ResolvedEntity {
  entity: GameEntity | null;
  /** True when resolution crossed a 'renamed' alias edge (old name -> new). */
  viaAlias: boolean;
}

type EntityList = 'scarabs' | 'deliriumOrbs' | 'astrolabes' | 'chisels';

/** Case/space/punctuation-insensitive key for name matching. */
function nameKey(s: string): string {
  return s.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Build name->entity indices for one manifest revision, memoised on the
 * manifest object identity so a revision swap (initGameData) rebuilds lazily
 * without any explicit invalidation call.
 */
let indexCacheFor: GameDataManifest | null = null;
let indexCache: Record<EntityList, Map<string, GameEntity>> | null = null;

function indices(): Record<EntityList, Map<string, GameEntity>> {
  const m = getManifest();
  if (indexCache && indexCacheFor === m) return indexCache;
  const build = (list: GameEntity[]): Map<string, GameEntity> => {
    const map = new Map<string, GameEntity>();
    for (const e of list) map.set(nameKey(e.name), e);
    return map;
  };
  indexCache = {
    scarabs: build(m.scarabs),
    deliriumOrbs: build(m.deliriumOrbs),
    astrolabes: build(m.astrolabes),
    chisels: build(m.chisels),
  };
  indexCacheFor = m;
  return indexCache;
}

/** Follow renamed -> aliasOf edges to the surviving entity (cycle-guarded). */
function followAlias(entity: GameEntity, byId: Map<string, GameEntity>): { entity: GameEntity; hopped: boolean } {
  let cur = entity;
  let hopped = false;
  const seen = new Set<string>();
  while (cur.status === 'renamed' && cur.aliasOf && !seen.has(cur.id)) {
    seen.add(cur.id);
    const next = byId.get(cur.aliasOf);
    if (!next) break; // dangling aliasOf — manifest invariant test guards this; be defensive at runtime
    cur = next;
    hopped = true;
  }
  return { entity: cur, hopped };
}

/**
 * Resolve a (possibly historical) entity name within one list to the current
 * manifest entity. Identity pass-through when the name is already current.
 */
export function resolveEntity(list: EntityList, name: string): ResolvedEntity {
  if (!name || !name.trim()) return { entity: null, viaAlias: false };
  const idx = indices()[list];
  const hit = idx.get(nameKey(name));
  if (!hit) return { entity: null, viaAlias: false };
  const byId = new Map<string, GameEntity>(getManifest()[list].map((e) => [e.id, e] as const));
  const { entity, hopped } = followAlias(hit, byId);
  return { entity, viaAlias: hopped };
}

/** Convenience: the CURRENT canonical display name for a stored name (or the
 *  input unchanged if unknown — never throws, never blanks user data). */
export function currentName(list: EntityList, name: string): string {
  return resolveEntity(list, name).entity?.name ?? name;
}

/** True if the stored name maps to an entity that is present + usable now
 *  (status active OR reworked — reworked still exists, just changed). Unknown
 *  or 'removed' -> false. Used by compatibility badges (step 4). */
export function isCurrentlyUsable(list: EntityList, name: string): boolean {
  const e = resolveEntity(list, name).entity;
  return !!e && (e.status === 'active' || e.status === 'reworked');
}
