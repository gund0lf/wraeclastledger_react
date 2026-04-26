/**
 * Uber-tier Originator map (T16.5) mod definitions.
 * Source: uber_tier.json — complete verified mod pool.
 *
 * These are the mods that roll EXCLUSIVELY on uber/originator maps
 * and their higher-value equivalents. Originator maps can also roll
 * top-tier mods (see regularMapMods.ts).
 */

export interface UberMod {
  name: string;
  affix: 'prefix' | 'suffix';
  tier: 'S' | 'A' | 'B' | 'X';
  quant: number;
  rarity?: number;
  pack?: number;
  secondary?: string;
  keyword: string;     // unique substring to detect this mod from clipboard text
  regexToken?: string; // shortest verified-unique stash regex token
}

export const UBER_MODS: UberMod[] = [
  // ─── PREFIXES ────────────────────────────────────────────────────────────

  // S-tier: 19% quant
  { name: 'Magnifying',  affix: 'prefix', tier: 'S', quant: 19, rarity: 56, pack: 7,
    keyword: '100% increased Area of Effect',
    regexToken: 'rea of' },
  { name: 'Savage',      affix: 'prefix', tier: 'S', quant: 19, rarity: 56, pack: 7,
    keyword: '(30-40)% increased Monster Damage',
    regexToken: 'ter D' },
  { name: 'Fleet',       affix: 'prefix', tier: 'S', quant: 19, rarity: 56, pack: 7,
    keyword: '(25-30)% increased Monster Movement Speed',
    regexToken: 'ter Mo' },
  { name: 'Chaining',    affix: 'prefix', tier: 'S', quant: 16, rarity: 56, pack: 6,
    keyword: "Monsters' skills Chain 3 additional times",
    regexToken: 'lid' },
  { name: 'Enthralled',  affix: 'prefix', tier: 'S', quant: 16, rarity: 56, pack: 6,
    keyword: 'Unique Bosses are Possessed',
    regexToken: 'poss' },
  { name: 'Prismatic',   affix: 'prefix', tier: 'B', quant: 16, rarity: 71, pack: 6,
    keyword: 'Physical Damage as Extra Damage of a random Element',
    regexToken: 'andom E' },
  { name: 'Profane',     affix: 'prefix', tier: 'B', quant: 16, rarity: 46, pack: 6,
    keyword: '(80-100)% of their Physical Damage as Extra Chaos Damage',
    regexToken: 'aos D' },

  // A-tier currency: 47% more currency
  { name: 'Stalwart',    affix: 'prefix', tier: 'A', quant: 13, rarity: 8,  pack: 5,
    secondary: '+47% Currency',
    keyword: 'Monsters have +50% Chance to Block Attack Damage',
    regexToken: 'k d' },
  { name: 'Punishing',   affix: 'prefix', tier: 'A', quant: 10, rarity: 8,  pack: 5,
    secondary: '+47% Currency',
    keyword: 'Monsters reflect 20% of Physical Damage',
    regexToken: 't 20' },
  { name: 'Fecund',      affix: 'prefix', tier: 'A', quant: 13, rarity: 8,  pack: 5,
    secondary: '+47% Currency',
    keyword: '(90-100)% more Monster Life',
    regexToken: '(9\\d|100)% m' },
  { name: 'Diluted',     affix: 'prefix', tier: 'A', quant: 16, rarity: 8,  pack: 5,
    secondary: '+47% Currency',
    keyword: 'Players have 40% less effect of Flasks applied to them',
    regexToken: 'sks' },
  { name: 'Ultimate',    affix: 'prefix', tier: 'A', quant: 13, rarity: 8,  pack: 5,
    secondary: '+47% Currency',
    keyword: 'Players are assaulted by Bloodstained Sawblades',
    regexToken: 'wb' },

  // B-tier maps/scarabs
  { name: "Antagonist's", affix: 'prefix', tier: 'B', quant: 13, rarity: 8, pack: 5,
    keyword: '(35-45)% increased number of Rare Monsters',
    regexToken: 'ber of R' },
  { name: 'Grasping',    affix: 'prefix', tier: 'S', quant: 13, rarity: 8,  pack: 5,
    secondary: '+40% Maps',
    keyword: 'Monsters inflict 2 Grasping Vines on Hit',
    regexToken: 'rasp' },
  { name: 'Volatile',    affix: 'prefix', tier: 'A', quant: 13, rarity: 11, pack: 5,
    secondary: '+53% Scarabs',
    keyword: 'Rare Monsters have Volatile Cores',
    regexToken: 'vol' },
  { name: 'Buffered',    affix: 'prefix', tier: 'A', quant: 13, rarity: 8,  pack: 5,
    secondary: '+35% Maps',
    keyword: 'Monsters gain (70-80)% of Maximum Life as Extra Maximum Energy Shield',
    regexToken: 'a Ma' },
  { name: 'Oppressive',  affix: 'prefix', tier: 'A', quant: 13, rarity: 8,  pack: 5,
    secondary: '+35% Maps',
    keyword: 'Monsters have +100% chance to Suppress Spell Damage',
    regexToken: 'o su' },
  { name: 'Protected',   affix: 'prefix', tier: 'A', quant: 13, rarity: 8,  pack: 5,
    secondary: '+35% Maps',
    keyword: '+50% Monster Physical Damage Reduction',
    regexToken: 'uct' },
  { name: 'Afflicting',  affix: 'prefix', tier: 'B', quant: 13, rarity: 8,  pack: 5,
    secondary: '+60% Scarabs',
    keyword: 'All Monster Damage can Ignite, Freeze and Shock',
    regexToken: 'n ig' },

  // Pack size +20%
  { name: "Valdo's",     affix: 'prefix', tier: 'S', quant: 13, rarity: 11, pack: 20,
    keyword: 'Rare monsters in area are Shaper-Touched',
    regexToken: '-t' },
  { name: 'Synthetic',   affix: 'prefix', tier: 'S', quant: 13, rarity: 8,  pack: 20,
    keyword: 'Map Boss is accompanied by a Synthesis Boss',
    regexToken: 'yn' },
  { name: 'Searing',     affix: 'prefix', tier: 'A', quant: 13, rarity: 8,  pack: 20,
    keyword: 'Area contains Runes of the Searing Exarch',
    regexToken: 'rch' },
  { name: 'Hungering',   affix: 'prefix', tier: 'A', quant: 16, rarity: 8,  pack: 20,
    keyword: 'Area contains Drowning Orbs',
    regexToken: 'wni' },
  { name: "Labyrinth's", affix: 'prefix', tier: 'A', quant: 19, rarity: 54, pack: 5,
    keyword: 'Area contains Labyrinth Hazards',
    regexToken: 'az' },

  // ─── SUFFIXES ─────────────────────────────────────────────────────────────

  // S-tier
  { name: 'of Exposure',    affix: 'suffix', tier: 'S', quant: 19, rarity: 11, pack: 20,
    keyword: 'Players have -20% to all maximum Resistances',
    regexToken: 'ax R' },
  { name: 'of Defiance',    affix: 'suffix', tier: 'S', quant: 16, rarity: 12, pack: 6,
    secondary: '+64% Currency',
    keyword: 'Debuffs on Monsters expire 100% faster',
    regexToken: 'deb' },
  { name: 'of Penetration', affix: 'suffix', tier: 'S', quant: 19, rarity: 72, pack: 6,
    keyword: 'Monster Damage Penetrates 15% Elemental Resistances',
    regexToken: 'net' },
  { name: 'of Deadliness',  affix: 'suffix', tier: 'S', quant: 16, rarity: 56, pack: 6,
    keyword: '(650-700)% increased Critical Strike Chance',
    regexToken: '650' },

  // A-tier currency
  { name: 'of the Juggernaut', affix: 'suffix', tier: 'A', quant: 13, rarity: 8, pack: 5,
    secondary: '+47% Currency',
    keyword: 'Monsters cannot be Stunned',
    regexToken: 'tun' },
  { name: 'of Imbibing',    affix: 'suffix', tier: 'A', quant: 13, rarity: 8,  pack: 5,
    secondary: '+45% Currency',
    keyword: 'Players are targeted by a Meteor when they use a Flask',
    regexToken: 'eor' },
  { name: 'of Congealment',  affix: 'suffix', tier: 'A', quant: 16, rarity: 49, pack: 6,
    keyword: 'Players have (50-60)% reduced Maximum total Life, Mana and Energy Shield Recovery per second from Leech',
    regexToken: 'eech' },
  { name: 'of Venom',       affix: 'suffix', tier: 'A', quant: 16, rarity: 49, pack: 6,
    keyword: 'Monsters Poison on Hit\nAll Damage from Monsters',
    regexToken: 'an Poi' },
  { name: 'of Curses',      affix: 'suffix', tier: 'A', quant: 13, rarity: 11, pack: 6,
    secondary: '+35% Scarabs',
    keyword: "Players are Cursed with Vulnerability\nPlayers are Cursed with Temporal Chains",
    regexToken: 'oral' },

  // B-tier maps
  { name: 'of Power',      affix: 'suffix', tier: 'B', quant: 13, rarity: 8, pack: 5,
    secondary: '+35% Maps',
    keyword: 'Monsters have +1 to Maximum Power Charges',
    regexToken: 'um p' },
  { name: 'of Frenzy',     affix: 'suffix', tier: 'B', quant: 13, rarity: 8, pack: 5,
    secondary: '+35% Maps',
    keyword: 'Monsters have +1 to Maximum Frenzy Charges',
    regexToken: 'mum f' },
  { name: 'of Endurance',  affix: 'suffix', tier: 'B', quant: 13, rarity: 8, pack: 5,
    secondary: '+35% Maps',
    keyword: 'Monsters have +1 to Maximum Endurance Charges',
    regexToken: 'm End' },
  { name: 'of Domination', affix: 'suffix', tier: 'B', quant: 13, rarity: 8, pack: 5,
    secondary: '+35% Maps',
    keyword: 'Unique Monsters have a random Shrine Buff',
    regexToken: 'ne b' },

  // B-tier scarabs
  { name: 'of Miring',     affix: 'suffix', tier: 'B', quant: 13, rarity: 8, pack: 5,
    secondary: '+35% Scarabs',
    keyword: 'Players have (25-30)% less Defences',
    regexToken: 'fenc' },
  { name: 'of Transience', affix: 'suffix', tier: 'B', quant: 10, rarity: 6, pack: 4,
    secondary: '+35% Scarabs',
    keyword: 'Buffs on Players expire 100% faster',
    regexToken: 'yers e' },
  { name: 'of Marking',    affix: 'suffix', tier: 'B', quant: 16, rarity: 8, pack: 5,
    secondary: '+36% Scarabs',
    keyword: 'Area contains patches of moving Marked Ground',
    regexToken: 'rke' },

  // B-tier misc
  { name: 'of Impotence',  affix: 'suffix', tier: 'B', quant: 13, rarity: 69, pack: 5,
    keyword: 'Players have (25-30)% less Area of Effect',
    regexToken: 'ss Ar' },
  { name: 'of Toughness',  affix: 'suffix', tier: 'B', quant: 10, rarity: 56, pack: 5,
    keyword: 'Monsters take (35-45)% reduced Extra Damage from Critical Strikes',
    regexToken: 'uced ex' },
  { name: 'of Splinters',  affix: 'suffix', tier: 'B', quant: 19, rarity: 8,  pack: 5,
    keyword: '25% chance for Rare Monsters to Fracture on death',
    regexToken: 'ractu' },
  { name: 'of Treachery',  affix: 'suffix', tier: 'B', quant: 16, rarity: 54, pack: 5,
    keyword: 'Auras from Player Skills which affect Allies also affect Enemies',
    regexToken: 'lies' },
  { name: 'of Persistence', affix: 'suffix', tier: 'B', quant: 16, rarity: 8, pack: 17,
    keyword: 'Rare monsters in area Temporarily Revive on death',
    regexToken: 'evive' },
  { name: 'of Collection',  affix: 'suffix', tier: 'B', quant: 13, rarity: 8, pack: 20,
    keyword: 'The Maven interferes with Players',
    regexToken: 'mav' },
  { name: 'of Decaying',   affix: 'suffix', tier: 'X', quant: 16, rarity: 11, pack: 20,
    keyword: 'Area contains Unstable Tentacle Fiends',
    regexToken: 'nsta' },
];

// ─── Analysis ─────────────────────────────────────────────────────────────────

export interface ModAnalysis {
  detected:     UberMod[];
  prefixes:     UberMod[];
  suffixes:     UberMod[];
  goodPrefixes: UberMod[];
  goodSuffixes: UberMod[];
  prefixScore:  number;
  suffixScore:  number;
  recommendation: 'excellent' | 'good' | 'decent' | 'standard';
  chiselRec:    'Avarice' | 'Proliferation' | 'none';
  chiselReason: string;
}

const TIER_SCORE: Record<string, number> = { S: 4, A: 3, B: 1, X: 0 };

export function analyzeMap(text: string): ModAnalysis {
  const detected: UberMod[] = [];
  for (const mod of UBER_MODS) {
    const lines = mod.keyword.split('\n');
    if (lines.every((line) => text.includes(line)) &&
        !detected.find((d) => d.keyword === mod.keyword)) {
      detected.push(mod);
    }
  }
  const prefixes     = detected.filter((m) => m.affix === 'prefix');
  const suffixes     = detected.filter((m) => m.affix === 'suffix');
  const goodPrefixes = prefixes.filter((m) => m.tier === 'S' || m.tier === 'A');
  const goodSuffixes = suffixes.filter((m) => m.tier === 'S' || m.tier === 'A');
  const prefixScore  = prefixes.reduce((a, m) => a + (TIER_SCORE[m.tier] ?? 0), 0);
  const suffixScore  = suffixes.reduce((a, m) => a + (TIER_SCORE[m.tier] ?? 0), 0);
  const totalGood    = goodPrefixes.length + goodSuffixes.length;

  let recommendation: ModAnalysis['recommendation'];
  if      (totalGood >= 4) recommendation = 'excellent';
  else if (totalGood >= 2) recommendation = 'good';
  else if (totalGood >= 1) recommendation = 'decent';
  else                     recommendation = 'standard';

  const currMatch = text.match(/More Currency: \+(\d+)%/);
  const currVal   = currMatch ? parseInt(currMatch[1]) : 0;
  const packMatch = text.match(/Monster Pack Size: \+(\d+)%/);
  const packVal   = packMatch ? parseInt(packMatch[1]) : 0;

  let chiselRec: ModAnalysis['chiselRec'] = 'Avarice';
  let chiselReason: string;
  if (currVal > 0) {
    chiselReason = `Currency mod present (${currVal}%) — Avarice adds flat +50% on top`;
  } else if (packVal < 15) {
    chiselRec    = 'Proliferation';
    chiselReason = `Low pack size (${packVal}%) — Proliferation +10% pack gives the biggest relative gain`;
  } else {
    chiselReason = `Avarice flat +50% currency vs Proliferation +10% pack (${packVal}%) — Avarice wins`;
  }

  return { detected, prefixes, suffixes, goodPrefixes, goodSuffixes,
           prefixScore, suffixScore, recommendation, chiselRec, chiselReason };
}
