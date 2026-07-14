/**
 * tagFit.ts — pure "how many tag badges fit" math for the Strategy Browser
 * TagStrip. Kept separate from the React measurement wiring so the fitting
 * logic is unit-testable (the DOM measurement in TagStrip feeds it real widths).
 */

/**
 * How many badges (from the start) cleanly fit in `avail` px.
 *
 * If every badge fits (with the inter-badge gaps) there is no "+N" and all are
 * shown. Otherwise we reserve room for a trailing "+N" badge and pack as many
 * real badges before it as fit.
 *
 * @param widths    measured px width of each badge, in order
 * @param avail     available px width of the container
 * @param gap       px gap between adjacent badges
 * @param plusWidth measured px width of the "+N" overflow badge
 * @returns number of leading badges to show (0..widths.length). When the result
 *          is < widths.length, the caller renders a "+N" badge for the rest.
 */
export function computeVisibleTagCount(
  widths: number[],
  avail: number,
  gap: number,
  plusWidth: number,
): number {
  if (widths.length === 0) return 0;
  // A tabbed FlexLayout pane can first mount at zero width. Never render all
  // badges into an unknown space: callers show a safe "+N" until measured.
  if (avail <= 0) return 0;

  // Do they ALL fit without needing a "+N"?
  const totalAll = widths.reduce((sum, w, i) => sum + w + (i > 0 ? gap : 0), 0);
  if (totalAll <= avail) return widths.length;

  // They don't — pack badges while always reserving space for the trailing "+N".
  let used = 0;
  let count = 0;
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i] + (i > 0 ? gap : 0);
    if (used + w + gap + plusWidth <= avail) {
      used += w;
      count++;
    } else {
      break;
    }
  }
  return count;
}
