import { describe, expect, it } from 'vitest';
import { missingShareFields } from './shareCompleteness';

const complete = {
  atlasTreeUrl: 'https://pathofpathing.com/?v=3.29.0-atlas#AAAA',
  totalInvest: 100,
  totalReturn: 200,
  mapCount: 5,
};

describe('missingShareFields', () => {
  it('requires a parseable export before checking individual fields', () => {
    expect(missingShareFields(null)).toEqual(['A parseable WraeclastLedger export']);
  });

  it('reports every bot-required field that is missing', () => {
    expect(missingShareFields({
      atlasTreeUrl: 'https://pathofpathing.com/',
      totalInvest: 0,
      totalReturn: Number.NaN,
      mapCount: 4,
    })).toEqual([
      'Atlas tree with an allocation hash',
      'Total invest above 0',
      'Total return above 0',
      'At least 5 parsed maps',
    ]);
  });

  it('rejects fractional map counts and accepts a complete run', () => {
    expect(missingShareFields({ ...complete, mapCount: 5.5 })).toEqual([
      'At least 5 parsed maps',
    ]);
    expect(missingShareFields(complete)).toEqual([]);
  });
});
