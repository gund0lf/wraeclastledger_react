import { getManifest } from './gameData'
import { parseSafeCatalogue, parseSafeDetail, parseSafeEvidence, parseSafeList, sameSafeIdentity, safeIdentityKey, safeSortOrder,
  type SafeDetail, type SafeIdentity, type SafeList, type SafeRun, type SafeSnapshot } from '../../../shared/safeStrategy'

export type SafeRead = (path: string) => Promise<unknown>
const bridge: SafeRead = async path => {
  const r = await window.api.authorHandoff({ action: 'read', path })
  if (!r.ok) throw new Error(r.error)
  return r.value
}
export const safeDetailPath = (i: Pick<SafeIdentity, 'scope' | 'snapshot_key' | 'id'>) => i.scope === 'frozen'
  ? `/web/v2/retrospectives/${i.snapshot_key}/strategies/${i.id}` : `/web/v2/strategies/${i.id}`

/** One cache for each exact public evidence generation, shared by costs and disclosure. */
export class SafeStrategyReader {
  private evidenceCache = new Map<string, Promise<SafeRun[]>>()
  constructor(private read: SafeRead = bridge) {}
  async list(path: string): Promise<SafeList> {
    const page = parseSafeList(await this.read(path))
    const url = new URL(path, 'http://127.0.0.1'), snapshot = url.pathname.match(/retrospectives\/([^/]+)\//)?.[1] ?? null
    if (page.scope !== (snapshot ? 'frozen' : 'current') || page.snapshot_key !== snapshot ||
      page.limit !== Number(url.searchParams.get('limit') ?? 20) ||
      page.sort !== (url.searchParams.get('sort') ?? (snapshot ? 'score' : 'activity')) || page.order !== (url.searchParams.get('order') ?? safeSortOrder(page.sort)) ||
      page.strategies.length > page.limit || new Set(page.strategies.map(r => r.id)).size !== page.strategies.length ||
      page.strategies.some(r => r.scope !== page.scope || r.snapshot_key !== page.snapshot_key)) throw new Error('The strategy page identity changed. Refresh to continue.')
    return page
  }
  async detail(identity: SafeIdentity, fresh = false): Promise<SafeDetail> {
    const d = parseSafeDetail(await this.read(safeDetailPath(identity) + '?format=covens-v1'))
    if (d.id !== identity.id || d.scope !== identity.scope || d.snapshot_key !== identity.snapshot_key ||
      (!fresh && !sameSafeIdentity(d, identity))) throw new Error('The strategy changed. Refresh its card to continue.')
    if (d.lifecycle.state !== d.scope || (d.scope === 'frozen' && (d.continuation_setup.status !== 'unavailable' || d.continuation_setup.reason !== 'frozen')))
      throw new Error('Unsupported strategy lifecycle.')
    return d
  }
  async catalogue(): Promise<SafeSnapshot[]> { return parseSafeCatalogue(await this.read('/web/v2/retrospectives')).snapshots }
  evidence(d: SafeDetail): Promise<SafeRun[]> {
    if (d.scope !== 'current') return Promise.reject(new Error('Frozen history is contained in its snapshot.'))
    const key = safeIdentityKey(d), cached = this.evidenceCache.get(key)
    if (cached) return cached
    if (this.evidenceCache.size >= 20) this.evidenceCache.delete(this.evidenceCache.keys().next().value!)
    const pending = this.readEvidence(d).catch(e => { if (this.evidenceCache.get(key) === pending) this.evidenceCache.delete(key); throw e })
    this.evidenceCache.set(key, pending)
    return pending
  }
  private async readEvidence(d: SafeDetail): Promise<SafeRun[]> {
    const runs: SafeRun[] = [], cursors = new Set<string>()
    let cursor: string | null = null
    do {
      const params = new URLSearchParams({ revision: String(d.revision), read_version: d.read_version, limit: '20' })
      if (getManifest().leagueRules?.[d.league ?? '']?.threadSlots) params.set('format', 'covens-v1')
      if (cursor) params.set('cursor', cursor)
      const page = parseSafeEvidence(await this.read(`${safeDetailPath(d)}/evidence?${params}`))
      if (page.strategy_id !== d.id || page.revision !== d.revision || page.read_version !== d.read_version ||
        page.runs.some((r, i) => r.ordinal !== runs.length + i + 1) || runs.length + page.runs.length > 100)
        throw new Error('Historical evidence changed or is incomplete. Refresh the strategy.')
      runs.push(...page.runs); cursor = page.next_cursor
      if (cursor && (!page.runs.length || cursors.has(cursor))) throw new Error('Invalid evidence cursor.')
      if (cursor) cursors.add(cursor)
    } while (cursor)
    if (d.coverage.run_count !== null && runs.length !== d.coverage.run_count) throw new Error('Historical evidence is incomplete.')
    return runs
  }
}
export const safeStrategyReader = new SafeStrategyReader()

export class SafeBrowserRequests {
  private listeners = new Set<() => void>()
  private generation = 0
  private attempt = 0
  private detailAttempt = 0
  private timer: ReturnType<typeof setInterval> | undefined
  private state: { path: string | null; page: SafeList | null; detail: SafeDetail | null; expanded: string | null; loading: boolean; error: string | null } =
    { path: null, page: null, detail: null, expanded: null, loading: false, error: null }
  constructor(private reader = safeStrategyReader) {}
  subscribe = (f: () => void) => { this.listeners.add(f); return () => { this.listeners.delete(f) } }
  getSnapshot = () => this.state
  private update(p: Partial<typeof this.state>) { this.state = { ...this.state, ...p }; this.listeners.forEach(f => f()) }
  activate(path: string) { this.deactivate(); this.update({ path }); void this.refresh(); this.timer = setInterval(() => {
    if (!this.state.loading && (this.state.page?.strategies.length ?? 0) <= 20) void this.refresh()
  }, 300000) }
  deactivate() { this.generation++; this.attempt++; this.detailAttempt++; clearInterval(this.timer)
    this.update({ path: null, page: null, detail: null, expanded: null, loading: false, error: null }) }
  refresh = () => this.load(false)
  more = () => this.state.page?.next_cursor && !this.state.loading ? this.load(true) : Promise.resolve()
  private async load(more: boolean) {
    if (!this.state.path) return
    const g = this.generation, a = ++this.attempt, owns = () => g === this.generation && a === this.attempt
    this.detailAttempt++; this.update({ loading: true, error: null, detail: null })
    try {
      const previous = this.state.page
      const path = this.state.path + (more ? '&cursor=' + encodeURIComponent(previous!.next_cursor!) : '')
      const page = await this.reader.list(path)
      if (!owns()) return
      if (more && previous && (page.read_version !== previous.read_version || page.scope !== previous.scope || page.snapshot_key !== previous.snapshot_key))
        throw new Error('The results changed. Refresh to continue.')
      const rows = more && previous ? [...previous.strategies, ...page.strategies.filter(r => !previous.strategies.some(p => p.id === r.id))] : page.strategies
      const expanded = rows.some(r => r.id === this.state.expanded) ? this.state.expanded : null
      // A card may have been opened while this list was loading. Its response and
      // error belong to the old list, even if the new list no longer has that row.
      this.detailAttempt++
      this.update({ page: { ...page, strategies: rows }, expanded, detail: null, error: null })
      if (expanded) void this.expand(expanded)
    } catch (e) { if (owns()) this.update({ error: e instanceof Error ? e.message : 'Could not load strategies.' }) }
    finally { if (owns()) this.update({ loading: false }) }
  }
  expand = async (id: string | null) => {
    const g = this.generation, a = ++this.detailAttempt, owns = () => g === this.generation && a === this.detailAttempt
    this.update({ expanded: id, detail: null, error: null })
    const row = this.state.page?.strategies.find(r => r.id === id)
    if (!row) return
    try { const detail = await this.reader.detail(row); if (owns()) this.update({ detail }) }
    catch (e) { if (owns()) this.update({ error: e instanceof Error ? e.message : 'Could not load details.' }) }
  }
}
