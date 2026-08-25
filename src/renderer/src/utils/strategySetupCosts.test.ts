import { describe, expect, it } from 'vitest';
import { computePublishedSetupCostBreakdown } from './strategySetupCosts';

describe('computePublishedSetupCostBreakdown', () => {
  it('reconciles every itemized cost from the authored 72-map share', () => {
    const result = computePublishedSetupCostBreakdown({
      costPerMap: 213.5,
      mapCount: 72,
      scarabs: [
        { name: 'Trarthan Scarab of Infamy', cost: 16 },
        { name: 'Kalguuran Scarab', cost: 1.3 },
        { name: 'Horned Scarab of Awakening', cost: 83 },
        { name: 'Divination Scarab of Plenty', cost: 12 },
        { name: 'Divination Scarab of Plenty', cost: 12 },
      ],
      chiselPrice: 50,
      deliOrbQtyPerMap: 1,
      deliOrbPriceEach: 18,
      astrolabeCount: 13,
      astrolabePriceEach: 62,
    });

    expect(result.scarabs).toBeCloseTo(124.3);
    expect(result.chisel).toBe(50);
    expect(result.deliriumOrbs).toBe(18);
    expect(result.astrolabe).toBeCloseTo(11.194444);
    expect(result.baseAndRolling).toBeCloseTo(10.005556);
    expect(result.allIn).toBe(213.5);
  });

  it('amortizes retained scarabs when Preservation is present', () => {
    const result = computePublishedSetupCostBreakdown({
      costPerMap: 30,
      mapCount: 20,
      scarabs: [
        { name: 'Horned Scarab of Preservation', cost: 8 },
        { name: 'Horned Scarab of Awakening', cost: 100 },
      ],
      chiselPrice: 0,
      deliOrbQtyPerMap: 0,
      deliOrbPriceEach: 0,
      astrolabeCount: 0,
      astrolabePriceEach: 0,
    });

    expect(result.scarabs).toBe(13);
    expect(result.baseAndRolling).toBe(17);
  });
});
