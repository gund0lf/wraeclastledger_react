import type { AuthorHandoffVault } from './authorHandoffVault'
import type { DurableShareView } from '../shared/durableShare'

/** One main-process observer for persisted share capabilities. It performs only
 * private reads; closing a renderer never cancels or recreates a submission. */
export class DurableShareTracker {
  private enabled = false
  private timer?: ReturnType<typeof setTimeout>
  private running?: Promise<void>
  private entries = new Map<string, { view: DurableShareView; due: number; attempts: number }>()
  constructor(private vault: AuthorHandoffVault,
    private read: (id: string, authorization: string) => Promise<unknown>, private now = Date.now) {}
  async start(): Promise<void> { this.enabled = true; await this.wake() }
  stop(): void { this.enabled = false; clearTimeout(this.timer) }
  async wake(id?: string): Promise<void> {
    for (const view of await this.vault.durableShares()) {
      const old = this.entries.get(view.id)
      if (!old || old.view.draftRevision !== view.draftRevision || view.status === 'complete')
        this.entries.set(view.id, { view, due: 0, attempts: 0 })
      else {
        old.view = { ...old.view, copiedRevision: view.copiedRevision }
        if (!id || id === view.id) old.due = Math.min(old.due, this.now() + 1000)
      }
    }
    this.schedule()
  }
  view(id: string): DurableShareView | null { return this.entries.get(id)?.view ?? null }
  views(): DurableShareView[] { return [...this.entries.values()].map(e => e.view) }
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
      try {
        const result = await this.vault.observeDurable(entry.view.id, auth => this.read(entry.view.id, auth))
        if (result) entry.view = result
      } catch (error) {
        const code = (error as { code?: string }).code
        // Only a formerly prepared record can be described as missing. A lost
        // initial PUT response is still an uncertain preparation, not a restore.
        if (code === 'share_result_unavailable') {
          const missing = await this.vault.markDurableUnavailable(entry.view.id)
          entry.view = missing ?? { ...entry.view, status: 'checking' }
        } else entry.view = { ...entry.view, status: 'checking' }
      }
      entry.due = this.now() + [2000,4000,8000,15000,30000,60000,300000][Math.min(entry.attempts++, 6)]
    })().catch(() => {
      // A local read/write failure is not proof of a remote failure. The next
      // explicit wake retries; never throw an unhandled background rejection.
      for (const entry of this.entries.values()) {
        if (entry.view.status !== 'complete') { entry.view = { ...entry.view, status: 'checking' }; entry.due = this.now() + 60000 }
      }
    }).finally(() => { this.running = undefined; this.schedule() })
    return this.running
  }
}
