import { ProtectedShareStorageError, type AuthorHandoffVault } from './authorHandoffVault'
import type { DurableShareView } from '../shared/durableShare'

const minute = 60_000, hour = 60 * minute, day = 24 * hour
const activeIntervals = [2000, 4000, 8000, 15000, 30000, minute, 5 * minute]
interface TrackedShare {
  view: DurableShareView
  due: number
  attempts: number
  pollingActivityAt: number | null
  firstSeenAt: number
  activeUntil: number
}
function nextDelay(entry: TrackedShare, now: number): number {
  const active = activeIntervals[Math.min(entry.attempts++, activeIntervals.length - 1)]
  // Age never expires a share or slows uncertain/accepted work. A deliberate
  // Copy/reopen gives the selected draft a fresh ten-minute active window.
  if (entry.view.status !== 'ready' || entry.view.accepted || now < entry.activeUntil) return active
  const age = Math.max(0, now - (entry.pollingActivityAt ?? entry.firstSeenAt))
  // Older development records have no timestamp. Observe them promptly, then
  // use only time seen in this process instead of inventing an age on restart.
  return Math.max(active, age >= 7 * day ? day : age >= day ? hour : age >= hour ? 15 * minute : 0)
}

/** One main-process observer for persisted share capabilities. It performs only
 * private reads; closing a renderer never cancels or recreates a submission. */
export class DurableShareTracker {
  private enabled = false
  private timer?: ReturnType<typeof setTimeout>
  private running?: Promise<void>
  private entries = new Map<string, TrackedShare>()
  private storageError: ProtectedShareStorageError | null = null
  constructor(private vault: Pick<AuthorHandoffVault, 'durableTrackingShares' | 'observeDurable' | 'markDurableUnavailable'>,
    private read: (id: string, authorization: string) => Promise<unknown>, private now = Date.now) {}
  async start(): Promise<void> { this.enabled = true; await this.wake() }
  stop(): void { this.enabled = false; clearTimeout(this.timer) }
  async pauseForRecovery(): Promise<void> { this.stop(); await this.running }
  resetAfterRecovery(): void {
    // Only the explicitly confirmed vault recovery calls this, after polling
    // has drained. A result from the old store must not survive in UI memory.
    if (this.enabled || this.running) throw new Error('Sharing observer is still running')
    this.entries.clear()
    this.storageError = null
  }
  async wake(id?: string): Promise<void> {
    const active = await this.vault.durableTrackingShares().catch((error) => {
      if (error instanceof ProtectedShareStorageError) this.storageError = error
      throw error
    })
    this.storageError = null
    const ids = new Set(active.map(record => record.view.id)), now = this.now()
    // A noticed completion is compacted by the vault. Drop its cached payload
    // and notification; reopening its session reads the completed marker.
    for (const [key, entry] of this.entries) {
      if (!ids.has(key) && entry.view.status === 'complete') this.entries.delete(key)
    }
    for (const { view, pollingActivityAt } of active) {
      const old = this.entries.get(view.id)
      if (!old || old.view.archived || old.view.draftRevision !== view.draftRevision || view.status === 'complete')
        this.entries.set(view.id, { view, due: now, attempts: 0, pollingActivityAt, firstSeenAt: now,
          activeUntil: id === view.id ? now + 10 * minute : 0 })
      else {
        old.view = { ...old.view, copiedRevision: view.copiedRevision }
        old.pollingActivityAt = pollingActivityAt
        if (!id || id === view.id) old.due = Math.min(old.due, now + 1000)
        if (id === view.id) { old.attempts = 0; old.activeUntil = now + 10 * minute }
      }
    }
    this.schedule()
  }
  view(id: string): DurableShareView | null {
    if (this.storageError) throw this.storageError
    return this.entries.get(id)?.view ?? null
  }
  views(): DurableShareView[] {
    if (this.storageError) throw this.storageError
    return [...this.entries.values()].map(e => e.view)
  }
  private schedule(): void {
    if (!this.enabled || this.running) return
    clearTimeout(this.timer)
    const due = [...this.entries.values()].filter(e => !['complete','restore_review'].includes(e.view.status))
      .reduce((next, e) => Math.min(next, e.due), Infinity)
    if (!Number.isFinite(due)) return
    this.timer = setTimeout(() => { void this.tick() }, Math.max(0, due - this.now()))
    this.timer.unref()
  }
  private tick(): Promise<void> {
    if (this.running) return this.running
    this.running = (async () => {
      const entry = [...this.entries.values()].filter(e => !['complete','restore_review'].includes(e.view.status) && e.due <= this.now())
        .sort((a, b) => a.due - b.due)[0]
      if (!entry || !this.enabled) return
      const previousStatus = entry.view.status
      try {
        const result = await this.vault.observeDurable(entry.view.id, auth => this.read(entry.view.id, auth))
        if (result) entry.view = result
        this.storageError = null
      } catch (error) {
        if (error instanceof ProtectedShareStorageError) {
          this.storageError = error
          entry.due = this.now() + minute
          return
        }
        const code = (error as { code?: string }).code
        // Only a formerly prepared record can be described as missing. A lost
        // initial PUT response is still an uncertain preparation, not a restore.
        if (code === 'share_result_unavailable') {
          const missing = await this.vault.markDurableUnavailable(entry.view.id)
          if (missing) entry.view = missing
          else if (!entry.view.archived) entry.view = { ...entry.view, status: 'checking' }
        } else if (!entry.view.archived) entry.view = { ...entry.view, status: 'checking' }
      }
      if (entry.view.status !== previousStatus) entry.attempts = 0
      entry.due = this.now() + nextDelay(entry, this.now())
    })().catch((error) => {
      // A local read/write failure is not proof of a remote failure. Retain
      // its distinct message during retries, without an unhandled rejection.
      if (error instanceof ProtectedShareStorageError) this.storageError = error
      for (const entry of this.entries.values()) {
        if (!entry.view.archived && !['complete', 'restore_review'].includes(entry.view.status)) {
          if (!this.storageError) entry.view = { ...entry.view, status: 'checking' }
          entry.due = this.now() + minute
        }
      }
    }).finally(() => { this.running = undefined; this.schedule() })
    return this.running
  }
}
