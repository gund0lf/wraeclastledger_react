import { describe, expect, it } from 'vitest';
import type { PublicEvidenceRun } from './evidenceApi';
import { aggregateEvidenceSetupCosts } from './evidenceCosts';

const run = (
  overrides: Partial<PublicEvidenceRun>,
): PublicEvidenceRun => ({
  ordinal: 1,
  run_started_at: null,
  run_ended_at: null,
  submitted_at: '2026-08-25T00:00:00.000Z',
  map_count: 20,
  avg_quant: null,
  avg_rarity: null,
  avg_pack: null,
  avg_currency: null,
  observed_mod_average: null,
  observed_mod_sample_size: null,
  multiplier: null,
  per_map_cost: 204,
  total_invest: 4_080,
  net_profit: null,
  div_per_map: null,
  divine_price: null,
  session_minutes: null,
  cost_breakdown: {
    chisel: null,
    scarabs: [],
    delirium: null,
    astrolabe: null,
  },
  game_data_revision: null,
  game_data_patch_version: null,
  loot_summary: null,
  ...overrides,
});

describe('pooled evidence setup costs', () => {
  it('preserves every setup category as a map-weighted historical value', () => {
    const aggregate = aggregateEvidenceSetupCosts([
      run({
        map_count: 20,
        per_map_cost: 204,
        divine_price: 204,
        cost_breakdown: {
          chisel: { name: "Maven's Chisel of Divination", priceEach: 50 },
          scarabs: [
            { name: 'Scarab A', priceEach: 20 },
            { name: 'Scarab B', priceEach: 30 },
          ],
          delirium: { type: 'Fine', countPerMap: 1, priceEach: 10 },
          astrolabe: { type: 'Templar', count: 2, priceEach: 100 },
        },
      }),
      run({
        ordinal: 2,
        map_count: 40,
        per_map_cost: 180,
        total_invest: 7_200,
        divine_price: 180,
        cost_breakdown: {
          chisel: { name: "Maven's Chisel of Divination", priceEach: 40 },
          scarabs: [
            { name: 'Scarab A', priceEach: 40 },
            { name: 'Scarab B', priceEach: 20 },
          ],
          delirium: { type: 'Fine', countPerMap: 2, priceEach: 10 },
          astrolabe: { type: 'Templar', count: 4, priceEach: 100 },
        },
      }),
    ]);

    expect(aggregate).not.toBeNull();
    expect(aggregate).toMatchObject({ runCount: 2, mapCount: 60 });
    expect(aggregate!.allIn).toBeCloseTo(188);
    expect(aggregate!.baseAndRolling).toBeCloseTo(61.333333);
    expect(aggregate!.chisel).toBeCloseTo(43.333333);
    expect(aggregate!.scarabs).toBeCloseTo(56.666667);
    expect(aggregate!.deliriumOrbs).toBeCloseTo(16.666667);
    expect(aggregate!.astrolabe).toBeCloseTo(10);
    expect(aggregate!.totalInvestDivines).toBeCloseTo(60);
    expect(aggregate!.costPerMapDivines).toBeCloseTo(1);
    expect(aggregate!.scarabItems).toEqual([
      { name: 'Scarab A', perMap: 100 / 3 },
      { name: 'Scarab B', perMap: 70 / 3 },
    ]);
    expect(aggregate!.chiselItems[0]).toMatchObject({
      name: "Maven's Chisel of Divination",
    });
    expect(aggregate!.chiselItems[0].perMap).toBeCloseTo(43.333333);
    expect(aggregate!.deliriumItems[0].perMap).toBeCloseTo(16.666667);
    expect(aggregate!.astrolabeItems[0].perMap).toBeCloseTo(10);
  });

  it('preserves repeated scarabs as separate pooled setup slots', () => {
    const aggregate = aggregateEvidenceSetupCosts([
      run({
        map_count: 20,
        per_map_cost: 100,
        cost_breakdown: {
          chisel: null,
          scarabs: [
            { name: 'Delirium Scarab of Paranoia', priceEach: 21.15 },
            { name: 'Delirium Scarab of Paranoia', priceEach: 21.15 },
          ],
          delirium: null,
          astrolabe: null,
        },
      }),
      run({
        ordinal: 2,
        map_count: 40,
        per_map_cost: 100,
        cost_breakdown: {
          chisel: null,
          scarabs: [
            { name: 'Delirium Scarab of Paranoia', priceEach: 21 },
            { name: 'Delirium Scarab of Paranoia', priceEach: 21 },
          ],
          delirium: null,
          astrolabe: null,
        },
      }),
    ]);

    expect(aggregate!.scarabItems).toHaveLength(2);
    expect(aggregate!.scarabItems[0]).toMatchObject({ name: 'Delirium Scarab of Paranoia' });
    expect(aggregate!.scarabItems[1]).toMatchObject({ name: 'Delirium Scarab of Paranoia' });
    expect(aggregate!.scarabItems[0].perMap).toBeCloseTo(21.05);
    expect(aggregate!.scarabItems[1].perMap).toBeCloseTo(21.05);
    expect(aggregate!.scarabs).toBeCloseTo(42.1);
  });

  it('weights each occurrence independently when runs use different copy counts', () => {
    const aggregate = aggregateEvidenceSetupCosts([
      run({
        map_count: 20,
        per_map_cost: 100,
        cost_breakdown: {
          chisel: null,
          scarabs: [
            { name: 'Delirium Scarab of Paranoia', priceEach: 10 },
            { name: 'Delirium Scarab of Paranoia', priceEach: 10 },
          ],
          delirium: null,
          astrolabe: null,
        },
      }),
      run({
        ordinal: 2,
        map_count: 40,
        per_map_cost: 100,
        cost_breakdown: {
          chisel: null,
          scarabs: [{ name: 'Delirium Scarab of Paranoia', priceEach: 20 }],
          delirium: null,
          astrolabe: null,
        },
      }),
    ]);

    expect(aggregate!.scarabItems).toHaveLength(2);
    expect(aggregate!.scarabItems[0].perMap).toBeCloseTo(50 / 3);
    expect(aggregate!.scarabItems[1].perMap).toBeCloseTo(10 / 3);
    expect(aggregate!.scarabs).toBeCloseTo(20);
    expect(aggregate!.scarabItems.reduce((sum, item) => sum + item.perMap, 0))
      .toBeCloseTo(aggregate!.scarabs);
  });

  it('keeps Preservation amortization intact for repeated retained scarab slots', () => {
    const aggregate = aggregateEvidenceSetupCosts([
      run({
        map_count: 20,
        per_map_cost: 30,
        cost_breakdown: {
          chisel: null,
          scarabs: [
            { name: 'Horned Scarab of Preservation', priceEach: 8 },
            { name: 'Horned Scarab of Awakening', priceEach: 100 },
            { name: 'Horned Scarab of Awakening', priceEach: 100 },
          ],
          delirium: null,
          astrolabe: null,
        },
      }),
    ]);

    expect(aggregate!.scarabs).toBeCloseTo(18);
    expect(aggregate!.scarabItems).toEqual([
      { name: 'Horned Scarab of Preservation', perMap: 8 },
      { name: 'Horned Scarab of Awakening', perMap: 5 },
      { name: 'Horned Scarab of Awakening', perMap: 5 },
    ]);
    expect(aggregate!.scarabItems.reduce((sum, item) => sum + item.perMap, 0))
      .toBeCloseTo(aggregate!.scarabs);
  });

  it('keeps an unitemized authored all-in value as base and rolling cost', () => {
    const aggregate = aggregateEvidenceSetupCosts([
      run({
        map_count: 10,
        per_map_cost: 100,
        total_invest: 1_000,
        divine_price: 100,
        cost_breakdown: null as unknown as PublicEvidenceRun['cost_breakdown'],
      }),
    ]);

    expect(aggregate).toMatchObject({
      runCount: 1,
      mapCount: 10,
      baseAndRolling: 100,
      allIn: 100,
      totalInvestDivines: 10,
      costPerMapDivines: 1,
      chiselItems: [],
      scarabItems: [],
      deliriumItems: [],
      astrolabeItems: [],
    });
  });

  it('does not present a partial divine total when any run lacks a snapshot', () => {
    const aggregate = aggregateEvidenceSetupCosts([
      run({ map_count: 10, per_map_cost: 100, divine_price: 100 }),
      run({ map_count: 10, per_map_cost: 100, divine_price: null }),
    ]);

    expect(aggregate).toMatchObject({
      totalInvestDivines: null,
      costPerMapDivines: null,
    });
  });

  it('uses exact recorded investment instead of multiplying a rounded per-map value', () => {
    const aggregate = aggregateEvidenceSetupCosts([
      run({
        map_count: 3,
        per_map_cost: 33.3,
        total_invest: 100,
        divine_price: 100,
      }),
    ]);

    expect(aggregate).toMatchObject({
      totalInvestDivines: 1,
    });
    expect(aggregate!.costPerMapDivines).toBeCloseTo(1 / 3);
  });

  it('rejects evidence without a usable map count and all-in cost', () => {
    expect(aggregateEvidenceSetupCosts([
      run({ map_count: 0, per_map_cost: null, total_invest: null }),
    ])).toBeNull();
  });
});
