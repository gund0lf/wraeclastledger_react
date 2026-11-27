import { BUNDLED_MANIFEST } from './gameData/manifest'
import { isLedgerAtlasUrl } from './atlasReaderSafety'
import { READ_ATLAS_STAT_GROUPS, type AtlasStatsReadResult } from './atlasStats'

type Guest = { getURL(): string; executeJavaScript(script: string): Promise<unknown> }
const snapshotCall = 'window.wraeclastLedgerAtlas?.readSnapshot()'
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const nodeId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65535

export function validateLedgerSnapshot(value: unknown, requested: string) {
  if (!isLedgerAtlasUrl(requested) || !record(value) || value.schemaVersion !== 1 || value.ready !== true) return null
  const url = new URL(requested)
  const version = url.searchParams.get('v') || ''
  const tree = BUNDLED_MANIFEST.atlasTrees?.[version]
  const ids = value.allocatedNodeIds
  if (!tree || !url.hash || url.searchParams.getAll('v').length !== 1 || url.searchParams.getAll('choices').length > 1
    || value.url !== url.href || value.treeVersion !== version || value.pointsMax !== tree.maxPoints
    || !Array.isArray(ids) || ids.length > tree.maxPoints || ids.length !== value.pointsSpent
    || !ids.every(nodeId) || new Set(ids).size !== ids.length || !Array.isArray(value.choices)
    || value.choices.length > ids.length) return null
  const effects: Record<string, string> = {}
  const pairs: string[] = []
  for (const pair of value.choices) {
    if (!record(pair) || !nodeId(pair.nodeId) || !nodeId(pair.effectId) || !ids.includes(pair.nodeId)
      || Object.hasOwn(effects, pair.nodeId)
      || !tree.choices?.[pair.nodeId]?.options.some(option => option.id === String(pair.effectId))) return null
    effects[pair.nodeId] = String(pair.effectId)
    pairs.push(pair.nodeId + '-' + pair.effectId)
  }
  if (pairs.join('.') !== (url.searchParams.get('choices') ?? '')) return null
  return { allocatedNodeIds: [...ids], choiceEffects: effects, allocated: ids.length, max: tree.maxPoints, url: url.href }
}

export async function readLedgerCounter(guest: Guest) {
  const requested = guest.getURL()
  if (!isLedgerAtlasUrl(requested)) return null
  const raw = await guest.executeJavaScript(snapshotCall)
  return requested === guest.getURL() ? validateLedgerSnapshot(raw, requested) : null
}

export async function readLedgerTree(guest: Guest, requested: string): Promise<AtlasStatsReadResult> {
  const failed = (error: string) => ({ groups: null, error })
  if (!isLedgerAtlasUrl(requested)) return failed('Expected a Ledger Atlas link.')
  const expected = new URL(requested).href
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    if (guest.getURL() !== expected) return failed('Atlas tree changed before the read finished.')
    // Read the model and its displayed stats in one synchronous guest turn.
    const row = await guest.executeJavaScript(`(() => {
      const snapshot = ${snapshotCall};
      return snapshot?.ready ? { snapshot, groups: ${READ_ATLAS_STAT_GROUPS} } : null;
    })()`)
    if (guest.getURL() !== expected) return failed('Atlas tree changed during sync.')
    if (row !== null) {
      const snap = record(row) && validateLedgerSnapshot(row.snapshot, expected)
      if (!snap) return failed('The planner returned an inconsistent Atlas allocation or effect.')
      const groups = row.groups ?? (snap.allocated === 0 ? [] : null)
      if (!Array.isArray(groups) || (snap.allocated > 0 && !groups.length)
        || !groups.every(g => record(g) && typeof g.title === 'string' && Array.isArray(g.stats)
          && g.stats.every((text: unknown) => typeof text === 'string'))) return failed('The planner returned incomplete Atlas stats.')
      return { allocatedNodeIds: snap.allocatedNodeIds, choiceEffects: snap.choiceEffects, groups, error: null }
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  return failed('The Ledger Atlas tree did not finish loading. Try syncing again.')
}
