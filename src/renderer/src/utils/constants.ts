/**
 * constants.ts — DERIVED VIEWS over the game-data manifest (since session 12).
 *
 * The flat game-entity arrays that used to live here (SCARAB_LIST,
 * DELIRIUM_ORB_LIST, ASTROLABE_LIST, CHISEL_TYPES) moved to the single source
 * of truth: src/shared/gameData/manifest.ts (LEAGUE_ROLLOVER_PLAN §2.2).
 * The exports below keep their EXACT legacy names and shapes so no consumer
 * changes — but they are static snapshots of the BUNDLED manifest, evaluated
 * at module load. They will NOT follow a newer cached/served manifest revision;
 * consumers migrate to the call-time helpers in utils/gameData.ts (step 2c)
 * to become revision-aware. Until then this is behaviourally identical to the
 * old file (bundled data only), which is fine pre-3.29.
 *
 * QUALITY_STAT_EFFECTS stays HERE, not in the manifest: it is clipboard-parser
 * configuration (which "Quality (X)" strings map to which stat), not a game
 * entity with a lifecycle. It changes when GGG changes tooltip WORDING, which
 * is a parser concern.
 */
import { BUNDLED_MANIFEST } from '../../../shared/gameData/manifest';

// ─── SCARAB LIST (derived) ────────────────────────────────────────────────────
// Current ACTIVE entries from bundled revision 2. Reworked entries remain
// selectable through the call-time helpers in gameData.ts, not this legacy view.
export const SCARAB_LIST: string[] =
  BUNDLED_MANIFEST.scarabs.filter((e) => e.status === 'active').map((e) => e.name);

// ─── CHISEL TYPES (derived) ───────────────────────────────────────────────────
export const CHISEL_TYPES: Record<string, { label: string; statKey: string; bonusAt20: number }> =
  Object.fromEntries(
    BUNDLED_MANIFEST.chisels
      .filter((c) => c.status === 'active')
      .map((c) => [c.name, { label: c.label ?? c.name, statKey: c.statKey, bonusAt20: c.bonusAt20 }])
  );

export const CHISEL_SELECT_DATA = [
  { value: '', label: '— None —' },
  ...Object.entries(CHISEL_TYPES).map(([k, v]) => ({ value: k, label: v.label })),
];

// ─── QUALITY STAT EFFECTS (parser config — NOT manifest data, see header) ─────
export const QUALITY_STAT_EFFECTS: Record<string, { statKey: string; multiplier: number }> = {
  Currency:      { statKey: "moreCurrency",  multiplier: 2.5 },
  Rarity:        { statKey: "rarity",        multiplier: 2   },
  "Pack Size":   { statKey: "packSize",      multiplier: 0.5 },
  Scarabs:       { statKey: "moreScarabs",   multiplier: 2.5 },
  // "Divination Cards" is the string the game actually prints in
  // "Quality (Divination Cards): +N%" — fixture-verified (Desolate Compass).
  // Div cards are their OWN drop pool (own stat), not currency.
  "Divination Cards": { statKey: "moreDivCards", multiplier: 2.5 },
  Divination:    { statKey: "moreDivCards",  multiplier: 2.5 },
  Standard:      { statKey: "quantity",      multiplier: 0.5 },
  Cartographer:  { statKey: "quantity",      multiplier: 0.5 },
  Avarice:       { statKey: "moreCurrency",  multiplier: 2.5 },
  Procurement:   { statKey: "rarity",        multiplier: 2   },
  Proliferation: { statKey: "packSize",      multiplier: 0.5 },
};

// ─── DELIRIUM ORBS (derived) ──────────────────────────────────────────────────
export const DELIRIUM_ORB_LIST: { value: string; label: string }[] =
  BUNDLED_MANIFEST.deliriumOrbs
    .filter((e) => e.status === 'active')
    .map((e) => ({ value: e.name, label: e.label ?? e.name }));

// ─── ASTROLABE LIST (derived, incl. the None row) ─────────────────────────────
export const ASTROLABE_LIST: { value: string; label: string }[] = [
  { value: "", label: "— None —" },
  ...BUNDLED_MANIFEST.astrolabes
    .filter((e) => e.status === 'active')
    .map((e) => ({ value: e.name, label: e.label ?? e.name })),
];
