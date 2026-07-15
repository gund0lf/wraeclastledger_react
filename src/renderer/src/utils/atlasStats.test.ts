import { describe, expect, it } from 'vitest';
import { deriveAtlasCalcSettings } from '../../../shared/atlasStats';

describe('deriveAtlasCalcSettings', () => {
  it('maps Path of Pathing stats to the three Atlas Calc inputs', () => {
    expect(deriveAtlasCalcSettings([{
      title: 'Map Modifiers',
      stats: [
        '32% increased effect of Explicit Modifiers on your Maps',
        '2% increased effect of Explicit Modifiers on your Maps per Explicit Modifier',
        '3% increased effect of Explicit Modifiers on your Maps per Fragment used with Map',
      ],
    }])).toEqual({
      smallNodesAllocated: 16,
      mountingModifiers: true,
      fragmentsUsed: 5,
    });
  });

  it('returns only settings supported by the observed stats', () => {
    expect(deriveAtlasCalcSettings([{
      title: 'Map Modifiers',
      stats: ['12% increased effect of Explicit Modifiers on your Maps'],
    }])).toEqual({ smallNodesAllocated: 6 });
  });
});
