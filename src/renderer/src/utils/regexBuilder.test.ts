import { describe, expect, it } from 'vitest';
import {
  compileMagicMapPredicate,
  findPresetIdForGroup,
  generateBuilderRegex,
  generateMagicMapRegex,
  generatePosRegex,
  getAvailablePresetIds,
  OPEN_EITHER_PATTERN,
  OPEN_PREFIX_PATTERN,
  OPEN_SUFFIX_PATTERN,
  REGEX_CHAR_LIMIT,
} from './regexBuilder';
import type { ModGroupState } from './regexBuilderPresets';

const group = (
  id: string,
  tokens: string[],
  minimum: number,
  selected = tokens.map((_, index) => `${id}-${index}`),
): ModGroupState => ({
  id,
  label: `Group ${id}`,
  mods: tokens.map((token, index) => ({
    id: `${id}-${index}`,
    token,
    label: `Mod ${index + 1}`,
  })),
  selected,
  k: minimum,
});

describe('generatePosRegex', () => {
  it('emits one OR block for K=1', () => {
    expect(generatePosRegex(['alpha', 'beta', 'gamma'], 1))
      .toBe('"alpha|beta|gamma"');
  });

  it('emits one required block per token for K=N', () => {
    expect(generatePosRegex(['alpha', 'beta', 'gamma'], 3))
      .toBe('"alpha" "beta" "gamma"');
  });

  it('emits the current product-of-sums combinations byte for byte', () => {
    expect(generatePosRegex(['alpha', 'beta', 'gamma'], 2))
      .toBe('"alpha|beta" "alpha|gamma" "beta|gamma"');
  });

  it('returns no output for empty or invalid group thresholds', () => {
    expect(generatePosRegex([], 1)).toBe('');
    expect(generatePosRegex(['alpha'], 0)).toBe('');
    expect(generatePosRegex(['alpha'], 2)).toBe('');
  });
});

describe('generateBuilderRegex', () => {
  it('assembles multiple groups with one exact separating space', () => {
    const result = generateBuilderRegex([
      group('a', ['alpha', 'beta'], 1),
      group('b', ['gamma', 'delta'], 2),
    ]);

    expect(result.regex).toBe('"alpha|beta" "gamma" "delta"');
    expect(result.blockCount).toBe(3);
    expect(result.groups.map((entry) => ({
      id: entry.id,
      minimum: entry.minimum,
      selectedCount: entry.selectedCount,
      blockCount: entry.blockCount,
    }))).toEqual([
      { id: 'a', minimum: 1, selectedCount: 2, blockCount: 1 },
      { id: 'b', minimum: 2, selectedCount: 2, blockCount: 2 },
    ]);
  });

  it('preserves custom tokens and skips groups without valid output', () => {
    const result = generateBuilderRegex([
      group('custom', ['!exact custom.*token'], 1),
      group('empty', ['unused'], 1, []),
    ]);

    expect(result.regex).toBe('"!exact custom.*token"');
    expect(result.groups).toHaveLength(1);
  });

  it('reports the exact stash character-limit boundary', () => {
    const exact = generateBuilderRegex([
      group('exact', ['a'.repeat(123), 'b'.repeat(124)], 1),
    ]);
    const over = generateBuilderRegex([
      group('over', ['a'.repeat(123), 'b'.repeat(125)], 1),
    ]);

    expect(exact.charCount).toBe(REGEX_CHAR_LIMIT);
    expect(over.charCount).toBe(REGEX_CHAR_LIMIT + 1);
  });
});

describe('preset group availability', () => {
  const presets = [
    { id: 'pack', mods: [{ id: 'pack-a' }, { id: 'pack-b' }] },
    { id: 'currency', mods: [{ id: 'currency-a' }] },
  ];

  it('recognises a preset even after custom tokens are added', () => {
    const pack = group('pack', ['a', 'b'], 1);
    pack.mods = [
      { id: 'pack-a', token: 'a', label: 'A' },
      { id: 'pack-b', token: 'b', label: 'B' },
      { id: 'custom_1', token: 'custom', label: 'Custom' },
    ];

    expect(findPresetIdForGroup(pack, presets)).toBe('pack');
  });

  it('offers only presets not already represented by a group', () => {
    const pack = group('pack', ['a', 'b'], 1);
    pack.mods = [
      { id: 'pack-a', token: 'a', label: 'A' },
      { id: 'pack-b', token: 'b', label: 'B' },
    ];

    expect(getAvailablePresetIds([pack], presets)).toEqual(['currency']);
  });

  it('does not mistake a custom-only group for a preset', () => {
    const custom = group('custom', ['token'], 1);
    custom.mods = [{ id: 'custom_1', token: 'token', label: 'Custom' }];

    expect(findPresetIdForGroup(custom, presets)).toBeUndefined();
    expect(getAvailablePresetIds([custom], presets)).toEqual(['pack', 'currency']);
  });
});

describe('magic-map workflow generation', () => {
  const suppliedWorkflow = () => generateMagicMapRegex({
    required: [
      { kind: 'stat', stat: 'packSize', minimum: 20 },
    ],
    alternatives: [
      { kind: 'open-affix', side: 'either' },
      { kind: 'token', token: 'deb' },
      { kind: 'stat', stat: 'packSize', minimum: 40 },
    ],
  });

  it('preserves the supplied two-block open/deb/40 plus required-20 workflow', () => {
    const result = suppliedWorkflow();

    expect(result.regex).toBe(
      '"size.*([2-9].|\\d..)%" "^Map of|Map \\(Tier|deb|size.*([4-9].|\\d..)%"',
    );
    expect(result.charCount).toBe(result.regex.length);
    expect(result.blockCount).toBe(2);
    expect(result.invalidCount).toBe(0);
  });

  it('matches each intended keeper branch but still requires the baseline', () => {
    const clauses = suppliedWorkflow().regex
      .split('" "')
      .map((clause) => clause.replace(/^"|"$/g, ''));
    const matches = (text: string) => clauses.every((clause) => new RegExp(clause, 'im').test(text));

    expect(matches('Fecund Map of Exposure (Tier 16)\nMonster Pack Size: +40%')).toBe(true);
    expect(matches('Map of Defiance (Tier 16)\nMonster Pack Size: +20%')).toBe(true);
    expect(matches('Fecund Map of Defiance (Tier 16)\nMonster Pack Size: +20%\nDebuffs on Monsters expire 100% faster')).toBe(true);
    expect(matches('Fecund Map of Exposure (Tier 16)\nMonster Pack Size: +20%')).toBe(false);
    expect(matches('Map of Defiance (Tier 16)\nMonster Pack Size: +19%')).toBe(false);
  });

  it('keeps non-round numeric floors exact', () => {
    expect(compileMagicMapPredicate({
      kind: 'stat',
      stat: 'moreCurrency',
      minimum: 64,
    })).toBe('curr.*(6[4-9]|[7-9].|\\d..)%');
  });

  it('supports More Maps and More Scarabs thresholds', () => {
    expect(generateMagicMapRegex({
      required: [{ kind: 'stat', stat: 'moreMaps', minimum: 35 }],
      alternatives: [{ kind: 'stat', stat: 'moreScarabs', minimum: 53 }],
    }).regex).toBe(
      '"maps.*(3[5-9]|[4-9].|\\d..)%" "scarabs.*(5[3-9]|[6-9].|\\d..)%"',
    );
  });

  it('exposes prefix, suffix, and either-open-affix predicates independently', () => {
    expect(compileMagicMapPredicate({ kind: 'open-affix', side: 'prefix' })).toBe(OPEN_PREFIX_PATTERN);
    expect(compileMagicMapPredicate({ kind: 'open-affix', side: 'suffix' })).toBe(OPEN_SUFFIX_PATTERN);
    expect(compileMagicMapPredicate({ kind: 'open-affix', side: 'either' })).toBe(OPEN_EITHER_PATTERN);
  });

  it('adds an applied chisel bonus only to its selected stat', () => {
    const appliedScarabChisel = { stat: 'moreScarabs' as const, bonus: 50, applied: true };
    expect(compileMagicMapPredicate(
      { kind: 'stat', stat: 'moreScarabs', minimum: 20 },
      appliedScarabChisel,
    )).toBe('scarabs.*([7-9].|\\d..)%');
    expect(compileMagicMapPredicate(
      { kind: 'stat', stat: 'packSize', minimum: 20 },
      appliedScarabChisel,
    )).toBe('size.*([2-9].|\\d..)%');
    expect(compileMagicMapPredicate(
      { kind: 'stat', stat: 'moreScarabs', minimum: 20 },
      { ...appliedScarabChisel, applied: false },
    )).toBe('scarabs.*([2-9].|\\d..)%');
  });

  it('retains the literal floor while a selected chisel is not applied', () => {
    const result = generateMagicMapRegex({
      required: [{ kind: 'stat', stat: 'moreCurrency', minimum: 20 }],
      alternatives: [{ kind: 'token', token: 'deb' }],
      chisel: { stat: 'moreCurrency', bonus: 50, applied: false },
    });

    expect(result.regex).toBe('"curr.*([2-9].|\\d..)%" "deb"');
    expect(result.blockCount).toBe(2);
    expect(result.invalidCount).toBe(0);
  });

  it.each([
    ['moreCurrency', 50, 'curr.*([7-9].|\\d..)%'],
    ['rarity', 40, 'm rar.*([6-9].|\\d..)%'],
    ['packSize', 10, 'size.*([3-9].|\\d..)%'],
    ['moreScarabs', 50, 'scarabs.*([7-9].|\\d..)%'],
    ['moreDivCards', 50, 'divi.*([7-9].|\\d..)%'],
  ] as const)('applies the active %s chisel bonus', (stat, bonus, expected) => {
    expect(compileMagicMapPredicate(
      { kind: 'stat', stat, minimum: 20 },
      { stat, bonus, applied: true },
    )).toBe(expected);
  });

  it('reports unfinished direct-token conditions instead of silently copying around them', () => {
    const result = generateMagicMapRegex({
      required: [{ kind: 'stat', stat: 'packSize', minimum: 20 }],
      alternatives: [{ kind: 'token', token: '  ' }],
    });

    expect(result.regex).toBe('"size.*([2-9].|\\d..)%"');
    expect(result.invalidCount).toBe(1);
  });
});
