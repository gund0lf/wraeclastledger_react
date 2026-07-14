import { describe, it, expect } from 'vitest';
import { computeVisibleTagCount } from './tagFit';

describe('computeVisibleTagCount', () => {
  it('shows all when they fit with gaps and no overflow badge is needed', () => {
    // 3 badges of 30 + 2 gaps of 4 = 98 <= 100
    expect(computeVisibleTagCount([30, 30, 30], 100, 4, 20)).toBe(3);
  });

  it('reserves room for the +N badge when not all fit', () => {
    // 5 badges of 30, gap 4, plus 20. avail 120.
    // fit check: badge0=30 (used30) +gap4+plus20=54<=120 ok; badge1 +34 -> used64 +24=88 ok;
    // badge2 +34 -> used98 +24=122 >120 stop. => 2 shown, +3.
    expect(computeVisibleTagCount([30, 30, 30, 30, 30], 120, 4, 20)).toBe(2);
  });

  it('shows no real badges until an unmeasured container receives a width', () => {
    expect(computeVisibleTagCount([30, 30], 0, 4, 20)).toBe(0);
  });

  it('handles a single badge that fits', () => {
    expect(computeVisibleTagCount([40], 100, 4, 20)).toBe(1);
  });

  it('can show zero real badges when the container is tiny (all collapse to +N)', () => {
    // one badge of 50 won't fit with the +N reserve in avail 30
    expect(computeVisibleTagCount([50, 50], 30, 4, 20)).toBe(0);
  });

  it('empty tag list shows nothing', () => {
    expect(computeVisibleTagCount([], 100, 4, 20)).toBe(0);
  });

  it('exact fit of all badges (boundary) shows all, no +N', () => {
    // 2 badges 48 + gap 4 = 100 == avail
    expect(computeVisibleTagCount([48, 48], 100, 4, 20)).toBe(2);
  });

  it('wider container shows more before collapsing', () => {
    const widths = [30, 30, 30, 30, 30];
    expect(computeVisibleTagCount(widths, 300, 4, 20)).toBe(5); // all fit (166 <= 300)
    expect(computeVisibleTagCount(widths, 140, 4, 20)).toBe(3); // overflow -> reserves +N
    expect(computeVisibleTagCount(widths, 140, 4, 20)).toBeLessThan(5);
  });
});
