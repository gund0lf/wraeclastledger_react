import type { SafeDetail } from '../../../shared/safeStrategy'
import { normalizeManualLootIdentity } from '../../../shared/manualLoot'
import type { LootSummary, LootSummaryRow } from './lootSummary'
import { ITEM_CATEGORIES } from './lootCategories'
import type { LootCategory } from '../types'

type OptionalTotals = 'inventoryFlow' | 'marketRevaluation' | 'manualTotal' |
  'omittedCsvRows' | 'omittedCsvValue' | 'omittedManualRows' | 'omittedManualValue'

/** Display vocabulary shared by the existing card and the public reader. */
export type StrategyLootPresentation = Omit<LootSummary, OptionalTotals | 'rows' | 'categories'> & {
  [K in OptionalTotals]: number | null
} & {
  rows: Array<Omit<LootSummaryRow, 'category' | 'source'> & {
    category: string; source: string; identityDescription?: string
  }>
  categories: Array<{ category: string; value: number }>
}

export function categoryArtwork(category: string): LootCategory {
  return ITEM_CATEGORIES.find(known => known === category) ?? 'Other'
}

/** Rename validated public fields only; absence must never become a zero. */
export function publicLootPresentation(loot: NonNullable<SafeDetail['loot']>): StrategyLootPresentation {
  return {
    version: loot.version, rowLimit: loot.row_limit,
    categories: loot.categories.map(c => ({ category: c.category, value: c.value_chaos })),
    rows: loot.rows.map(r => {
      const identity = r.identity && normalizeManualLootIdentity({
        ...r.identity, equipmentGroup: r.identity.equipment_group,
        memoryStrands: r.identity.memory_strands ?? undefined,
        influence: r.identity.influence ?? undefined,
      })
      return {
        name: r.name, category: r.category, source: r.source, quantity: r.quantity,
        value: r.value_chaos, note: r.note ?? undefined, identity: identity || undefined,
        identityDescription: r.identity ? Object.entries(r.identity)
          .filter(([key]) => key !== 'kind')
          .map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value ?? 'unrecorded'}`).join(' · ') : undefined,
        valuation: r.valuation ? {
          baselineQuantity: r.valuation.baseline_quantity, currentQuantity: r.valuation.current_quantity,
          baselineValue: r.valuation.baseline_value_chaos, currentValue: r.valuation.current_value_chaos,
        } : undefined,
      }
    }),
    hasBaseline: loot.has_baseline, csvPositive: loot.csv_positive_chaos,
    csvNegative: loot.csv_negative_chaos, csvNet: loot.csv_net_chaos,
    csvAdjustment: loot.csv_adjustment_chaos, inventoryFlow: loot.inventory_flow_chaos,
    marketRevaluation: loot.market_revaluation_chaos, manualTotal: loot.manual_total_chaos,
    gemCorrection: loot.gem_correction_chaos, investmentCorrection: loot.investment_correction_chaos,
    reportedReturn: loot.reported_return_chaos, omittedCsvRows: loot.omitted_csv_rows,
    omittedCsvValue: loot.omitted_csv_value_chaos, omittedManualRows: loot.omitted_manual_rows,
    omittedManualValue: loot.omitted_manual_value_chaos,
  }
}
