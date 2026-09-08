import { describe, expect, it } from 'vitest';
import { decodeStrategySetupCode, encodeStrategySetupCode, publicStrategySetup, SETUP_CODE_MAX_LENGTH, type StrategySetupCode } from '../../../shared/strategySetupCode';

const setup: StrategySetupCode = {
  version: 1, kind: 'setup', title: '森林 · Test', notes: 'First line\nSecond line', league: 'Allflame',
  mapType: '8-mod', chisel: 'avarice', scarabs: ['Bestiary Scarab of the Herd', 'Bestiary Scarab of the Herd'],
  delirium: { type: 'fine', countPerMap: 2 }, astrolabe: 'grasping astrolabe',
  atlasTreeUrl: 'https://pathofpathing.com/?v=3.29.0-atlas#AAAA', runRegex: '"ack.*40%"',
};
const detail = () => ({ schema_version: 1, id: '11111111-1111-4111-8111-000000000001', revision: 1,
  title: setup.title, notes: setup.notes, league: setup.league,
  setup: { map_type: '8-mod', chisel: 'Avarice', scarabs: setup.scarabs.map((name) => ({ name, price_each_chaos: 12.5 })),
    delirium: { type: 'Fine', count_per_map: 2 }, astrolabe: 'Grasping Astrolabe',
    atlas: { url: setup.atlasTreeUrl, points: 138, points_max: 138 }, run_regex: setup.runRegex },
  coverage: { run_count: 1, map_count: 60, timed_minutes: 160, timed_map_count: 60 },
  observed: { quantity_average: 114, rarity_average: 129, pack_size_average: 49, currency_average: 18, multiplier_average: 1.63 },
  economics: { all_in_cost_per_map_chaos: 208, historical_invest_divines: 32.929, historical_net_divines: 110.1, net_per_map_divines: 1.835 },
});
const evidence = () => ({ schema_version: 1, strategy_id: detail().id, revision: 1, next_cursor: null,
  runs: [{ schema_version: 1, observed: { map_count: 60 }, setup: detail().setup,
    cost_breakdown: null, display_cost_breakdown: { scarabs: detail().setup.scarabs },
    economics: { total_invest_chaos: 12480, net_profit_chaos: 41730.1, divine_price_chaos: 379 } }],
});
const raw = (value: unknown) => 'wls1.' + Buffer.from(JSON.stringify(value)).toString('base64url');

describe('website setup import', () => {
  it('round-trips Unicode and multiline notes without requiring a historical run', () => {
    expect(decodeStrategySetupCode(`\n${encodeStrategySetupCode(setup)}\n`)).toEqual(setup);
  });
  it('copies an older run with null structured costs and preserves available inspection values', () => {
    const code = publicStrategySetup(detail(), evidence())!;
    expect(code).not.toBeNull();
    expect(code.history).toMatchObject({ totalInvest: 12480, netProfit: 41730.1, divinePrice: 379, scarabPrices: [12.5, 12.5] });
    expect(decodeStrategySetupCode(encodeStrategySetupCode(code))).toEqual(code);
  });
  it('omits unknown economics without manufacturing zeros or blocking reusable settings', () => {
    const d = { ...detail(), economics: {} };
    const code = publicStrategySetup(d)!;
    expect(code.history).toMatchObject({ totalInvest: null, netProfit: null, divinePrice: null, costPerMap: null });
    expect(code.scarabs).toEqual(setup.scarabs);
  });
  it.each(['strategyId', 'evidenceHash', 'owner', 'prices', 'raw_export'])('rejects injected %s outside inspection', (field) => {
    expect(decodeStrategySetupCode(raw({ ...setup, [field]: 'injected' }))).toBeNull();
  });
  it.each(['http://pathofpathing.com/#AAA', 'https://pathofpathing.com.evil.test/#AAA', 'https://user@pathofpathing.com/#AAA', 'javascript:alert(1)'])('rejects unsafe Atlas URL %s', (atlasTreeUrl) => {
    expect(decodeStrategySetupCode(raw({ ...setup, atlasTreeUrl }))).toBeNull();
  });
  it('rejects unsupported schemas, malformed encoding, duplicate keys, oversized and invalid fields', () => {
    for (const code of ['wls2.' + encodeStrategySetupCode(setup).slice(5), 'wls1.!', 'wls1.A',
      'wls1.' + 'a'.repeat(SETUP_CODE_MAX_LENGTH), raw({ ...setup, scarabs: Array(6).fill('Scarab') }),
      raw({ ...setup, delirium: { type: 'Fine', countPerMap: 6 } }),
      'wls1.' + Buffer.from(JSON.stringify(setup).replace('"version":1', '"version":2,"version":1')).toString('base64url')]) {
      expect(decodeStrategySetupCode(code)).toBeNull();
    }
  });
  it('rejects cross-revision and cross-strategy evidence', () => {
    expect(publicStrategySetup(detail(), { ...evidence(), revision: 2 })).toBeNull();
    expect(publicStrategySetup(detail(), { ...evidence(), strategy_id: 'different' })).toBeNull();
  });
  it('does not derive pooled Chaos totals or one Divine quote from incomplete or mixed history', () => {
    const d = detail(); d.coverage.run_count = 2; d.coverage.map_count = 120;
    const e = evidence(); e.runs.push({ ...e.runs[0], economics: { ...e.runs[0].economics, divine_price_chaos: 500 } });
    expect(publicStrategySetup(d, e)?.history).toMatchObject({ totalInvest: 24960, netProfit: 83460.2, divinePrice: null });
    e.runs.pop();
    expect(publicStrategySetup(d, e)?.history).toMatchObject({ totalInvest: null, netProfit: null, divinePrice: null });
  });
  it('keeps real zero and losses in the informational snapshot', () => {
    const e = evidence(); e.runs[0].economics.total_invest_chaos = 0; e.runs[0].economics.net_profit_chaos = -25;
    expect(publicStrategySetup(detail(), e)?.history).toMatchObject({ totalInvest: 0, netProfit: -25 });
  });
});
