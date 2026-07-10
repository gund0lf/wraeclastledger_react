/**
 * regexBuilderPresets.ts — mod-preset data for the Regex Builder (WP8).
 *
 * Moved verbatim out of RegexBuilderModule so the component file holds only
 * logic + UI. The preset arrays and PRESET_GROUPS are the hardcoded mod
 * catalogue; ModGroupState + DEFAULT_GROUPS describe the builder's persisted
 * workspace shape (the store keeps `regexBuilderGroups: ModGroupState[]`).
 */

import { MOD_TOKENS } from './modTokens';

export interface NamedMod {
  id: string;
  label: string;   // short badge label
  token: string;   // stash regex token
  detail: string;  // full tooltip: actual in-game mod text + token explanation
  tier?: 'S' | 'A' | 'B';
}

// Pack Size mods — all give +20% pack size
export const PACK_SIZE_MODS: NamedMod[] = [
  {
    id: 'hap', tier: 'S',
    label: 'Shaper-Touched (+20% pack)',
    token: MOD_TOKENS.uber_rare_monsters_shaper_touched,
    detail: '"Rare monsters in area are Shaper-Touched" · +20% Pack · 13% Quant · Token: "-t" from "Shaper**-T**ouched" (2 chars, hyphen is unique in mod text)',
  },
  {
    id: 'syn', tier: 'S',
    label: 'Synthesis Boss (+20% pack)',
    token: MOD_TOKENS.uber_synthesis_boss,
    detail: '"Map Boss is accompanied by a Synthesis Boss" · +20% Pack · 13% Quant · Extra boss drops fractured/synthesised items · Token: "yn"',
  },
  {
    id: 'rch', tier: 'A',
    label: 'Searing Exarch Runes (+20% pack)',
    token: MOD_TOKENS.uber_searing_exarch_runes,
    detail: '"Area contains Runes of the Searing Exarch" · +20% Pack · 13% Quant · Runes pulse fire damage and halt all recovery — dangerous for regen builds · Token: "rch"',
  },
  {
    id: 'wni', tier: 'A',
    label: 'Drowning Orbs (+20% pack)',
    token: MOD_TOKENS.uber_drowning_orbs,
    detail: '"Area contains Drowning Orbs" · +20% Pack · 13% Quant · Slow orbs stack Drowning debuff — instant death at max stacks · Token: "wni"',
  },
  {
    id: 'maxres', tier: 'A',
    label: '-20% Max Res (+20% pack)',
    token: MOD_TOKENS.uber_20_max_resistances,
    detail: '"Players have -20% to all maximum Resistances" · +20% Pack · 19% Quant · Token: "ax R" from "m**ax R**esistances" (4 chars) — "all m" hit Afflicting+Conflagrating ("All Monster Damage"); "ax R" appears only in max Resistances context',
  },
  {
    id: 'maven', tier: 'B',
    label: 'Maven Interferes (+20% pack)',
    token: MOD_TOKENS.uber_the_maven_interferes,
    detail: '"The Maven interferes with Players" · +20% Pack · 13% Quant · Token: "mav" from "**mav**en"',
  },
];

// Currency mods — ordered best to worst by currency %
export const CURRENCY_MODS: NamedMod[] = [
  {
    id: 'xpir', tier: 'S',
    label: 'of Defiance — Debuffs Expire (+64%)',
    token: MOD_TOKENS.uber_debuffs_expire_faster,
    detail: '"Debuffs on Monsters expire 100% faster" · +64% Currency · 16% Quant · BEST currency mod · Token: "deb" from "**Deb**uffs on Monsters" — "xpi" was colliding with "Buffs on Players expire" (Transience) which also contains "expire"',
  },
  {
    id: 'kat', tier: 'A',
    label: 'Stalwart — Block Attack Damage (+47%)',
    token: MOD_TOKENS.uber_50_monster_block_chance,
    detail: '"Monsters have +50% Chance to Block Attack Damage" · +47% Currency · 13% Quant · Token: "k d" from "bloc**k D**amage" — "k a" collides with top tier Overlord\'s "increased Attack and Cast Speed"',
  },
  {
    id: 'fph', tier: 'A',
    label: 'Punishing — Reflect Phys & Ele (+47%)',
    token: MOD_TOKENS.uber_reflect_20_physical_elemental,
    detail: '"Monsters reflect 20% of Physical Damage · Monsters reflect 20% of Elemental Damage" · +47% Currency · 10% Quant · Token: "t 20" from "reflec**t 20**%" — top tier version reflects only 18%, so targeting the 20% value is unique',
  },
  {
    id: 'life', tier: 'A',
    label: 'Fecund — More Monster Life 90-100% (+47%)',
    token: '(9\\d|100)% m',
    detail: '"(90-100)% more Monster Life" · +47% Currency · Token targets the 90-100% roll only — skips the low (25-30%) Unwavering variant which shares similar text',
  },
  {
    id: 'sks', tier: 'A',
    label: 'Diluted — Less Flask Effect (+47%)',
    token: MOD_TOKENS.uber_less_flask_effect,
    detail: '"Players have 40% less effect of Flasks applied to them" · +47% Currency · 16% Quant · Token: "sks" from "flas**ks**"',
  },
  {
    id: 'wb', tier: 'A',
    label: 'Ultimate — Bloodstained Sawblades (+47%)',
    token: MOD_TOKENS.uber_bloodstained_sawblades,
    detail: '"Players are assaulted by Bloodstained Sawblades" · +47% Currency · 13% Quant · Token: "wb" from "sa**wb**lades"',
  },
  {
    id: 'tunn', tier: 'A',
    label: 'Juggernaut — Cannot Be Stunned (+47%)',
    token: MOD_TOKENS.uber_stunned_action_move_speed_floor,
    detail: '"Monsters cannot be Stunned · Action Speed cannot be modified to below Base Value" · +47% Currency · 13% Quant · ⚠ Same text exists on top tier Unwavering (no currency reward) — no single token can distinguish these',
  },
  {
    id: 'eteor', tier: 'B',
    label: 'of Imbibing — Meteor on Flask Use (+45%)',
    token: MOD_TOKENS.uber_flask_triggers_meteor,
    detail: '"Players are targeted by a Meteor when they use a Flask" · +45% Currency · 13% Quant · Token: "teor" from "me**teor**"',
  },
];

// Quantity mods — highest quant rolls (19% quant, S/A tier)
export const QUANTITY_MODS: NamedMod[] = [
  {
    id: 'chain3', tier: 'S',
    label: 'Chaining — Chain 3 Times (19% quant)',
    token: MOD_TOKENS.uber_skills_chain_terrain_chain,
    detail: '"Monsters\' skills Chain 3 additional times · Projectiles can Chain when colliding with Terrain" · 19% Quant · 56% Rarity · 6% Pack · Token: "lid" from "col**lid**ing"',
  },
  {
    id: 'poss', tier: 'S',
    label: 'Enthralled — Bosses Possessed (19% quant)',
    token: MOD_TOKENS.unique_bosses_possessed,
    detail: '"Unique Bosses are Possessed" · 19% Quant · 56% Rarity · 6% Pack · ⚠ Exact same text in top tier Enthralled (weaker stats) — no single token can distinguish these',
  },
  {
    id: 'aoe', tier: 'S',
    label: 'Magnifying — 100% AoE + Projectiles (19% quant)',
    token: MOD_TOKENS.uber_extra_projectiles_massive_aoe,
    detail: '"Monsters fire 2 additional Projectiles · Monsters\' skills Chain 3 additional times" · 19% Quant · 56% Rarity · 7% Pack · ⚠ "2 a" also matches top tier Splitting and Chaining (same individual lines, uber combines both)',
  },
  {
    id: 'mondam', tier: 'S',
    label: 'Savage — Increased Monster Damage (19% quant)',
    token: 'ter D',
    detail: '"(30-40)% increased Monster Damage" · 19% Quant · 56% Rarity · 7% Pack · ⚠ "ter D" also matches Afflicting (Ignite) and Penetration uber mods, plus top tier equivalents',
  },
  {
    id: 'speed', tier: 'S',
    label: 'Fleet — Monster Speed (19% quant)',
    token: 'ter Mo',
    detail: '"(25-30)% increased Monster Movement Speed · (35-45)% increased Monster Attack Speed · (35-45)% increased Monster Cast Speed" · 19% Quant · 56% Rarity · 7% Pack · Token: "ter Mo" from "Mons**ter Mo**vement" (6 chars) — "veme" hit Juggernaut+Unstoppable ("Monsters\u2019 Movement Speed cannot be modified" also has veme); "ter Mo" requires a space before M, which "Monsters\u2019" (apostrophe) does not provide',
  },
  {
    id: 'labyhaz', tier: 'A',
    label: 'Labyrinthine — Labyrinth Hazards (19% quant)',
    token: MOD_TOKENS.uber_labyrinth_hazards,
    detail: '"Area contains Labyrinth Hazards" · 19% Quant · 54% Rarity · 5% Pack · Token: "az" from "h**az**ards" (2 chars) — "nth" collided with top tier Synthetic (Synthesis Boss) which also contains "nth"',
  },
  {
    id: 'expres', tier: 'S',
    label: 'of Exposure — -20% Max Res (19% quant)',
    token: MOD_TOKENS.uber_20_max_resistances,  // shared with Pack Size group
    detail: '"Players have -20% to all maximum Resistances" · 19% Quant · 11% Rarity · 20% Pack · Token: "ax R" from "m**ax R**esistances" — avoids "-20% to amount of Suppressed Spell Damage Prevented" and "All Monster Damage" (Afflicting/Conflagrating)',
  },
  {
    id: 'penet', tier: 'S',
    label: 'of Penetration — Penetrates 15% Ele Res (19% quant)',
    token: MOD_TOKENS.uber_penetrates_elemental_resistances,
    detail: '"Monster Damage Penetrates 15% Elemental Resistances" · 19% Quant · 72% Rarity · 6% Pack',
  },
];

// Scarab mods
export const SCARAB_MODS: NamedMod[] = [
  {
    id: 'afflict', tier: 'S',
    label: 'Afflicting — Ignite/Freeze/Shock (+60% scarabs)',
    token: MOD_TOKENS.uber_all_damage_can_ignite_freeze_shock,
    detail: '"All Monster Damage can Ignite, Freeze and Shock · Monsters Ignite, Freeze and Shock on Hit" · +60% Scarabs · 13% Quant · Token: "n ig" from "ca**n ig**nite" — top tier has "chance to Ignite" ("o ig") and "always Ignites" ("ys ig"), neither contains "n ig"',
  },
  {
    id: 'volati', tier: 'A',
    label: 'Volatile — Volatile Cores (+53% scarabs)',
    token: MOD_TOKENS.uber_rare_monsters_volatile_cores,
    detail: '"Rare Monsters have Volatile Cores" · +53% Scarabs · 13% Quant · 11% Rarity · Token: "vola" from "**vola**tile"',
  },
  {
    id: 'curses', tier: 'A',
    label: 'of Curses — Triple Curse (+35% scarabs)',
    token: MOD_TOKENS.uber_triple_curse_vuln_temporal_elem,
    detail: '"Players are Cursed with Vulnerability · Temporal Chains · Elemental Weakness" · +35% Scarabs · 13% Quant · Token: "oral" from "Temp**oral** Chains" — ⚠ also matches top-tier "of Temporal Chains" (single curse, no scarab reward); unavoidable without multi-line matching',
  },
  {
    id: 'defenc', tier: 'B',
    label: 'of Miring — Less Defences (+35% scarabs)',
    token: MOD_TOKENS.uber_players_less_defences,
    detail: '"Players have (25-30)% less Defences" · +35% Scarabs · 13% Quant · Token: "efenc" from "d**efenc**es"',
  },
  {
    id: 'bufscar', tier: 'B',
    label: 'of Transience — Buffs Expire (+35% scarabs)',
    token: MOD_TOKENS.buffs_on_players_expire_faster,
    detail: '"Buffs on Players expire 100% faster" · +35% Scarabs · 10% Quant · ⚠ Also matches top tier "Buffs on Players expire 70% faster" (same text, different %) — unavoidable without targeting the "100" value specifically',
  },
  {
    id: 'marked', tier: 'B',
    label: 'of Marking — Marked Ground (+36% scarabs)',
    token: MOD_TOKENS.uber_moving_marked_ground,
    detail: '"Area contains patches of moving Marked Ground, inflicting random Marks" · +36% Scarabs · 16% Quant · Token: "rke" from "ma**rke**d"',
  },
];

// Maps mods
export const MAPS_MODS: NamedMod[] = [
  {
    id: 'grasp', tier: 'S',
    label: 'Grasping — Grasping Vines (+40% maps)',
    token: MOD_TOKENS.uber_grasping_vines_on_hit,
    detail: '"Monsters inflict 2 Grasping Vines on Hit" · +40% Maps · 13% Quant · Token: "raspin" from "g**raspin**g"',
  },
  {
    id: 'shield', tier: 'A',
    label: 'Buffered — Extra Energy Shield (+35% maps)',
    token: MOD_TOKENS.uber_extra_es_from_life,
    detail: '"Monsters gain (70-80)% of Maximum Life as Extra Maximum Energy Shield" · +35% Maps · 13% Quant · Token: "a Ma" from "extr**a Ma**ximum" — ⚠ also matches top-tier Buffered (40-49%, same text) — unavoidable; both give the same mechanic at different values',
  },
  {
    id: 'oppress', tier: 'A',
    label: 'Oppressive — Suppress Spell Damage (+35% maps)',
    token: MOD_TOKENS.uber_suppress_spell_damage,
    detail: '"Monsters have +100% chance to Suppress Spell Damage" · +35% Maps · 13% Quant · ⚠ Also matches top tier (+60% chance, same text) — no clean single token to distinguish',
  },
  {
    id: 'protect', tier: 'A',
    label: 'Protected — Physical Damage Reduction (+35% maps)',
    token: MOD_TOKENS.uber_massive_all_resistances,
    detail: '"+50% Monster Physical Damage Reduction · +35% Monster Chaos Resistance · +55% Monster Elemental Resistances" · +35% Maps · 13% Quant · ⚠ also matches top-tier Armoured (+40% PDR, same text) — same mechanic, different values, unavoidable',
  },
  {
    id: 'powchg', tier: 'B',
    label: 'of Power — Power Charges (+35% maps)',
    token: MOD_TOKENS.uber_power_charges_max_power,
    detail: '"Monsters have +1 to Maximum Power Charges · Monsters gain a Power Charge on Hit" · +35% Maps · 13% Quant',
  },
  {
    id: 'frenzchg', tier: 'B',
    label: 'of Frenzy — Frenzy Charges (+35% maps)',
    token: MOD_TOKENS.uber_frenzy_charge_max_frenzy,
    detail: '"Monsters have +1 to Maximum Frenzy Charges · Monsters gain a Frenzy Charge on Hit" · +35% Maps · 13% Quant · Token: "mum f" from "maxi**mum f**renzy" — "renzy" also matched top tier "steals Power, Frenzy and Endurance charges" (of Enervation)',
  },
  {
    id: 'endchg', tier: 'B',
    label: 'of Endurance — Endurance Charges (+35% maps)',
    token: MOD_TOKENS.uber_endurance_charges_max_endurance,
    detail: '"Monsters have +1 to Maximum Endurance Charges · Monsters gain an Endurance Charge when hit" · +35% Maps · 13% Quant · Token: "m End" from "Maximu**m End**urance" — "dura" matched Poison Duration + top-tier Endurance mods; "Maximum Energy" is "m Ene" (e not d) so no collision',
  },
  {
    id: 'shrine', tier: 'B',
    label: 'of Domination — Shrine Buff (+35% maps)',
    token: MOD_TOKENS.uber_shrine_buff_on_unique_monsters,
    detail: '"Unique Monsters have a random Shrine Buff" · +35% Maps · 13% Quant · Token: "ne b" from "shri**ne b**uff"',
  },
];

export const PRESET_GROUPS = [
  { id: 'packsize', label: 'Pack Size Mods',  mods: PACK_SIZE_MODS },
  { id: 'currency', label: 'Currency Mods',   mods: CURRENCY_MODS },
  { id: 'quantity', label: 'Quantity Mods',   mods: QUANTITY_MODS },
  { id: 'scarabs',  label: 'Scarab Mods',     mods: SCARAB_MODS  },
  { id: 'maps',     label: 'Maps Mods',       mods: MAPS_MODS    },
];

/** The builder's persisted workspace: one editable K-of-N mod group. */
export interface ModGroupState {
  id: string; label: string;
  mods: { id: string; token: string; label: string; detail?: string; tier?: string }[];
  selected: string[];
  k: number;
}

export const DEFAULT_GROUPS: ModGroupState[] = [
  {
    id: 'g1', label: 'Pack Size Mods',
    mods: PACK_SIZE_MODS.map((m) => ({ id: m.id, token: m.token, label: m.label, detail: m.detail, tier: m.tier })),
    selected: [], // start empty — user selects their own mods
    k: 2,
  },
];

/** Fresh deep copy of DEFAULT_GROUPS — used for store init so the module-level
 *  constant can never be mutated by immutable-but-shared references. */
export const cloneDefaultGroups = (): ModGroupState[] =>
  DEFAULT_GROUPS.map((g) => ({ ...g, mods: g.mods.map((m) => ({ ...m })), selected: [...g.selected] }));
