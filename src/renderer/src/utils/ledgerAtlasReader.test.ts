import { expect, it, vi } from 'vitest'
import { readLedgerTree, validateLedgerSnapshot } from '../../../shared/ledgerAtlasReader'
import { isAllowedExternalUrl, isAtlasPlannerUrl } from '../../../shared/atlasReaderSafety'

const url = 'https://atlas.wraeclastledger.com/?v=3.30.0-atlas&choices=712-17864#AAAABgAAAwIAAshxdXF1AAA='
const snapshot = { url, schemaVersion: 1, ready: true, treeVersion: '3.30.0-atlas', pointsSpent: 1, pointsMax: 150,
  allocatedNodeIds: [712], choices: [{ nodeId: 712, effectId: 17864 }] }
const groups = [{ title: 'Maps', stats: ['2% increased Maps found in your Maps'] }]

it('waits for one settled allocation and matches the effect to its node and the authored URL', async () => {
  const executeJavaScript = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ snapshot, groups })
  expect(await readLedgerTree({ getURL: () => url, executeJavaScript }, url)).toEqual({
    groups, error: null, allocatedNodeIds: [712], choiceEffects: { '712': '17864' } })
  expect(executeJavaScript).toHaveBeenCalledTimes(2)
})

it('rejects partial, mismatched and ineligible allocations', () => {
  for (const overrides of [{ ready: false }, { schemaVersion: 2 }, { pointsMax: 121 }, { pointsSpent: 2 },
    { allocatedNodeIds: [712,712], pointsSpent: 2 }, { treeVersion: '3.29.0-atlas' }, { url: url + 'x' },
    { choices: [] }, { choices: [{nodeId: 711, effectId: 17864}] }, {choices: [{nodeId: 712, effectId: 5}]}])
    expect(validateLedgerSnapshot({ ...snapshot, ...overrides }, url)).toBeNull()
})

it('rejects a navigation during a read and bypasses the reader on an untrusted origin', async () => {
  const executeJavaScript = vi.fn().mockResolvedValue({ snapshot, groups })
  expect((await readLedgerTree({ getURL: vi.fn().mockReturnValueOnce(url).mockReturnValue(url + 'x'), executeJavaScript }, url)).groups).toBeNull()
  for (const host of ['atlas.wraeclastledger.com.example', 'user@atlas.wraeclastledger.com', 'atlas.wraeclastledger.com:444']) {
    const other = url.replace('atlas.wraeclastledger.com', host)
    expect(isAtlasPlannerUrl(other)).toBe(false)
    expect(isAllowedExternalUrl(other)).toBe(false)
    expect((await readLedgerTree({ getURL: () => other, executeJavaScript }, other)).groups).toBeNull()
  }
  expect(executeJavaScript).toHaveBeenCalledTimes(1)
  expect(isAllowedExternalUrl(url)).toBe(true)
})
