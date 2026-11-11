import { expect, it } from 'vitest'
import { postedSharePresentation } from './postedSharePresentation'
import { parseDiscordExport } from './parseDiscordExport'
import { buildDiscordSharePayload } from './discordShareWire'

const author = { name: 'Recorded author', registration_id: null }
function core() {
  const p = parseDiscordExport('WraeclastLedger\nMaps: 12\nType: 6-mod\nMultiplier: 1x\nLeague: Allflame')!
  Object.assign(p, { strategyName: 'Posted title', strategyNotes: 'Posted notes', typeTags: ['regular'],
    isGroupPlay: true, groupSize: 3, sessionMinutes: 22, totalReturn: 1200,
    totalInvest: 180, netProfit: 1020, divPrice: 300, divPerMap: 0.283, perMapCost: 15 })
  return buildDiscordSharePayload(p)
}
it('renders all locked fields and the existing preview from the same accepted payload', () => {
  const result = postedSharePresentation({ core: core(), author })!
  expect(result).toMatchObject({ title: 'Posted title', notes: 'Posted notes', tags: ['regular'],
    group: true, groupSize: 3, time: '22' })
  expect(result.preview).toContain('**Maps:** 12')
  expect(result.preview).toContain('**Divine Price:** 300c')
  expect(result.preview).toContain('Posted title')
  expect(result.preview).toContain('Posted notes')
})
it('cannot construct posted details from a marker with no snapshot or malformed bytes', () => {
  expect(postedSharePresentation(null)).toBeNull()
  expect(() => postedSharePresentation({ core: '{}', author })).toThrow('saved posted details')
})
it.each(['share', 'evidence', 'update'] as const)('preserves absent optional values for %s instead of inventing posted details', (operation) => {
  const p = parseDiscordExport('WraeclastLedger\nMaps: 12\nType: 6-mod\nMultiplier: 1x\nLeague: Allflame')!
  Object.assign(p, {
    operation,
    updateStrategyId: '11111111-2222-4333-8444-555555555555',
    evidenceTargetStrategyId: '11111111-2222-4333-8444-555555555555',
    evidenceExpectedRevision: 2,
    evidenceRunKey: `sha256-v1:${'a'.repeat(64)}`,
    evidenceRunStartedAt: '2026-08-15T01:00:00.000Z',
    evidenceRunEndedAt: '2026-08-15T02:00:00.000Z',
    setupFingerprint: `sha256-v1:${'b'.repeat(64)}`,
  })
  const result = postedSharePresentation({ core: buildDiscordSharePayload(p), author })!
  expect(result).toMatchObject({ title: '', notes: '', tags: [], group: false, groupSize: null, time: '' })
})
