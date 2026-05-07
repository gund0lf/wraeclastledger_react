/**
 * modTokens.ts — Single source of truth for all stash regex tokens.
 *
 * Every value is a short substring that matches mod text in the PoE stash search.
 * PoE stash search is case-insensitive and line-by-line.
 *
 * Consumers:
 *   - BRICK_MOD_DEFS (src/main/index.ts): tokens for "!term1|term2" exclusion regex
 *   - RegexBuilderModule: tokens for K-of-N positive-match POS regex
 *   - modTokens.test.ts: sync test verifying BRICK_MOD_DEFS stays aligned
 *
 * Verification key:
 *   [V:game]  = manually verified in PoE stash search in-game
 *   [V:py]    = verified via Python substring check against mod text
 *   [V:uber]  = from UBER_MODS (uberMapMods.ts) verified dataset
 *
 * Special case: Fecund uber (90-100% more Life, +47% currency) uses a regex
 * pattern '(9\\d|100)% m' that lives in RegexBuilderModule.tsx directly —
 * it is the only non-plain-substring token and is not a brick (good mod).
 */

export const MOD_TOKENS = {
  // ══════════════════════════════════════════════════════════════
  // REGULAR (top-tier) MAP MODS
  // ══════════════════════════════════════════════════════════════

  // ── Damage & Reflect ────────────────────────────────────────────

  reflect_physical_damage: 's ref',  // [V:py] Reflect Physical Damage
  reflect_elemental_damage: 'f ele',  // [V:py] Reflect Elemental Damage
  high_crit_chance_multiplier: 'ike m',  // [V:py] High Crit Chance + Multiplier
  extra_chaos_damage_withered: 'withe',  // [V:py] Extra Chaos Damage + Withered
  extra_fire_damage: 'fire',  // [V:py] Extra Fire Damage
  extra_cold_damage: 'as col',  // [V:py] Extra Cold Damage
  extra_lightning_damage: 'ghtnin',  // [V:py] Extra Lightning Damage
  monsters_fire_extra_projectiles: 'onal pr',  // [V:py] Monsters Fire Extra Projectiles
  increased_monster_damage: 'ster da',  // [V:py] Increased Monster Damage
  reduced_crit_damage_taken: 'uced ext',  // [V:py] Reduced Crit Damage Taken
  all_damage_ignites: 'lways i',  // [V:py] All Damage Ignites
  impale_on_hit: 'pale on',  // [V:py] Impale on Hit
  ignite_freeze_shock_chance: 'hock on',  // [V:py] Ignite/Freeze/Shock Chance

  // ── Recovery & Leech ────────────────────────────────────────────

  cannot_regenerate_life_mana_es: 'reg',  // [V:py] Cannot Regenerate Life/Mana/ES
  less_recovery_rate: 'covery',  // [V:py] Less Recovery Rate
  cannot_be_leeched_from: 'eche',  // [V:py] Cannot Be Leeched From
  reduced_flask_charges: 'sk char',  // [V:py] Reduced Flask Charges
  less_cooldown_recovery: 'coo',  // [V:py] Less Cooldown Recovery

  // ── Curses & Ailments ───────────────────────────────────────────

  reduced_non_curse_aura_effect: 'non-c',  // [V:py] Reduced Non-Curse Aura Effect
  less_curse_effect: 'f curs',  // [V:py] Less Curse Effect
  cursed_with_enfeeble: 'feebl',  // [V:py] Cursed with Enfeeble
  cursed_with_vulnerability: 'ulnera',  // [V:py] Cursed with Vulnerability
  cursed_with_temporal_chains: 'empor',  // [V:py] Cursed with Temporal Chains
  cursed_with_elemental_weakness: 'al wea',  // [V:py] Cursed with Elemental Weakness
  monsters_hexproof: 'xpro',  // [V:py] Monsters Hexproof

  // ── Monster Behaviour ───────────────────────────────────────────

  boss_damage_attack_speed: 'oss de',  // [V:py] Boss Damage + Attack Speed
  monster_speed_move_attack_cast: 'ster mo',  // [V:py] Monster Speed (Move/Attack/Cast)
  boss_more_life_aoe: 'oss ha',  // [V:py] Boss More Life + AoE
  monsters_increased_aoe: 'rea of e',  // [V:py] Monsters Increased AoE
  monsters_poison_on_hit: 'n on hi',  // [V:py] Monsters Poison on Hit
  skills_chain_additional_times: 'hain 2',  // [V:py] Skills Chain Additional Times
  players_less_suppressed_spell_damage: 'uppres',  // [V:py] Players Less Suppressed Spell Damage
  monsters_increased_accuracy_rating: 'ccurac',  // [V:py] Monsters Increased Accuracy Rating
  monsters_suppress_spell_damage_chance: 'ppress',  // [V:py] Monsters Suppress Spell Damage Chance
  cannot_be_stunned: 'tun',  // [V:game] Cannot Be Stunned
  buffs_on_players_expire_faster: 'yers e',  // [V:game] Buffs on Players Expire Faster
  cannot_be_taunted_slowed: 'aunted',  // [V:py] Cannot Be Taunted/Slowed
  players_less_accuracy: 'ss acc',  // [V:py] Players Less Accuracy
  monsters_steal_charges: 'teal p',  // [V:py] Monsters Steal Charges
  monsters_gain_frenzy_charges: 'renz',  // [V:py] Monsters Gain Frenzy Charges
  monsters_gain_endurance_charges: 'ndur',  // [V:py] Monsters Gain Endurance Charges
  monsters_gain_power_charges: 'ower c',  // [V:py] Monsters Gain Power Charges
  monsters_maim_on_hit: 'aim on',  // [V:py] Monsters Maim on Hit
  monsters_hinder_on_hit: 'inder',  // [V:py] Monsters Hinder on Hit
  monsters_blind_on_hit: 'lind o',  // [V:py] Monsters Blind on Hit
  increased_rare_monsters: 'rare mo',  // [V:py] Increased Rare Monsters
  increased_magic_monsters: 'agic mo',  // [V:py] Increased Magic Monsters

  // ── Ground Effects ──────────────────────────────────────────────

  consecrated_ground: 'onsecr',  // [V:py] Consecrated Ground
  desecrated_ground: 'esecr',  // [V:py] Desecrated Ground
  shocked_ground: 'hocked g',  // [V:py] Shocked Ground
  chilled_ground: 'hilled g',  // [V:py] Chilled Ground
  burning_ground: 'urning g',  // [V:py] Burning Ground

  // ── Defence & Mitigation ────────────────────────────────────────

  reduced_max_resistances: 'um re',  // [V:py] Reduced Max Resistances
  reduced_block_less_armour: 'nce to b',  // [V:py] Reduced Block + Less Armour
  extra_energy_shield_from_life: 'ife as e',  // [V:py] Extra Energy Shield from Life
  avoid_elemental_ailments: 'oid ele',  // [V:py] Avoid Elemental Ailments
  cannot_inflict_exposure: 'posure',  // [V:py] Cannot Inflict Exposure
  chaos_elemental_resistances: 'haos re',  // [V:py] Chaos + Elemental Resistances
  players_less_area_of_effect: 'ss are',  // [V:py] Players Less Area of Effect

  // ── Boss Mods ───────────────────────────────────────────────────

  unique_bosses_possessed: 'poss',  // [V:game] Unique Bosses Possessed
  two_unique_bosses: 'o uniqu',  // [V:py] Two Unique Bosses

  // ── Monster Inhabitants ─────────────────────────────────────────

  area_contains_many_totems: 'otems',  // [V:py] Area Contains Many Totems
  area_has_increased_monster_variety: 'ariety',  // [V:py] Area Has Increased Monster Variety
  inhabited_by_cultists_of_kitava: 'itava',  // [V:py] Inhabited by Cultists of Kitava
  inhabited_by_ranged_monsters: 'ranged',  // [V:py] Inhabited by Ranged Monsters
  inhabited_by_lunaris_fanatics: 'unar',  // [V:py] Inhabited by Lunaris Fanatics
  inhabited_by_undead: 'ndead',  // [V:py] Inhabited by Undead
  inhabited_by_humanoids: 'umano',  // [V:py] Inhabited by Humanoids
  inhabited_by_goatmen: 'oatme',  // [V:py] Inhabited by Goatmen
  inhabited_by_skeletons: 'kelet',  // [V:py] Inhabited by Skeletons
  inhabited_by_solaris_fanatics: 'olari',  // [V:py] Inhabited by Solaris Fanatics
  inhabited_by_sea_witches: 'ea wi',  // [V:py] Inhabited by Sea Witches
  inhabited_by_demons: 'by dem',  // [V:py] Inhabited by Demons
  inhabited_by_abominations: 'bomin',  // [V:py] Inhabited by Abominations
  inhabited_by_animals: 'nimal',  // [V:py] Inhabited by Animals
  inhabited_by_ghosts: 'host',  // [V:py] Inhabited by Ghosts

  // ── Other Regular ───────────────────────────────────────────────

  avoid_poison_impale_bleed: 'mpale',  // [V:py] Avoid Poison/Impale/Bleed
  physical_damage_reduction: 'ysic',  // [V:py] Physical Damage Reduction
  more_monster_life: 're mon',  // [V:py] More Monster Life

  // ══════════════════════════════════════════════════════════════
  // UBER (nightmare/originator) MAP MODS
  // Tokens sourced from RegexBuilder (V:game) or UBER_MODS (V:uber)
  // ══════════════════════════════════════════════════════════════

  // ── Uber Mods ───────────────────────────────────────────────────

  uber_synthesis_boss: 'yn',  // [V:game] Synthesis Boss
  uber_20_max_resistances: 'um re',  // [V:game] -20% Max Resistances
  uber_50_monster_block_chance: 'k d',  // [V:game] +50% Monster Block Chance
  uber_rare_monsters_shaper_touched: '-t',  // [V:game] Rare Monsters Shaper-Touched
  uber_rare_monsters_1_modifier: '1 add',  // [V:py] Rare Monsters +1 Modifier
  uber_unstable_tentacle_fiends: 'nsta',  // [V:uber] Unstable Tentacle Fiends
  uber_frenzy_charge_max_frenzy: 'mum f',  // [V:game] Frenzy Charge + Max Frenzy
  uber_reflect_20_physical_elemental: 't 20',  // [V:game] Reflect 20% Physical + Elemental
  uber_penetrates_elemental_resistances: 'net',  // [V:game] Penetrates Elemental Resistances
  uber_skills_chain_terrain_chain: 'lid',  // [V:game] Skills Chain + Terrain Chain
  uber_grasping_vines_on_hit: 'rasp',  // [V:game] Grasping Vines on Hit
  uber_drowning_orbs: 'wni',  // [V:game] Drowning Orbs
  uber_random_elemental_damage: 'andom E',  // [V:uber] Random Elemental Damage
  uber_massive_all_resistances: 'uct',  // [V:game] Massive All Resistances
  uber_all_damage_can_ignite_freeze_shock: 'n ig',  // [V:game] All Damage Can Ignite/Freeze/Shock
  uber_less_flask_effect: 'sks',  // [V:game] Less Flask Effect
  uber_endurance_charges_max_endurance: 'm End',  // [V:game] Endurance Charges + Max Endurance
  uber_shrine_buff_on_unique_monsters: 'ne b',  // [V:game] Shrine Buff on Unique Monsters
  uber_triple_curse_vuln_temporal_elem: 'oral',  // [V:game] Triple Curse (Vuln/Temporal/Elem)
  uber_stunned_action_move_speed_floor: 'tun',  // [V:game] Stunned + Action/Move Speed Floor
  uber_searing_exarch_runes: 'rch',  // [V:game] Searing Exarch Runes
  uber_rare_monsters_temporarily_revive: 'evive',  // [V:uber] Rare Monsters Temporarily Revive
  uber_poison_duration_all_can_poison: 'an Poi',  // [V:uber] Poison + Duration + All Can Poison
  uber_bloodstained_sawblades: 'wb',  // [V:game] Bloodstained Sawblades
  uber_debuffs_expire_faster: 'deb',  // [V:game] Debuffs Expire Faster
  uber_reduced_leech_recovery: 'eech',  // [V:uber] Reduced Leech Recovery
  uber_rare_monsters_fracture_on_death: 'ractu',  // [V:uber] Rare Monsters Fracture on Death
  uber_flask_triggers_meteor: 'eor',  // [V:game] Flask Triggers Meteor
  uber_players_less_defences: 'fenc',  // [V:game] Players Less Defences
  uber_extra_projectiles_massive_aoe: '2 a',  // [V:game] Extra Projectiles + Massive AoE
  uber_power_charges_max_power: 'um p',  // [V:game] Power Charges + Max Power
  uber_labyrinth_hazards: 'az',  // [V:game] Labyrinth Hazards
  uber_rare_monsters_volatile_cores: 'vol',  // [V:game] Rare Monsters Volatile Cores
  uber_the_maven_interferes: 'mav',  // [V:game] The Maven Interferes
  uber_auras_affect_enemies: 'lies',  // [V:uber] Auras Affect Enemies
  uber_moving_marked_ground: 'rke',  // [V:game] Moving Marked Ground

  uber_extra_es_from_life: 'a Ma',  // [V:game] Buffered — Extra ES from Life (+35% maps)
  uber_suppress_spell_damage: 'o su',  // [V:game] Oppressive — Suppress Spell Damage (+35% maps)

} as const;

export type ModTokenId = keyof typeof MOD_TOKENS;
