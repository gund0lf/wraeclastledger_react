import { describe, expect, it } from 'vitest';
import {
  formatManualLootValueInput,
  manualLootEntryValue,
  manualLootTotalAfterQuantityChange,
  manualLootTotalFromEntry,
  parseManualLootValueInput,
} from './manualLootValue';

describe('manual loot value entry', () => {
  it('keeps Total mode identical to the canonical persisted value', () => {
    expect(manualLootEntryValue(123.4, 3, 'total')).toBe(123.4);
    expect(manualLootTotalFromEntry(88.8, 5, 'total')).toBe(88.8);
    expect(manualLootTotalAfterQuantityChange(123.4, 3, 9, 'total')).toBe(123.4);
  });

  it('converts Per item input to one canonical total', () => {
    expect(manualLootEntryValue(120, 3, 'perItem')).toBe(40);
    expect(manualLootTotalFromEntry(40, 3, 'perItem')).toBe(120);
    expect(manualLootTotalFromEntry(12.3, 4, 'perItem')).toBe(49.2);
  });

  it('preserves the visible unit value when quantity changes in Per item mode', () => {
    expect(manualLootEntryValue(100, 3, 'perItem')).toBe(33.3);
    expect(manualLootTotalAfterQuantityChange(100, 3, 4, 'perItem')).toBe(133.2);
  });

  it('bounds malformed authoring values without changing the storage shape', () => {
    expect(manualLootEntryValue(Number.NaN, 0, 'perItem')).toBe(0);
    expect(manualLootTotalFromEntry(-5, 0, 'perItem')).toBe(0);
  });

  it('accepts Chaos and leading-zero or shorthand Divine values', () => {
    expect(parseManualLootValueInput('100', 217)).toEqual({
      ok: true, amount: 100, unit: 'chaos', chaos: 100,
    });
    expect(parseManualLootValueInput('100c', 217)).toEqual({
      ok: true, amount: 100, unit: 'chaos', chaos: 100,
    });
    expect(parseManualLootValueInput('0.4d', 217)).toEqual({
      ok: true, amount: 0.4, unit: 'divine', chaos: 86.8,
    });
    expect(parseManualLootValueInput('.4D', 217)).toEqual({
      ok: true, amount: 0.4, unit: 'divine', chaos: 86.8,
    });

    const perItem = parseManualLootValueInput('.4d', 217);
    expect(perItem.ok && manualLootTotalFromEntry(perItem.chaos, 5, 'perItem')).toBe(434);
  });

  it('requires a real session quote for Divine input and rejects mixed text', () => {
    expect(parseManualLootValueInput('.4d', null)).toEqual({
      ok: false, reason: 'divine-price',
    });
    expect(parseManualLootValueInput('about .4d', 217)).toEqual({
      ok: false, reason: 'format',
    });
  });

  it('retains the selected currency while switching total/per-item presentation', () => {
    expect(formatManualLootValueInput(434, 5, 'perItem', 'divine', 217)).toBe('0.4d');
    expect(formatManualLootValueInput(434, 5, 'total', 'divine', 217)).toBe('2d');
    expect(formatManualLootValueInput(86.8, 5, 'perItem', 'divine', 217)).toBe('0.08d');
    expect(formatManualLootValueInput(86.8, 1, 'total', 'chaos', 217)).toBe('86.8');
  });

  it('rounds only the canonical total after a Divine per-item conversion', () => {
    const parsed = parseManualLootValueInput('.03d', 217);
    expect(parsed).toEqual({
      ok: true, amount: 0.03, unit: 'divine', chaos: 6.51,
    });
    expect(parsed.ok && manualLootTotalFromEntry(parsed.chaos, 5, 'perItem')).toBe(32.6);
  });
});
