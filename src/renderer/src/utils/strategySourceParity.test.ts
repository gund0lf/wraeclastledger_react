import { describe, expect, it } from 'vitest';
import fixtures from './fixtures/strategy-source-parity.json';
import { publicStrategySetup, encodeStrategySetupCode, decodeStrategySetupCode } from '../../../shared/strategySetupCode';
import { publishedStrategyImportSource, discordImportSource } from './strategyImportSource';
import { buildSetupOnlyImportPlan } from './setupOnlyImport';
import { evidencePresentation } from './evidenceApi';
import { parseDiscordExport } from './parseDiscordExport';
import { buildImportPreview } from './importPreview';

describe('independently projected desktop and website sources', () => {
  for (const fixture of fixtures.cases) {
    it(`${fixture.name}: loads identical investment, Atlas and recorded regex guidance`, () => {
      const web = publicStrategySetup(fixture.detail, fixture.evidence);
      expect(web).not.toBeNull();
      const pasted = decodeStrategySetupCode(encodeStrategySetupCode(web!))!;
      const desktop = publishedStrategyImportSource(fixture.desktop);
      expect(buildSetupOnlyImportPlan(pasted)).toEqual(buildSetupOnlyImportPlan(desktop));
      expect(pasted.party).toEqual(desktop.party);
      expect(buildImportPreview({ kind: 'setup', value: pasted }).isGroupPlay).toBe(true);
      expect(pasted).not.toHaveProperty('raw_export');
    });
    it(`${fixture.name}: preview has the same recorded totals and averages as the current app row`, () => {
      const web = publicStrategySetup(fixture.detail, fixture.evidence)!;
      const app = evidencePresentation(fixture.desktop);
      expect(web.history).toMatchObject({ maps: app.mapCount, costPerMap: app.costPerMap,
        totalInvest: fixture.desktop.total_invest, netProfit: fixture.desktop.net_profit,
        netPerMapDivines: app.divPerMap, quantity: fixture.desktop.avg_quant, packSize: fixture.desktop.avg_pack });
      expect(web.history?.historicalInvestDivines).toBeCloseTo(app.totalInvestDivines!);
    });
  }
  it('uses current pooled guidance, not the older authored run preserved in raw_export', () => {
    const fixture = fixtures.cases.find((c) => c.name === 'pooled')!;
    const oldRun = parseDiscordExport(fixture.desktop.raw_export)!;
    const published = buildSetupOnlyImportPlan(publishedStrategyImportSource(fixture.desktop));
    const oldSnapshot = buildSetupOnlyImportPlan(discordImportSource(oldRun));
    expect(published.source).toMatchObject({ mapCount: 40, avgQuant: 145, avgPack: 45 });
    expect(oldSnapshot.source).toMatchObject({ mapCount: 10, avgQuant: 100, avgPack: 30 });
    expect(published.investment).toEqual(oldSnapshot.investment);
    expect(published.multiplyingModifiers).toEqual(oldSnapshot.multiplyingModifiers);
  });
});
