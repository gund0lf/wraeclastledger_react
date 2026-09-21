import type { SafeSort } from '../../../shared/safeStrategy'

export interface SafeStrategyFilters {
  search: string
  league: string
  tags: string[]
  group: string
  mapType: string
  since: string
  min: string
  sort: SafeSort
  order: 'asc' | 'desc'
}

/** Invalid drafts must not silently turn a requested minimum into no filter. */
export function safeStrategyQuery(filters: SafeStrategyFilters): { query: string | null; error: string | null } {
  const { search, league, tags, group, mapType, since, min, sort, order } = filters
  if (min !== '' && !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(min)) {
    return { query: null, error: 'Enter 0 or a positive decimal (for example, 0.5).' }
  }
  if (min.length > 32 || Number(min) > 1e15) {
    return { query: null, error: 'Use at most 32 characters and a value no greater than 1,000,000,000,000,000.' }
  }
  const q = new URLSearchParams({ limit: '20', sort, order, group, since })
  if (search.trim()) q.set('search', search.trim())
  if (league) q.set('league', league)
  if (tags.length) q.set('tags', tags.join(','))
  if (mapType) q.set('map_type', mapType)
  if (min !== '') q.set('min_div', min)
  return { query: q.toString(), error: null }
}
