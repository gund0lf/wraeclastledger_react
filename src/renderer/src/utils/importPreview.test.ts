import { expect, it } from 'vitest';
import { decodeDiscordShareBrotli } from '../../../main/discordShareCompression';
import { decodeDiscordSharePayload } from './discordShareWire';
import fixture from './fixtures/public-setup-code.json';
import { buildImportPreview } from './importPreview';
import { parseDiscordExport } from './parseDiscordExport';
import { discordImportSource } from './strategyImportSource';

it('presents the same recorded fields from a legacy Discord token and a website code', () => {
  const run = decodeDiscordSharePayload(decodeDiscordShareBrotli(fixture.wl3))!;
  const legacy = buildImportPreview({ kind: 'discord', value: run });
  const website = buildImportPreview({ kind: 'setup', value: {
    version: 1, kind: 'setup', title: legacy.title, notes: legacy.notes, league: legacy.league,
    mapType: '8-mod', chisel: legacy.chisel, scarabs: legacy.scarabs, delirium: legacy.delirium,
    astrolabe: legacy.astrolabe, atlasTreeUrl: legacy.atlasTreeUrl, runRegex: legacy.runRegex,
    history: legacy.history!,
  } });
  expect(website.history).toEqual(legacy.history);
  expect(website.scarabs).toEqual(legacy.scarabs);
  expect(website.notes).toBe(legacy.notes);
  expect(Object.keys(website)).toEqual(Object.keys(legacy));
  expect(website).not.toHaveProperty('updateStrategyId');
  expect(website.slamRegex).toBe('');
  expect(legacy.approximateTotals).toBeUndefined();
  expect(website.approximateTotals).toBeUndefined();
});

it('discloses rounded Divine totals without changing reusable setup', () => {
  const card = `WraeclastLedger\nMaps: 20\nType: 6-mod\nDivine Price: 215c\n**Total Invest:** 71.5d\n**Net Profit:** +87.4d`;
  const parsed = parseDiscordExport(card)!;
  expect(parsed.totalInvest).toBeCloseTo(15372.5);
  expect(parsed.netProfit).toBeCloseTo(18791);
  const preview = buildImportPreview({ kind: 'discord', value: parsed });
  expect(preview.approximateTotals).toEqual({ totalInvest: true, netProfit: true });
  expect(discordImportSource(parsed)).toEqual(discordImportSource({ ...parsed, approximateTotals: undefined }));
  const chaos = parseDiscordExport(card.replace('71.5d', '15371.6c').replace('+87.4d', '+18801.4c'))!;
  expect(buildImportPreview({ kind: 'discord', value: chaos }).approximateTotals).toBeUndefined();
});

it('marks only the totals expressed in Divines including loss and zero', () => {
  for (const amount of ['-0.5', '0']) {
    const parsed = parseDiscordExport(`WraeclastLedger\nMaps: 20\nDivine Price: 215c\nTotal Invest: 100c\nNet Profit: ${amount}d`)!;
    expect(parsed.approximateTotals).toEqual({ totalInvest: false, netProfit: true });
    expect(parsed.netProfit).toBe(Number(amount) * 215);
  }
});
it('preserves invalid-operation blocking on legacy imports', () => {
  const run = decodeDiscordSharePayload(decodeDiscordShareBrotli(fixture.wl3))!;
  run.operationError = 'invalid_operation_marker';
  expect(buildImportPreview({ kind: 'discord', value: run }).operationError).toBe('invalid_operation_marker');
});
