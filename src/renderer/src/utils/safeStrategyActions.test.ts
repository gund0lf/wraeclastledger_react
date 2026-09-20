import { describe, expect, it, vi } from 'vitest'
import { SafeStrategyActions } from './safeStrategyActions'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(r => { resolve = r })
  return { promise, resolve }
}
describe('safe strategy action ownership', () => {
  it.each(['replace', 'load'])('a delayed %s cannot replace a newer evidence choice', async () => {
    const actions = new SafeStrategyActions(() => 1), old = actions.begin(), gate = deferred()
    let target = 'original'
    const pending = old.run(async () => { await gate.promise; old.assertCurrent(); target = 'old' })
    const latest = actions.begin()
    await latest.run(async () => { latest.assertCurrent(); target = 'evidence' })
    gate.resolve(); await pending
    expect(target).toBe('evidence')
  })
  it.each(['navigation', 'unmount', 'cancel and reopen'])('%s invalidates success, failure and a queued guard', async () => {
    const actions = new SafeStrategyActions(() => 1), ticket = actions.begin(), gate = deferred(), commit = vi.fn()
    const pending = ticket.run(async () => { await gate.promise; ticket.assertCurrent(); commit() })
    actions.invalidate(); gate.resolve(); await pending
    await ticket.run(async () => { commit() })
    expect(commit).not.toHaveBeenCalled()
    const failed = actions.begin(), failGate = deferred()
    const failure = failed.run(async () => { await failGate.promise; throw Error('old failure') })
    actions.invalidate(); failGate.resolve(); await expect(failure).resolves.toBeUndefined()
  })
  it('reads session ownership synchronously, before any React rerender', async () => {
    let nonce = 1
    const actions = new SafeStrategyActions(() => nonce), ticket = actions.begin(), gate = deferred(), commit = vi.fn()
    const pending = ticket.run(async () => { await gate.promise; ticket.assertCurrent(); commit() })
    nonce++; gate.resolve(); await pending
    expect(commit).not.toHaveBeenCalled()
  })
  it('allows only its own synchronous fresh activation, then detects another session or action', () => {
    let nonce = 1
    const actions = new SafeStrategyActions(() => nonce), ticket = actions.begin()
    ticket.assertCurrent(); nonce++; ticket.activated()
    expect(ticket.current()).toBe(true)
    nonce++; expect(() => ticket.assertCurrent()).toThrow('changed')
    const newer = actions.begin(); actions.invalidate(); nonce++; newer.activated()
    expect(newer.current()).toBe(false)
  })
  it('still reports failures belonging to the active action', async () => {
    const ticket = new SafeStrategyActions(() => 1).begin()
    await expect(ticket.run(async () => { throw Error('offline') })).rejects.toThrow('offline')
  })
  it('runs an accepted replacement-guard callback only once', async () => {
    const ticket = new SafeStrategyActions(() => 1).begin(), gate = deferred(), commit = vi.fn()
    const task = async () => { await gate.promise; ticket.assertCurrent(); commit() }
    const first = ticket.run(task), second = ticket.run(task)
    gate.resolve(); await Promise.all([first, second])
    expect(commit).toHaveBeenCalledTimes(1)
  })
})
