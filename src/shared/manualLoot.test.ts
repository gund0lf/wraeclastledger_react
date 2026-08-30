import { describe, expect, it } from 'vitest'
import {
  manualLootIdentityArtName,
  manualLootIdentityName,
  normalizeManualLootIdentity,
  normalizeTradeItemCatalog,
} from './manualLoot'

describe('structured manual loot identity', () => {
  it('separates a quality base display label from its exact artwork identity', () => {
    const identity = normalizeManualLootIdentity({
      kind: 'quality-base',
      equipmentGroup: 'armour',
      base: 'Giantslayer Helmet',
      quality: 27,
      influence: 'Elder',
    })
    expect(identity).toEqual({
      kind: 'quality-base',
      equipmentGroup: 'armour',
      base: 'Giantslayer Helmet',
      quality: 27,
      influence: 'Elder',
    })
    expect(manualLootIdentityName(identity!)).toBe('Elder Giantslayer Helmet · 27% quality')
    expect(manualLootIdentityArtName(identity)).toBe('Giantslayer Helmet')
  })

  it('uses exact normal Chart art and generic art for location/unknown Charts', () => {
    expect(manualLootIdentityArtName({ kind: 'chart', chart: 'Coral Reef Chart' }))
      .toBe('Coral Reef Chart')
    expect(manualLootIdentityArtName({ kind: 'chart', chart: 'Chart (Abyssal Plain)' }))
      .toBe('Chart')
    expect(manualLootIdentityArtName({ kind: 'chart', chart: null })).toBe('Chart')
  })

  it('normalizes only the bounded official Trade catalogue groups', () => {
    const catalog = normalizeTradeItemCatalog({
      result: [
        { id: 'currency', label: 'Currency', entries: [{ type: 'Chaos Orb' }] },
        {
          id: 'armour',
          label: 'Armour',
          entries: [
            { type: 'Giantslayer Helmet' },
            { type: 'Glorious Plate', text: "Kaom's Heart Glorious Plate" },
          ],
        },
        {
          id: 'chart',
          label: 'Chart',
          entries: [{ type: 'AbyssalPlain', text: 'Chart (Abyssal Plain)' }],
        },
      ],
    })
    expect(catalog.groups.map((group) => group.id)).toEqual(['armour', 'chart'])
    expect(catalog.groups.find((group) => group.id === 'armour')?.entries)
      .toEqual(['Giantslayer Helmet', 'Glorious Plate'])
    expect(catalog.groups.find((group) => group.id === 'armour')?.entries)
      .not.toContain("Kaom's Heart Glorious Plate")
    expect(catalog.groups.find((group) => group.id === 'chart')?.entries)
      .toContain('Chart (Abyssal Plain)')
  })

  it('rejects malformed or unbounded structured identities', () => {
    expect(normalizeManualLootIdentity({
      kind: 'quality-base', equipmentGroup: 'armour', base: 'Helmet', quality: 31,
    })).toBeUndefined()
    expect(normalizeManualLootIdentity({ kind: 'chart', chart: 'not an item' })).toBeUndefined()
  })
})
