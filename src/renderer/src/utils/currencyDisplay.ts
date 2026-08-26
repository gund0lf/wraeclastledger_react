export const LOOT_CURRENCY_MODES = ['chaos', 'divine'] as const;
export type LootCurrencyMode = typeof LOOT_CURRENCY_MODES[number];

export function normalizeLootCurrencyMode(value: unknown): LootCurrencyMode {
  return value === 'divine' ? 'divine' : 'chaos';
}

export function hasDivinePrice(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

export function formatChaosValue(
  value: number | null | undefined,
  sign = false,
  decimals = 0,
): string {
  if (value == null || !Number.isFinite(value)) return '\u2014';
  const prefix = sign ? (value >= 0 ? '+' : '-') : (value < 0 ? '-' : '');
  const absolute = Math.abs(value);
  const formatted = decimals > 0
    ? absolute.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals })
    : Math.round(absolute).toLocaleString('en-US');
  return `${prefix}${formatted}c`;
}

export function formatDivineValue(value: number, sign = false): string {
  if (!Number.isFinite(value)) return '\u2014';
  const absolute = Math.abs(value);
  const decimals = absolute >= 100 ? 1 : absolute >= 1 ? 2 : 3;
  const prefix = sign ? (value >= 0 ? '+' : '-') : (value < 0 ? '-' : '');
  return `${prefix}${absolute.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}d`;
}

/**
 * Returns a presentation-only Divine equivalent for a chaos value.
 *
 * Callers choose the threshold because currency units are contextual: setup
 * prices stay useful in chaos, while large outcome totals benefit from a
 * secondary Divine value. This helper centralises validation and conversion
 * without imposing one global auto-switching rule on the application.
 */
export function divineEquivalent(
  chaosValue: number | null | undefined,
  divinePrice: number | null | undefined,
  minimumAbsoluteDivines = 0,
): number | null {
  if (
    chaosValue == null
    || !Number.isFinite(chaosValue)
    || divinePrice == null
    || !Number.isFinite(divinePrice)
    || divinePrice <= 0
  ) return null;

  const divines = chaosValue / divinePrice;
  return Math.abs(divines) >= minimumAbsoluteDivines ? divines : null;
}

export interface LootCurrencyPresentation {
  effectiveMode: LootCurrencyMode;
  primary: string;
  secondary: string | null;
  chaos: string;
  divine: string | null;
}

/**
 * One shared presentation contract for repeated loot rows and their totals.
 * A requested Divine view falls back loudly-but-safely to chaos when the
 * evidence has no single authored Divine snapshot (notably pooled strategies).
 */
export function lootCurrencyPresentation(
  chaosValue: number | null | undefined,
  divinePrice: number | null | undefined,
  requestedMode: LootCurrencyMode,
  options: { sign?: boolean; chaosDecimals?: number } = {},
): LootCurrencyPresentation {
  const sign = options.sign ?? false;
  const chaos = formatChaosValue(chaosValue, sign, options.chaosDecimals ?? 1);
  const equivalent = divineEquivalent(chaosValue, divinePrice);
  const divine = equivalent == null ? null : formatDivineValue(equivalent, sign);
  const effectiveMode = requestedMode === 'divine' && divine !== null ? 'divine' : 'chaos';
  return {
    effectiveMode,
    primary: effectiveMode === 'divine' ? divine! : chaos,
    secondary: effectiveMode === 'divine' ? chaos : divine,
    chaos,
    divine,
  };
}
