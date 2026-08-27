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
  BRICK_MOD_FAMILIES,
  BRICK_MOD_DEFS,
  brickRegexTerm,
  buildBrickTradeStatGroups,
  compileBrickExclusionPattern,
  compileBrickExclusionTerms,
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
      const max = id.startsWith('brick_') ? 24 : 10;
      expect(token.length, `${id} token '${token}' is too long (>${max} chars)`).toBeLessThanOrEqual(max);
    }
  });
});

describe('stash-token collision guards', () => {
  it('matches More Monster Life across tiers without matching Rare Monsters or More Maps', () => {
    const token = new RegExp(MOD_TOKENS.more_monster_life, 'i');

    expect(token.test('42% more Monster Life')).toBe(true);
    expect(token.test('100% more Monster Life')).toBe(true);

    const decoys = [
      'Rare Monsters have Physical Thorns reflecting 800 Physical Damage',
      '24% increased number of Rare Monsters',
      'Rare monsters in area Temporarily Revive on death',
      '35% more Maps found in Area',
    ];
    for (const decoy of decoys) {
      expect(token.test(decoy), decoy).toBe(false);
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
  'More Monster Life': 'ore mo',
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
  const replacedLabels = new Set([
    'Thorns Reflection (all tiers)',
    'Reduced Max Resistances',
    'High Crit Chance + Multiplier',
    'Increased Monster Damage',
    'Monsters Suppress Spell Damage Chance',
    'Extra Energy Shield from Life',
    'Physical Damage Reduction',
    'Chaos + Elemental Resistances',
    'More Monster Life',
    'Buffs on Players Expire Faster',
    '-20% Max Resistances',
    'Massive All Resistances',
  ]);

  it('keeps every unaffected catalogue token byte-identical', () => {
    for (const [label, token] of Object.entries(BRICK_REGEX_SNAPSHOT)) {
      if (replacedLabels.has(label)) continue;
      const def = BRICK_MOD_DEFS.find((candidate) => candidate.label === label);
      expect(def, label).toBeDefined();
      expect(brickRegexTerm(def!), `${label} (${def!.id})`).toBe(token);
    }
  });

  it('pins all 21 approved semantic leaf tokens', () => {
    const expected = {
      brick_crit_regular: '4[1-5]% to m',
      brick_crit_nightmare: '7[0-5]% to m',
      brick_es_regular: '4\\d% of m',
      brick_es_nightmare: '(7\\d|80)% of m',
      brick_max_res_regular: '-(9|1[0-2])% to all',
      brick_max_res_nightmare: '-20% to all',
      brick_monster_damage_regular: '2[2-5]%.*r d',
      brick_monster_damage_nightmare: '(3\\d|40)%.*r d',
      brick_monster_life_low_regular: '(2[5-9]|30)% more mo',
      brick_monster_life_regular: '4\\d% more mo',
      brick_monster_life_nightmare: '(9\\d|100)% more mo',
      brick_suppression_regular: '60% chance to s',
      brick_suppression_nightmare: '100% chance to s',
      brick_buff_expiry_regular: 'players expire 70%',
      brick_buff_expiry_nightmare: 'players expire 100%',
      brick_thorns_physical_regular: 'ting 800 p',
      brick_thorns_elemental_regular: 'ting 1500 e',
      brick_thorns_combined_nightmare: 'ting 2500 e',
      brick_armoured_regular: '40%.*duct',
      brick_resistant_regular: '25%.*r chao',
      brick_protected_nightmare: '50%.*duct',
    } as const;
    expect(Object.fromEntries(BRICK_MOD_DEFS
      .filter((def) => def.familyId)
      .map((def) => [def.id, brickRegexTerm(def)])))
      .toEqual(expected);
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

  it('resolves exact semantic stats and keeps their signed/value bounds', () => {
    const ids = [
      'brick_crit_regular',
      'brick_crit_nightmare',
      'brick_max_res_regular',
      'brick_max_res_nightmare',
      'brick_monster_life_low_regular',
      'brick_monster_life_regular',
      'brick_monster_life_nightmare',
      'brick_thorns_physical_regular',
      'brick_thorns_elemental_regular',
      'brick_thorns_combined_nightmare',
      'brick_armoured_regular',
      'brick_resistant_regular',
      'brick_protected_nightmare',
    ];
    const definitions = ids.map(byId);
    const intended = [...new Map(definitions.flatMap((def) =>
      def.tradePatterns.map((pattern) => [pattern.statId!, {
        id: pattern.statId!,
        text: pattern.text
          .replace('Elemental Thorns', '[ElementalThorns|Elemental Thorns]')
          .replace('Physical Thorns', '[PhysicalThorns|Physical Thorns]'),
      }] as const)),
    ).values()];
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
    expect(Object.fromEntries(result.resolved.map(({ def, filters }) => [def.id, filters])))
      .toEqual(Object.fromEntries(definitions.map((def) => [
        def.id,
        def.tradePatterns.map((pattern) => ({
          id: pattern.statId!,
          value: pattern.value,
        })),
      ])));
    const expanded = expandSelectedBrickIds(ids, result.resolved);
    expect(expanded).toEqual([
      'explicit.stat_57326096',
      'explicit.stat_3376488707',
      'explicit.stat_95249895',
      'explicit.stat_3278889477',
      'explicit.stat_3938822425',
      'explicit.stat_839186746',
      'explicit.stat_365540634',
    ]);
  });

  it('keeps the historically inverted player-accuracy label separate from monster accuracy', () => {
    const playerAccuracy = byId('players_less_accuracy');
    const monsterAccuracy = byId('monsters_increased_accuracy_rating');
    expect(playerAccuracy.tradePatterns[0].text).toBe('Players have #% more Accuracy Rating');
    expect(monsterAccuracy.tradePatterns[0].text).toBe('Monsters have #% increased Accuracy Rating');
  });

  it('fails a brick closed when an exact pattern is missing or ambiguous', () => {
    const maxRes = byId('brick_max_res_regular');
    expect(resolveBrickTradeStats([], [maxRes]).unavailable).toEqual([{
      id: maxRes.id,
      label: maxRes.label,
      expectedCount: 1,
      actualCount: 0,
    }]);

    const aura = byId('reduced_non_curse_aura_effect');
    const duplicateText = aura.tradePatterns[0].text;
    expect(resolveBrickTradeStats([
      { id: 'duplicate.one', text: duplicateText },
      { id: 'duplicate.two', text: duplicateText },
    ], [aura]).unavailable[0]).toMatchObject({
      id: aura.id,
      expectedCount: 1,
      actualCount: 2,
    });
  });

  it('pins the complete exact-pattern registry', () => {
    const snapshot = BRICK_MOD_DEFS.map(({ id, tradePatterns }) => ({ id, tradePatterns }));
    expect(createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')).toBe(
      'cb0f794947bb5c0f106765677dd1c447079a11e01f56dec3a104e12d8c513787',
    );
  });

  it('keeps same-stat numerical leaves independent inside one NOT group', () => {
    const regular = byId('brick_max_res_regular');
    const nightmare = byId('brick_max_res_nightmare');
    expect(buildBrickTradeStatGroups(
      [regular.id, nightmare.id],
      [
        { def: regular, filters: [{ id: 'explicit.stat_3376488707', value: { min: -12, max: -9 } }] },
        { def: nightmare, filters: [{ id: 'explicit.stat_3376488707', value: { min: -20, max: -20 } }] },
      ],
    )).toEqual([
      { type: 'not', filters: [
        { id: 'explicit.stat_3376488707', value: { min: -12, max: -9 } },
        { id: 'explicit.stat_3376488707', value: { min: -20, max: -20 } },
      ] },
    ]);
  });

  it('consolidates ordinary and bounded brick exclusions into one NOT group', () => {
    const ordinary = byId('cannot_regenerate_life_mana_es');
    const regular = byId('brick_es_regular');
    const nightmare = byId('brick_es_nightmare');
    expect(buildBrickTradeStatGroups(
      [ordinary.id, regular.id, nightmare.id],
      [
        { def: ordinary, filters: [{ id: 'explicit.stat_plain' }] },
        { def: regular, filters: [{ id: 'explicit.stat_es', value: { min: 40, max: 49 } }] },
        { def: nightmare, filters: [{ id: 'explicit.stat_es', value: { min: 70, max: 80 } }] },
      ],
    )).toEqual([
      { type: 'not', filters: [
        { id: 'explicit.stat_plain' },
        { id: 'explicit.stat_es', value: { min: 40, max: 49 } },
        { id: 'explicit.stat_es', value: { min: 70, max: 80 } },
      ] },
    ]);
  });

  it('defines exactly the nine approved linked families and 21 leaves', () => {
    expect(BRICK_MOD_FAMILIES.map((familyDef) => familyDef.id)).toEqual([
      'critical_multiplier',
      'energy_shield_from_life',
      'maximum_resistances',
      'monster_damage',
      'monster_life',
      'spell_suppression',
      'buff_expiry',
      'thorns',
      'monster_protection',
    ]);
    expect(BRICK_MOD_FAMILIES.flatMap((familyDef) => familyDef.leafIds)).toHaveLength(21);
    expect(byId('uber_triple_curse_vuln_temporal_elem').familyId).toBeUndefined();
    expect(byId('uber_triple_curse_vuln_temporal_elem').tradePatterns[0]).toEqual({
      text: 'Players are Cursed with Temporal Chains',
      statId: 'explicit.stat_2326202293',
    });
  });

  it('pins every semantic leaf to its exact official stat id and signed range', () => {
    const expected = {
      brick_crit_regular: ['explicit.stat_57326096', 41, 45],
      brick_crit_nightmare: ['explicit.stat_57326096', 70, 75],
      brick_es_regular: ['explicit.stat_2887760183', 40, 49],
      brick_es_nightmare: ['explicit.stat_2887760183', 70, 80],
      brick_max_res_regular: ['explicit.stat_3376488707', -12, -9],
      brick_max_res_nightmare: ['explicit.stat_3376488707', -20, -20],
      brick_monster_damage_regular: ['explicit.stat_1890519597', 22, 25],
      brick_monster_damage_nightmare: ['explicit.stat_1890519597', 30, 40],
      brick_monster_life_low_regular: ['explicit.stat_95249895', 25, 30],
      brick_monster_life_regular: ['explicit.stat_95249895', 40, 49],
      brick_monster_life_nightmare: ['explicit.stat_95249895', 90, 100],
      brick_suppression_regular: ['explicit.stat_2138205941', 60, 60],
      brick_suppression_nightmare: ['explicit.stat_2138205941', 100, 100],
      brick_buff_expiry_regular: ['explicit.stat_1217583941', 70, 70],
      brick_buff_expiry_nightmare: ['explicit.stat_1217583941', 100, 100],
      brick_thorns_physical_regular: ['explicit.stat_3278889477', 800, 800],
      brick_thorns_elemental_regular: ['explicit.stat_3938822425', 1500, 1500],
      brick_thorns_combined_nightmare: ['explicit.stat_3938822425', 2500, 2500],
      brick_armoured_regular: ['explicit.stat_839186746', 40, 40],
      brick_resistant_regular: ['explicit.stat_365540634', 25, 25],
      brick_protected_nightmare: ['explicit.stat_839186746', 50, 50],
    } as const;
    expect(Object.fromEntries(BRICK_MOD_DEFS.filter((def) => def.familyId).map((def) => {
      const pattern = def.tradePatterns[0];
      return [def.id, [pattern.statId, pattern.value?.min, pattern.value?.max]];
    }))).toEqual(expected);
  });

  it('pins every approved optimized exact cover and the remaining leaf fallbacks', () => {
    expect(compileBrickExclusionTerms(['brick_crit_regular', 'brick_crit_nightmare']))
      .toEqual(['ike m']);
    expect(compileBrickExclusionTerms(['brick_es_regular', 'brick_es_nightmare']))
      .toEqual(['ife as e']);
    expect(compileBrickExclusionTerms(['brick_max_res_regular', 'brick_max_res_nightmare']))
      .toEqual(['mum r']);
    expect(compileBrickExclusionTerms([
      'brick_monster_damage_regular', 'brick_monster_damage_nightmare',
    ])).toEqual(['d monster d']);
    expect(compileBrickExclusionTerms([
      'brick_monster_life_regular', 'brick_monster_life_nightmare',
    ])).toEqual(['([49]\\d|100)% more mo']);
    expect(compileBrickExclusionTerms([
      'brick_monster_life_low_regular',
      'brick_monster_life_regular',
      'brick_monster_life_nightmare',
    ])).toEqual(['ore mo']);
    expect(compileBrickExclusionTerms(['brick_monster_life_low_regular']))
      .toEqual(['(2[5-9]|30)% more mo']);
    expect(compileBrickExclusionTerms([
      'brick_suppression_regular', 'brick_suppression_nightmare',
    ])).toEqual(['e to sup']);
    expect(compileBrickExclusionTerms([
      'brick_buff_expiry_regular', 'brick_buff_expiry_nightmare',
    ])).toEqual(['yers e']);
    expect(compileBrickExclusionTerms([
      'brick_thorns_physical_regular', 'brick_thorns_elemental_regular',
    ])).toEqual(['ting (800 p|1500 e)']);
    expect(compileBrickExclusionTerms([
      'brick_thorns_physical_regular', 'brick_thorns_combined_nightmare',
    ])).toEqual(['ting (800|1500) p']);
    expect(compileBrickExclusionTerms([
      'brick_thorns_elemental_regular', 'brick_thorns_combined_nightmare',
    ])).toEqual(['ting (1500|2500) e']);
    expect(compileBrickExclusionTerms([
      'brick_thorns_physical_regular', 'brick_thorns_elemental_regular',
      'brick_thorns_combined_nightmare',
    ])).toEqual(['horns']);
    expect(compileBrickExclusionTerms([
      'brick_armoured_regular', 'brick_protected_nightmare',
    ])).toEqual(['duct']);
    expect(compileBrickExclusionTerms([
      'brick_resistant_regular', 'brick_protected_nightmare',
    ])).toEqual(['r chao']);
    expect(compileBrickExclusionTerms([
      'brick_armoured_regular', 'brick_resistant_regular', 'brick_protected_nightmare',
    ])).toEqual(['duct|r chao']);
    expect(compileBrickExclusionTerms(['brick_max_res_regular']))
      .toEqual(['-(9|1[0-2])% to all']);
  });

  it('migrates broad legacy tokens to their historical reach', () => {
    expect(compileBrickExclusionPattern(['ster da', 'ore mo', 'ppress', 'ysic']))
      .toBe('d monster d|ore mo|e to sup|duct');
  });

  it('keeps every optimized family cover collision-free across the full catalogue', () => {
    const renderedCatalogue = BRICK_MOD_DEFS.map((def) => ({
      id: def.id,
      text: `${def.label}\n${def.displayText ?? def.tradePatterns
        .map((pattern) => pattern.text.replaceAll('#', '42'))
        .join('\n')}`,
    }));

    for (const familyDef of BRICK_MOD_FAMILIES) {
      for (const [key, pattern] of Object.entries(familyDef.exactCovers)) {
        const expected = new Set(key.split('|'));
        const actual = renderedCatalogue
          .filter(({ text }) => new RegExp(pattern, 'i').test(text))
          .map(({ id }) => id);
        expect(new Set(actual), `${familyDef.id}: ${pattern}`).toEqual(expected);
      }
    }
  });

  it('does not confuse Suppression with the separate chance-to-steal modifier', () => {
    const suppression = new RegExp(compileBrickExclusionPattern([
      'brick:brick_suppression_regular',
      'brick:brick_suppression_nightmare',
    ]), 'i');
    expect(suppression.test('Monsters have +60% chance to Suppress Spell Damage')).toBe(true);
    expect(suppression.test('Monsters have +100% chance to Suppress Spell Damage')).toBe(true);
    expect(suppression.test(
      'Monsters have 10% chance to steal Power, Frenzy and Endurance charges on Hit',
    )).toBe(false);
  });

  it('keeps signed max-resistance and split-Thorns stash leaves exact', () => {
    const regularMaxRes = new RegExp(compileBrickExclusionPattern([
      'brick:brick_max_res_regular',
    ]), 'i');
    expect(regularMaxRes.test('Players have -9% to all maximum Resistances')).toBe(true);
    expect(regularMaxRes.test('Players have -12% to all maximum Resistances')).toBe(true);
    expect(regularMaxRes.test('Players have -20% to all maximum Resistances')).toBe(false);

    const physical = new RegExp(compileBrickExclusionPattern([
      'brick:brick_thorns_physical_regular',
    ]), 'i');
    const elemental = new RegExp(compileBrickExclusionPattern([
      'brick:brick_thorns_elemental_regular',
    ]), 'i');
    expect(physical.test('Rare Monsters have Physical Thorns reflecting 800 Physical Damage')).toBe(true);
    expect(physical.test('Rare Monsters have Elemental Thorns reflecting 1500 Elemental Damage')).toBe(false);
    expect(elemental.test('Rare Monsters have Elemental Thorns reflecting 1500 Elemental Damage')).toBe(true);
    expect(elemental.test('Rare Monsters have Physical Thorns reflecting 800 Physical Damage')).toBe(false);
  });

  it('deduplicates regular Temporal Chains when Triple Curse already covers it', () => {
    expect(compileBrickExclusionPattern([
      'brick:cursed_with_temporal_chains',
      'brick:uber_triple_curse_vuln_temporal_elem',
    ])).toBe('oral');
  });
});
