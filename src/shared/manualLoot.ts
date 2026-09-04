/**
 * Structured identities for author-supplied loot rows.
 *
 * The displayed row name is intentionally separate from the artwork lookup
 * identity. A quality/influenced base or a Syndicate reward can have useful
 * authored context without pretending that the whole label is an item name.
 * This file is imported by both Electron main and the renderer.
 */

export type EquipmentCatalogGroup = 'weapon' | 'armour' | 'accessory'

export type ItemInfluence =
  | 'Shaper'
  | 'Elder'
  | 'Crusader'
  | 'Hunter'
  | 'Redeemer'
  | 'Warlord'

export interface QualityBaseLootIdentity {
  kind: 'quality-base'
  equipmentGroup: Extract<EquipmentCatalogGroup, 'weapon' | 'armour'>
  base: string
  quality: number
  influence?: ItemInfluence
  /** Missing means unrecorded; explicit zero means confirmed no strands. */
  memoryStrands?: number
}

export interface ChartLootIdentity {
  kind: 'chart'
  /** null means the author only knows that the drops were Charts. */
  chart: string | null
}

export interface SyndicateRewardLootIdentity {
  kind: 'syndicate-reward'
  member: string
  reward: string
  equipmentGroup: EquipmentCatalogGroup
  /** Optional exact dropped base; the group remains useful when it is unknown. */
  base?: string
}

export type ManualLootIdentity =
  | QualityBaseLootIdentity
  | ChartLootIdentity
  | SyndicateRewardLootIdentity

export interface TradeItemCatalogGroup {
  id: EquipmentCatalogGroup | 'chart'
  label: string
  entries: string[]
}

export interface TradeItemCatalog {
  groups: TradeItemCatalogGroup[]
}

export const EQUIPMENT_GROUP_LABEL: Readonly<Record<EquipmentCatalogGroup, string>> = {
  weapon: 'Weapons',
  armour: 'Armour',
  accessory: 'Accessories',
}

export const ITEM_INFLUENCES: readonly ItemInfluence[] = [
  'Shaper',
  'Elder',
  'Crusader',
  'Hunter',
  'Redeemer',
  'Warlord',
]

/** Current 3.29 roster, excluding Mastermind Catarina. */
export const SYNDICATE_MEMBERS = [
  'Aisling Laffrey',
  'Cameria the Coldblooded',
  'Elreon',
  'Guff "Tiny" Grenn',
  'Gravicius',
  'Haku',
  'Hillock',
  'It That Fled',
  'Janus Perandus',
  'Jorgin',
  'Korell Goya',
  'Leo',
  'Riker Maloney',
  'Rin Yuushu',
  'Tora',
  'Vagan',
  'Vorici',
] as const

/**
 * Current official Trade Chart group. Kept as an offline fallback; the main
 * process refreshes the live group and may add future identities.
 */
export const BUNDLED_CHART_NAMES = [
  'Coral Forest Chart',
  'Coral Reef Chart',
  'Sandy Seabed Chart',
  'Chart (Abyssal Plain)',
  'Chart (Anchorfield)',
  "Chart (Brine King's Domain)",
  'Chart (Clam-infested Shelf)',
  'Chart (Diving Shoals)',
  'Chart (Eldritch Depths)',
  'Chart (Hazardous Depths)',
  'Chart (Infested Bathyspheres)',
  "Chart (Kishara's Rest)",
  'Chart (Lost Ruins)',
  'Chart (Pelagic Abyss)',
  'Chart (Seafloor Ridges)',
  'Chart (Sea Pillars)',
  'Chart (Sunken Totems)',
  'Chart (Undersea Groves)',
  'Chart (Unremarkable Seabed)',
] as const

const clean = (value: unknown, maximum: number): string => String(value ?? '')
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maximum)

const isEquipmentGroup = (value: unknown): value is EquipmentCatalogGroup => (
  value === 'weapon' || value === 'armour' || value === 'accessory'
)

export function normalizeManualLootIdentity(value: unknown): ManualLootIdentity | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const candidate = value as Record<string, unknown>
  if (candidate.kind === 'quality-base') {
    if (candidate.equipmentGroup !== 'weapon' && candidate.equipmentGroup !== 'armour') {
      return undefined
    }
    const base = clean(candidate.base, 120)
    const quality = Number(candidate.quality)
    const influence = candidate.influence == null ? undefined : clean(candidate.influence, 20)
    const memoryStrands = candidate.memoryStrands
    if (memoryStrands !== undefined && (typeof memoryStrands !== 'number'
      || !Number.isInteger(memoryStrands) || memoryStrands < 0 || memoryStrands > 100)) return undefined
    if (!base || !Number.isInteger(quality) || quality < 1 || quality > 30) return undefined
    if (influence && !ITEM_INFLUENCES.includes(influence as ItemInfluence)) return undefined
    return {
      kind: 'quality-base',
      equipmentGroup: candidate.equipmentGroup,
      base,
      quality,
      ...(influence ? { influence: influence as ItemInfluence } : {}),
      ...(memoryStrands !== undefined ? { memoryStrands } : {}),
    }
  }
  if (candidate.kind === 'chart') {
    const chart = candidate.chart == null ? null : clean(candidate.chart, 120)
    if (chart !== null && (!chart || !/\bchart\b/i.test(chart))) return undefined
    return { kind: 'chart', chart }
  }
  if (candidate.kind === 'syndicate-reward') {
    if (!isEquipmentGroup(candidate.equipmentGroup)) return undefined
    const member = clean(candidate.member, 60)
    const reward = clean(candidate.reward, 100)
    const base = candidate.base == null ? '' : clean(candidate.base, 120)
    if (!member || !reward) return undefined
    return {
      kind: 'syndicate-reward',
      member,
      reward,
      equipmentGroup: candidate.equipmentGroup,
      ...(base ? { base } : {}),
    }
  }
  return undefined
}

export function manualLootIdentityName(identity: ManualLootIdentity): string {
  if (identity.kind === 'quality-base') {
    return `${identity.influence ? `${identity.influence} ` : ''}${identity.base} · ${identity.quality}% quality`
      + (identity.memoryStrands !== undefined ? ` · ${identity.memoryStrands} Memory Strands` : '')
  }
  if (identity.kind === 'chart') return identity.chart ?? 'Charts'
  const target = identity.base ?? EQUIPMENT_GROUP_LABEL[identity.equipmentGroup]
  return `${identity.member} · ${identity.reward} · ${target}`
}

/** Exact item identity used by the artwork resolver. */
export function manualLootIdentityArtName(identity: ManualLootIdentity | undefined): string | undefined {
  if (!identity) return undefined
  if (identity.kind === 'quality-base') return identity.base
  if (identity.kind === 'chart') {
    if (identity.chart === 'Coral Forest Chart'
      || identity.chart === 'Coral Reef Chart'
      || identity.chart === 'Sandy Seabed Chart') return identity.chart
    return 'Chart'
  }
  return identity.base
}

export function manualLootIdentityCategory(identity: ManualLootIdentity): 'League' | 'Other' {
  return identity.kind === 'quality-base' ? 'Other' : 'League'
}

type RawCatalogEntry = { type?: unknown; text?: unknown }
type RawCatalogGroup = { id?: unknown; label?: unknown; entries?: unknown }

/** Strictly bounds the untrusted official Trade catalogue before IPC. */
export function normalizeTradeItemCatalog(value: unknown): TradeItemCatalog {
  const result = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as { result?: unknown }).result : undefined
  const groups = Array.isArray(result) ? result : []
  const selected: TradeItemCatalogGroup[] = []
  for (const raw of groups) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const group = raw as RawCatalogGroup
    const id = group.id
    if (id !== 'weapon' && id !== 'armour' && id !== 'accessory' && id !== 'chart') continue
    const entries = Array.isArray(group.entries) ? group.entries : []
    const names = new Set<string>()
    for (const entryValue of entries.slice(0, 2500)) {
      if (!entryValue || typeof entryValue !== 'object' || Array.isArray(entryValue)) continue
      const entry = entryValue as RawCatalogEntry
      // Equipment groups interleave base rows with unique display rows. Their
      // `type` remains the exact base in both cases; `text` may instead be e.g.
      // "Kaom's Heart Glorious Plate" and must never enter a base picker.
      // Chart is the inverse: special locations keep a machine id in `type`
      // and the human identity in `text`.
      const name = clean(id === 'chart' ? entry.text ?? entry.type : entry.type, 120)
      if (name) names.add(name)
    }
    if (id === 'chart') for (const name of BUNDLED_CHART_NAMES) names.add(name)
    selected.push({
      id,
      label: clean(group.label, 40) || (id === 'chart' ? 'Chart' : EQUIPMENT_GROUP_LABEL[id]),
      entries: [...names].sort((left, right) => left.localeCompare(right)),
    })
  }
  if (!selected.some((group) => group.id === 'chart')) {
    selected.push({ id: 'chart', label: 'Chart', entries: [...BUNDLED_CHART_NAMES] })
  }
  return { groups: selected }
}
