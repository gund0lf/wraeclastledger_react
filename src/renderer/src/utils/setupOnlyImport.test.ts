import { expect, it } from 'vitest';
import { buildSetupOnlyImportPlan } from './setupOnlyImport';
import { freshWorkingPayload } from '../repository/sessionRepositoryRuntime';
import { decodeSessionPayload, toJsonObject } from '../repository/sessionPayloadCodec';
import { DEFAULT_SETTINGS } from '../store/useSessionStore';
import { buildCovensShare } from './covensShare';
import { publicStrategySetup } from '../../../shared/strategySetupCode';
import { encodeStrategySetupCode, decodeStrategySetupCode } from '../../../shared/strategySetupCode';

it('round-trips price-free Covens settings, including granted and paused slots and a path-through choice', () => {
  const code = { version: 1, kind: 'setup', title: 'Example', notes: '', league: 'Covens', mapType: '8-mod',
    chisel: null, scarabs: [], delirium: null, astrolabe: null, runRegex: '',
    atlasTreeUrl: 'https://pathofpathing.com/?v=3.30.0-atlas#AAAA',
    covens: { version: 1, threads: [{ slot: 2, id: 'bestiary-thread', paid: 0, granted: 1, paused: true }],
      ember: 'allflame-ember-of-resplendence', atlas: { version: '3.30.0-atlas', choices: [{ node: 712, option: 50999 }] } },
  } as const;
  const decoded = decodeStrategySetupCode(encodeStrategySetupCode(JSON.parse(JSON.stringify(code))))!;
  const plan = buildSetupOnlyImportPlan(decoded);
  expect(plan.device?.threadSlots?.[1]).toEqual({ name: 'Bestiary Thread', count: 0, granted: 1, paused: true, price: 0 });
  expect(plan.device?.ember).toEqual({ name: 'Allflame Ember of Resplendence', price: 0 });
  expect(plan.device?.choices).toEqual({ '712': '50999' });
  for (const threads of [null, []]) {
    const source = { ...decoded, covens: { ...decoded.covens!, threads } };
    const fresh = decodeSessionPayload(freshWorkingPayload(source.league), DEFAULT_SETTINGS);
    expect(fresh.settings.leagueName).toBe('Covens');
    const slots = buildSetupOnlyImportPlan(source).device?.threadSlots;
    const reopened = decodeSessionPayload(toJsonObject({ ...fresh, settings: { ...fresh.settings, threadSlots: slots } }), DEFAULT_SETTINGS);
    expect(buildCovensShare(reopened.settings, reopened.maps)?.threads).toEqual(threads);
    expect(reopened.maps).toEqual([]);
  }
  const invalid = JSON.parse(JSON.stringify(code));
  invalid.covens.threads[0].price_each = 80;
  expect(() => encodeStrategySetupCode(invalid)).toThrow();
});

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
