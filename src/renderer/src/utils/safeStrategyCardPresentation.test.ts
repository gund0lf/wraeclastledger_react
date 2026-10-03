import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { parseSafeDetail, parseSafeRun, parseSafeRow } from '../../../shared/safeStrategy'
import fixture from './__fixtures__/safe-strategy-v2.json'
import { compactChaos, detailMoney, recordedCostBreakdown, recordedCount, singleRunQuote, publishedChiselName, safePooledPresentation, listDivineTotal, groupLabel } from './safeStrategyCardPresentation'
import { categoryArtwork, publicLootPresentation } from './strategyLootPresentation'

describe('safe rich strategy presentation', () => {
  it('shows only supplied historical list totals and distinguishes unknown party size', () => {
    expect(listDivineTotal(null)).toBeNull()
    expect(listDivineTotal(0, true)).toBe('+0.0d')
    expect(listDivineTotal(-3, true)).toBe('-3.0d')
    expect(listDivineTotal(71.5)).toBe('71.5d')
    expect(groupLabel(true, 3)).toBe('Group · 3 players')
    expect(groupLabel(true, null)).toBe('Group')
    expect(groupLabel(null, null)).toBeNull()
    expect(groupLabel(false, 1)).toBeNull()
    expect(recordedCount(1234, 'map')).toBe('1,234 maps')
  })
  it('reuses weighted costs only for complete matching evidence, preserving duplicate items and individual quotes', () => {
    const { buildPresentationFixtures } = createRequire(import.meta.url)('./__fixtures__/safe-strategy-presentation.mjs')
    const entry = buildPresentationFixtures().entries[1]
    const detail = parseSafeDetail(entry.detail), runs = entry.runs.map(parseSafeRun)
    const view = safePooledPresentation(runs, detail)!
    expect(view.mapCount).toBe(144)
    expect(view.allIn).toBeCloseTo(213.5)
    expect(view.scarabItems.filter(s => s.name === 'Divination Scarab of Plenty')).toHaveLength(2)
    expect(view.totalInvestDivines).toBeCloseTo(15372 / 215 + 15372 / 300)
    expect(view.costPerMapDivines).toBeCloseTo((15372 / 215 + 15372 / 300) / 144)
    expect(safePooledPresentation(runs.slice(0, 1), detail)).toBeNull()
    expect(safePooledPresentation(runs, { ...detail, coverage: { ...detail.coverage, map_count: 200 } })).toBeNull()
    runs[1].economics.divine_price_chaos = null
    expect(safePooledPresentation(runs, detail)!.costPerMapDivines).toBeNull()
    runs[1].cost_breakdown!.scarabs[0].price_each_chaos = null
    expect(safePooledPresentation(runs, detail)).toBeNull()
  })
  it('rejects old identity and export fields before the restored view can receive them', () => {
    for (const key of ['discord_username', 'raw_export', 'discord_jump_url']) {
      expect(() => parseSafeRow({ ...fixture.row, [key]: 'PRIVATE_IDENTITY_SENTINEL' })).toThrow()
      expect(() => parseSafeDetail({ ...fixture.detail, [key]: 'PRIVATE_IDENTITY_SENTINEL' })).toThrow()
    }
  })
  it('uses complete published chisel names without adding a second prefix', () => {
    expect(publishedChiselName("Maven's Chisel of Divination")).toBe("Maven's Chisel of Divination")
    expect(publishedChiselName('Divination')).toBe("Maven's Chisel of Divination")
    expect(publishedChiselName("Cartographer's Chisel")).toBe("Cartographer's Chisel")
    expect(publishedChiselName('None')).toBeNull()
    expect(publishedChiselName(null)).toBeNull()
  })
  it('validates every realistic and missing-data visual fixture through the production readers', () => {
    const { buildPresentationFixtures } = createRequire(import.meta.url)('./__fixtures__/safe-strategy-presentation.mjs')
    for (const entry of buildPresentationFixtures().entries) {
      expect(parseSafeRow(entry.row).id).toBe(entry.detail.id)
      expect(parseSafeDetail(entry.detail).title).toBe(entry.row.title)
      for (const run of entry.runs) expect(parseSafeRun(run).observed.map_count).toBeGreaterThan(0)
    }
  })
  it('formats counts, zero, missing values and signed compact money distinctly', () => {
    expect(recordedCount(1, 'run')).toBe('1 run')
    expect(recordedCount(2, 'run')).toBe('2 runs')
    expect(recordedCount(0, 'run')).toBe('0 runs')
    expect(recordedCount(null, 'run')).toBe('run count unrecorded')
    expect(compactChaos(null)).toBe('—')
    expect(compactChaos(0, true)).toBe('+0c')
    expect(compactChaos(-15200, true)).toBe('-15.2kc')
  })
  it('converts only an exact single-run snapshot, never the last quote of a pool', () => {
    const d = parseSafeDetail(fixture.detail)
    d.authored_history!.economics.divine_price_chaos = 200
    d.economics.net_profit_chaos = 400
    d.economics.historical_net_divines = null
    d.coverage.map_count = d.observed.map_count = d.authored_history!.observed.map_count = 2
    d.coverage.run_count = 1
    expect(singleRunQuote(d)).toBe(200)
    expect(detailMoney(d).netSecondary).toBe('+2.00d')
    d.coverage.run_count = 2
    expect(singleRunQuote(d)).toBeNull()
    expect(detailMoney(d).netSecondary).toBeNull()
    d.economics.historical_net_divines = 1.5
    expect(detailMoney(d).netSecondary).toBe('+1.50d')
    d.coverage.run_count = 1
    d.observed.map_count = 3
    expect(singleRunQuote(d)).toBeNull()
  })
  it('uses the existing cost authority and does not reconstruct from incomplete prices', () => {
    const run = parseSafeRun(fixture.run)
    run.setup.chisel = 'None'; run.setup.delirium = null; run.setup.astrolabe = null
    const costs = { chisel: null, scarabs: run.setup.scarabs.map(name => ({ name, price_each_chaos: 0 })), delirium: null, astrolabe: null }
    expect(recordedCostBreakdown(costs, run.setup, 2, 10)).toEqual({ baseAndRolling: 10, chisel: 0, scarabs: 0, deliriumOrbs: 0, astrolabe: 0, allIn: 10 })
    expect(recordedCostBreakdown(null, run.setup, 2, 10)).toBeNull()
    expect(recordedCostBreakdown(costs, run.setup, 0, 10)).toBeNull()
    expect(recordedCostBreakdown(costs, run.setup, 2, null)).toBeNull()
    expect(recordedCostBreakdown({ ...costs, scarabs: [{ name: 'Other', price_each_chaos: 0 }] }, run.setup, 2, 10)).toBeNull()
    expect(recordedCostBreakdown({ ...costs, chisel: { name: 'Unknown', price_each_chaos: null } }, run.setup, 2, 10)).toBeNull()
    expect(recordedCostBreakdown({ ...costs, delirium: { type: 'Fine', count_per_map: 1, price_each_chaos: -1 } }, run.setup, 2, 10)).toBeNull()
  })
  it('retains null, zero, negative evidence and every safe loot detail without mutation', () => {
    const loot = parseSafeDetail(fixture.richDetail).loot!
    const before = structuredClone(loot)
    const view = publicLootPresentation(loot)
    expect(loot).toEqual(before)
    expect(view.rows).toHaveLength(loot.rows.length)
    expect(view.reportedReturn).toBe(loot.reported_return_chaos)
    expect(view.categories).toEqual(loot.categories.map(c => ({ category: c.category, value: c.value_chaos })))
    for (let i = 0; i < loot.rows.length; i++) {
      expect(view.rows[i]).toMatchObject({ name: loot.rows[i].name, quantity: loot.rows[i].quantity, value: loot.rows[i].value_chaos, source: loot.rows[i].source })
      expect(view.rows[i].note).toBe(loot.rows[i].note ?? undefined)
    }
    loot.manual_total_chaos = null; loot.omitted_csv_rows = null; loot.inventory_flow_chaos = -4; loot.market_revaluation_chaos = 0
    expect(publicLootPresentation(loot)).toMatchObject({ manualTotal: null, omittedCsvRows: null, inventoryFlow: -4, marketRevaluation: 0 })
  })
  it('keeps unfamiliar categories and manual provenance while using safe fallback artwork', () => {
    const loot = parseSafeDetail(fixture.richDetail).loot!
    loot.rows[0].category = '__proto__'
    loot.rows[0].identity = { kind: 'quality-base', base: 'Vaal Regalia', quality: 30, memory_strands: 0, equipment_group: 'armour' }
    const row = publicLootPresentation(loot).rows[0]
    expect(row.category).toBe('__proto__')
    expect(row.identityDescription).toContain('memory strands: 0')
    expect(categoryArtwork('__proto__')).toBe('Other')
    expect(categoryArtwork('Currency')).toBe('Currency')
  })
  it('keeps restored public components independent of legacy identity and request modules', () => {
    for (const name of ['SafeStrategyBrowser', 'SafeStrategyDetail', 'SafeStrategyRow', 'StrategyCardPresentation', 'PublicAuthorName']) {
      const source = readFileSync(new URL(`../components/${name}.tsx`, import.meta.url), 'utf8')
      expect(source).not.toMatch(/discord_username|raw_export|parseDiscordExport|from ['"].*\/(?:StrategyCard|evidenceApi)['"]|\/web\/strategies/)
    }
    const source = readFileSync(new URL('../components/SafeStrategyDetail.tsx', import.meta.url), 'utf8')
    expect(source).toContain('safeStrategyReader.evidence(d)')
    expect(source).toContain('<PublicAuthorName attribution={d.attribution}')
    expect(source).toContain('LootEvidenceSummary')
  })
})
