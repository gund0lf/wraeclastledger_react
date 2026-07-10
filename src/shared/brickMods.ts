/**
 * brickMods.ts (src/shared) - single source of truth for the brick-mod catalogue.
 *
 * WP12: moved out of src/main/index.ts so BOTH processes share ONE definition
 * and the regex tokens live in exactly one place. electron-vite bundles main and
 * renderer separately but both can import from src/shared (the old "cannot import
 * across the process boundary" belief was wrong).
 *
 * Consumers:
 *   - src/main/index.ts (trade:get-brick-mods, ensureStatsLoaded needle matching)
 *   - modTokens.test.ts (alignment snapshot: proves no regexTerm changed in WP12)
 *
 * `regexTerm` is NO LONGER stored here - it is derived from MOD_TOKENS[id] via
 * brickRegexTerm(), so the short stash token for a mod is defined once, in
 * modTokens.ts. `needle`, `label`, `category` remain here (main-process-only:
 * needle resolves the PoE Trade stats API id; there is no MOD_TOKENS counterpart).
 *
 * Verification key on token choices lives in modTokens.ts; the inline notes below
 * record why each needle/token was chosen (kept verbatim from the original).
 */
import { MOD_TOKENS, ModTokenId } from './modTokens';

export interface BrickModDef {
  id:       ModTokenId;
  label:    string;
  needle:   string;
  category: 'regular' | 'nightmare';
}

export const BRICK_MOD_DEFS: BrickModDef[] = [
  // ── Regular ──
  { id: 'reflect_physical_damage', label: 'Reflect Physical Damage', needle: 'Monsters reflect #% of Physical Damage', category: 'regular' },
  { id: 'reflect_elemental_damage', label: 'Reflect Elemental Damage', needle: 'Monsters reflect #% of Elemental Damage', category: 'regular' },
  { id: 'reduced_non_curse_aura_effect', label: 'Reduced Non-Curse Aura Effect', needle: 'Non-Curse Auras', category: 'regular' },
  { id: 'reduced_max_resistances', label: 'Reduced Max Resistances', needle: 'to all maximum Resistances', category: 'regular' },
  { id: 'cannot_regenerate_life_mana_es', label: 'Cannot Regenerate Life/Mana/ES', needle: 'cannot Regenerate Life, Mana', category: 'regular' },
  { id: 'less_recovery_rate', label: 'Less Recovery Rate', needle: 'Recovery Rate of Life and Energy Shield', category: 'regular' },
  { id: 'cannot_be_leeched_from', label: 'Cannot Be Leeched From', needle: 'cannot be Leeched from', category: 'regular' },
  { id: 'high_crit_chance_multiplier', label: 'High Crit Chance + Multiplier', needle: 'Monster Critical Strike Multiplier', category: 'regular' },
  { id: 'extra_chaos_damage_withered', label: 'Extra Chaos Damage + Withered', needle: 'Physical Damage as Extra Chaos Damage', category: 'regular' },
  { id: 'extra_fire_damage', label: 'Extra Fire Damage', needle: 'extra Physical Damage as Fire', category: 'regular' },
  { id: 'extra_cold_damage', label: 'Extra Cold Damage', needle: 'extra Physical Damage as Cold', category: 'regular' },
  { id: 'extra_lightning_damage', label: 'Extra Lightning Damage', needle: 'extra Physical Damage as Lightning', category: 'regular' },
  { id: 'monsters_fire_extra_projectiles', label: 'Monsters Fire Extra Projectiles', needle: 'Monsters fire # additional Projectiles', category: 'regular' },
  { id: 'boss_damage_attack_speed', label: 'Boss Damage + Attack Speed', needle: 'Unique Boss deals #% increased Damage', category: 'regular' },
  { id: 'monster_speed_move_attack_cast', label: 'Monster Speed (Move/Attack/Cast)', needle: 'increased Monster Movement Speed', category: 'regular' },
  { id: 'boss_more_life_aoe', label: 'Boss More Life + AoE', needle: 'Unique Boss has #% increased Life', category: 'regular' },
  { id: 'monsters_increased_aoe', label: 'Monsters Increased AoE', needle: 'Monsters have #% increased Area of Effect', category: 'regular' },
  { id: 'avoid_poison_impale_bleed', label: 'Avoid Poison/Impale/Bleed', needle: 'chance to avoid Poison, Impale, and Bleeding', category: 'regular' },
  { id: 'monsters_poison_on_hit', label: 'Monsters Poison on Hit', needle: 'Monsters Poison on Hit', category: 'regular' },
  { id: 'skills_chain_additional_times', label: 'Skills Chain Additional Times', needle: 'Chain # additional times', category: 'regular' },
  { id: 'increased_monster_damage', label: 'Increased Monster Damage', needle: 'increased Monster Damage', category: 'regular' },
  { id: 'players_less_suppressed_spell_damage', label: 'Players Less Suppressed Spell Damage', needle: 'Prevent +#% of Suppressed Spell Damage', category: 'regular' },
  { id: 'monsters_increased_accuracy_rating', label: 'Monsters Increased Accuracy Rating', needle: 'Monsters have #% increased Accuracy Rating', category: 'regular' },
  { id: 'monsters_suppress_spell_damage_chance', label: 'Monsters Suppress Spell Damage Chance', needle: 'chance to Suppress Spell Damage', category: 'regular' },
  { id: 'less_curse_effect', label: 'Less Curse Effect', needle: 'less effect of Curses on Monsters', category: 'regular' },
  { id: 'cursed_with_enfeeble', label: 'Cursed with Enfeeble', needle: 'Cursed with Enfeeble', category: 'regular' },
  { id: 'cursed_with_vulnerability', label: 'Cursed with Vulnerability', needle: 'Cursed with Vulnerability', category: 'regular' },
  { id: 'cursed_with_temporal_chains', label: 'Cursed with Temporal Chains', needle: 'Cursed with Temporal Chains', category: 'regular' },
  { id: 'cursed_with_elemental_weakness', label: 'Cursed with Elemental Weakness', needle: 'Cursed with Elemental Weakness', category: 'regular' },
  { id: 'consecrated_ground', label: 'Consecrated Ground', needle: 'patches of Consecrated Ground', category: 'regular' },
  { id: 'desecrated_ground', label: 'Desecrated Ground', needle: 'patches of desecrated ground', category: 'regular' },
  { id: 'shocked_ground', label: 'Shocked Ground', needle: 'patches of Shocked Ground', category: 'regular' },
  { id: 'chilled_ground', label: 'Chilled Ground', needle: 'patches of Chilled Ground', category: 'regular' },
  { id: 'burning_ground', label: 'Burning Ground', needle: 'patches of Burning Ground', category: 'regular' },
  { id: 'reduced_block_less_armour', label: 'Reduced Block + Less Armour', needle: 'reduced Chance to Block', category: 'regular' },
  { id: 'reduced_crit_damage_taken', label: 'Reduced Crit Damage Taken', needle: 'reduced Extra Damage from Critical Strikes', category: 'regular' },
  { id: 'extra_energy_shield_from_life', label: 'Extra Energy Shield from Life', needle: 'Maximum Life as Extra Maximum Energy Shield', category: 'regular' },
  { id: 'reduced_flask_charges', label: 'Reduced Flask Charges', needle: 'reduced Flask Charges', category: 'regular' },
  { id: 'avoid_elemental_ailments', label: 'Avoid Elemental Ailments', needle: 'chance to Avoid Elemental Ailments', category: 'regular' },
  { id: 'physical_damage_reduction', label: 'Physical Damage Reduction', needle: 'Monster Physical Damage Reduction', category: 'regular' },
  { id: 'cannot_inflict_exposure', label: 'Cannot Inflict Exposure', needle: 'Players cannot inflict Exposure', category: 'regular' },
  { id: 'monsters_hexproof', label: 'Monsters Hexproof', needle: 'Monsters are Hexproof', category: 'regular' },
  { id: 'chaos_elemental_resistances', label: 'Chaos + Elemental Resistances', needle: 'Monster Chaos Resistance', category: 'regular' },
  { id: 'more_monster_life', label: 'More Monster Life', needle: 'more Monster Life', category: 'regular' },
  // KNOWN OVERLAP: 'tunn' also matches uber 'of the Juggernaut' (identical mod text). Both tiers are brick — intentional.
  { id: 'cannot_be_stunned', label: 'Cannot Be Stunned', needle: 'Monsters cannot be Stunned', category: 'regular' },
  { id: 'all_damage_ignites', label: 'All Damage Ignites', needle: 'All Monster Damage from Hits always Ignites', category: 'regular' },
  { id: 'impale_on_hit', label: 'Impale on Hit', needle: 'chance to Impale on Hit', category: 'regular' },
  { id: 'ignite_freeze_shock_chance', label: 'Ignite/Freeze/Shock Chance', needle: 'chance to Ignite, Freeze and Shock on Hit', category: 'regular' },
  // KNOWN OVERLAP: 'yers e' also matches uber 'of Transience' (100% faster vs 70% faster — same token, different values). Both are brick — intentional.
  { id: 'buffs_on_players_expire_faster', label: 'Buffs on Players Expire Faster', needle: 'Buffs on Players expire', category: 'regular' },
  { id: 'less_cooldown_recovery', label: 'Less Cooldown Recovery', needle: 'Cooldown Recovery', category: 'regular' },
  // KNOWN OVERLAP: 'poss' also matches uber 'Enthralled' (identical mod text, different quant/pack values). Both are brick — intentional.
  { id: 'unique_bosses_possessed', label: 'Unique Bosses Possessed', needle: 'Unique Bosses are Possessed', category: 'regular' },
  { id: 'two_unique_bosses', label: 'Two Unique Bosses', needle: 'Area contains two Unique Bosses', category: 'regular' },
  { id: 'cannot_be_taunted_slowed', label: 'Cannot Be Taunted/Slowed', needle: 'cannot be Taunted', category: 'regular' },
  { id: 'players_less_accuracy', label: 'Players Less Accuracy', needle: 'Accuracy Rating', category: 'regular' },
  { id: 'monsters_steal_charges', label: 'Monsters Steal Charges', needle: 'steal Power, Frenzy and Endurance charges', category: 'regular' },
  // MINOR OVERLAP: 'renz' also matches 'Monsters Steal Charges' (steal Power, Frenzy... — 'Frenzy' contains 'renz'). Steal-charges is also brick; overlap is acceptable.
  { id: 'monsters_gain_frenzy_charges', label: 'Monsters Gain Frenzy Charges', needle: 'gain a Frenzy Charge on Hit', category: 'regular' },
  { id: 'monsters_gain_endurance_charges', label: 'Monsters Gain Endurance Charges', needle: 'gain an Endurance Charge on Hit', category: 'regular' },
  { id: 'monsters_gain_power_charges', label: 'Monsters Gain Power Charges', needle: 'gain a Power Charge on Hit', category: 'regular' },
  { id: 'players_less_area_of_effect', label: 'Players Less Area of Effect', needle: 'Players have #% less Area of Effect', category: 'regular' },
  { id: 'monsters_maim_on_hit', label: 'Monsters Maim on Hit', needle: 'Maim on Hit', category: 'regular' },
  { id: 'monsters_hinder_on_hit', label: 'Monsters Hinder on Hit', needle: 'Hinder on Hit', category: 'regular' },
  { id: 'monsters_blind_on_hit', label: 'Monsters Blind on Hit', needle: 'Blind on Hit', category: 'regular' },
  { id: 'area_contains_many_totems', label: 'Area Contains Many Totems', needle: 'Area contains many Totems', category: 'regular' },
  { id: 'area_has_increased_monster_variety', label: 'Area Has Increased Monster Variety', needle: 'Area has increased monster variety', category: 'regular' },
  { id: 'inhabited_by_cultists_of_kitava', label: 'Inhabited by Cultists of Kitava', needle: 'Area is inhabited by Cultists of Kitava', category: 'regular' },
  { id: 'inhabited_by_ranged_monsters', label: 'Inhabited by Ranged Monsters', needle: 'Area is inhabited by ranged monsters', category: 'regular' },
  { id: 'inhabited_by_lunaris_fanatics', label: 'Inhabited by Lunaris Fanatics', needle: 'Area is inhabited by Lunaris fanatics', category: 'regular' },
  { id: 'inhabited_by_undead', label: 'Inhabited by Undead', needle: 'Area is inhabited by Undead', category: 'regular' },
  { id: 'inhabited_by_humanoids', label: 'Inhabited by Humanoids', needle: 'Area is inhabited by Humanoids', category: 'regular' },
  { id: 'inhabited_by_goatmen', label: 'Inhabited by Goatmen', needle: 'Area is inhabited by Goatmen', category: 'regular' },
  { id: 'inhabited_by_skeletons', label: 'Inhabited by Skeletons', needle: 'Area is inhabited by Skeletons', category: 'regular' },
  { id: 'inhabited_by_solaris_fanatics', label: 'Inhabited by Solaris Fanatics', needle: 'Area is inhabited by Solaris fanatics', category: 'regular' },
  { id: 'inhabited_by_sea_witches', label: 'Inhabited by Sea Witches', needle: 'Area is inhabited by Sea Witches', category: 'regular' },
  { id: 'inhabited_by_demons', label: 'Inhabited by Demons', needle: 'Area is inhabited by Demons', category: 'regular' },
  { id: 'inhabited_by_abominations', label: 'Inhabited by Abominations', needle: 'Area is inhabited by Abominations', category: 'regular' },
  { id: 'inhabited_by_animals', label: 'Inhabited by Animals', needle: 'Area is inhabited by Animals', category: 'regular' },
  { id: 'inhabited_by_ghosts', label: 'Inhabited by Ghosts', needle: 'Area is inhabited by Ghosts', category: 'regular' },
  { id: 'increased_rare_monsters', label: 'Increased Rare Monsters', needle: 'increased number of Rare Monsters', category: 'regular' },
  { id: 'increased_magic_monsters', label: 'Increased Magic Monsters', needle: 'increased Magic Monsters', category: 'regular' },

  // ── Nightmare ──
  { id: 'uber_synthesis_boss', label: 'Synthesis Boss', needle: 'accompanied by a Synthesis Boss', category: 'nightmare' },
  { id: 'uber_20_max_resistances', label: '-20% Max Resistances', needle: 'Players have -20% to all maximum Resistances', category: 'nightmare' },
  { id: 'uber_50_monster_block_chance', label: '+50% Monster Block Chance', needle: 'Chance to Block Attack Damage', category: 'nightmare' },
  { id: 'uber_rare_monsters_shaper_touched', label: 'Rare Monsters Shaper-Touched', needle: 'Shaper-Touched', category: 'nightmare' },
  // FIXED: was 'ditio' which collides with 'additional Projectiles' and 'additional times' (any mod containing 'additional').
  // '1 add' uniquely targets '+1 additional Modifier' vs '2 additional Projectiles' / '3 additional times'.
  { id: 'uber_rare_monsters_1_modifier', label: 'Rare Monsters +1 Modifier', needle: 'additional Modifier', category: 'nightmare' },
  { id: 'uber_unstable_tentacle_fiends', label: 'Unstable Tentacle Fiends', needle: 'Unstable Tentacle Fiends', category: 'nightmare' },
  // 'm f' from 'Maximum Frenzy' — position 6-8 of 'Maximum': 'm[space]F'. Clean: 'gain a Frenzy' has no 'm' before the 'F'.
  { id: 'uber_frenzy_charge_max_frenzy', label: 'Frenzy Charge + Max Frenzy', needle: 'Maximum Frenzy Charges', category: 'nightmare' },
  { id: 'uber_reflect_20_physical_elemental', label: 'Reflect 20% Physical + Elemental', needle: 'Monsters reflect 20% of Physical Damage', category: 'nightmare' },
  { id: 'uber_penetrates_elemental_resistances', label: 'Penetrates Elemental Resistances', needle: 'Penetrates', category: 'nightmare' },
  { id: 'uber_skills_chain_terrain_chain', label: 'Skills Chain + Terrain Chain', needle: 'Chain when colliding', category: 'nightmare' },
  { id: 'uber_grasping_vines_on_hit', label: 'Grasping Vines on Hit', needle: 'Grasping Vine', category: 'nightmare' },
  { id: 'uber_drowning_orbs', label: 'Drowning Orbs', needle: 'Drowning Orbs', category: 'nightmare' },
  { id: 'uber_random_elemental_damage', label: 'Random Elemental Damage', needle: 'Extra Damage of a random Element', category: 'nightmare' },
  { id: 'uber_massive_all_resistances', label: 'Massive All Resistances', needle: 'Monster Physical Damage Reduction', category: 'nightmare' },
  // FIXED: 'll dam' was wrong ('All Monster Damage' has 'll M' not 'll D'). 'n ig' from 'can Ignite' — aligns with uber token.
  { id: 'uber_all_damage_can_ignite_freeze_shock', label: 'All Damage Can Ignite/Freeze/Shock', needle: 'All Monster Damage can Ignite, Freeze and Shock', category: 'nightmare' },
  // FIXED: 'sk ef' was wrong ('Flasks applied' has 'sks a' not 'sks e'). 'sks' from 'Flasks' — aligns with uber token.
  { id: 'uber_less_flask_effect', label: 'Less Flask Effect', needle: 'Flasks applied to them', category: 'nightmare' },
  // 'm end' from 'Maximum Endurance' — 'm[space]End' at positions 6-10. Clean: 'gain an Endurance' has 'an End' not 'm End'.
  { id: 'uber_endurance_charges_max_endurance', label: 'Endurance Charges + Max Endurance', needle: 'Maximum Endurance Charges', category: 'nightmare' },
  { id: 'uber_shrine_buff_on_unique_monsters', label: 'Shrine Buff on Unique Monsters', needle: 'random Shrine Buff', category: 'nightmare' },
  { id: 'uber_triple_curse_vuln_temporal_elem', label: 'Triple Curse (Vuln/Temporal/Elem)', needle: 'Cursed with Vulnerability', category: 'nightmare' },
  // 'n sp' from 'Action Speed' — 'action[space]speed' has 'n[space]sp' at positions 5-8.
  // Clean: 'Movement Speed' = 'nt[space]sp' (not 'n[space]sp'); 'Modifier'/'modified' contain no 'n sp'.
  // Catches both uber (Juggernaut: Stunned+ActionSpd) and regular (Unstoppable: Taunted+ActionSpd) — same mod slot.
  { id: 'uber_stunned_action_move_speed_floor', label: 'Stunned + Action/Move Speed Floor', needle: 'Action Speed cannot be modified', category: 'nightmare' },
  { id: 'uber_searing_exarch_runes', label: 'Searing Exarch Runes', needle: 'Runes of the Searing Exarch', category: 'nightmare' },
  { id: 'uber_rare_monsters_temporarily_revive', label: 'Rare Monsters Temporarily Revive', needle: 'Temporarily Revive on death', category: 'nightmare' },
  // FIXED: 'oisona' never appeared in 'Poison Duration'. 'on du' from 'Poison Duration' — unique.
  { id: 'uber_poison_duration_all_can_poison', label: 'Poison + Duration + All Can Poison', needle: 'increased Poison Duration', category: 'nightmare' },
  { id: 'uber_bloodstained_sawblades', label: 'Bloodstained Sawblades', needle: 'Bloodstained Sawblades', category: 'nightmare' },
  { id: 'uber_debuffs_expire_faster', label: 'Debuffs Expire Faster', needle: 'Debuffs on Monsters expire', category: 'nightmare' },
  // FIXED: 'each re' was wrong ('Leech' is e,e,c,h — no 'a'). 'eech' from 'Leech' — aligns with uber token.
  { id: 'uber_reduced_leech_recovery', label: 'Reduced Leech Recovery', needle: 'Recovery per second from Leech', category: 'nightmare' },
  { id: 'uber_rare_monsters_fracture_on_death', label: 'Rare Monsters Fracture on Death', needle: 'Fracture on death', category: 'nightmare' },
  { id: 'uber_flask_triggers_meteor', label: 'Flask Triggers Meteor', needle: 'targeted by a Meteor', category: 'nightmare' },
  { id: 'uber_players_less_defences', label: 'Players Less Defences', needle: 'more Defences', category: 'nightmare' },
  { id: 'uber_extra_projectiles_massive_aoe', label: 'Extra Projectiles + Massive AoE', needle: 'additional Projectiles', category: 'nightmare' },
  // 'm po' from 'Maximum Power' — 'm[space]Po' at positions 6-9. Clean: 'gain a Power Charge' has 'a Po' not 'm Po'.
  { id: 'uber_power_charges_max_power', label: 'Power Charges + Max Power', needle: 'Maximum Power Charges', category: 'nightmare' },
  { id: 'uber_labyrinth_hazards', label: 'Labyrinth Hazards', needle: 'Labyrinth Hazards', category: 'nightmare' },
  { id: 'uber_rare_monsters_volatile_cores', label: 'Rare Monsters Volatile Cores', needle: 'Volatile Core', category: 'nightmare' },
  { id: 'uber_the_maven_interferes', label: 'The Maven Interferes', needle: 'The Maven interferes', category: 'nightmare' },
  { id: 'uber_auras_affect_enemies', label: 'Auras Affect Enemies', needle: 'Auras from Player Skills which affect Allies also affect Enemies', category: 'nightmare' },
  { id: 'uber_moving_marked_ground', label: 'Moving Marked Ground', needle: 'patches of moving Marked Ground', category: 'nightmare' },
];

/** The short stash-highlight token for a brick mod, sourced from MOD_TOKENS
 *  (single source of truth). */
export const brickRegexTerm = (def: BrickModDef): string => MOD_TOKENS[def.id];
