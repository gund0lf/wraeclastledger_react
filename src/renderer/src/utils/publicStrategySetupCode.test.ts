import { describe, expect, it } from 'vitest';
import {
  decodeDiscordShareBrotli,
  encodeDiscordShareBrotli,
} from '../../../main/discordShareCompression';
import { decodeDiscordSharePayload } from './discordShareWire';
import { buildImportedSetupPlan } from './investmentSetup';
import { generatePublicStrategySetupCode } from './publicStrategySetupCode';
import publicSetupCodeFixture from './fixtures/public-setup-code.json';

const strategy = () => ({
  schema_version: 1 as const,
  id: '11111111-1111-4111-8111-111111111111',
  revision: 3,
  title: 'Safe public strategy',
  notes: 'Plain public notes',
  tags: ['bestiary', 'regular'],
  league: 'Mirage',
  setup: {
    map_type: '8-mod',
    atlas: {
      url: 'https://pathofpathing.com/?v=3.29.0-atlas#AAAA',
      points: 138,
      points_max: 138,
    },
    run_regex: '"ack.*([4-9].|\\d..)%"',
  },
});

const evidence = (ordinal = 2) => ({
  schema_version: 1 as const,
  ordinal,
  setup: {
    map_type: '8-mod',
    group_play: false,
    party_size: 1,
    chisel: 'avarice',
    scarabs: ['bestiary scarab', 'bestiary scarab of the herd'],
    delirium: { type: 'fine', count_per_map: 2 },
    astrolabe: 'grasping astrolabe',
    multiplying_modifiers: { allocated: true, fragment_count: 4 },
    game_data: { revision: 4, patch_version: '3.29' },
  },
  observed: {
    map_count: 10,
    mod_average: 7.2,
    mod_sample_size: 10,
    quantity_average: 100,
    rarity_average: 60,
    pack_size_average: 40,
    currency_average: 20,
    multiplier: 1.5,
  },
  economics: {
    recurring_cost_per_map_chaos: 20,
    total_invest_chaos: 200,
    net_profit_chaos: -50,
    net_per_map_divines: -0.05,
    divine_price_chaos: 100,
  },
  timing: { reported_minutes: 30 },
  cost_breakdown: {
    chisel: { name: 'Avarice', price_each_chaos: 0 },
    scarabs: [
      { name: 'Bestiary Scarab of the Herd', price_each_chaos: 8 },
      { name: 'Bestiary Scarab', price_each_chaos: 4 },
    ],
    delirium: { type: 'Fine', count_per_map: 2, price_each_chaos: 5 },
    astrolabe: { type: 'Grasping Astrolabe', count: 10, price_each_chaos: 3 },
  },
});

const page = (runs = [evidence()]) => ({
  schema_version: 1 as const,
  strategy_id: '11111111-1111-4111-8111-111111111111',
  revision: 3,
  runs,
});

describe('public strategy setup-code adapter', () => {
  it('round-trips the safe DTO through the production wl3 desktop path', async () => {
    const poisonedStrategy = {
      ...strategy(),
      discord_jump_url: 'DROP-DISCORD-LINK',
      raw_export: 'DROP-RAW-EXPORT',
    };
    const poisonedEvidence = {
      ...evidence(),
      run_id: 'DROP-RUN-ID',
      setup_fingerprint: 'DROP-SETUP-HASH',
      payload: { authority: 'DROP-OPERATION-AUTHORITY' },
    };
    const result = await generatePublicStrategySetupCode(
      poisonedStrategy,
      page([poisonedEvidence]),
      encodeDiscordShareBrotli,
    );

    expect(result.status).toBe('available');
    if (result.status !== 'available') return;
    expect(result.code.startsWith('wl3.')).toBe(true);
    expect(result.code).toBe(publicSetupCodeFixture.wl3);
    expect(result.sourceEvidenceOrdinal).toBe(2);

    const payloadJson = decodeDiscordShareBrotli(result.code);
    for (const forbidden of [
      'DROP-DISCORD-LINK',
      'DROP-RAW-EXPORT',
      'DROP-RUN-ID',
      'DROP-SETUP-HASH',
      'DROP-OPERATION-AUTHORITY',
    ]) expect(payloadJson).not.toContain(forbidden);

    const decoded = decodeDiscordSharePayload(payloadJson);
    expect(decoded).not.toBeNull();
    expect(decoded).toMatchObject({
      operation: 'share',
      updateStrategyId: null,
      evidenceTargetStrategyId: null,
      mapCount: 10,
      mapType: '8-mod',
      totalInvest: 200,
      totalReturn: 150,
      netProfit: -50,
      divPerMap: -0.05,
      atlasTreeUrl: 'https://pathofpathing.com/?v=3.29.0-atlas#AAAA',
      scarabs: ['Bestiary Scarab', 'Bestiary Scarab of the Herd'],
      scarabCosts: [4, 8],
      excludedDrops: [],
      lootSummary: null,
    });
    expect(buildImportedSetupPlan({
      mapType: decoded!.mapType,
      chisel: decoded!.chisel,
      scarabs: decoded!.scarabs,
      deliriumType: decoded!.deliOrbType,
      deliriumCountPerMap: decoded!.deliOrbQty,
      astrolabeType: decoded!.astroType,
    })).toEqual({
      mapType: '8-mod',
      chiselType: 'Avarice',
      scarabNames: ['Bestiary Scarab', 'Bestiary Scarab of the Herd'],
      deliriumType: 'Fine',
      deliriumCountPerMap: 2,
      astrolabeType: 'Grasping Astrolabe',
    });
  });

  it('uses the newest complete run and falls back without inventing missing prices', async () => {
    const incomplete = {
      ...evidence(3),
      cost_breakdown: null,
    };
    const result = await generatePublicStrategySetupCode(
      strategy(),
      page([evidence(1), incomplete]),
      encodeDiscordShareBrotli,
    );
    expect(result).toMatchObject({ status: 'available', sourceEvidenceOrdinal: 1 });

    const unavailable = await generatePublicStrategySetupCode(
      strategy(),
      page([incomplete]),
      encodeDiscordShareBrotli,
    );
    expect(unavailable).toEqual({
      status: 'unavailable',
      reason: 'incomplete_safe_source',
    });
  });

  it('flattens public DTO multiline notes for the production single-line wire', async () => {
    const result = await generatePublicStrategySetupCode(
      { ...strategy(), notes: 'First public line\nSecond public line' },
      page(),
      encodeDiscordShareBrotli,
    );

    expect(result.status).toBe('available');
    if (result.status !== 'available') return;
    const decoded = decodeDiscordSharePayload(decodeDiscordShareBrotli(result.code));
    expect(decoded?.strategyNotes).toBe('First public line Second public line');
  });

  it('fails closed on setup/cost disagreement and invalid transport output', async () => {
    const mismatched = evidence();
    mismatched.cost_breakdown.scarabs[0].name = 'Unrelated Scarab';
    expect(await generatePublicStrategySetupCode(
      strategy(),
      page([mismatched]),
      encodeDiscordShareBrotli,
    )).toEqual({ status: 'unavailable', reason: 'incomplete_safe_source' });

    expect(await generatePublicStrategySetupCode(
      strategy(),
      page(),
      () => 'wl2.not-production',
    )).toEqual({ status: 'unavailable', reason: 'encoding_failed' });
  });

  it('rejects stale or cross-strategy evidence before encoding', async () => {
    const stale = page();
    stale.revision = 2;
    const crossStrategy = page();
    crossStrategy.strategy_id = '22222222-2222-4222-8222-222222222222';

    expect(await generatePublicStrategySetupCode(
      strategy(),
      stale,
      encodeDiscordShareBrotli,
    )).toEqual({ status: 'unavailable', reason: 'incomplete_safe_source' });
    expect(await generatePublicStrategySetupCode(
      strategy(),
      crossStrategy,
      encodeDiscordShareBrotli,
    )).toEqual({ status: 'unavailable', reason: 'incomplete_safe_source' });
  });
});
