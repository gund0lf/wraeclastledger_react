/**
 * Top-tier regular map mod definitions.
 * Source: top_tier.json — complete verified mod pool.
 *
 * Originator maps can roll ANY of these in addition to uber-tier mods.
 * Many top-tier mods share text with uber-tier mods but at lower values.
 */

import type { ModAnalysis } from './uberMapMods';

export interface RegularMod {
  name: string;
  affix: 'prefix' | 'suffix';
  quant: number;
  rarity?: number;
  pack?: number;
  effect: string;
}

export const REGULAR_MODS: RegularMod[] = [
  // ─── PREFIXES ────────────────────────────────────────────────────────────
  { name: 'Ceremonial',   affix: 'prefix', quant: 10, rarity: 6,  pack: 4, effect: 'Area contains many Totems' },
  { name: "Antagonist's", affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: '(20-30)% increased number of Rare Monsters' },
  { name: 'Skeletal',     affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: 'Area is inhabited by Skeletons' },
  { name: 'Capricious',   affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: 'Area is inhabited by Goatmen' },
  { name: 'Slithering',   affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: 'Area is inhabited by Sea Witches and their Spawn' },
  { name: 'Undead',       affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: 'Area is inhabited by Undead' },
  { name: 'Emanant',      affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: 'Area is inhabited by ranged monsters' },
  { name: 'Feral',        affix: 'prefix', quant: 16, rarity: 9,  pack: 6, effect: 'Area is inhabited by Animals' },
  { name: 'Demonic',      affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: 'Area is inhabited by Demons' },
  { name: 'Bipedal',      affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: 'Area is inhabited by Humanoids' },
  { name: 'Solar',        affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: 'Area is inhabited by Solaris fanatics' },
  { name: 'Lunar',        affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: 'Area is inhabited by Lunaris fanatics' },
  { name: 'Haunting',     affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: 'Area is inhabited by Ghosts' },
  { name: 'Feasting',     affix: 'prefix', quant: 16, rarity: 9,  pack: 6, effect: 'Area is inhabited by Cultists of Kitava' },
  { name: 'Multifarious', affix: 'prefix', quant: 10, rarity: 6,  pack: 4, effect: 'Area has increased monster variety' },
  { name: 'Abhorrent',    affix: 'prefix', quant: 16, rarity: 9,  pack: 6, effect: 'Area is inhabited by Abominations' },
  { name: 'Chaining',     affix: 'prefix', quant: 16, rarity: 9,  pack: 6, effect: "Monsters' skills Chain 2 additional times" },
  { name: 'Hexproof',     affix: 'prefix', quant: 16, rarity: 9,  pack: 6, effect: 'Monsters are Hexproof' },
  { name: 'Hexwarded',    affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: '60% less effect of Curses on Monsters' },
  { name: 'Twinned',      affix: 'prefix', quant: 19, rarity: 11, pack: 7, effect: 'Area contains two Unique Bosses' },
  { name: 'Unwavering',   affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: '(25-30)% more Monster Life\nMonsters cannot be Stunned' },
  { name: 'Splitting',    affix: 'prefix', quant: 19, rarity: 11, pack: 7, effect: 'Monsters fire 2 additional Projectiles' },
  { name: 'Armoured',     affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: '+40% Monster Physical Damage Reduction' },
  { name: 'Fecund',       affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: '(40-49)% more Monster Life' },
  { name: 'Savage',       affix: 'prefix', quant: 19, rarity: 11, pack: 7, effect: '(22-25)% increased Monster Damage' },
  { name: 'Burning',      affix: 'prefix', quant: 16, rarity: 9,  pack: 6, effect: 'Monsters deal (90-110)% extra Physical Damage as Fire' },
  { name: 'Freezing',     affix: 'prefix', quant: 16, rarity: 9,  pack: 6, effect: 'Monsters deal (90-110)% extra Physical Damage as Cold' },
  { name: 'Shocking',     affix: 'prefix', quant: 16, rarity: 9,  pack: 6, effect: 'Monsters deal (90-110)% extra Physical Damage as Lightning' },
  { name: 'Profane',      affix: 'prefix', quant: 16, rarity: 9,  pack: 6, effect: 'Monsters gain (31-35)% of their Physical Damage as Extra Chaos Damage\nMonsters Inflict Withered for 2 seconds on Hit' },
  { name: 'Fleet',        affix: 'prefix', quant: 19, rarity: 11, pack: 7, effect: '(25-30)% increased Monster Movement Speed\n(35-45)% increased Monster Attack Speed\n(35-45)% increased Monster Cast Speed' },
  { name: 'Punishing',    affix: 'prefix', quant: 10, rarity: 6,  pack: 4, effect: 'Monsters reflect 18% of Physical Damage' },
  { name: 'Mirrored',     affix: 'prefix', quant: 10, rarity: 6,  pack: 4, effect: 'Monsters reflect 18% of Elemental Damage' },
  { name: "Overlord's",   affix: 'prefix', quant: 16, rarity: 9,  pack: 6, effect: 'Unique Boss deals 25% increased Damage\nUnique Boss has 30% increased Attack and Cast Speed' },
  { name: "Titan's",      affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: 'Unique Boss has 35% increased Life\nUnique Boss has 70% increased Area of Effect' },
  { name: 'Empowered',    affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: 'Monsters have a 20% chance to Ignite, Freeze and Shock on Hit' },
  { name: 'Unstoppable',  affix: 'prefix', quant: 10, rarity: 6,  pack: 4, effect: 'Monsters cannot be Taunted\nMonsters\' Action Speed cannot be modified to below Base Value\nMonsters\' Movement Speed cannot be modified to below Base Value' },
  { name: 'Conflagrating', affix: 'prefix', quant: 10, rarity: 6, pack: 4, effect: 'All Monster Damage from Hits always Ignites' },
  { name: 'Resistant',    affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: '+25% Monster Chaos Resistance\n+40% Monster Elemental Resistances' },
  { name: 'Impervious',   affix: 'prefix', quant: 10, rarity: 6,  pack: 4, effect: 'Monsters have a 50% chance to avoid Poison, Impale, and Bleeding' },
  { name: 'Impaling',     affix: 'prefix', quant: 16, rarity: 9,  pack: 6, effect: "Monsters' Attacks have 60% chance to Impale on Hit" },
  { name: 'Oppressive',   affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: 'Monsters have +60% chance to Suppress Spell Damage' },
  { name: 'Buffered',     affix: 'prefix', quant: 13, rarity: 8,  pack: 5, effect: 'Monsters gain (40-49)% of Maximum Life as Extra Maximum Energy Shield' },
  { name: 'Enthralled',   affix: 'prefix', quant: 16, rarity: 9,  pack: 6, effect: 'Unique Bosses are Possessed' },

  // ─── SUFFIXES ────────────────────────────────────────────────────────────
  { name: 'of Bloodlines',      affix: 'suffix', quant: 10, rarity: 6,  pack: 4, effect: '(20-30)% increased Magic Monsters' },
  { name: 'of Venom',           affix: 'suffix', quant: 16, rarity: 9,  pack: 6, effect: 'Monsters Poison on Hit' },
  { name: 'of Balance',         affix: 'suffix', quant: 10, rarity: 6,  pack: 4, effect: 'Players cannot inflict Exposure' },
  { name: 'of Giants',          affix: 'suffix', quant: 13, rarity: 8,  pack: 5, effect: 'Monsters have 100% increased Area of Effect' },
  { name: 'of Deadliness',      affix: 'suffix', quant: 16, rarity: 9,  pack: 6, effect: 'Monsters have (360-400)% increased Critical Strike Chance\n+(41-45)% to Monster Critical Strike Multiplier' },
  { name: 'of Smothering',      affix: 'suffix', quant: 16, rarity: 9,  pack: 6, effect: 'Players have 60% less Recovery Rate of Life and Energy Shield' },
  { name: 'of Stasis',          affix: 'suffix', quant: 16, rarity: 9,  pack: 6, effect: 'Players cannot Regenerate Life, Mana or Energy Shield' },
  { name: 'of Flames',          affix: 'suffix', quant: 10, rarity: 6,  pack: 4, effect: 'Area has patches of Burning Ground' },
  { name: 'of Ice',             affix: 'suffix', quant: 10, rarity: 6,  pack: 4, effect: 'Area has patches of Chilled Ground' },
  { name: 'of Lightning',       affix: 'suffix', quant: 10, rarity: 6,  pack: 4, effect: 'Area has patches of Shocked Ground which increase Damage taken by 50%' },
  { name: 'of Desecration',     affix: 'suffix', quant: 10, rarity: 6,  pack: 4, effect: 'Area has patches of desecrated ground' },
  { name: 'of Consecration',    affix: 'suffix', quant: 10, rarity: 6,  pack: 4, effect: 'Area has patches of Consecrated Ground' },
  { name: 'of Elemental Weakness', affix: 'suffix', quant: 13, rarity: 8, pack: 5, effect: 'Players are Cursed with Elemental Weakness' },
  { name: 'of Vulnerability',   affix: 'suffix', quant: 13, rarity: 8,  pack: 5, effect: 'Players are Cursed with Vulnerability' },
  { name: 'of Enfeeblement',    affix: 'suffix', quant: 13, rarity: 8,  pack: 5, effect: 'Players are Cursed with Enfeeble' },
  { name: 'of Temporal Chains', affix: 'suffix', quant: 13, rarity: 8,  pack: 5, effect: 'Players are Cursed with Temporal Chains' },
  { name: 'of Exposure',        affix: 'suffix', quant: 19, rarity: 11, pack: 7, effect: 'Players have (-12--9)% to all maximum Resistances' },
  { name: 'of Congealment',     affix: 'suffix', quant: 16, rarity: 9,  pack: 6, effect: 'Monsters cannot be Leeched from' },
  { name: 'of Insulation',      affix: 'suffix', quant: 10, rarity: 6,  pack: 4, effect: 'Monsters have 70% chance to Avoid Elemental Ailments' },
  { name: 'of Toughness',       affix: 'suffix', quant: 10, rarity: 6,  pack: 4, effect: 'Monsters take (36-40)% reduced Extra Damage from Critical Strikes' },
  { name: 'of Drought',         affix: 'suffix', quant: 13, rarity: 8,  pack: 5, effect: 'Players gain 50% reduced Flask Charges' },
  { name: 'of Rust',            affix: 'suffix', quant: 13, rarity: 8,  pack: 5, effect: 'Players have 30% less Armour\nPlayers have 40% reduced Chance to Block' },
  { name: 'of Miring',          affix: 'suffix', quant: 13, rarity: 8,  pack: 5, effect: 'Monsters have 50% increased Accuracy Rating\nPlayers have -20% to amount of Suppressed Spell Damage Prevented' },
  { name: 'of Impotence',       affix: 'suffix', quant: 13, rarity: 8,  pack: 5, effect: 'Players have 25% less Area of Effect' },
  { name: 'of Frenzy',          affix: 'suffix', quant: 13, rarity: 8,  pack: 5, effect: 'Monsters gain a Frenzy Charge on Hit' },
  { name: 'of Endurance',       affix: 'suffix', quant: 13, rarity: 8,  pack: 5, effect: 'Monsters gain an Endurance Charge on Hit' },
  { name: 'of Power',           affix: 'suffix', quant: 13, rarity: 8,  pack: 5, effect: 'Monsters gain a Power Charge on Hit' },
  { name: 'of Blinding',        affix: 'suffix', quant: 10, rarity: 6,  pack: 4, effect: 'Monsters Blind on Hit' },
  { name: 'of Carnage',         affix: 'suffix', quant: 10, rarity: 6,  pack: 4, effect: 'Monsters Maim on Hit with Attacks' },
  { name: 'of Impedance',       affix: 'suffix', quant: 10, rarity: 6,  pack: 4, effect: 'Monsters Hinder on Hit with Spells' },
  { name: 'of Enervation',      affix: 'suffix', quant: 10, rarity: 6,  pack: 4, effect: 'Monsters steal Power, Frenzy and Endurance charges on Hit' },
  { name: 'of Fatigue',         affix: 'suffix', quant: 13, rarity: 8,  pack: 5, effect: 'Players have 40% less Cooldown Recovery Rate' },
  { name: 'of Transience',      affix: 'suffix', quant: 10, rarity: 6,  pack: 4, effect: 'Buffs on Players expire 70% faster' },
  { name: 'of Doubt',           affix: 'suffix', quant: 13, rarity: 8,  pack: 5, effect: 'Players have 60% reduced effect of Non-Curse Auras from Skills' },
  { name: 'of Imprecision',     affix: 'suffix', quant: 13, rarity: 8,  pack: 5, effect: 'Players have 25% less Accuracy Rating' },
];

// ─── Analysis ─────────────────────────────────────────────────────────────────

export function analyzeRegularMap(text: string): ModAnalysis {
  const detected = REGULAR_MODS.filter((m) =>
    m.effect.split('\n').every((line) => text.includes(line))
  ) as any[];

  const prefixes     = detected.filter((m) => m.affix === 'prefix');
  const suffixes     = detected.filter((m) => m.affix === 'suffix');
  // Regular mods have no tier; treat all detected as B-quality for coloring purposes
  const goodPrefixes: any[] = [];
  const goodSuffixes: any[] = [];
  const prefixScore  = prefixes.length;
  const suffixScore  = suffixes.length;
  const totalGood    = detected.length;

  let recommendation: ModAnalysis['recommendation'];
  if      (totalGood >= 4) recommendation = 'excellent';
  else if (totalGood >= 2) recommendation = 'good';
  else if (totalGood >= 1) recommendation = 'decent';
  else                     recommendation = 'standard';

  const packMatch = text.match(/Monster Pack Size: \+(\d+)%/);
  const packVal   = packMatch ? parseInt(packMatch[1]) : 0;
  const chiselRec: ModAnalysis['chiselRec']    = 'Avarice';
  const chiselReason = `Regular map — Avarice chisel always recommended (pack: ${packVal}%)`;

  return { detected, prefixes, suffixes, goodPrefixes, goodSuffixes,
           prefixScore, suffixScore, recommendation, chiselRec, chiselReason };
}
