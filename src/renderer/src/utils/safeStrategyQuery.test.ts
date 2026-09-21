import { describe, expect, it } from 'vitest'
import { SAFE_SORTS, safeSortOrder } from '../../../shared/safeStrategy'
import { safeStrategyQuery, type SafeStrategyFilters } from './safeStrategyQuery'

const filters: SafeStrategyFilters = { search: '', league: '', tags: [], group: 'all', mapType: '', since: 'all', min: '', sort: 'activity', order: 'desc' }

describe('safe browser query controls', () => {
  it('omits only unselected filters and leaves pagination to the reader', () => {
    expect(Object.fromEntries(new URLSearchParams(safeStrategyQuery(filters).query!))).toEqual({
      limit: '20', sort: 'activity', order: 'desc', group: 'all', since: 'all'
    })
  })
  it('preserves combined selections and literal URL-sensitive text', () => {
    const { query, error } = safeStrategyQuery({ ...filters, search: '  %_ & + 名  ', league: 'Hardcore Allflame',
      tags: ['bestiary', 'anarchy'], group: 'solo', mapType: '8-mod', since: '7d', min: '0.5', sort: 'maps', order: 'asc' })
    expect(error).toBeNull()
    expect(Object.fromEntries(new URLSearchParams(query!))).toEqual({ limit: '20', sort: 'maps', order: 'asc',
      group: 'solo', since: '7d', search: '%_ & + 名', league: 'Hardcore Allflame', tags: 'bestiary,anarchy', map_type: '8-mod', min_div: '0.5' })
  })
  it.each(['0', '0.5', '1000000000000000', '0.' + '1'.repeat(30)])('retains the valid minimum %s including explicit zero', min => {
    const result = safeStrategyQuery({ ...filters, min })
    expect(result.error).toBeNull()
    expect(new URLSearchParams(result.query!).get('min_div')).toBe(min)
  })
  it.each(['-1', '.5', '1.', '01', '1e2', '+1', 'NaN', 'Infinity', ' ', ' 1 ', '1,5', '1000000000000001', '0.' + '1'.repeat(31)])('blocks invalid minimum %s instead of requesting unfiltered results', min => {
    const result = safeStrategyQuery({ ...filters, min })
    expect(result.query).toBeNull()
    expect(result.error).toBeTruthy()
  })
  it('keeps every sort and both directions distinct without rewriting filters', () => {
    for (const sort of Object.keys(SAFE_SORTS) as SafeStrategyFilters['sort'][]) {
      for (const order of ['asc', 'desc'] as const) {
        const q = new URLSearchParams(safeStrategyQuery({ ...filters, sort, order, min: '0' }).query!)
        expect(q.get('sort')).toBe(sort)
        expect(q.get('order')).toBe(order)
        expect(q.get('min_div')).toBe('0')
      }
      expect(safeSortOrder(sort)).toBe(['title', 'cost_per_map', 'total_invest'].includes(sort) ? 'asc' : 'desc')
    }
  })
})
