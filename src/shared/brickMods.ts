/**
 * brickMods.ts (src/shared) - single source of truth for the brick-mod catalogue.
 *
 * WP12: moved out of src/main/index.ts so BOTH processes share ONE definition
 * and the regex tokens live in exactly one place. electron-vite bundles main and
 * renderer separately but both can import from src/shared (the old "cannot import
 * across the process boundary" belief was wrong).
 *
 * Consumers:
 *   - src/main/index.ts (trade:get-brick-mods, exact Trade-stat resolution)
 *   - modTokens.test.ts (alignment snapshot: proves no regexTerm changed in WP12)
 *
 * `regexTerm` is NO LONGER stored here - it is derived from MOD_TOKENS[id] via
 * brickRegexTerm(), so the short stash token for a mod is defined once, in
 * modTokens.ts. Trade patterns are exact normalized Trade-API labels. A statId
 * tie-breaker appears only where the API exposes byte-identical active/obsolete
 * entries that text alone cannot distinguish.
 *
 * Verification key on token choices lives in modTokens.ts; the inline notes below
 * record why each stash token was chosen (kept verbatim from the original).
 */
import { MOD_TOKENS, ModTokenId } from './modTokens';

export interface BrickModDef {
  id:       ModTokenId;
  label:    string;
  tradePatterns: readonly BrickTradePattern[];
  category: 'regular' | 'nightmare';
}

export interface BrickTradePattern {
  text: string;
  statId?: string;
}

export interface TradeStatEntry {
  id: string;
  text: string;
}

export interface ResolvedBrickTradeStat {
  def: BrickModDef;
  statIds: string[];
}

export interface UnavailableBrickTradeStat {
  id: ModTokenId;
  label: string;
  expectedCount: number;
  actualCount: number;
}

export const BRICK_MOD_DEFS: BrickModDef[] = [
  // ── Regular ──
  { id: 'thorns_reflection', label: 'Thorns Reflection (all tiers)', tradePatterns: [{ text: "Rare Monsters have Elemental Thorns reflecting # Elemental Damage" }, { text: "Rare Monsters have Physical Thorns reflecting # Physical Damage" }], category: 'regular' },
  { id: 'reduced_non_curse_aura_effect', label: 'Reduced Non-Curse Aura Effect', tradePatterns: [{ text: "Players have #% increased effect of Non-Curse Auras from Skills" }], category: 'regular' },
  { id: 'reduced_max_resistances', label: 'Reduced Max Resistances', tradePatterns: [{ text: "Players have #% to all maximum Resistances" }], category: 'regular' },
  { id: 'cannot_regenerate_life_mana_es', label: 'Cannot Regenerate Life/Mana/ES', tradePatterns: [{ text: "Players cannot Regenerate Life, Mana or Energy Shield" }], category: 'regular' },
  { id: 'less_recovery_rate', label: 'Players: Less Life/ES Recovery Rate', tradePatterns: [{ text: "Players have #% less Recovery Rate of Life and Energy Shield" }], category: 'regular' },
  { id: 'cannot_be_leeched_from', label: 'Cannot Be Leeched From', tradePatterns: [{ text: "Monsters cannot be Leeched from" }], category: 'regular' },
  { id: 'high_crit_chance_multiplier', label: 'High Crit Chance + Multiplier', tradePatterns: [{ text: "+#% to Monster Critical Strike Multiplier" }], category: 'regular' },
  { id: 'extra_chaos_damage_withered', label: 'Extra Chaos Damage + Withered', tradePatterns: [{ text: "Monsters gain #% of their Physical Damage as Extra Chaos Damage" }], category: 'regular' },
  { id: 'extra_fire_damage', label: 'Extra Fire Damage', tradePatterns: [{ text: "Monsters deal #% extra Physical Damage as Fire" }], category: 'regular' },
  { id: 'extra_cold_damage', label: 'Extra Cold Damage', tradePatterns: [{ text: "Monsters deal #% extra Physical Damage as Cold" }], category: 'regular' },
  { id: 'extra_lightning_damage', label: 'Extra Lightning Damage', tradePatterns: [{ text: "Monsters deal #% extra Physical Damage as Lightning" }], category: 'regular' },
  { id: 'monsters_fire_extra_projectiles', label: 'Monsters Fire Extra Projectiles', tradePatterns: [{ text: "Monsters fire # additional Projectiles" }], category: 'regular' },
  { id: 'boss_damage_attack_speed', label: 'Boss Damage + Attack Speed', tradePatterns: [{ text: "Unique Boss deals #% increased Damage" }], category: 'regular' },
  { id: 'monster_speed_move_attack_cast', label: 'Monster Speed (Move/Attack/Cast)', tradePatterns: [{ text: "#% increased Monster Movement Speed" }], category: 'regular' },
  { id: 'boss_more_life_aoe', label: 'Boss More Life + AoE', tradePatterns: [{ text: "Unique Boss has #% increased Life" }], category: 'regular' },
  { id: 'monsters_increased_aoe', label: 'Monsters Increased AoE', tradePatterns: [{ text: "Monsters have #% increased Area of Effect" }], category: 'regular' },
  { id: 'avoid_poison_impale_bleed', label: 'Avoid Poison/Impale/Bleed', tradePatterns: [{ text: "Monsters have a #% chance to avoid Poison, Impale, and Bleeding" }], category: 'regular' },
  { id: 'monsters_poison_on_hit', label: 'Monsters Poison on Hit', tradePatterns: [{ text: "Monsters Poison on Hit", statId: "explicit.stat_3350803563" }], category: 'regular' },
  { id: 'skills_chain_additional_times', label: 'Skills Chain Additional Times', tradePatterns: [{ text: "Monsters' skills Chain # additional times" }], category: 'regular' },
  { id: 'increased_monster_damage', label: 'Increased Monster Damage', tradePatterns: [{ text: "#% increased Monster Damage" }], category: 'regular' },
  { id: 'players_less_suppressed_spell_damage', label: 'Players Less Suppressed Spell Damage', tradePatterns: [{ text: "Players Prevent +#% of Suppressed Spell Damage" }], category: 'regular' },
  { id: 'monsters_increased_accuracy_rating', label: 'Monsters Increased Accuracy Rating', tradePatterns: [{ text: "Monsters have #% increased Accuracy Rating" }], category: 'regular' },
  { id: 'monsters_suppress_spell_damage_chance', label: 'Monsters Suppress Spell Damage Chance', tradePatterns: [{ text: "Monsters have +#% chance to Suppress Spell Damage" }], category: 'regular' },
  { id: 'less_curse_effect', label: 'Less Curse Effect', tradePatterns: [{ text: "#% less effect of Curses on Monsters" }], category: 'regular' },
  { id: 'cursed_with_enfeeble', label: 'Cursed with Enfeeble', tradePatterns: [{ text: "Players are Cursed with Enfeeble" }], category: 'regular' },
  { id: 'cursed_with_vulnerability', label: 'Cursed with Vulnerability', tradePatterns: [{ text: "Players are Cursed with Vulnerability" }], category: 'regular' },
  { id: 'cursed_with_temporal_chains', label: 'Cursed with Temporal Chains', tradePatterns: [{ text: "Players are Cursed with Temporal Chains" }], category: 'regular' },
  { id: 'cursed_with_elemental_weakness', label: 'Cursed with Elemental Weakness', tradePatterns: [{ text: "Players are Cursed with Elemental Weakness" }], category: 'regular' },
  { id: 'consecrated_ground', label: 'Consecrated Ground', tradePatterns: [{ text: "Area has patches of Consecrated Ground" }], category: 'regular' },
  { id: 'desecrated_ground', label: 'Desecrated Ground', tradePatterns: [{ text: "Area has patches of desecrated ground" }], category: 'regular' },
  { id: 'shocked_ground', label: 'Shocked Ground', tradePatterns: [{ text: "Area has patches of Shocked Ground which increase Damage taken by #%" }], category: 'regular' },
  { id: 'chilled_ground', label: 'Chilled Ground', tradePatterns: [{ text: "Area has patches of Chilled Ground", statId: "explicit.stat_349586058" }], category: 'regular' },
  { id: 'burning_ground', label: 'Burning Ground', tradePatterns: [{ text: "Area has patches of Burning Ground", statId: "explicit.stat_133340941" }], category: 'regular' },
  { id: 'reduced_block_less_armour', label: 'Reduced Block + Less Armour', tradePatterns: [{ text: "Players have #% reduced Chance to Block" }], category: 'regular' },
  { id: 'reduced_crit_damage_taken', label: 'Reduced Crit Damage Taken', tradePatterns: [{ text: "Monsters take #% reduced Extra Damage from Critical Strikes" }], category: 'regular' },
  { id: 'extra_energy_shield_from_life', label: 'Extra Energy Shield from Life', tradePatterns: [{ text: "Monsters gain #% of Maximum Life as Extra Maximum Energy Shield" }], category: 'regular' },
  { id: 'reduced_flask_charges', label: 'Reduced Flask Charges', tradePatterns: [{ text: "Players gain #% reduced Flask Charges" }], category: 'regular' },
  { id: 'avoid_elemental_ailments', label: 'Avoid Elemental Ailments', tradePatterns: [{ text: "Monsters have #% chance to Avoid Elemental Ailments" }], category: 'regular' },
  { id: 'physical_damage_reduction', label: 'Physical Damage Reduction', tradePatterns: [{ text: "+#% Monster Physical Damage Reduction" }], category: 'regular' },
  { id: 'cannot_inflict_exposure', label: 'Cannot Inflict Exposure', tradePatterns: [{ text: "Players cannot inflict Exposure" }], category: 'regular' },
  { id: 'monsters_hexproof', label: 'Monsters Hexproof', tradePatterns: [{ text: "Monsters are Hexproof" }], category: 'regular' },
  { id: 'chaos_elemental_resistances', label: 'Chaos + Elemental Resistances', tradePatterns: [{ text: "+#% Monster Chaos Resistance" }], category: 'regular' },
  { id: 'more_monster_life', label: 'More Monster Life', tradePatterns: [{ text: "#% more Monster Life", statId: "explicit.stat_95249895" }], category: 'regular' },
  // KNOWN OVERLAP: 'tunn' also matches uber 'of the Juggernaut' (identical mod text). Both tiers are brick — intentional.
  { id: 'cannot_be_stunned', label: 'Cannot Be Stunned', tradePatterns: [{ text: "Monsters cannot be Stunned" }], category: 'regular' },
  { id: 'all_damage_ignites', label: 'All Damage Ignites', tradePatterns: [{ text: "All Monster Damage from Hits always Ignites" }], category: 'regular' },
  { id: 'impale_on_hit', label: 'Impale on Hit', tradePatterns: [{ text: "Monsters' Attacks have #% chance to Impale on Hit" }], category: 'regular' },
  { id: 'ignite_freeze_shock_chance', label: 'Ignite/Freeze/Shock Chance', tradePatterns: [{ text: "Monsters have a #% chance to Ignite, Freeze and Shock on Hit" }], category: 'regular' },
  // KNOWN OVERLAP: 'yers e' also matches uber 'of Transience' (100% faster vs 70% faster — same token, different values). Both are brick — intentional.
  { id: 'buffs_on_players_expire_faster', label: 'Buffs on Players Expire Faster', tradePatterns: [{ text: "Buffs on Players expire #% faster" }], category: 'regular' },
  { id: 'less_cooldown_recovery', label: 'Less Cooldown Recovery', tradePatterns: [{ text: "Players have #% more Cooldown Recovery Rate" }], category: 'regular' },
  // KNOWN OVERLAP: 'poss' also matches uber 'Enthralled' (identical mod text, different quant/pack values). Both are brick — intentional.
  { id: 'unique_bosses_possessed', label: 'Unique Bosses Possessed', tradePatterns: [{ text: "Unique Bosses are Possessed" }], category: 'regular' },
  { id: 'two_unique_bosses', label: 'Two Unique Bosses', tradePatterns: [{ text: "Area contains two Unique Bosses" }], category: 'regular' },
  { id: 'cannot_be_taunted_slowed', label: 'Cannot Be Taunted/Slowed', tradePatterns: [{ text: "Monsters cannot be Taunted" }], category: 'regular' },
  // GGG's Trade label is historically inverted from the player-facing mod name.
  // Keep the product label and exact API pattern independent; do not derive one from the other.
  { id: 'players_less_accuracy', label: 'Players Less Accuracy', tradePatterns: [{ text: "Players have #% more Accuracy Rating" }], category: 'regular' },
  { id: 'monsters_steal_charges', label: 'Monsters Steal Charges', tradePatterns: [{ text: "Monsters have #% chance to steal Power, Frenzy and Endurance charges on Hit" }], category: 'regular' },
  // MINOR OVERLAP: 'renz' also matches 'Monsters Steal Charges' (steal Power, Frenzy... — 'Frenzy' contains 'renz'). Steal-charges is also brick; overlap is acceptable.
  { id: 'monsters_gain_frenzy_charges', label: 'Monsters Gain Frenzy Charges', tradePatterns: [{ text: "Monsters have #% chance to gain a Frenzy Charge on Hit" }], category: 'regular' },
  { id: 'monsters_gain_endurance_charges', label: 'Monsters Gain Endurance Charges', tradePatterns: [{ text: "Monsters have #% chance to gain an Endurance Charge on Hit" }], category: 'regular' },
  { id: 'monsters_gain_power_charges', label: 'Monsters Gain Power Charges', tradePatterns: [{ text: "Monsters have #% chance to gain a Power Charge on Hit" }], category: 'regular' },
  { id: 'players_less_area_of_effect', label: 'Players Less Area of Effect', tradePatterns: [{ text: "Players have #% less Area of Effect" }], category: 'regular' },
  { id: 'monsters_maim_on_hit', label: 'Monsters Maim on Hit', tradePatterns: [{ text: "Monsters have #% chance to Maim on Hit with Attacks" }], category: 'regular' },
  { id: 'monsters_hinder_on_hit', label: 'Monsters Hinder on Hit', tradePatterns: [{ text: "Monsters have #% chance to Hinder on Hit with Spells" }], category: 'regular' },
  { id: 'monsters_blind_on_hit', label: 'Monsters Blind on Hit', tradePatterns: [{ text: "Monsters have #% chance to Blind on Hit" }], category: 'regular' },
  { id: 'area_contains_many_totems', label: 'Area Contains Many Totems', tradePatterns: [{ text: "Area contains many Totems" }], category: 'regular' },
  { id: 'area_has_increased_monster_variety', label: 'Area Has Increased Monster Variety', tradePatterns: [{ text: "Area has increased monster variety" }], category: 'regular' },
  { id: 'inhabited_by_cultists_of_kitava', label: 'Inhabited by Cultists of Kitava', tradePatterns: [{ text: "Area is inhabited by Cultists of Kitava" }], category: 'regular' },
  { id: 'inhabited_by_ranged_monsters', label: 'Inhabited by Ranged Monsters', tradePatterns: [{ text: "Area is inhabited by ranged monsters" }], category: 'regular' },
  { id: 'inhabited_by_lunaris_fanatics', label: 'Inhabited by Lunaris Fanatics', tradePatterns: [{ text: "Area is inhabited by Lunaris fanatics", statId: "explicit.stat_3134632618" }], category: 'regular' },
  { id: 'inhabited_by_undead', label: 'Inhabited by Undead', tradePatterns: [{ text: "Area is inhabited by Undead" }], category: 'regular' },
  { id: 'inhabited_by_humanoids', label: 'Inhabited by Humanoids', tradePatterns: [{ text: "Area is inhabited by Humanoids" }], category: 'regular' },
  { id: 'inhabited_by_goatmen', label: 'Inhabited by Goatmen', tradePatterns: [{ text: "Area is inhabited by Goatmen" }], category: 'regular' },
  { id: 'inhabited_by_skeletons', label: 'Inhabited by Skeletons', tradePatterns: [{ text: "Area is inhabited by Skeletons" }], category: 'regular' },
  { id: 'inhabited_by_solaris_fanatics', label: 'Inhabited by Solaris Fanatics', tradePatterns: [{ text: "Area is inhabited by Solaris fanatics", statId: "explicit.stat_2457517302" }], category: 'regular' },
  { id: 'inhabited_by_sea_witches', label: 'Inhabited by Sea Witches', tradePatterns: [{ text: "Area is inhabited by Sea Witches and their Spawn" }], category: 'regular' },
  { id: 'inhabited_by_demons', label: 'Inhabited by Demons', tradePatterns: [{ text: "Area is inhabited by Demons" }], category: 'regular' },
  { id: 'inhabited_by_abominations', label: 'Inhabited by Abominations', tradePatterns: [{ text: "Area is inhabited by Abominations" }], category: 'regular' },
  { id: 'inhabited_by_animals', label: 'Inhabited by Animals', tradePatterns: [{ text: "Area is inhabited by Animals" }], category: 'regular' },
  { id: 'inhabited_by_ghosts', label: 'Inhabited by Ghosts', tradePatterns: [{ text: "Area is inhabited by Ghosts" }], category: 'regular' },
  { id: 'increased_rare_monsters', label: 'Increased Rare Monsters', tradePatterns: [{ text: "#% increased number of Rare Monsters" }], category: 'regular' },
  { id: 'increased_magic_monsters', label: 'Increased Magic Monsters', tradePatterns: [{ text: "#% increased Magic Monsters" }], category: 'regular' },

  // ── Nightmare ──
  { id: 'uber_synthesis_boss', label: 'Synthesis Boss', tradePatterns: [{ text: "Map Boss is accompanied by a Synthesis Boss" }], category: 'nightmare' },
  { id: 'uber_20_max_resistances', label: '-20% Max Resistances', tradePatterns: [{ text: "Players have #% to all maximum Resistances" }], category: 'nightmare' },
  { id: 'uber_50_monster_block_chance', label: '+50% Monster Block Chance', tradePatterns: [{ text: "Monsters have +#% Chance to Block Attack Damage" }], category: 'nightmare' },
  { id: 'uber_rare_monsters_shaper_touched', label: 'Rare Monsters Shaper-Touched', tradePatterns: [{ text: "Rare monsters in area are Shaper-Touched" }], category: 'nightmare' },
  // FIXED: was 'ditio' which collides with 'additional Projectiles' and 'additional times' (any mod containing 'additional').
  // '1 add' uniquely targets '+1 additional Modifier' vs '2 additional Projectiles' / '3 additional times'.
  { id: 'uber_rare_monsters_1_modifier', label: 'Rare Monsters +1 Modifier', tradePatterns: [{ text: "Rare Monsters each have # additional Modifier" }], category: 'nightmare' },
  { id: 'uber_unstable_tentacle_fiends', label: 'Unstable Tentacle Fiends', tradePatterns: [{ text: "Area contains Unstable Tentacle Fiends" }], category: 'nightmare' },
  // 'm f' from 'Maximum Frenzy' — position 6-8 of 'Maximum': 'm[space]F'. Clean: 'gain a Frenzy' has no 'm' before the 'F'.
  { id: 'uber_frenzy_charge_max_frenzy', label: 'Frenzy Charge + Max Frenzy', tradePatterns: [{ text: "Monsters have +# to Maximum Frenzy Charges" }], category: 'nightmare' },
  { id: 'uber_penetrates_elemental_resistances', label: 'Penetrates Elemental Resistances', tradePatterns: [{ text: "Monster Damage Penetrates #% Elemental Resistances" }], category: 'nightmare' },
  { id: 'uber_skills_chain_terrain_chain', label: 'Skills Chain + Terrain Chain', tradePatterns: [{ text: "Monsters' Projectiles have #% chance to be able to Chain when colliding with Terrain" }], category: 'nightmare' },
  { id: 'uber_grasping_vines_on_hit', label: 'Grasping Vines on Hit', tradePatterns: [{ text: "Monsters inflict # Grasping Vine on Hit" }], category: 'nightmare' },
  { id: 'uber_drowning_orbs', label: 'Drowning Orbs', tradePatterns: [{ text: "Area contains Drowning Orbs" }], category: 'nightmare' },
  { id: 'uber_random_elemental_damage', label: 'Random Elemental Damage', tradePatterns: [{ text: "Monsters gain #% of their Physical Damage as Extra Damage of a random Element" }], category: 'nightmare' },
  { id: 'uber_massive_all_resistances', label: 'Massive All Resistances', tradePatterns: [{ text: "+#% Monster Physical Damage Reduction" }], category: 'nightmare' },
  // FIXED: 'll dam' was wrong ('All Monster Damage' has 'll M' not 'll D'). 'n ig' from 'can Ignite' — aligns with uber token.
  { id: 'uber_all_damage_can_ignite_freeze_shock', label: 'All Damage Can Ignite/Freeze/Shock', tradePatterns: [{ text: "All Monster Damage can Ignite, Freeze and Shock" }], category: 'nightmare' },
  // FIXED: 'sk ef' was wrong ('Flasks applied' has 'sks a' not 'sks e'). 'sks' from 'Flasks' — aligns with uber token.
  { id: 'uber_less_flask_effect', label: 'Less Flask Effect', tradePatterns: [{ text: "Players have #% more effect of Flasks applied to them" }], category: 'nightmare' },
  // 'm end' from 'Maximum Endurance' — 'm[space]End' at positions 6-10. Clean: 'gain an Endurance' has 'an End' not 'm End'.
  { id: 'uber_endurance_charges_max_endurance', label: 'Endurance Charges + Max Endurance', tradePatterns: [{ text: "Monsters have +# to Maximum Endurance Charges" }], category: 'nightmare' },
  { id: 'uber_shrine_buff_on_unique_monsters', label: 'Shrine Buff on Unique Monsters', tradePatterns: [{ text: "Unique Monsters have a random Shrine Buff" }], category: 'nightmare' },
  { id: 'uber_triple_curse_vuln_temporal_elem', label: 'Triple Curse (Vuln/Temporal/Elem)', tradePatterns: [{ text: "Players are Cursed with Vulnerability" }], category: 'nightmare' },
  // 'n sp' from 'Action Speed' — 'action[space]speed' has 'n[space]sp' at positions 5-8.
  // Clean: 'Movement Speed' = 'nt[space]sp' (not 'n[space]sp'); 'Modifier'/'modified' contain no 'n sp'.
  // Catches both uber (Juggernaut: Stunned+ActionSpd) and regular (Unstoppable: Taunted+ActionSpd) — same mod slot.
  { id: 'uber_stunned_action_move_speed_floor', label: 'Stunned + Action/Move Speed Floor', tradePatterns: [{ text: "Monsters' Action Speed cannot be modified to below Base Value\nMonsters' Movement Speed cannot be modified to below Base Value" }], category: 'nightmare' },
  { id: 'uber_searing_exarch_runes', label: 'Searing Exarch Runes', tradePatterns: [{ text: "Area contains Runes of the Searing Exarch" }], category: 'nightmare' },
  { id: 'uber_rare_monsters_temporarily_revive', label: 'Rare Monsters Temporarily Revive', tradePatterns: [{ text: "Rare monsters in area Temporarily Revive on death" }], category: 'nightmare' },
  // FIXED: 'oisona' never appeared in 'Poison Duration'. 'on du' from 'Poison Duration' — unique.
  { id: 'uber_poison_duration_all_can_poison', label: 'Poison + Duration + All Can Poison', tradePatterns: [{ text: "Monsters have #% increased Poison Duration" }], category: 'nightmare' },
  { id: 'uber_bloodstained_sawblades', label: 'Bloodstained Sawblades', tradePatterns: [{ text: "Players are assaulted by Bloodstained Sawblades" }], category: 'nightmare' },
  { id: 'uber_debuffs_expire_faster', label: 'Debuffs Expire Faster', tradePatterns: [{ text: "Debuffs on Monsters expire #% faster" }], category: 'nightmare' },
  // FIXED: 'each re' was wrong ('Leech' is e,e,c,h — no 'a'). 'eech' from 'Leech' — aligns with uber token.
  { id: 'uber_reduced_leech_recovery', label: 'Reduced Leech Recovery', tradePatterns: [{ text: "Players have #% increased Maximum total Life, Mana and Energy Shield Recovery per second from Leech" }], category: 'nightmare' },
  { id: 'uber_rare_monsters_fracture_on_death', label: 'Rare Monsters Fracture on Death', tradePatterns: [{ text: "#% chance for Rare Monsters to Fracture on death" }], category: 'nightmare' },
  { id: 'uber_flask_triggers_meteor', label: 'Flask Triggers Meteor', tradePatterns: [{ text: "Players have #% chance to be targeted by a Meteor when they use a Flask" }], category: 'nightmare' },
  { id: 'uber_players_less_defences', label: 'Players Less Defences', tradePatterns: [{ text: "Players have #% more Defences" }], category: 'nightmare' },
  { id: 'uber_extra_projectiles_massive_aoe', label: 'Extra Projectiles + Massive AoE', tradePatterns: [{ text: "Monsters fire # additional Projectiles" }], category: 'nightmare' },
  // 'm po' from 'Maximum Power' — 'm[space]Po' at positions 6-9. Clean: 'gain a Power Charge' has 'a Po' not 'm Po'.
  { id: 'uber_power_charges_max_power', label: 'Power Charges + Max Power', tradePatterns: [{ text: "Monsters have +# to Maximum Power Charges" }], category: 'nightmare' },
  { id: 'uber_labyrinth_hazards', label: 'Labyrinth Hazards', tradePatterns: [{ text: "Area contains Labyrinth Hazards" }], category: 'nightmare' },
  { id: 'uber_rare_monsters_volatile_cores', label: 'Rare Monsters Volatile Cores', tradePatterns: [{ text: "Rare Monsters have #% chance to have a Volatile Core" }], category: 'nightmare' },
  { id: 'uber_the_maven_interferes', label: 'The Maven Interferes', tradePatterns: [{ text: "The Maven interferes with Players" }], category: 'nightmare' },
  { id: 'uber_auras_affect_enemies', label: 'Auras Affect Enemies', tradePatterns: [{ text: "Auras from Player Skills which affect Allies also affect Enemies" }], category: 'nightmare' },
  { id: 'uber_moving_marked_ground', label: 'Moving Marked Ground', tradePatterns: [{ text: "Area contains patches of moving Marked Ground, inflicting random Marks" }], category: 'nightmare' },
];

/** The short stash-highlight token for a brick mod, sourced from MOD_TOKENS
 *  (single source of truth). */
export const brickRegexTerm = (def: BrickModDef): string => MOD_TOKENS[def.id];

/** Trade stat text may wrap display names as [machine-tag|human label]. */
export function normalizeTradeStatText(text: string): string {
  return text.replace(/\[[^|\]]+\|([^\]]+)\]/g, '$1');
}

const normalizedTradeText = (text: string): string =>
  normalizeTradeStatText(text).toLocaleLowerCase('en-US');

/**
 * Resolve the brick catalogue against the complete live Trade stat vocabulary.
 *
 * Patterns use full normalized-text equality, never substring matching. A
 * pattern must resolve exactly once; any missing or ambiguous brick is omitted
 * and returned as unavailable so the renderer can fail closed visibly.
 */
export function resolveBrickTradeStats(
  entries: readonly TradeStatEntry[],
  definitions: readonly BrickModDef[] = BRICK_MOD_DEFS,
): {
  resolved: ResolvedBrickTradeStat[];
  unavailable: UnavailableBrickTradeStat[];
} {
  const normalizedEntries = entries.map((entry) => ({
    ...entry,
    normalizedText: normalizedTradeText(entry.text),
  }));
  const resolved: ResolvedBrickTradeStat[] = [];
  const unavailable: UnavailableBrickTradeStat[] = [];

  for (const def of definitions) {
    const matchedIds = new Set<string>();
    let everyPatternResolvedOnce = true;

    for (const pattern of def.tradePatterns) {
      const expectedText = normalizedTradeText(pattern.text);
      const matches = normalizedEntries.filter((entry) =>
        entry.normalizedText === expectedText &&
        (!pattern.statId || entry.id === pattern.statId),
      );
      if (matches.length !== 1) everyPatternResolvedOnce = false;
      for (const match of matches) matchedIds.add(match.id);
    }

    const expectedCount = def.tradePatterns.length;
    if (!everyPatternResolvedOnce || matchedIds.size !== expectedCount) {
      unavailable.push({
        id: def.id,
        label: def.label,
        expectedCount,
        actualCount: matchedIds.size,
      });
      continue;
    }
    resolved.push({ def, statIds: [...matchedIds] });
  }

  return { resolved, unavailable };
}

/** Expand stable catalogue IDs into their resolved Trade stat IDs. Unknown or
 *  unavailable catalogue IDs fail closed instead of entering a Trade query. */
export function expandSelectedBrickIds(
  selectedBrickIds: readonly string[],
  resolved: readonly Pick<ResolvedBrickTradeStat, 'def' | 'statIds'>[],
): string[] {
  const byBrickId = new Map<string, readonly string[]>(
    resolved.map(({ def, statIds }) => [def.id, statIds]),
  );
  return [...new Set(selectedBrickIds.flatMap((id) => byBrickId.get(id) ?? []))];
}
