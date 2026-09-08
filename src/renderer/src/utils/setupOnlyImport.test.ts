import { expect, it } from 'vitest';
import { buildSetupOnlyImportPlan } from './setupOnlyImport';
import { publicStrategySetup } from '../../../shared/strategySetupCode';

it('loads canonical reusable identities and duplicate slots identically with or without inspection history', () => {
  const code = publicStrategySetup({ schema_version: 1, id: 'synthetic', revision: 1,
    title: 'Example', league: 'Older league', setup: { map_type: '8-mod', chisel: 'avarice',
      scarabs: [{ name: 'bestiary scarab of the herd', price_each_chaos: 900 }, { name: 'bestiary scarab of the herd', price_each_chaos: 900 }],
      delirium: { type: 'fine', count_per_map: 2 }, astrolabe: 'grasping astrolabe',
      atlas: { url: 'https://pathofpathing.com/?v=3.29.0-atlas#AAAA' }, run_regex: '"ack.*40%"' },
    economics: { all_in_cost_per_map_chaos: 2000, historical_net_divines: 100 },
  })!;
  const plan = buildSetupOnlyImportPlan(code);
  const withoutHistory = { ...code }; delete withoutHistory.history;
  expect(plan).toEqual(buildSetupOnlyImportPlan(withoutHistory));
  expect(plan.investment).toEqual({ mapType: '8-mod', chiselType: 'Avarice',
    scarabNames: ['Bestiary Scarab of the Herd', 'Bestiary Scarab of the Herd'],
    deliriumType: 'Fine', deliriumCountPerMap: 2, astrolabeType: 'Grasping Astrolabe' });
  expect(plan.source).toEqual({ kind: 'setup', authorName: 'Example', runRegex: '"ack.*40%"', mapType: '8mod' });
  expect(Object.keys(plan)).toEqual(['investment', 'atlasTreeUrl', 'source', 'multiplyingModifiers']);
});
