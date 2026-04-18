/**
 * Regular T16 map mod classifier.
 * Covers the standard map mod pool (non-Originator maps).
 *
 * Tier rationale:
 *   S = 19%Q mods — highest quant in the pool, very strong
 *   A = 16%Q mods — excellent, worth deliberately rolling for
 *   B = 13%Q or 10%Q — decent, run happily but not target-rolled
 *
 * Note: reflect mods (Punishing, Mirrored) are B-tier but marked dangerous.
 * Note: Smothering / Stasis are A-tier quant-wise but extremely dangerous —
 *       treat as A if you can handle them, otherwise add to brick exclusions.
 */

import { UberMod, ModAnalysis } from './uberMapMods';

const TIER_SCORE: Record<string, number> = { S: 3, A: 2, B: 1 };

export const REGULAR_MODS: UberMod[] = [
  // ─── PREFIXES ────────────────────────────────────────────────────────────

  // S-tier — 19%Q
  { name: 'Twinned',   affix: 'prefix', tier: 'S', quant: 19, keyword: 'Area contains two Unique Bosses' },
  { name: 'Splitting', affix: 'prefix', tier: 'S', quant: 19, keyword: 'fire 2 additional Projectiles' },
  { name: 'Savage',    affix: 'prefix', tier: 'S', quant: 19, keyword: 'increased Monster Damage' },
  { name: 'Fleet',     affix: 'prefix', tier: 'S', quant: 19, keyword: 'increased Monster Movement Speed' },

  // A-tier — 16%Q
  { name: 'Chaining',    affix: 'prefix', tier: 'A', quant: 16, keyword: 'Chain 2 additional times' },
  { name: "Overlord's",  affix: 'prefix', tier: 'A', quant: 16, keyword: 'Unique Boss deals 25%' },
  { name: 'Enthralled',  affix: 'prefix', tier: 'A', quant: 16, keyword: 'Unique Bosses are Possessed' },
  { name: 'Burning',     affix: 'prefix', tier: 'A', quant: 16, keyword: 'extra Physical Damage as Fire' },
  { name: 'Freezing',    affix: 'prefix', tier: 'A', quant: 16, keyword: 'extra Physical Damage as Cold' },
  { name: 'Shocking',    affix: 'prefix', tier: 'A', quant: 16, keyword: 'extra Physical Damage as Lightning' },
  { name: 'Profane',     affix: 'prefix', tier: 'A', quant: 16, keyword: 'Physical Damage as Extra Chaos Damage' },
  { name: 'Hexproof',    affix: 'prefix', tier: 'A', quant: 16, keyword: 'Monsters are Hexproof' },
  { name: 'Impaling',    affix: 'prefix', tier: 'A', quant: 16, keyword: 'Impale on Hit' },
  { name: 'Feral',       affix: 'prefix', tier: 'A', quant: 16, keyword: 'Area is inhabited by Animals' },
  { name: 'Feasting',    affix: 'prefix', tier: 'A', quant: 16, keyword: 'Cultists of Kitava' },
  { name: 'Abhorrent',   affix: 'prefix', tier: 'A', quant: 16, keyword: 'Area is inhabited by Abominations' },

  // B-tier — 13%Q notable mods
  { name: "Antagonist's", affix: 'prefix', tier: 'B', quant: 13, secondary: 'Nemesis on rares', keyword: 'increased number of Rare Monsters' },
  { name: 'Fecund',       affix: 'prefix', tier: 'B', quant: 13, keyword: 'more Monster Life' },
  { name: 'Unwavering',   affix: 'prefix', tier: 'B', quant: 13, keyword: 'Monsters cannot be Stunned' },
  { name: 'Armoured',     affix: 'prefix', tier: 'B', quant: 13, keyword: 'Monster Physical Damage Reduction' },
  { name: 'Empowered',    affix: 'prefix', tier: 'B', quant: 13, keyword: 'Ignite, Freeze and Shock on Hit' },
  { name: "Titan's",      affix: 'prefix', tier: 'B', quant: 13, keyword: 'Unique Boss has 35% increased Life' },
  { name: 'Hexwarded',    affix: 'prefix', tier: 'B', quant: 13, keyword: 'less effect of Curses on Monsters' },
  { name: 'Oppressive',   affix: 'prefix', tier: 'B', quant: 13, keyword: 'chance to Suppress Spell Damage' },
  { name: 'Buffered',     affix: 'prefix', tier: 'B', quant: 13, keyword: 'of Maximum Life as Extra Maximum Energy Shield' },
  // 10%Q reflect mods — B-tier but potentially dangerous
  { name: 'Punishing',    affix: 'prefix', tier: 'B', quant: 10, secondary: '⚠ Reflect phys', keyword: 'reflect 18% of Physical Damage' },
  { name: 'Mirrored',     affix: 'prefix', tier: 'B', quant: 10, secondary: '⚠ Reflect elem', keyword: 'reflect 18% of Elemental Damage' },

  // ─── SUFFIXES ────────────────────────────────────────────────────────────

  // S-tier — 19%Q
  { name: 'of Exposure',    affix: 'suffix', tier: 'S', quant: 19, keyword: 'to all maximum Resistances' },

  // A-tier — 16%Q
  { name: 'of Deadliness',  affix: 'suffix', tier: 'A', quant: 16, keyword: 'Critical Strike Chance' },
  { name: 'of Smothering',  affix: 'suffix', tier: 'A', quant: 16, secondary: '⚠ Less recovery', keyword: 'less Recovery Rate of Life' },
  { name: 'of Stasis',      affix: 'suffix', tier: 'A', quant: 16, secondary: '⚠ No regen',     keyword: 'cannot Regenerate Life, Mana' },
  { name: 'of Venom',       affix: 'suffix', tier: 'A', quant: 16, keyword: 'Monsters Poison on Hit' },
  { name: 'of Congealment',  affix: 'suffix', tier: 'A', quant: 16, keyword: 'cannot be Leeched from' },

  // B-tier — 13%Q
  { name: 'of Bloodlines',         affix: 'suffix', tier: 'B', quant: 10, secondary: 'Magic pack mods', keyword: 'increased Magic Monsters' },
  { name: 'of Vulnerability',      affix: 'suffix', tier: 'B', quant: 13, keyword: 'Cursed with Vulnerability' },
  { name: 'of Elemental Weakness', affix: 'suffix', tier: 'B', quant: 13, keyword: 'Cursed with Elemental Weakness' },
  { name: 'of Enfeeblement',       affix: 'suffix', tier: 'B', quant: 13, keyword: 'Cursed with Enfeeble' },
  { name: 'of Temporal Chains',    affix: 'suffix', tier: 'B', quant: 13, keyword: 'Cursed with Temporal Chains' },
  { name: 'of Frenzy',             affix: 'suffix', tier: 'B', quant: 13, keyword: 'Frenzy Charge on Hit' },
  { name: 'of Endurance',          affix: 'suffix', tier: 'B', quant: 13, keyword: 'Endurance Charge on Hit' },
  { name: 'of Power',              affix: 'suffix', tier: 'B', quant: 13, keyword: 'Power Charge on Hit' },
  { name: 'of Fatigue',            affix: 'suffix', tier: 'B', quant: 13, keyword: 'less Cooldown Recovery Rate' },
  { name: 'of Miring',             affix: 'suffix', tier: 'B', quant: 13, keyword: 'Monsters have 50% increased Accuracy' },
  { name: 'of Doubt',              affix: 'suffix', tier: 'B', quant: 13, keyword: 'reduced effect of Non-Curse Auras' },
  { name: 'of Impotence',          affix: 'suffix', tier: 'B', quant: 13, keyword: 'Players have 25% less Area of Effect' },
  { name: 'of Giants',             affix: 'suffix', tier: 'B', quant: 13, keyword: 'Monsters have 100% increased Area of Effect' },
  { name: 'of Transience',         affix: 'suffix', tier: 'B', quant: 10, keyword: 'Buffs on Players expire 70% faster' },
  { name: 'of Drought',            affix: 'suffix', tier: 'B', quant: 13, keyword: 'Players gain 50% reduced Flask Charges' },
  { name: 'of Rust',               affix: 'suffix', tier: 'B', quant: 13, keyword: 'Players have 30% less Armour' },
  { name: 'of Toughness',          affix: 'suffix', tier: 'B', quant: 10, keyword: 'reduced Extra Damage from Critical Strikes' },
];

export function analyzeRegularMap(text: string): ModAnalysis {
  const detected: UberMod[] = [];
  for (const mod of REGULAR_MODS) {
    if (text.includes(mod.keyword) && !detected.find((d) => d.name === mod.name)) {
      detected.push(mod);
    }
  }

  const prefixes     = detected.filter((m) => m.affix === 'prefix');
  const suffixes     = detected.filter((m) => m.affix === 'suffix');
  const goodPrefixes = prefixes.filter((m) => m.tier === 'S' || m.tier === 'A');
  const goodSuffixes = suffixes.filter((m) => m.tier === 'S' || m.tier === 'A');
  const prefixScore  = prefixes.reduce((a, m) => a + TIER_SCORE[m.tier], 0);
  const suffixScore  = suffixes.reduce((a, m) => a + TIER_SCORE[m.tier], 0);

  const totalGood = goodPrefixes.length + goodSuffixes.length;
  let recommendation: ModAnalysis['recommendation'];
  if      (totalGood >= 4) recommendation = 'excellent';
  else if (totalGood >= 2) recommendation = 'good';
  else if (totalGood >= 1) recommendation = 'decent';
  else                     recommendation = 'standard';

  // Chisel: same logic as uber maps — Avarice by default, Proliferation if
  // currency mod is present but pack size is low
  const hasCurrencyMod = text.includes('More Currency:');
  const currMatch       = text.match(/More Currency: \+(\d+)%/);
  const currVal         = currMatch ? parseInt(currMatch[1]) : 0;
  const packMatch = text.match(/Monster Pack Size: \+(\d+)%/);
  const packVal = packMatch ? parseInt(packMatch[1]) : 0;
  let chiselRec: ModAnalysis['chiselRec'] = 'Avarice';
  let chiselReason: string;
  if (hasCurrencyMod) {
    chiselReason = `Currency mod present (${currVal}%) — Avarice adds flat +50% on top (atlas multiplies the map mod, not the chisel bonus)`;
  } else if (packVal < 15) {
    chiselRec = 'Proliferation';
    chiselReason = `Very low pack (${packVal}%) — Proliferation +10% flat pack gives the biggest relative gain here`;
  } else {
    chiselReason = `Avarice flat +50% currency ≈ +17% total value; Proliferation flat +10% pack ≈ +${(10 / (100 + packVal) * 100).toFixed(1)}% monsters (both additive after atlas) — Avarice wins`;
  }

  return {
    detected, prefixes, suffixes, goodPrefixes, goodSuffixes,
    prefixScore, suffixScore, recommendation, chiselRec, chiselReason,
  };
}
