import { describe, expect, it } from 'vitest';
import {
  manualLootEntryValue,
  manualLootTotalAfterQuantityChange,
  manualLootTotalFromEntry,
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
});
