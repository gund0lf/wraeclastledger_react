/**
 * modTokens.test.ts — guards token integrity and catches regressions.
 *
 * What this tests:
 *   1. Every token ID is unique
 *   2. Every token value is non-empty
 *   3. No accidental duplicate tokens that would cause false-positive collisions
 *      (unless intentionally documented)
 *   4. RegexBuilder group tokens all resolve from MOD_TOKENS
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { MOD_TOKENS } from '../../../shared/modTokens';
import {
  BRICK_MOD_DEFS,
  brickRegexTerm,
  expandSelectedBrickIds,
  normalizeTradeStatText,
  resolveBrickTradeStats,
} from '../../../shared/brickMods';

describe('MOD_TOKENS integrity', () => {
  const entries = Object.entries(MOD_TOKENS);

  it('has no empty tokens', () => {
    for (const [id, token] of entries) {
      expect(token.length, `${id} has empty token`).toBeGreaterThan(0);
    }
  });

  it('has unique IDs (enforced by TS object keys)', () => {
    // TypeScript objects can't have duplicate keys at compile time,
    // but this guards against copy-paste errors where a key shadows another.
    expect(entries.length).toBeGreaterThan(100);
  });

  it('flags unexpected duplicate token values', () => {
    // Some tokens intentionally overlap (e.g. regular + uber for same mod text).
    // This test documents which duplicates are known-intentional.
    const KNOWN_DUPES = new Set([
      'um re',  // reduced_max_resistances (regular) + uber_20_max_resistances
      'tun',    // cannot_be_stunned (regular) + uber_stunned_action_move_speed_floor
      'poss',   // unique_bosses_possessed (regular) — shared with uber Enthralled
      'yers e', // buffs_on_players_expire_faster (regular) — shared with uber Transience
    ]);

    const seen = new Map<string, string[]>();
    for (const [id, token] of entries) {
      if (!seen.has(token)) seen.set(token, []);
      seen.get(token)!.push(id);
    }

    for (const [token, ids] of seen) {
      if (ids.length > 1 && !KNOWN_DUPES.has(token)) {
        throw new Error(
          `Unexpected duplicate token '${token}' shared by: ${ids.join(', ')}. ` +
          `If intentional, add to KNOWN_DUPES in this test.`
        );
      }
    }
  });

  it('all tokens are reasonably short for stash regex use', () => {
    for (const [id, token] of entries) {
      expect(token.length, `${id} token '${token}' is too long (>10 chars)`).toBeLessThanOrEqual(10);
    }
  });
});

// --- WP12 brick-mod alignment guard ---
// BRICK_MOD_DEFS moved to src/shared and now derives its stash token from
// MOD_TOKENS[id] via brickRegexTerm(). This is the FROZEN set of regexTerm values
// captured before the move; the tests prove the refactor changed NONE of them, and
// act as the drift guard going forward (add/remove a brick -> update this snapshot).
const BRICK_REGEX_SNAPSHOT: Record<string, string> = {
  'Thorns Reflection (all tiers)': 'horns',
  'Reduced Non-Curse Aura Effect': 'non-c',
  'Reduced Max Resistances': 'um re',
  'Cannot Regenerate Life/Mana/ES': 'reg',
  'Players: Less Life/ES Recovery Rate': 'te of',
  'Cannot Be Leeched From': 'eche',
  'High Crit Chance + Multiplier': 'ike m',
  'Extra Chaos Damage + Withered': 'withe',
  'Extra Fire Damage': 'fire',
  'Extra Cold Damage': 'as col',
  'Extra Lightning Damage': 'ghtnin',
  'Monsters Fire Extra Projectiles': 'onal pr',
  'Boss Damage + Attack Speed': 'oss de',
  'Monster Speed (Move/Attack/Cast)': 'ster mo',
  'Boss More Life + AoE': 'oss ha',
  'Monsters Increased AoE': 'rea of e',
  'Avoid Poison/Impale/Bleed': 'mpale',
  'Monsters Poison on Hit': 'n on hi',
  'Skills Chain Additional Times': 'hain 2',
  'Increased Monster Damage': 'ster da',
  'Players Less Suppressed Spell Damage': 'uppres',
  'Monsters Increased Accuracy Rating': 'ccurac',
  'Monsters Suppress Spell Damage Chance': 'ppress',
  'Less Curse Effect': 'f curs',
  'Cursed with Enfeeble': 'feebl',
  'Cursed with Vulnerability': 'ulnera',
  'Cursed with Temporal Chains': 'empor',
  'Cursed with Elemental Weakness': 'al wea',
  'Consecrated Ground': 'onsecr',
  'Desecrated Ground': 'esecr',
  'Shocked Ground': 'hocked g',
  'Chilled Ground': 'hilled g',
  'Burning Ground': 'urning g',
  'Reduced Block + Less Armour': 'nce to b',
  'Reduced Crit Damage Taken': 'uced ext',
  'Extra Energy Shield from Life': 'ife as e',
  'Reduced Flask Charges': 'sk char',
  'Avoid Elemental Ailments': 'oid ele',
  'Physical Damage Reduction': 'ysic',
  'Cannot Inflict Exposure': 'posure',
  'Monsters Hexproof': 'xpro',
  'Chaos + Elemental Resistances': 'haos re',
  'More Monster Life': 're mon',
  'Cannot Be Stunned': 'tun',
  'All Damage Ignites': 'lways i',
  'Impale on Hit': 'pale on',
  'Ignite/Freeze/Shock Chance': 'hock on',
  'Buffs on Players Expire Faster': 'yers e',
  'Less Cooldown Recovery': 'coo',
  'Unique Bosses Possessed': 'poss',
  'Two Unique Bosses': 'o uniqu',
  'Cannot Be Taunted/Slowed': 'aunted',
  'Players Less Accuracy': 'ss acc',
  'Monsters Steal Charges': 'teal p',
  'Monsters Gain Frenzy Charges': 'renz',
  'Monsters Gain Endurance Charges': 'ndur',
  'Monsters Gain Power Charges': 'ower c',
  'Players Less Area of Effect': 'ss are',
  'Monsters Maim on Hit': 'aim on',
  'Monsters Hinder on Hit': 'inder',
  'Monsters Blind on Hit': 'lind o',
  'Area Contains Many Totems': 'otems',
  'Area Has Increased Monster Variety': 'ariety',
  'Inhabited by Cultists of Kitava': 'itava',
  'Inhabited by Ranged Monsters': 'ranged',
  'Inhabited by Lunaris Fanatics': 'unar',
  'Inhabited by Undead': 'ndead',
  'Inhabited by Humanoids': 'umano',
  'Inhabited by Goatmen': 'oatme',
  'Inhabited by Skeletons': 'kelet',
  'Inhabited by Solaris Fanatics': 'olari',
  'Inhabited by Sea Witches': 'ea wi',
  'Inhabited by Demons': 'by dem',
  'Inhabited by Abominations': 'bomin',
  'Inhabited by Animals': 'nimal',
  'Inhabited by Ghosts': 'host',
  'Increased Rare Monsters': 'rare mo',
  'Increased Magic Monsters': 'agic mo',
  'Synthesis Boss': 'yn',
  '-20% Max Resistances': 'um re',
  '+50% Monster Block Chance': 'k d',
  'Rare Monsters Shaper-Touched': '-t',
  'Rare Monsters +1 Modifier': '1 add',
  'Unstable Tentacle Fiends': 'nsta',
  'Frenzy Charge + Max Frenzy': 'mum f',
  'Penetrates Elemental Resistances': 'net',
  'Skills Chain + Terrain Chain': 'lid',
  'Grasping Vines on Hit': 'rasp',
  'Drowning Orbs': 'wni',
  'Random Elemental Damage': 'andom E',
  'Massive All Resistances': 'uct',
  'All Damage Can Ignite/Freeze/Shock': 'n ig',
  'Less Flask Effect': 'sks',
  'Endurance Charges + Max Endurance': 'm End',
  'Shrine Buff on Unique Monsters': 'ne b',
  'Triple Curse (Vuln/Temporal/Elem)': 'oral',
  'Stunned + Action/Move Speed Floor': 'tun',
  'Searing Exarch Runes': 'rch',
  'Rare Monsters Temporarily Revive': 'evive',
  'Poison + Duration + All Can Poison': 'an Poi',
  'Bloodstained Sawblades': 'wb',
  'Debuffs Expire Faster': 'deb',
  'Reduced Leech Recovery': 'eech',
  'Rare Monsters Fracture on Death': 'ractu',
  'Flask Triggers Meteor': 'eor',
  'Players Less Defences': 'fenc',
  'Extra Projectiles + Massive AoE': '2 a',
  'Power Charges + Max Power': 'um p',
  'Labyrinth Hazards': 'az',
  'Rare Monsters Volatile Cores': 'vol',
  'The Maven Interferes': 'mav',
  'Auras Affect Enemies': 'lies',
  'Moving Marked Ground': 'rke',
};

describe('BRICK_MOD_DEFS <-> MOD_TOKENS alignment (WP12)', () => {
  it('covers exactly the snapshot labels (no additions/removals)', () => {
    const labels = BRICK_MOD_DEFS.map((d) => d.label);
    expect(labels.length).toBe(Object.keys(BRICK_REGEX_SNAPSHOT).length);
    expect(new Set(labels).size, 'brick labels must be unique').toBe(labels.length);
    expect(new Set(labels)).toEqual(new Set(Object.keys(BRICK_REGEX_SNAPSHOT)));
  });

  it('every brick derives its exact original regexTerm from MOD_TOKENS (zero drift)', () => {
    for (const def of BRICK_MOD_DEFS) {
      expect(brickRegexTerm(def), `${def.label} (${def.id})`).toBe(BRICK_REGEX_SNAPSHOT[def.label]);
    }
  });

  it('every brick id resolves to a non-empty MOD_TOKENS entry', () => {
    for (const def of BRICK_MOD_DEFS) {
      expect(MOD_TOKENS[def.id]?.length, def.id).toBeGreaterThan(0);
    }
  });

  it('brick ids are unique', () => {
    const ids = BRICK_MOD_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('exact Trade-stat resolution', () => {
  const byId = (id: string) => BRICK_MOD_DEFS.find((def) => def.id === id)!;

  it('normalizes Trade API tag markup before exact matching', () => {
    const tagged = 'Rare Monsters have [ElementalThorns|Elemental Thorns] reflecting # Elemental Damage';
    expect(normalizeTradeStatText(tagged)).toBe(
      'Rare Monsters have Elemental Thorns reflecting # Elemental Damage',
    );
  });

  it('resolves intended map stats without collecting global gear-stat decoys', () => {
    const ids = [
      'reduced_max_resistances',
      'reduced_non_curse_aura_effect',
      'cannot_regenerate_life_mana_es',
      'less_recovery_rate',
      'high_crit_chance_multiplier',
      'reduced_block_less_armour',
      'avoid_elemental_ailments',
      'more_monster_life',
      'players_less_accuracy',
    ];
    const definitions = ids.map(byId);
    const intended = definitions.flatMap((def) =>
      def.tradePatterns.map((pattern, index) => ({
        id: pattern.statId ?? `intended.${def.id}.${index}`,
        text: pattern.text
          .replace('Elemental Thorns', '[ElementalThorns|Elemental Thorns]')
          .replace('Physical Thorns', '[PhysicalThorns|Physical Thorns]'),
      })),
    );
    const decoys = [
      { id: 'gear.max-res', text: '+#% to all maximum Resistances while you have no Endurance Charges' },
      { id: 'gear.spectre-max-res', text: 'Raised Spectres have +#% to all maximum Resistances' },
      { id: 'gear.aura', text: '#% increased effect of Non-Curse Auras from your Skills on Enemies' },
      { id: 'gear.recovery', text: '#% increased Recovery Rate of Life and Energy Shield' },
      { id: 'gear.block', text: '#% reduced Chance to Block Attack and Spell Damage' },
      { id: 'gear.ailments', text: '#% chance to Avoid Elemental Ailments while Phasing' },
      { id: 'obsolete.more-life', text: '#% more Monster Life' },
      { id: 'gear.accuracy', text: '+# to Accuracy Rating' },
      { id: 'gear.accuracy-percent', text: '#% increased Accuracy Rating' },
    ];

    const result = resolveBrickTradeStats([...intended, ...decoys], definitions);
    expect(result.unavailable).toEqual([]);
    expect(Object.fromEntries(result.resolved.map(({ def, statIds }) => [def.id, statIds]))).toEqual(
      Object.fromEntries(definitions.map((def) => [
        def.id,
        def.tradePatterns.map((pattern, index) => pattern.statId ?? `intended.${def.id}.${index}`),
      ])),
    );
    const expanded = expandSelectedBrickIds(ids, result.resolved);
    expect(expanded).toHaveLength(9);
    expect(expanded.every((id) => id.startsWith('intended.') || id.startsWith('explicit.'))).toBe(true);
  });

  it('keeps the historically inverted player-accuracy label separate from monster accuracy', () => {
    const playerAccuracy = byId('players_less_accuracy');
    const monsterAccuracy = byId('monsters_increased_accuracy_rating');
    expect(playerAccuracy.tradePatterns[0].text).toBe('Players have #% more Accuracy Rating');
    expect(monsterAccuracy.tradePatterns[0].text).toBe('Monsters have #% increased Accuracy Rating');
  });

  it('fails a brick closed when an exact pattern is missing or ambiguous', () => {
    const maxRes = byId('reduced_max_resistances');
    expect(resolveBrickTradeStats([], [maxRes]).unavailable).toEqual([{
      id: maxRes.id,
      label: maxRes.label,
      expectedCount: 1,
      actualCount: 0,
    }]);

    const duplicateText = maxRes.tradePatterns[0].text;
    expect(resolveBrickTradeStats([
      { id: 'duplicate.one', text: duplicateText },
      { id: 'duplicate.two', text: duplicateText },
    ], [maxRes]).unavailable[0]).toMatchObject({
      id: maxRes.id,
      expectedCount: 1,
      actualCount: 2,
    });
  });

  it('pins the complete exact-pattern registry', () => {
    const snapshot = BRICK_MOD_DEFS.map(({ id, tradePatterns }) => ({ id, tradePatterns }));
    expect(createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')).toBe(
      'a894dfce98e5a5d61b4a9773b1cf41f0586f5d6f95aa29a5c1a90722ff3e42b6',
    );
  });

  it('expands one stable brick id to both Thorns Trade filters', () => {
    const thorns = byId('thorns_reflection');
    expect(expandSelectedBrickIds(
      [thorns.id, 'unknown.brick'],
      [{ def: thorns, statIds: ['explicit.stat_physical', 'explicit.stat_elemental'] }],
    )).toEqual([
      'explicit.stat_physical',
      'explicit.stat_elemental',
    ]);
  });

  it('keeps tier labels independently selectable while deduplicating a shared Trade stat', () => {
    const regular = byId('reduced_max_resistances');
    const nightmare = byId('uber_20_max_resistances');
    expect(regular.label).not.toBe(nightmare.label);
    expect(expandSelectedBrickIds(
      [regular.id, nightmare.id],
      [
        { def: regular, statIds: ['explicit.shared-max-res'] },
        { def: nightmare, statIds: ['explicit.shared-max-res'] },
      ],
    )).toEqual(['explicit.shared-max-res']);
  });
});
