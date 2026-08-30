export type ManualLootValueMode = 'total' | 'perItem';
export type ManualLootCurrencyUnit = 'chaos' | 'divine';

export type ManualLootValueInputResult =
  | { ok: true; amount: number; unit: ManualLootCurrencyUnit; chaos: number }
  | { ok: false; reason: 'format' | 'divine-price' };

const validQuantity = (value: number): number =>
  Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1;

const validValue = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

const roundChaos = (value: number): number => Math.round(value * 10) / 10;

/** Parses an authored Chaos/Divine value without changing the persisted shape.
 * Plain numbers remain Chaos for backwards compatibility; c/d suffixes are
 * case-insensitive and Divine decimals may omit the leading zero. */
export function parseManualLootValueInput(
  input: string | number,
  divinePrice: number | null,
): ManualLootValueInputResult {
  const match = String(input).trim().match(/^((?:\d+(?:\.\d*)?|\.\d+))\s*([cd]?)$/i);
  if (!match) return { ok: false, reason: 'format' };
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, reason: 'format' };
  const unit: ManualLootCurrencyUnit = match[2].toLowerCase() === 'd' ? 'divine' : 'chaos';
  if (unit === 'divine' && (!Number.isFinite(divinePrice) || Number(divinePrice) <= 0)) {
    return { ok: false, reason: 'divine-price' };
  }
  const chaos = amount * (unit === 'divine' ? Number(divinePrice) : 1);
  if (!Number.isFinite(chaos)) return { ok: false, reason: 'format' };
  const normalizedChaos = Number(chaos.toPrecision(15));
  return {
    ok: true,
    amount,
    unit,
    chaos: normalizedChaos,
  };
}

const compactDecimal = (value: number, precision: number): string => (
  value.toFixed(precision).replace(/0+$/, '').replace(/\.$/, '')
);

/** Reformats a canonical total when the author switches Total/Per-item mode,
 * retaining Divine entry when its conversion snapshot is available. */
export function formatManualLootValueInput(
  total: number,
  quantity: number,
  mode: ManualLootValueMode,
  unit: ManualLootCurrencyUnit,
  divinePrice: number | null,
): string {
  if (unit === 'divine' && Number.isFinite(divinePrice) && Number(divinePrice) > 0) {
    const chaos = mode === 'perItem'
      ? validValue(total) / validQuantity(quantity)
      : validValue(total);
    return `${compactDecimal(chaos / Number(divinePrice), 4)}d`;
  }
  const chaos = manualLootEntryValue(total, quantity, mode);
  return compactDecimal(chaos, 1);
}

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
  return roundChaos(mode === 'perItem'
    ? safeValue * validQuantity(quantity)
    : safeValue);
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
