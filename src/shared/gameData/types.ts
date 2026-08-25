/**
 * Game-data manifest — shared types (LEAGUE_ROLLOVER_PLAN §2.2, Phase 1 step 2).
 *
 * Lives in src/shared/ because BOTH processes consume game data: the renderer
 * for pickers/matching/badges, main (eventually) for tradeStatLiterals — the
 * same reason modTokens.ts lives here (D1).
 *
 * Principles (from the plan — do not violate):
 *  - NEVER delete an entity: re-status it ('removed') or alias it ('renamed'
 *    + aliasOf). Old strategies and session logs must keep resolving.
 *  - Historical name matching is resolved through aliases at READ time; stored
 *    user history is never rewritten.
 *  - `revision` is monotonic and decoupled from both the app version and the
 *    league — it can bump mid-league for hotfix corrections.
 */

export type EntityStatus = 'active' | 'reworked' | 'renamed' | 'removed';
export type MechanicStatus = 'active' | 'reworked' | 'removed';

export interface GameEntity {
  /** Stable internal id — slug of the name at introduction (D6). NEVER changes,
   *  even if the display name does (that is what aliasOf is for). */
  id: string;
  /** Display name as the game/economy prints it TODAY. For deli orbs and
   *  chisels this is the SHORT form stored in session settings
   *  (e.g. "Abyssal", "Cartographer") — changing it would orphan persisted
   *  settings; the long form belongs in `label`. */
  name: string;
  status: EntityStatus;
  /** For status 'renamed': the surviving entity's id. */
  aliasOf?: string;
  /** Short lifecycle note shown in "what changed" and historical surfaces. */
  note?: string;
  /** Optional icon pin for removed items (poe.ninja drops them from feeds). */
  iconUrl?: string;
  /** Optional select-input label (e.g. "Abyssal (Abyss)"). Falls back to name. */
  label?: string;
}

/** Chisels carry the map-stat math the calculators need. */
export interface ChiselEntity extends GameEntity {
  statKey: 'quantity' | 'moreCurrency' | 'rarity' | 'packSize' | 'moreScarabs' | 'moreDivCards';
  bonusAt20: number;
}

export interface GameDataManifest {
  revision: number;        // monotonic, mid-league bumps allowed
  /** Legacy revision 1 predates these fields. Every revision >= 2 must declare
   *  both so incompatible future wire formats cannot be silently adopted. */
  schemaVersion?: number;
  /** Product/game context rather than a league name: newer PoE1 challenge
   *  manifests remain eligible for older clients. */
  contextKey?: string;
  patchVersion: string;    // "3.28", "3.29"
  /** pathofpathing ?v= string. '' = not yet observed for this patch (loud
   *  unknown, NOT a guess) — §5.4 Tier 1 fills this per rollover. */
  atlasTreeVersion: string;
  mechanics: Record<string, MechanicStatus>;
  scarabs: GameEntity[];
  deliriumOrbs: GameEntity[];
  astrolabes: GameEntity[];
  chisels: ChiselEntity[];
  // tradeStatLiterals: DEFERRED to step 2b — needs its own inventory of the
  // main/index.ts literals before absorbing them (see HANDOVER session 12).
}

/**
 * D6: stable ids are slugified display names AT INTRODUCTION TIME.
 * "Horned Scarab of Awakening" -> "horned-scarab-of-awakening".
 * Deli orbs / chisels are prefixed by kind at manifest-creation call sites
 * ("deli-abyssal", "chisel-cartographer") since their short names are generic.
 */
export function slugifyEntityId(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
