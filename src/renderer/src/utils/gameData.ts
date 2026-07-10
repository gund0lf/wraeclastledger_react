/**
 * Game-data manifest access + loader (rollover Phase 1 step 2).
 *
 * ACCESS MODEL: getManifest() is synchronous and always returns the ACTIVE
 * manifest — bundled at startup, possibly replaced by a newer cached/served
 * revision during initGameData(). Revision swaps are RESTART-SCOPED by design:
 * initGameData() runs once at App mount, before any picker is opened; module
 * constants derived from the bundled snapshot (utils/constants.ts) intentionally
 * do NOT react to a swap — consumer-by-consumer migration to the helpers below
 * is step 2c (documented in HANDOVER session 12).
 *
 * SOURCE ORDER (plan §2.2 "loader prefers server, falls back to bundled"):
 *   bundled (always available) -> disk cache (userData, via main IPC — D1
 *   decision: NOT localStorage, its budget is already strained) -> server
 *   GET /game-data/latest (NOT LIVE yet — §6, rides Traceur's consolidated
 *   change; hook below stays dormant until then).
 */
import { GameDataManifest, GameEntity, ChiselEntity } from '../../../shared/gameData/types';
import { BUNDLED_MANIFEST } from '../../../shared/gameData/manifest';

let active: GameDataManifest = BUNDLED_MANIFEST;
let initPromise: Promise<GameDataManifest> | null = null;

/** The active manifest. Synchronous — safe to call anywhere after App mount. */
export function getManifest(): GameDataManifest {
  return active;
}

/**
 * Structural sanity check for manifests from disk/server. Deliberately shallow:
 * a manifest that passes this but carries bad data is a human editing problem,
 * not a loader problem.
 */
export function isValidManifest(m: unknown): m is GameDataManifest {
  const x = m as GameDataManifest;
  return !!x
    && typeof x.revision === 'number' && Number.isFinite(x.revision)
    && typeof x.patchVersion === 'string'
    && typeof x.atlasTreeVersion === 'string'
    && !!x.mechanics && typeof x.mechanics === 'object'
    && Array.isArray(x.scarabs) && x.scarabs.length > 0
    && Array.isArray(x.deliriumOrbs)
    && Array.isArray(x.astrolabes)
    && Array.isArray(x.chisels);
}

/**
 * Adopt a newer revision if the disk cache has one. Idempotent; runs once per
 * app lifetime (App mount). Failures are LOUD but never fatal — the bundled
 * manifest is always a working floor.
 */
export async function initGameData(): Promise<GameDataManifest> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const res = await window.api?.readGameDataCache?.();
        if (res?.manifest) {
          if (isValidManifest(res.manifest) && res.manifest.revision > active.revision) {
            active = res.manifest;
            console.log(`[GameData] Adopted cached manifest revision ${active.revision} (bundled: ${BUNDLED_MANIFEST.revision})`);
          } else if (!isValidManifest(res.manifest)) {
            console.warn('[GameData] Cached manifest failed validation — staying on bundled revision', BUNDLED_MANIFEST.revision);
          }
        } else if (res?.error) {
          // 'no cache file' is the normal fresh-install case; main returns error: null for it.
          console.warn('[GameData] Cache read error:', res.error);
        }
      } catch (err) {
        console.warn('[GameData] Cache read failed — staying on bundled revision', err);
      }
      // SERVER HOOK (dormant): when Traceur's GET /game-data/latest ships (§6),
      // fetch here, validate with isValidManifest, adopt if revision > active,
      // and persist via window.api.writeGameDataCache for the next start.
      return active;
    })();
  }
  return initPromise;
}

/** Test-only: reset module state so vi.resetModules-free tests can isolate. */
export function __resetGameDataForTests(): void {
  active = BUNDLED_MANIFEST;
  initPromise = null;
}

// ─── Derived views (read the ACTIVE manifest at call time) ───────────────────
// These are the migration target for constants.ts consumers (step 2c): unlike
// the static constants they follow a revision swap.

const isActive = (e: GameEntity): boolean => e.status === 'active';

/** Active scarab display names — shape of the legacy SCARAB_LIST. */
export function activeScarabNames(): string[] {
  return getManifest().scarabs.filter(isActive).map((e) => e.name);
}

/** Active deli orbs as select data — shape of the legacy DELIRIUM_ORB_LIST. */
export function activeDeliriumOrbList(): { value: string; label: string }[] {
  return getManifest().deliriumOrbs.filter(isActive)
    .map((e) => ({ value: e.name, label: e.label ?? e.name }));
}

/** Active astrolabes as select data incl. the None row — legacy ASTROLABE_LIST shape. */
export function activeAstrolabeList(): { value: string; label: string }[] {
  return [
    { value: '', label: '— None —' },
    ...getManifest().astrolabes.filter(isActive)
      .map((e) => ({ value: e.name, label: e.label ?? e.name })),
  ];
}

/** Active chisels keyed by stored name — legacy CHISEL_TYPES shape. */
export function activeChiselTypes(): Record<string, { label: string; statKey: ChiselEntity['statKey']; bonusAt20: number }> {
  const out: Record<string, { label: string; statKey: ChiselEntity['statKey']; bonusAt20: number }> = {};
  for (const c of getManifest().chisels) {
    if (!isActive(c)) continue;
    out[c.name] = { label: c.label ?? c.name, statKey: c.statKey, bonusAt20: c.bonusAt20 };
  }
  return out;
}

// ─── Mechanic flags (rollover step 5, §5.3) ──────────────────────────────────
// Whole-category on/off. A mechanic absent from the manifest map defaults to
// 'active' (fail-open): a data omission must never silently hide a working UI
// surface — that would be a silent failure, which this project rejects. 3.29
// removals are made EXPLICIT ('removed') in the manifest, not implied by omission.
export type MechanicKey = 'scarabs' | 'delirium' | 'astrolabe';

export function mechanicStatus(key: MechanicKey): 'active' | 'reworked' | 'removed' {
  const s = getManifest().mechanics[key];
  return s === 'removed' || s === 'reworked' ? s : 'active';
}

/** Show the mechanic's UI controls for NEW input? Removed hides new-input
 *  surfaces; old sessions/strategies still RENDER their data (read-time,
 *  handled at each display site, not here). Reworked stays visible. */
export function isMechanicActive(key: MechanicKey): boolean {
  return mechanicStatus(key) !== 'removed';
}
