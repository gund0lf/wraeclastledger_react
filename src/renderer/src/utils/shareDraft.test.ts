import { expect, it, vi } from 'vitest'
import type { AuthorBridge, AuthorResult } from '../../../shared/authorHandoff'
import { restoreShareDraft, shareDraftFields } from './shareDraft'
import { parseDiscordExport } from './parseDiscordExport'
import { buildDiscordSharePayload } from './discordShareWire'

function draftCore() {
  const parsed = parseDiscordExport('WraeclastLedger\nMaps: 12\nType: 6-mod\nMultiplier: 1x\nLeague: Allflame')!
  Object.assign(parsed, { strategyName: 'TEST ONLY Alpha', strategyNotes: 'Synthetic note',
    typeTags: ['regular'], sessionMinutes: 22 })
  return buildDiscordSharePayload(parsed)
}
it('projects saved presentation only, preserving empty optional time', () => {
  const core = draftCore()
  expect(shareDraftFields(core)).toEqual({ title: 'TEST ONLY Alpha', notes: 'Synthetic note',
    tags: ['regular'], group: false, groupSize: 2, time: '22' })
  const tuple = JSON.parse(core); tuple[8][1] = null
  expect(shareDraftFields(JSON.stringify(tuple)).time).toBe('')
  expect(() => shareDraftFields('{}')).toThrow('cannot be read')
})
it.each(['Sessions', 'Strategy Browser'])('reopens %s with the same saved fields', async () => {
  const bridge = vi.fn().mockResolvedValue({ ok: true, value: { core: draftCore() } }) as unknown as AuthorBridge
  const first = await restoreShareDraft(bridge, 'session:1', 'identity', () => true)
  expect(await restoreShareDraft(bridge, 'session:2', 'identity', () => true)).toEqual(first)
  expect(first?.title).toBe('TEST ONLY Alpha')
})
it.each(['success', 'refusal', 'throw'])('discards a delayed %s after session switch or close', async (mode) => {
  let current = true, resolve!: (r: AuthorResult<'share-draft'>) => void, reject!: (e: Error) => void
  const bridge = vi.fn(() => new Promise((yes, no) => { resolve = yes; reject = no })) as unknown as AuthorBridge
  const pending = restoreShareDraft(bridge, 'A:1', 'A-identity', () => current)
  current = false
  if (mode === 'throw') reject(Error('stale error'))
  else resolve(mode === 'success' ? { ok: true, value: { core: draftCore() } } : { ok: false, error: 'stale refusal' })
  expect(await pending).toBeUndefined()
})
it('propagates a current preparation/read error instead of leaving a silent pending view', async () => {
  const bridge = vi.fn().mockResolvedValue({ ok: false, error: 'Keep this session; review recovery data.' }) as unknown as AuthorBridge
  await expect(restoreShareDraft(bridge, 'A:1', 'A', () => true)).rejects.toThrow('Keep this session')
})
