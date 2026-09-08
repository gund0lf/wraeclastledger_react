// Generate synthetic independent API projections using the maintained server's real mappers.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
if (!process.argv[2]) throw Error('Pass the server source checkout.');
const server = path.resolve(process.argv[2]);
const require = createRequire(path.join(server, 'package.json'));
const { mapWebStrategyDetail, mapWebEvidenceRun } = require('./api/publicStrategyDto');
const { aggregateEvidenceRuns, buildSetupSnapshot } = require('./api/evidenceCore');
const atlas = 'https://pathofpathing.com/?v=3.29.0-atlas#AAAA';
const cases = [];
for (const [name, count, mapType, allocated, legacy] of [
  ['single', 1, '8-mod', true, false], ['pooled', 2, '6-mod', true, false],
  ['legacy-costs', 1, '8-mod', true, true], ['off-and-zero', 1, '6-mod', false, false],
]) {
  const runs = Array.from({ length: count }, (_, index) => {
    const maps = index ? 30 : 10, divine = index ? 400 : 200;
    const payload = { mapCount: maps, avgQuant: index ? 160 : 100, avgRarity: 60,
      avgPack: index ? 50 : 30, avgCurrency: allocated ? 20 : 0,
      observedModAverage: 7, observedModSampleSize: maps, multiplier: index ? 2 : 1.5,
      perMapCost: 50, totalInvest: 50 * maps, netProfit: allocated ? (index ? 900 : -100) : 0,
      divPerMap: allocated ? (index ? 900 : -100) / divine / maps : 0,
      divinePrice: divine, sessionMinutes: index ? null : 30,
      costBreakdown: { chisel: { name: 'Avarice', priceEach: 2 },
        scarabs: [{ name: 'Bestiary Scarab of the Herd', priceEach: 5 }, { name: 'Bestiary Scarab of the Herd', priceEach: 5 }],
        delirium: { type: 'Fine', countPerMap: 2, priceEach: 3 },
        astrolabe: { type: 'Grasping Astrolabe', count: 1, priceEach: 40 } },
    };
    const raw = `WraeclastLedger — Session Export\nStrategy: ${name}\nMaps: ${maps}\nType: ${mapType}\nMultiplier: ${payload.multiplier}x\nAvg Quant: ${payload.avgQuant}%\nAvg Rarity: 60%\nAvg Pack: ${payload.avgPack}%\nAvg Currency: ${payload.avgCurrency}%\nDivine Price: ${divine}c\nPer Map Cost: 50c\nTotal Invest: ${payload.totalInvest}c\nNet Profit: ${payload.netProfit}c\nProfit/map: ${payload.divPerMap}d\nChisel: Avarice (2c each)\n- Bestiary Scarab of the Herd (5c)\n- Bestiary Scarab of the Herd (5c)\nDelirium Orbs: 2x Fine (3c each)\nAstrolabe: Grasping Astrolabe (1x, 40c each)\nRun: "ack.*40%"\nMultiplying Modifiers: ${allocated ? '5 fragments' : 'Off'}\nAtlas Tree: ${atlas}\nLeague: Allflame\nParty Play: Yes (3 players)\nTags: bestiary,regular`;
    payload.raw_export = raw;
    const snapshot = buildSetupSnapshot({ mapType, league: 'Allflame', groupSize: 3, isGroupPlay: true,
      chiselType: 'Avarice', scarabs: payload.costBreakdown.scarabs.map((s) => s.name),
      deliriumType: 'Fine', deliriumCountPerMap: 2, astrolabeType: 'Grasping Astrolabe',
      atlasTreeUrl: atlas, multiplier: payload.multiplier, gameDataRevision: 4, gameDataPatchVersion: '3.29',
      multiplyingModifiersAllocated: allocated, multiplyingModifiersFragmentCount: allocated ? 5 : 0 });
    if (legacy) delete payload.costBreakdown;
    return { evidence_ordinal: index + 1, submitted_at: '2026-09-01T10:00:00Z',
      run_started_at: null, run_ended_at: null, setup_snapshot: snapshot, payload };
  });
  const a = aggregateEvidenceRuns(runs.map((r) => r.payload));
  const desktop = { id: '11111111-1111-4111-8111-000000000001', discord_username: 'Synthetic author',
    current_revision: 2, strategy_name: name, strategy_notes: 'Synthetic parity fixture', league: 'Allflame',
    posted_at: '2026-09-01T10:00:00Z', map_type: mapType, type_tag: 'bestiary,regular',
    chisel: 'Avarice', scarabs: [{ name: 'Bestiary Scarab of the Herd', cost: 5 }, { name: 'Bestiary Scarab of the Herd', cost: 5 }],
    atlas_tree_url: atlas, run_regex: '"ack.*40%"', slam_regex: null, is_group_play: true, group_size: 3,
    raw_export: runs[0].payload.raw_export, map_count: a.evidenceMapCount, evidence_map_count: a.evidenceMapCount,
    evidence_run_count: a.evidenceRunCount, avg_quant: a.avgQuant, avg_rarity: a.avgRarity,
    avg_pack: a.avgPack, avg_currency: a.avgCurrency, multiplier: a.multiplier,
    total_invest: a.totalInvest, net_profit: a.netProfit, per_map_cost: a.perMapCost,
    div_per_map: a.historicalDivPerMap, divine_price: runs[0].payload.divinePrice,
    historical_total_divines: a.historicalTotalDivines, historical_total_invest_divines: a.historicalTotalInvestDivines,
    timed_run_count: a.timedRunCount, timed_map_count: a.timedMapCount, timed_session_minutes: a.timedSessionMinutes,
    timed_total_divines: a.timedTotalDivines, session_minutes: a.timedSessionMinutes,
  };
  cases.push({ name, desktop, detail: mapWebStrategyDetail(desktop), evidence: {
    schema_version: 1, strategy_id: desktop.id, revision: 2, next_cursor: null, runs: runs.map(mapWebEvidenceRun),
  } });
}
const sources = ['api/publicStrategyDto.js', 'api/evidenceCore.js', 'api/evidenceService.js'].map((file) => ({
  path: file, sha256: createHash('sha256').update(fs.readFileSync(path.join(server, file))).digest('hex'),
}));
fs.writeFileSync('src/renderer/src/utils/fixtures/strategy-source-parity.json', JSON.stringify({ sources, cases }, null, 2) + '\n');
console.log(`Generated ${cases.length} synthetic strategy parity cases with real server projections.`);
