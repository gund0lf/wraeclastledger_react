export type ManualLootValueMode = 'total' | 'perItem';

const validQuantity = (value: number): number =>
  Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1;

const validValue = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

const roundChaos = (value: number): number => Math.round(value * 10) / 10;

/** Returns the number shown in the authoring field. Persisted rows always keep
 * one canonical total; this mode is intentionally presentation-only. */
export function manualLootEntryValue(
  total: number,
  quantity: number,
  mode: ManualLootValueMode,
): number {
  const safeTotal = validValue(total);
  return mode === 'perItem'
    ? roundChaos(safeTotal / validQuantity(quantity))
    : safeTotal;
}

/** Converts the visible authoring value back to the canonical stored total. */
export function manualLootTotalFromEntry(
  value: number,
  quantity: number,
  mode: ManualLootValueMode,
): number {
  const safeValue = validValue(value);
  return mode === 'perItem'
    ? roundChaos(safeValue * validQuantity(quantity))
    : safeValue;
}

/** Quantity edits in Per item mode retain the visible unit value. Total mode
 * retains the authored total, matching the pre-v1.0.82 behavior. */
export function manualLootTotalAfterQuantityChange(
  total: number,
  previousQuantity: number,
  nextQuantity: number,
  mode: ManualLootValueMode,
): number {
  if (mode === 'total') return validValue(total);
  return manualLootTotalFromEntry(
    manualLootEntryValue(total, previousQuantity, mode),
    nextQuantity,
    mode,
  );
}
