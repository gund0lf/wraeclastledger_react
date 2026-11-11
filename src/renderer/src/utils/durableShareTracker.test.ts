import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DurableShareTracker } from '../../../main/durableShareTracker'
import { ProtectedShareStorageError, type AuthorHandoffVault } from '../../../main/authorHandoffVault'
import type { ActiveDurableShareView } from '../../../shared/durableShare'

const minute = 60_000, hour = 60 * minute, day = 24 * hour
const trackers: DurableShareTracker[] = []
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T00:00:00Z')) })
afterEach(() => { trackers.splice(0).forEach(tracker => tracker.stop()); vi.useRealTimers() })

function setup(age: number | null, status: ActiveDurableShareView['status'] = 'ready') {
  const view: ActiveDurableShareView = { id: 'share', draftRevision: 1, copiedRevision: 1, core: '[]',
    author: { name: 'Synthetic name', registration_id: null }, operation: { kind: 'publication', strategy_id: null, revision: null },
    targetGeneration: null, status, accepted: status === 'processing', outcome: null, noticed: false }
  const records = [{ view, pollingActivityAt: age === null ? null : Date.now() - age }]
  const read = vi.fn(async () => null)
  const vault: Pick<AuthorHandoffVault, 'durableTrackingShares' | 'observeDurable' | 'markDurableUnavailable'> = {
    durableTrackingShares: vi.fn(async () => structuredClone(records)),
    observeDurable: vi.fn(async (id, exchange) => {
      await exchange('synthetic-reader')
      return structuredClone(records.find(record => record.view.id === id)!.view)
    }),
    markDurableUnavailable: vi.fn(async () => null)
  }
  const create = () => { const tracker = new DurableShareTracker(vault, read); trackers.push(tracker); return tracker }
  return { records, read, vault, create }
}

it.each([
  [0, 2000], [hour, 15 * minute], [day, hour], [7 * day, day]
])('ready share aged %s ms is observed at startup, then waits %s ms', async (age, delay) => {
  const f = setup(age), tracker = f.create()
  await tracker.start(); await vi.advanceTimersByTimeAsync(0)
  expect(f.read).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(delay - 1)
  expect(f.read).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(f.read).toHaveBeenCalledTimes(2)
  expect(tracker.view('share')?.status).toBe('ready')
})

it('restart immediately checks an old draft and retains the age-based schedule', async () => {
  const f = setup(2 * day), first = f.create()
  await first.start(); await vi.advanceTimersByTimeAsync(0); first.stop()
  await vi.advanceTimersByTimeAsync(10 * minute)
  const restarted = f.create()
  await restarted.start(); await vi.advanceTimersByTimeAsync(0)
  expect(f.read).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(hour - 1)
  expect(f.read).toHaveBeenCalledTimes(2)
  f.records[0].view = { ...f.records[0].view, status: 'complete', accepted: true,
    outcome: { strategy_id: 'synthetic-result', revision: 1 } }
  await vi.advanceTimersByTimeAsync(1)
  expect(restarted.view('share')).toMatchObject({ status: 'complete', outcome: f.records[0].view.outcome })
  await vi.advanceTimersByTimeAsync(day)
  expect(f.read).toHaveBeenCalledTimes(3)
})

it('a deliberate re-copy stays responsive after restart even if its draft is old', async () => {
  const f = setup(8 * day), first = f.create()
  await first.start(); await vi.advanceTimersByTimeAsync(0)
  // copiedDurable persists this activity independently of the share identity.
  f.records[0].pollingActivityAt = Date.now()
  first.stop()
  const restarted = f.create()
  await restarted.start(); await vi.advanceTimersByTimeAsync(0)
  f.records[0].view = { ...f.records[0].view, status: 'complete', accepted: true,
    outcome: { strategy_id: 'synthetic-result', revision: 1 } }
  await vi.advanceTimersByTimeAsync(2000)
  expect(restarted.view('share')?.status).toBe('complete')
  expect(f.read).toHaveBeenCalledTimes(3)
})

it('explicitly reopening or copying one share wakes only that share and keeps it responsive', async () => {
  const f = setup(8 * day)
  f.records.push({ view: { ...f.records[0].view, id: 'other-share' }, pollingActivityAt: Date.now() - 8 * day })
  const tracker = f.create()
  await tracker.start(); await vi.advanceTimersByTimeAsync(1)
  expect(f.read).toHaveBeenCalledTimes(2)
  await tracker.wake('share'); await vi.advanceTimersByTimeAsync(1000)
  expect(f.read).toHaveBeenCalledTimes(3)
  await vi.advanceTimersByTimeAsync(2000)
  expect(f.read).toHaveBeenCalledTimes(4)
  expect(vi.mocked(f.vault.observeDurable).mock.calls.slice(2).map(([id]) => id)).toEqual(['share', 'share'])
})

it('Strategy Browser refresh checks all old shares promptly without discarding their age', async () => {
  const f = setup(8 * day), tracker = f.create()
  await tracker.start(); await vi.advanceTimersByTimeAsync(0)
  await tracker.wake(); await vi.advanceTimersByTimeAsync(1000)
  expect(f.read).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(day - 1)
  expect(f.read).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1)
  expect(f.read).toHaveBeenCalledTimes(3)
})

it('explicit recovery drains an in-flight observation before discarding its cached result', async () => {
  const f = setup(0), tracker = f.create()
  let finish!: () => void
  f.read.mockImplementationOnce(() => new Promise<null>(resolve => { finish = () => resolve(null) }))
  await tracker.start(); await vi.advanceTimersByTimeAsync(0)
  expect(finish).toBeTypeOf('function')
  expect(() => tracker.resetAfterRecovery()).toThrow('still running')
  let drained = false
  const pause = tracker.pauseForRecovery().then(() => { drained = true })
  await Promise.resolve()
  expect(drained).toBe(false)
  finish(); await pause
  tracker.resetAfterRecovery()
  expect(tracker.views()).toEqual([])
  f.records.splice(0)
  await tracker.start(); await vi.advanceTimersByTimeAsync(day)
  expect(tracker.views()).toEqual([])
  expect(f.read).toHaveBeenCalledTimes(1)
})

it.each(['processing', 'checking'] as const)('age never slows %s work', async status => {
  const f = setup(30 * day, status), tracker = f.create()
  await tracker.start(); await vi.advanceTimersByTimeAsync(0)
  await vi.advanceTimersByTimeAsync(2000)
  expect(f.read).toHaveBeenCalledTimes(2)
  expect(tracker.view('share')?.status).toBe(status)
})

it('a formerly ready old share becomes responsive on a status outage and recovers automatically', async () => {
  const f = setup(8 * day), tracker = f.create()
  f.read.mockRejectedValueOnce(new Error('offline'))
  await tracker.start(); await vi.advanceTimersByTimeAsync(0)
  expect(tracker.view('share')).toMatchObject({ status: 'checking', accepted: false })
  f.records[0].view = { ...f.records[0].view, status: 'processing', accepted: true }
  await vi.advanceTimersByTimeAsync(2000)
  expect(tracker.view('share')).toMatchObject({ status: 'processing', accepted: true })
  await vi.advanceTimersByTimeAsync(2000)
  expect(f.read).toHaveBeenCalledTimes(3)
})

it('legacy records without an age are not guessed old, but slow after an observed hour', async () => {
  const f = setup(null), tracker = f.create()
  await tracker.start(); await vi.advanceTimersByTimeAsync(0)
  await vi.advanceTimersByTimeAsync(2000)
  expect(f.read).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(hour)
  const calls = f.read.mock.calls.length
  await vi.advanceTimersByTimeAsync(10 * minute)
  expect(f.read.mock.calls.length - calls).toBeLessThanOrEqual(1)
  expect(tracker.view('share')?.status).toBe('ready')
})

it('local storage failure retains the known outcome and is never described as server unreachable', async () => {
  const f = setup(0, 'processing'), tracker = f.create(), error = new ProtectedShareStorageError('damaged')
  vi.mocked(f.vault.observeDurable).mockRejectedValueOnce(error)
  await tracker.start(); await vi.advanceTimersByTimeAsync(0)
  expect(() => tracker.view('share')).toThrow(error)
  expect(() => tracker.views()).toThrow(error)
  expect(f.read).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(minute)
  expect(tracker.view('share')).toMatchObject({ status: 'processing', accepted: true })
  expect(f.read).toHaveBeenCalledTimes(1)
})

it('failed refresh also exposes the typed local error until a successful storage check', async () => {
  const f = setup(0), tracker = f.create(), error = new ProtectedShareStorageError('io')
  await tracker.start(); await vi.advanceTimersByTimeAsync(0)
  vi.mocked(f.vault.durableTrackingShares).mockRejectedValueOnce(error)
  await expect(tracker.wake()).rejects.toThrow(error)
  expect(() => tracker.views()).toThrow(error)
  await tracker.wake('share')
  expect(tracker.view('share')?.status).toBe('ready')
})
