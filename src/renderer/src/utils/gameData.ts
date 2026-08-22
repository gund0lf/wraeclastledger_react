/**
 * Game-data manifest access + loader (rollover Phase 1 step 2).
 *
 * ACCESS MODEL: getManifest() is synchronous and always returns the ACTIVE
 * manifest — bundled at startup, possibly replaced by a newer cached/served
 * revision during initGameData(). Revision swaps are RESTART-SCOPED by design:
 * initGameData() runs once at App mount. Live input surfaces call the derived
 * helpers below at render time; legacy constants remain a bundled snapshot for
 * historical display/math compatibility.
 *
 * SOURCE ORDER (plan §2.2 "loader prefers server, falls back to bundled"):
 *   bundled (always available) -> disk cache (userData, via main IPC — D1
 *   decision: outside the user-authored ledger-data backup) -> server
 *   GET /game-data/latest (NOT LIVE yet — §6, rides Traceur's consolidated
 *   change; hook below stays dormant until then).
 */
import { GameDataManifest, GameEntity, ChiselEntity } from '../../../shared/gameData/types';
import { BUNDLED_MANIFEST } from '../../../shared/gameData/manifest';
import { STRATEGY_API_URL } from './strategyConstants';

let active: GameDataManifest = BUNDLED_MANIFEST;
let initPromise: Promise<GameDataManifest> | null = null;

export const GAME_DATA_SCHEMA_VERSION = 1;
export const GAME_DATA_CONTEXT_KEY = 'poe1-challenge';
export type GameDataSource = 'bundled' | 'cache' | 'server';
export interface GameDataStatus {
  revision: number;
  patchVersion: string;
  source: GameDataSource;
  warning: string | null;
}
let status: GameDataStatus = {
  revision: active.revision,
  patchVersion: active.patchVersion,
  source: 'bundled',
  warning: null,
};

export function getGameDataStatus(): GameDataStatus {
  return { ...status };
}

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

export function isApplicableManifest(m: GameDataManifest): boolean {
  if (m.revision === 1 && m.schemaVersion === undefined && m.contextKey === undefined) return true;
  return m.schemaVersion === GAME_DATA_SCHEMA_VERSION && m.contextKey === GAME_DATA_CONTEXT_KEY;
}

function syncStatus(source: GameDataSource, warning = status.warning): void {
  status = { revision: active.revision, patchVersion: active.patchVersion, source, warning };
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
          if (isValidManifest(res.manifest) && isApplicableManifest(res.manifest) && res.manifest.revision > active.revision) {
            active = res.manifest;
            syncStatus('cache');
            console.log(`[GameData] Adopted cached manifest revision ${active.revision} (bundled: ${BUNDLED_MANIFEST.revision})`);
          } else if (!isValidManifest(res.manifest)) {
            syncStatus(status.source, 'Cached game data failed validation');
            console.warn('[GameData] Cached manifest failed validation — staying on bundled revision', BUNDLED_MANIFEST.revision);
          } else if (!isApplicableManifest(res.manifest)) {
            syncStatus(status.source, 'Cached game data is incompatible with this app');
            console.warn('[GameData] Cached manifest is incompatible — ignoring revision', res.manifest.revision);
          }
        } else if (res?.error) {
          // 'no cache file' is the normal fresh-install case; main returns error: null for it.
          console.warn('[GameData] Cache read error:', res.error);
        }
      } catch (err) {
        console.warn('[GameData] Cache read failed — staying on bundled revision', err);
      }
      // SERVER HOOK (live 2026-07-11): GET /game-data/latest via the main
      // process (CORS). Adopt if valid AND newer than whatever won above
      // (bundled or cache); persist so the NEXT start needs no network.
      // Every failure path is non-fatal — bundled/cache remain the floor.
      try {
        const res = await window.api?.fetchGameDataLatest?.(STRATEGY_API_URL);
        if (res?.payload) {
          const { revision, manifest } = res.payload;
          if (isValidManifest(manifest) && isApplicableManifest(manifest) && manifest.revision === revision && manifest.revision > active.revision) {
            active = manifest;
            syncStatus('server', null);
            console.log(`[GameData] Adopted server manifest revision ${revision}`);
            const w = await window.api?.writeGameDataCache?.(manifest);
            if (w && !w.ok) console.warn('[GameData] Could not cache server manifest:', w.error);
          } else if (!isValidManifest(manifest) || manifest.revision !== revision) {
            syncStatus(status.source, 'Server game data failed validation');
            console.warn('[GameData] Server manifest failed validation — ignoring');
          } else if (!isApplicableManifest(manifest)) {
            syncStatus(status.source, 'Server game data is incompatible with this app');
            console.warn('[GameData] Server manifest is incompatible — ignoring revision', revision);
          } // else: not newer — normal, no log spam
        } else if (res?.error) {
          // Server down / endpoint not deployed yet — quiet by design (§1 of
          // the endpoint spec: the client must work fully without it).
          console.log('[GameData] Server manifest unavailable:', res.error);
          syncStatus(status.source, `Game-data server unavailable; using ${status.source} data`);
        }
      } catch (err) {
        console.log('[GameData] Server manifest fetch failed — staying on', active.revision, err);
        syncStatus(status.source, `Game-data server unavailable; using ${status.source} data`);
      }
      return active;
    })();
  }
  return initPromise;
}

/** Test-only: reset module state so vi.resetModules-free tests can isolate. */
export function __resetGameDataForTests(): void {
  active = BUNDLED_MANIFEST;
  initPromise = null;
  status = { revision: active.revision, patchVersion: active.patchVersion, source: 'bundled', warning: null };
}

// ─── Derived views (read the ACTIVE manifest at call time) ───────────────────
// These are the migration target for constants.ts consumers (step 2c): unlike
// the static constants they follow a revision swap.

const isActive = (e: GameEntity): boolean => e.status === 'active';
const isSelectable = (e: GameEntity): boolean => e.status === 'active' || e.status === 'reworked';
const selectableLabel = (e: GameEntity): string => e.label ?? e.name;

export type GameEntityGroup = 'scarabs' | 'deliriumOrbs' | 'astrolabes' | 'chisels';

/** Lifecycle for an exact persisted/display name. Unknown free-text remains valid. */
export function entityLifecycleStatus(group: GameEntityGroup, name: string): GameEntity['status'] | null {
  const normalized = name.trim().toLocaleLowerCase();
  if (!normalized) return null;
  return getManifest()[group].find((e) => e.name.toLocaleLowerCase() === normalized)?.status ?? null;
}

/**
 * Current picker data. Reworked remains selectable, but lifecycle is internal:
 * input surfaces always present the clean product name/label.
 */
export function selectableScarabOptions(): { value: string; label: string }[] {
  return getManifest().scarabs.filter(isSelectable)
    .map((e) => ({ value: e.name, label: selectableLabel(e) }));
}

export function selectableDeliriumOrbList(): { value: string; label: string }[] {
  return getManifest().deliriumOrbs.filter(isSelectable)
    .map((e) => ({ value: e.name, label: selectableLabel(e) }));
}

export function selectableAstrolabeList(): { value: string; label: string }[] {
  return [
    { value: '', label: '— None —' },
    ...getManifest().astrolabes.filter(isSelectable)
      .map((e) => ({ value: e.name, label: selectableLabel(e) })),
  ];
}

export function selectableChiselList(): { value: string; label: string }[] {
  return [
    { value: '', label: '— None —' },
    ...getManifest().chisels.filter(isSelectable)
      .map((e) => ({ value: e.name, label: selectableLabel(e) })),
  ];
}

/**
 * A strict Select cannot display a saved value that is absent from its data.
 * Keep that one selected legacy value visible without returning it to any
 * fresh-session picker.
 */
export function preserveHistoricalSelection(
  options: { value: string; label: string }[],
  selectedValue: string,
): { value: string; label: string }[] {
  if (!selectedValue || options.some((option) => option.value === selectedValue)) return options;
  return [...options, { value: selectedValue, label: `${selectedValue} — Historical` }];
}

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
export type MechanicKey = 'scarabs' | 'delirium' | 'astrolabe' | 'split';

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

/**
 * New input follows the active manifest, while persisted historical input
 * remains editable and visible. This is the shared non-destructive gate used
 * by mechanic-specific Investment controls.
 */
export function shouldShowMechanicInput(key: MechanicKey, hasHistoricalData: boolean): boolean {
  return isMechanicActive(key) || hasHistoricalData;
}
