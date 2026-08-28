import { describe, it, expect } from 'vitest';
import { parseDiscordExport, fc, f1 } from './parseDiscordExport';
import { EXPORT_EMOJI, stripExportDecoration } from './discordEmoji';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FULL_EXPORT = `
WraeclastLedger — Session Export
Strategy: Deli Scarab Farmer
Maps: 42
Type: 8-mod
Multiplier: 4.82x
Avg Quant: 187%
Avg Rarity: 53%
Avg Pack: 47%
Avg Currency: 142%
Divine Price: 310c
Per Map Cost: 28.5c
Total Invest: 1197c
Total Return: 9840c
Net Profit: +8643c
Profit/map: 0.66d
🟢 Run: ter D|lid|poss
Notes: Strong deli build
Tags: delirium,scarabs
League: Mirage
Party Play: No
`.trim();

const EXPORT_WITH_EXTRAS = `
WraeclastLedger — Session Export
Maps: 20
Type: 6-mod
Multiplier: 3.50x
Avg Quant: 150%
Avg Rarity: 40%
Avg Pack: 30%
Avg Currency: 80%
Divine Price: 300c
Per Map Cost: 15.0c
Total Invest: 300c
Total Return: 4500c
Net Profit: +4200c
Profit/map: 0.70d
Chisel: Avarice (40c each)
🟢 Run: ter D|lid
🟠 Slam: lid (open suffix)
Delirium Orbs: 3x Divination (85c each)
Astrolabe: Horned Scarab of Awakening (10x, 25.5c each)
Excluded drops (2): Orb of Alteration (120.5c), Chaos Orb (55.0c)
Gem leveling: 4 gems | buy 80c | sell 320c | net +240c
Party Play: Yes
`.trim();

// ─── parseDiscordExport ───────────────────────────────────────────────────────

describe('parseDiscordExport', () => {
  it('returns null for empty string', () => {
    expect(parseDiscordExport('')).toBeNull();
  });

  it('returns null for string without WraeclastLedger marker', () => {
    expect(parseDiscordExport('Maps: 10\nNet Profit: 100c')).toBeNull();
  });

  it('returns null when Maps count is 0 or missing', () => {
    expect(parseDiscordExport('WraeclastLedger\nMaps: 0')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(parseDiscordExport('hello world')).toBeNull();
    expect(parseDiscordExport('🎲🎲🎲')).toBeNull();
  });

  it('strips markdown code fences', () => {
    const fenced = '```\n' + FULL_EXPORT + '\n```';
    const result = parseDiscordExport(fenced);
    expect(result).not.toBeNull();
    expect(result!.mapCount).toBe(42);
  });

  it('strips bold markdown', () => {
    const bolded = FULL_EXPORT.replace('Maps: 42', '**Maps:** 42');
    const result = parseDiscordExport(bolded);
    expect(result).not.toBeNull();
    expect(result!.mapCount).toBe(42);
  });

  it('does not import an Atlas allocation from an attacker-controlled host', () => {
    const result = parseDiscordExport(`${FULL_EXPORT}\nAtlas Tree: https://attacker.example/#AAAA`);
    expect(result).not.toBeNull();
    expect(result!.atlasTreeUrl).toBe('');
  });

  it('parses core numeric fields from a full export', () => {
    const r = parseDiscordExport(FULL_EXPORT);
    expect(r).not.toBeNull();
    expect(r!.mapCount).toBe(42);
    expect(r!.multiplier).toBe(4.82);
    expect(r!.avgQuant).toBe(187);
    expect(r!.avgRarity).toBe(53);
    expect(r!.avgPack).toBe(47);
    expect(r!.avgCurr).toBe(142);
    expect(r!.divPrice).toBe(310);
    expect(r!.perMapCost).toBe(28.5);
    expect(r!.totalInvest).toBe(1197);
    expect(r!.totalReturn).toBe(9840);
    expect(r!.netProfit).toBe(8643);
    expect(r!.divPerMap).toBe(0.66);
  });

  it('parses string fields', () => {
    const r = parseDiscordExport(FULL_EXPORT);
    expect(r!.mapType).toBe('8-mod');
    expect(r!.strategyName).toBe('Deli Scarab Farmer');
    expect(r!.strategyNotes).toBe('Strong deli build');
    expect(r!.runRegex).toBe('ter D|lid|poss');
  });

  it('parses Profit/map with legacy "Div / Map" label', () => {
    const legacy = FULL_EXPORT.replace('Profit/map: 0.66d', 'Div / Map: 0.66d');
    const r = parseDiscordExport(legacy);
    expect(r!.divPerMap).toBe(0.66);
  });

  it('isGroupPlay is false when Party Play is absent or No', () => {
    const r = parseDiscordExport(FULL_EXPORT);
    expect(r!.isGroupPlay).toBe(false);
  });

  it('parses delirium orbs, astrolabe, excluded drops, gem info', () => {
    const r = parseDiscordExport(EXPORT_WITH_EXTRAS);
    expect(r).not.toBeNull();
    expect(r!.deliOrbQty).toBe(3);
    expect(r!.deliOrbType).toBe('Divination');
    expect(r!.deliOrbPrice).toBe(85);
    expect(r!.astroType).toBe('Horned Scarab of Awakening');
    expect(r!.astroCount).toBe(10);
    expect(r!.astroPrice).toBe(25.5);
    expect(r!.excludedDrops).toHaveLength(2);
    expect(r!.excludedDrops[0]).toEqual({ name: 'Orb of Alteration', value: 120.5 });
    expect(r!.excludedDrops[1]).toEqual({ name: 'Chaos Orb', value: 55.0 });
    expect(r!.gemInfo).toEqual({ count: 4, buy: 80, sell: 320, net: 240 });
    expect(r!.isGroupPlay).toBe(true);
    expect(r!.slamRegex).toBe('lid');
  });

  it('chisel strips parenthetical price suffix', () => {
    const r = parseDiscordExport(EXPORT_WITH_EXTRAS);
    expect(r!.chisel).toBe('Avarice');
    expect(r!.chiselPrice).toBe(40);
  });

  it('returns empty defaults for missing optional fields', () => {
    const r = parseDiscordExport(FULL_EXPORT);
    expect(r!.chisel).toBe('');
    expect(r!.chiselPrice).toBe(0);
    expect(r!.slamRegex).toBe('');
    expect(r!.scarabs).toEqual([]);
    expect(r!.excludedDrops).toEqual([]);
    expect(r!.gemInfo).toBeNull();
    expect(r!.deliOrbQty).toBe(0);
    expect(r!.astroType).toBe('');
    expect(r!.multiplyingModifiersAllocated).toBeNull();
    expect(r!.multiplyingModifiersFragmentCount).toBeNull();
  });

  it('parses explicit Multiplying Modifiers state without inventing legacy values', () => {
    const allocated = parseDiscordExport(`${FULL_EXPORT}\nMultiplying Modifiers: 4 fragments`);
    expect(allocated).toMatchObject({
      multiplyingModifiersAllocated: true,
      multiplyingModifiersFragmentCount: 4,
    });
    const off = parseDiscordExport(`${FULL_EXPORT}\n**Multiplying Modifiers:** Off`);
    expect(off).toMatchObject({
      multiplyingModifiersAllocated: false,
      multiplyingModifiersFragmentCount: 0,
    });
  });
});

describe('parseDiscordExport - decoration-agnostic import (Part 1)', () => {
  it('ignores custom / application emoji refs prefixed on labels', () => {
    const decorated = FULL_EXPORT
      .replace('Maps:', '<:wl_maps:123456789012345678> Maps:')
      .replace('Multiplier:', '<:wl_mult:222> Multiplier:')
      .replace('Net Profit:', '<a:wl_spin:333> Net Profit:')
      .replace('Total Invest:', '<:wl_cost:444> Total Invest:');
    const r = parseDiscordExport(decorated);
    expect(r).not.toBeNull();
    expect(r!.mapCount).toBe(42);
    expect(r!.multiplier).toBe(4.82);
    expect(r!.netProfit).toBe(8643);
    expect(r!.totalInvest).toBe(1197);
  });

  it('ignores unicode emoji decoration from the registry', () => {
    const decorated = FULL_EXPORT
      .replace('Maps:', EXPORT_EMOJI.maps.uni + ' Maps:')
      .replace('Multiplier:', EXPORT_EMOJI.stats.uni + ' Multiplier:')
      .replace('Total Return:', EXPORT_EMOJI.returns.uni + ' Total Return:');
    const r = parseDiscordExport(decorated);
    expect(r).not.toBeNull();
    expect(r!.mapCount).toBe(42);
    expect(r!.multiplier).toBe(4.82);
    expect(r!.totalReturn).toBe(9840);
  });

  it('parses the same fields with decoration and pre-stripped', () => {
    const withDecoration = parseDiscordExport(EXPORT_WITH_EXTRAS);
    const preStripped    = parseDiscordExport(stripExportDecoration(EXPORT_WITH_EXTRAS));
    expect(preStripped).toEqual(withDecoration);
    // run/slam still recovered once the status circles are gone
    expect(preStripped!.runRegex).toBe('ter D|lid');
    expect(preStripped!.slamRegex).toBe('lid');
  });

  it('preserves load-bearing punctuation (multiplier x, em-dash)', () => {
    // stripExportDecoration must leave U+00D7 and U+2014 alone, only kill emoji.
    const s = stripExportDecoration('a \u00D7 b \u2014 c \uD83D\uDCE6 d');
    expect(s).toBe('a \u00D7 b \u2014 c  d');
  });

  it('does not mistake label lines for scarabs (structural, not decoration)', () => {
    // "Excluded drops (2):" starts with a capital and ends in " (N" but is NOT a
    // scarab bullet - scarab detection requires the leading "- ".
    const r = parseDiscordExport(EXPORT_WITH_EXTRAS);
    expect(r!.scarabs).toEqual([]);
    expect(r!.scarabCosts).toEqual([]);
  });
});

// ─── fc formatter ────────────────────────────────────────────────────────────

describe('fc', () => {
  it('returns em-dash for null/undefined', () => {
    expect(fc(null)).toBe('\u2014');
    expect(fc(undefined)).toBe('\u2014');
  });

  it('formats sub-1000 values as whole chaos', () => {
    expect(fc(42)).toBe('42c');
    expect(fc(999)).toBe('999c');
  });

  it('formats 1000+ as k-notation', () => {
    expect(fc(1000)).toBe('1kc');
    expect(fc(1500)).toBe('1.5kc');
    expect(fc(12345)).toBe('12.3kc');
  });

  it('handles negative values', () => {
    expect(fc(-250)).toBe('-250c');
    expect(fc(-1500)).toBe('-1.5kc');
  });

  it('adds + prefix when sign=true and value is positive', () => {
    expect(fc(100, true)).toBe('+100c');
    expect(fc(-100, true)).toBe('-100c');
  });
});

// ─── f1 formatter ────────────────────────────────────────────────────────────

describe('f1', () => {
  it('returns null for null/undefined', () => {
    expect(f1(null)).toBeNull();
    expect(f1(undefined)).toBeNull();
  });

  it('formats to one decimal place', () => {
    expect(f1(3.14159)).toBe('3.1');
    expect(f1(0)).toBe('0.0');
    expect(f1(100)).toBe('100.0');
  });
});
