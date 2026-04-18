/**
 * Uber map (Tier 16.5 / Originator) mod classifier.
 * Keywords match clipboard text lines from in-game item tooltips.
 *
 * Important: These maps use a MIXED mod pool — regular T16 mods AND uber-specific mods
 * can both appear. The uber-specific mods are identified by their unique secondary rewards
 * (47% more Currency, 35% more Maps, 60% more Scarabs etc.).
 *
 * Mod tiering for Sinistral/Dextral purposes:
 *   S = best to double (19% quant prefix, or top-value secondary)
 *   A = very good (47% currency bonus or 56%+ rarity)
 *   B = decent (maps/scarabs bonus, or standard good roll)
 */

export interface UberMod {
  name: string;
  affix: 'prefix' | 'suffix';
  tier: 'S' | 'A' | 'B';
  quant: number;
  secondary?: string;
  keyword: string;
}

export const UBER_MODS: UberMod[] = [
  // ─── PREFIXES ──────────────────────────────────────────────────────────────
  // S-tier: highest quant (19%) + 56% rarity + 7% pack
  { name: 'Magnifying',   affix: 'prefix', tier: 'S', quant: 19, keyword: 'fire 2 additional Projectiles' },
  { name: 'Savage',       affix: 'prefix', tier: 'S', quant: 19, keyword: 'increased Monster Damage' },
  { name: 'Fleet',        affix: 'prefix', tier: 'S', quant: 19, keyword: 'increased Monster Movement Speed' },
  { name: 'Chaining',     affix: 'prefix', tier: 'S', quant: 16, keyword: "Chain 3 additional times" },
  { name: 'Enthralled',   affix: 'prefix', tier: 'S', quant: 16, keyword: 'Unique Bosses are Possessed' },
  // A-tier: 13% quant + 47% more Currency
  { name: 'Fecund',       affix: 'prefix', tier: 'A', quant: 13, secondary: '+47% Currency', keyword: 'more Monster Life' },
  { name: 'Stalwart',     affix: 'prefix', tier: 'A', quant: 13, secondary: '+47% Currency', keyword: '+50% Chance to Block Attack Damage' },
  { name: 'Punishing',    affix: 'prefix', tier: 'A', quant: 10, secondary: '+47% Currency', keyword: 'reflect 20% of Physical Damage' },
  { name: 'Ultimate',     affix: 'prefix', tier: 'A', quant: 13, secondary: '+47% Currency', keyword: 'Bloodstained Sawblades' },
  { name: 'Diluted',      affix: 'prefix', tier: 'A', quant: 16, secondary: '+47% Currency', keyword: 'less effect of Flasks applied to them' },
  // B-tier: maps, scarabs, misc
  { name: "Antagonist's", affix: 'prefix', tier: 'B', quant: 13, keyword: 'increased number of Rare Monsters' },
  { name: 'Grasping',     affix: 'prefix', tier: 'B', quant: 13, secondary: '+40% Maps',     keyword: 'Grasping Vines on Hit' },
  { name: 'Volatile',     affix: 'prefix', tier: 'B', quant: 13, secondary: '+53% Scarabs',  keyword: 'Volatile Cores' },
  { name: 'Afflicting',   affix: 'prefix', tier: 'B', quant: 13, secondary: '+60% Scarabs',  keyword: 'Ignite, Freeze and Shock on Hit' },
  { name: 'Buffered',     affix: 'prefix', tier: 'B', quant: 13, secondary: '+35% Maps',     keyword: 'of Maximum Life as Extra Maximum Energy Shield' },
  { name: 'Oppressive',   affix: 'prefix', tier: 'B', quant: 13, secondary: '+35% Maps',     keyword: '+100% chance to Suppress Spell Damage' },
  { name: 'Hungering',    affix: 'prefix', tier: 'B', quant: 16, keyword: 'Area contains Drowning Orbs' },
  { name: 'Protected',    affix: 'prefix', tier: 'B', quant: 13, secondary: '+35% Maps',     keyword: '+50% Monster Physical Damage Reduction' },
  { name: "Valdo's",      affix: 'prefix', tier: 'B', quant: 13, keyword: 'Shaper-Touched' },
  { name: 'Prismatic',    affix: 'prefix', tier: 'B', quant: 16, keyword: "Physical Damage as Extra Damage of a random Element" },
  { name: 'Profane',      affix: 'prefix', tier: 'B', quant: 16, keyword: "Physical Damage as Extra Chaos Damage" },
  { name: "Labyrinth's",  affix: 'prefix', tier: 'B', quant: 19, keyword: 'Labyrinth Hazards' },

  // ─── SUFFIXES ──────────────────────────────────────────────────────────────
  // S-tier
  { name: 'of Exposure',       affix: 'suffix', tier: 'S', quant: 19, keyword: 'to all maximum Resistances' },
  { name: 'of Defiance',       affix: 'suffix', tier: 'S', quant: 16, secondary: '+64% Currency', keyword: 'Debuffs on Monsters expire 100% faster' },
  { name: 'of Penetration',    affix: 'suffix', tier: 'S', quant: 19, keyword: 'Penetrates 15% Elemental Resistances' },
  // A-tier
  { name: 'of Imbibing',       affix: 'suffix', tier: 'A', quant: 13, secondary: '+45% Currency', keyword: 'targeted by a Meteor when they use a Flask' },
  { name: 'of the Juggernaut', affix: 'suffix', tier: 'A', quant: 13, secondary: '+47% Currency', keyword: "Action Speed cannot be modified to below Base Value" },
  { name: 'of Deadliness',     affix: 'suffix', tier: 'A', quant: 16, keyword: 'increased Critical Strike Chance' },
  { name: 'of Congealment',    affix: 'suffix', tier: 'A', quant: 16, keyword: 'reduced Maximum total Life, Mana and Energy Shield Recovery' },
  { name: 'of Curses',         affix: 'suffix', tier: 'A', quant: 13, secondary: '+35% Scarabs', keyword: 'Players are Cursed with Vulnerability' },
  // B-tier
  { name: 'of Power',          affix: 'suffix', tier: 'B', quant: 13, secondary: '+35% Maps',    keyword: 'Maximum Power Charges' },
  { name: 'of Frenzy',         affix: 'suffix', tier: 'B', quant: 13, secondary: '+35% Maps',    keyword: 'Maximum Frenzy Charges' },
  { name: 'of Endurance',      affix: 'suffix', tier: 'B', quant: 13, secondary: '+35% Maps',    keyword: 'Maximum Endurance Charges' },
  { name: 'of Domination',     affix: 'suffix', tier: 'B', quant: 13, secondary: '+35% Maps',    keyword: 'random Shrine Buff' },
  { name: 'of Miring',         affix: 'suffix', tier: 'B', quant: 13, secondary: '+35% Scarabs', keyword: 'less Defences' },
  { name: 'of Transience',     affix: 'suffix', tier: 'B', quant: 10, secondary: '+35% Scarabs', keyword: 'expire 100% faster' },
  { name: 'of Marking',        affix: 'suffix', tier: 'B', quant: 16, secondary: '+36% Scarabs', keyword: 'patches of moving Marked Ground' },
  { name: 'of Decaying',       affix: 'suffix', tier: 'B', quant: 16, keyword: 'Unstable Tentacle Fiends' },
  { name: 'of Splinters',      affix: 'suffix', tier: 'B', quant: 19, keyword: 'Rare Monsters to Fracture on death' },
  { name: 'of Treachery',      affix: 'suffix', tier: 'B', quant: 16, keyword: 'Auras from Player Skills which affect Allies also affect Enemies' },
  { name: 'of Persistence',    affix: 'suffix', tier: 'B', quant: 16, keyword: 'Rare monsters in area Temporarily Revive on death' },
  { name: 'of Venom',          affix: 'suffix', tier: 'B', quant: 16, keyword: 'Monsters Poison on Hit' },
  { name: 'of Collection',     affix: 'suffix', tier: 'B', quant: 13, keyword: 'The Maven interferes with Players' },
  { name: 'of Impotence',      affix: 'suffix', tier: 'B', quant: 13, keyword: 'less Area of Effect' },
  { name: 'of Toughness',      affix: 'suffix', tier: 'B', quant: 10, keyword: 'reduced Extra Damage from Critical Strikes' },
];

const TIER_SCORE: Record<string, number> = { S: 3, A: 2, B: 1 };

export interface ModAnalysis {
  detected: UberMod[];
  prefixes: UberMod[];
  suffixes: UberMod[];
  goodPrefixes: UberMod[];  // S or A tier
  goodSuffixes: UberMod[];
  prefixScore: number;
  suffixScore: number;
  recommendation: 'excellent' | 'good' | 'decent' | 'standard';
  chiselRec: 'Avarice' | 'Proliferation' | 'none';
  chiselReason: string;
}

export function analyzeMap(text: string): ModAnalysis {
  const detected: UberMod[] = [];
  for (const mod of UBER_MODS) {
    if (text.includes(mod.keyword) && !detected.find(d => d.name === mod.name)) {
      detected.push(mod);
    }
  }

  const prefixes     = detected.filter(m => m.affix === 'prefix');
  const suffixes     = detected.filter(m => m.affix === 'suffix');
  const goodPrefixes = prefixes.filter(m => m.tier === 'S' || m.tier === 'A');
  const goodSuffixes = suffixes.filter(m => m.tier === 'S' || m.tier === 'A');
  const prefixScore  = prefixes.reduce((a, m) => a + TIER_SCORE[m.tier], 0);
  const suffixScore  = suffixes.reduce((a, m) => a + TIER_SCORE[m.tier], 0);

  const totalGood = goodPrefixes.length + goodSuffixes.length;
  let recommendation: ModAnalysis['recommendation'];
  if      (totalGood >= 4) recommendation = 'excellent';
  else if (totalGood >= 2) recommendation = 'good';
  else if (totalGood >= 1) recommendation = 'decent';
  else                     recommendation = 'standard';

  // ── Chisel recommendation ───────────────────────────────────────────────
  // Avarice at 20% quality: +50% more Currency (multiplier on all currency drops)
  // Proliferation at 20% quality: +10% pack size additive
  // Math: at pack P%, Proliferation adds 10/(100+P)% more monsters:
  //   P=40 → +7.1%, P=20 → +8.3%, P=0 → +10%
  // Avarice: +50% of currency ≈ +17% total value (if currency = 35% of drops)
  // → Avarice wins at any realistic pack size. Having a currency mod makes it even better.
  const hasCurrencyMod = text.includes('More Currency:');
  const currMatch       = text.match(/More Currency: \+(\d+)%/);
  const currVal         = currMatch ? parseInt(currMatch[1]) : 0;
  const packMatch       = text.match(/Monster Pack Size: \+(\d+)%/);
  const packVal         = packMatch ? parseInt(packMatch[1]) : 0;
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

  return { detected, prefixes, suffixes, goodPrefixes, goodSuffixes, prefixScore, suffixScore, recommendation, chiselRec, chiselReason };
}
