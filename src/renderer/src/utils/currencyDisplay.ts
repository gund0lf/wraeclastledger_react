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
