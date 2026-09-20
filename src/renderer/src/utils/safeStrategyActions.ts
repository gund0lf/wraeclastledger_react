/** One Load/Continue intent owns its async work, including a queued replacement guard. */
export class SafeStrategyActions {
  private generation = 0
  constructor(private readonly session: () => number) {}
  invalidate = (): void => { this.generation++ }
  begin(): SafeStrategyAction {
    const generation = ++this.generation
    let nonce = this.session()
    let started = false
    const ownsIntent = () => generation === this.generation
    const current = () => ownsIntent() && nonce === this.session()
    return {
      current,
      assertCurrent: () => { if (!current()) throw new Error('The selected action or session changed. Choose Load or Continue again.') },
      // Called synchronously by the repository when this action activates its own
      // fresh session, never after an arbitrary async apply has completed.
      activated: () => { if (ownsIntent()) nonce = this.session() },
      run: async task => {
        if (started || !current()) return
        started = true
        try { await task() } catch (error) { if (current()) throw error }
      },
    }
  }
}

export interface SafeStrategyAction {
  current(): boolean
  assertCurrent(): void
  activated(): void
  run(task: () => Promise<void>): Promise<void>
}
