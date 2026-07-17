import { describe, expect, it } from 'vitest';
import {
  adjustAltAugChisel,
  findPresetIdForGroup,
  generateAltAugRegex,
  generateBuilderRegex,
  generatePosRegex,
  getAvailablePresetIds,
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

describe('Alt/Aug regex generation', () => {
  it('freezes the known 90/20/150 post-chisel fixture', () => {
    const result = generateAltAugRegex({
      currencyMin: 90,
      packMin: 20,
      gigaMin: 150,
      chiseled: true,
    });

    expect(result.regex)
      .toBe('"curr.*(9.|\\d..)" "size.*([2-9].|\\d..)%| Map \\(Tier|^Map of|curr.*(1[5-9].|[2-9]..)"');
    expect(result.charCount).toBe(84);
  });

  it('omits the third currency gate when its floor is not higher', () => {
    expect(generateAltAugRegex({
      currencyMin: 100,
      packMin: 0,
      gigaMin: 100,
      chiseled: false,
    }).regex).toBe('"curr.*(\\d..)" "size.*(\\d+)%| Map \\(Tier|^Map of"');
  });

  it('adjusts visible currency thresholds by 50 across the chisel toggle', () => {
    const postChisel = {
      currencyMin: 90,
      packMin: 20,
      gigaMin: 150,
      chiseled: true,
    };
    const preChisel = adjustAltAugChisel(postChisel, false);

    expect(preChisel).toEqual({
      currencyMin: 40,
      packMin: 20,
      gigaMin: 100,
      chiseled: false,
    });
    expect(adjustAltAugChisel(preChisel, true)).toEqual(postChisel);
  });

  it('clamps pre-chisel threshold adjustments at zero', () => {
    expect(adjustAltAugChisel({
      currencyMin: 20,
      packMin: 5,
      gigaMin: 40,
      chiseled: true,
    }, false)).toEqual({
      currencyMin: 0,
      packMin: 5,
      gigaMin: 0,
      chiseled: false,
    });
  });
});
