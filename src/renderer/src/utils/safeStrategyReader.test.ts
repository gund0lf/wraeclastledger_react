import { afterEach, describe, expect, it, vi } from 'vitest'
import fixture from './__fixtures__/safe-strategy-v2.json'
import { parseSafeDetail } from '../../../shared/safeStrategy'
import { SafeBrowserRequests, SafeStrategyReader, safeDetailPath } from './safeStrategyReader'

const generation = '88888888-8888-4888-8888-888888888888'
const detail = () => parseSafeDetail(fixture.detail)
const page = (frozen = false) => ({ schema_version: 2, scope: frozen ? 'frozen' : 'current',
  snapshot_key: frozen ? fixture.snapshot : null, read_version: fixture.row.read_version,
  total: 1, limit: 20, sort: frozen ? 'score' : 'activity', order: 'desc', next_cursor: null,
  strategies: [frozen ? { ...fixture.row, scope: 'frozen', snapshot_key: fixture.snapshot, snapshot_schema_version: 1 } : fixture.row] })
const listPath = (frozen = false) => frozen
  ? `/web/v2/retrospectives/${fixture.snapshot}/strategies?limit=20` : '/web/v2/strategies?limit=20'
const evidencePage = (ordinal = 1, cursor: string | null = null) => ({ schema_version: 2,
  strategy_id: fixture.row.id, revision: fixture.row.revision, read_version: fixture.row.read_version,
  runs: [{ ...fixture.run, ordinal }], next_cursor: cursor })
const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
const controllers: SafeBrowserRequests[] = []
const board = (reader: SafeStrategyReader) => {
  const value = new SafeBrowserRequests(reader); controllers.push(value); return value
}
afterEach(() => { controllers.splice(0).forEach(value => value.deactivate()); vi.useRealTimers() })

describe('safe reader failures and retries', () => {
  it.each([false, true])('retries list and detail failures only in the requested scope (frozen=%s)', async frozen => {
    const read = vi.fn<((path: string) => Promise<unknown>)>()
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce(page(frozen))
      .mockRejectedValueOnce(new Error('Unavailable detail'))
      .mockResolvedValueOnce(frozen ? fixture.frozen : fixture.detail)
    const controller = board(new SafeStrategyReader(read)), path = listPath(frozen)
    controller.activate(path); await flush()
    expect(controller.getSnapshot()).toMatchObject({ loading: false, page: null, detail: null, error: 'Unavailable' })
    await controller.refresh()
    expect(controller.getSnapshot()).toMatchObject({ loading: false, error: null, page: { total: 1 } })
    await controller.expand(fixture.row.id)
    expect(controller.getSnapshot()).toMatchObject({ detail: null, error: 'Unavailable detail' })
    await controller.expand(fixture.row.id)
    expect(controller.getSnapshot()).toMatchObject({ error: null, detail: { scope: frozen ? 'frozen' : 'current' } })
    const target = safeDetailPath(frozen ? parseSafeDetail(fixture.frozen) : detail()) + '?format=covens-v1'
    expect(read.mock.calls.map(([url]) => url)).toEqual([path, path, target, target])
  })

  it('retries the catalogue after failure without substituting current results', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce({ schema_version: 2, snapshots: [] })
    const reader = new SafeStrategyReader(read)
    await expect(reader.catalogue()).rejects.toThrow('Unavailable')
    await expect(reader.catalogue()).resolves.toEqual([])
    expect(read.mock.calls).toEqual([['/web/v2/retrospectives'], ['/web/v2/retrospectives']])
  })

  it('rejects a malformed successful page, then accepts a clean retry without keeping private fields', async () => {
    const read = vi.fn().mockResolvedValueOnce({ ...page(), raw_export: 'must-not-display' }).mockResolvedValueOnce(page())
    const controller = board(new SafeStrategyReader(read))
    controller.activate(listPath()); await flush()
    expect(controller.getSnapshot()).toMatchObject({ page: null, error: 'The strategy service returned an unsupported response.', loading: false })
    expect(JSON.stringify(controller.getSnapshot())).not.toContain('must-not-display')
    await controller.refresh()
    expect(controller.getSnapshot()).toMatchObject({ page: { total: 1 }, error: null })
  })

  it.each(['resolve', 'reject'] as const)('ignores a superseded list %s and its finally while the new scope is loading', async outcome => {
    const old = deferred<unknown>(), next = deferred<unknown>()
    const read = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
    const controller = board(new SafeStrategyReader(read))
    controller.activate(listPath()); controller.activate(listPath(true))
    if (outcome === 'reject') old.reject(new Error('Old failure')); else old.resolve(page())
    await flush()
    expect(controller.getSnapshot()).toMatchObject({ path: listPath(true), loading: true, page: null, error: null })
    next.resolve(page(true)); await flush()
    expect(controller.getSnapshot()).toMatchObject({ loading: false, page: { scope: 'frozen' }, error: null })
  })

  it.each(['resolve', 'reject'] as const)('ignores a removed row detail %s after a refreshed list replaces it', async outcome => {
    const nextPage = deferred<unknown>(), oldDetail = deferred<unknown>()
    const read = vi.fn().mockResolvedValueOnce(page()).mockReturnValueOnce(nextPage.promise).mockReturnValueOnce(oldDetail.promise)
    const controller = board(new SafeStrategyReader(read))
    controller.activate(listPath()); await flush()
    const refresh = controller.refresh()
    const expanded = controller.expand(fixture.row.id)
    nextPage.resolve({ ...page(), total: 0, strategies: [], read_version: generation }); await refresh
    if (outcome === 'reject') oldDetail.reject(new Error('Obsolete detail failure')); else oldDetail.resolve(fixture.detail)
    await expanded
    expect(controller.getSnapshot()).toMatchObject({ page: { total: 0, read_version: generation }, expanded: null, detail: null, error: null, loading: false })
  })

  it('clears a detail completed during refresh when the new list no longer contains it', async () => {
    const nextPage = deferred<unknown>()
    const read = vi.fn().mockResolvedValueOnce(page()).mockReturnValueOnce(nextPage.promise).mockResolvedValueOnce(fixture.detail)
    const controller = board(new SafeStrategyReader(read))
    controller.activate(listPath()); await flush()
    const refresh = controller.refresh()
    await controller.expand(fixture.row.id)
    expect(controller.getSnapshot().detail?.id).toBe(fixture.row.id)
    nextPage.resolve({ ...page(), total: 0, strategies: [] }); await refresh
    expect(controller.getSnapshot()).toMatchObject({ expanded: null, detail: null, error: null })
  })

  it('reopens an expanded card against the new revision after refresh', async () => {
    const oldDetail = deferred<unknown>()
    const nextPage = { ...page(), read_version: generation, strategies: [{ ...fixture.row, revision: 3, read_version: generation }] }
    const read = vi.fn().mockResolvedValueOnce(page()).mockReturnValueOnce(oldDetail.promise)
      .mockResolvedValueOnce(nextPage).mockResolvedValueOnce({ ...fixture.detail, revision: 3, read_version: generation })
    const controller = board(new SafeStrategyReader(read))
    controller.activate(listPath()); await flush()
    const expanded = controller.expand(fixture.row.id)
    await controller.refresh(); await flush()
    oldDetail.resolve(fixture.detail); await expanded
    expect(controller.getSnapshot()).toMatchObject({ expanded: fixture.row.id, detail: { revision: 3, read_version: generation }, error: null })
  })

  it('keeps the first page after a failed Load more and retries the same cursor', async () => {
    const first = { ...page(), next_cursor: 'cursor +/&', total: 2 }
    const secondId = '99999999-9999-4999-8999-999999999999'
    const read = vi.fn().mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce({ ...page(), total: 2, strategies: [{ ...fixture.row, id: secondId }] })
    const controller = board(new SafeStrategyReader(read))
    controller.activate(listPath()); await flush()
    await controller.more()
    expect(controller.getSnapshot()).toMatchObject({ page: { strategies: [fixture.row], next_cursor: first.next_cursor }, loading: false, error: 'Unavailable' })
    await controller.more()
    expect(controller.getSnapshot().page?.strategies.map(r => r.id)).toEqual([fixture.row.id, secondId])
    expect(controller.getSnapshot().error).toBeNull()
    expect(read.mock.calls.slice(1)).toEqual([[listPath() + '&cursor=cursor%20%2B%2F%26'], [listPath() + '&cursor=cursor%20%2B%2F%26']])
  })

  it('does not combine pages from changed generations; Refresh can start the new generation', async () => {
    const read = vi.fn().mockResolvedValueOnce({ ...page(), next_cursor: 'next', total: 2 })
      .mockResolvedValue({ ...page(), read_version: generation })
    const controller = board(new SafeStrategyReader(read))
    controller.activate(listPath()); await flush(); await controller.more()
    expect(controller.getSnapshot()).toMatchObject({ page: { read_version: fixture.row.read_version }, error: 'The results changed. Refresh to continue.', loading: false })
    await controller.refresh()
    expect(controller.getSnapshot()).toMatchObject({ page: { read_version: generation }, error: null })
  })

  it('stops background retries when deactivated', async () => {
    vi.useFakeTimers()
    const read = vi.fn().mockRejectedValue(new Error('Unavailable'))
    const controller = board(new SafeStrategyReader(read))
    controller.activate(listPath()); await flush()
    await vi.advanceTimersByTimeAsync(300000)
    expect(read).toHaveBeenCalledTimes(2)
    controller.deactivate(); await vi.advanceTimersByTimeAsync(600000)
    expect(read).toHaveBeenCalledTimes(2)
    expect(controller.getSnapshot()).toMatchObject({ path: null, loading: false, error: null })
  })

  it('rejects the whole evidence pool after a later page fails and restarts its retry at page one', async () => {
    const read = vi.fn().mockResolvedValueOnce(evidencePage(1, 'next')).mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce(evidencePage(1, 'next')).mockResolvedValueOnce(evidencePage(2))
    const reader = new SafeStrategyReader(read), d = { ...detail(), coverage: { ...detail().coverage, run_count: 2 } }
    const one = reader.evidence(d), two = reader.evidence(d)
    expect(one).toBe(two)
    await expect(one).rejects.toThrow('Unavailable')
    const result = await reader.evidence(d)
    expect(result.map(r => r.ordinal)).toEqual([1, 2])
    expect(read.mock.calls[0]).toEqual(read.mock.calls[2])
    expect(read.mock.calls[1]).toEqual(read.mock.calls[3])
    expect(await reader.evidence(d)).toBe(result)
    expect(read).toHaveBeenCalledTimes(4)
  })

  it.each(['generation', 'ordinal', 'cursor', 'coverage'] as const)('rejects inconsistent %s evidence without caching it as successful', async mismatch => {
    const second = evidencePage(2)
    if (mismatch === 'generation') second.read_version = generation
    if (mismatch === 'ordinal') second.runs[0].ordinal = 1
    if (mismatch === 'cursor') second.next_cursor = 'next'
    const read = vi.fn().mockResolvedValueOnce(evidencePage(1, 'next')).mockResolvedValueOnce(second)
      .mockResolvedValueOnce({ ...evidencePage(), runs: [fixture.run, { ...fixture.run, ordinal: 2 }] })
    const reader = new SafeStrategyReader(read), d = { ...detail(), coverage: { ...detail().coverage, run_count: mismatch === 'coverage' ? 3 : 2 } }
    await expect(reader.evidence(d)).rejects.toThrow()
    await expect(reader.evidence({ ...d, coverage: { ...d.coverage, run_count: 2 } })).resolves.toHaveLength(2)
    expect(read).toHaveBeenCalledTimes(3)
  })
})
