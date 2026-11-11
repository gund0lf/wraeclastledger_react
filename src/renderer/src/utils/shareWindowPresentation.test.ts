import { expect, it } from 'vitest'
import { observeShareWindowPresentation } from './shareWindowPresentation'
import type { ActiveDurableShareView, CompletedShareView } from '../../../shared/durableShare'

const full: ActiveDurableShareView = { id: 'share-a', draftRevision: 2, copiedRevision: 2,
  core: 'exact accepted bytes', author: { name: 'Recorded author', registration_id: null },
  operation: { kind: 'publication', strategy_id: null, revision: null }, targetGeneration: null,
  status: 'complete', accepted: true, noticed: true, outcome: { strategy_id: 'strategy-a', revision: 1 } }
const marker: CompletedShareView = { ...full, archived: true, core: null, author: null,
  copiedRevision: null, status: 'complete', accepted: true, noticed: true, outcome: full.outcome! }

it('keeps exact accepted details across compaction and a display-cache eviction in the same window', () => {
  const opened = observeShareWindowPresentation(null, 'session-a:target-a', full)
  expect(opened.snapshot).toEqual({ core: full.core, author: full.author })
  expect(observeShareWindowPresentation(opened, opened.scope, marker)).toBe(opened)
})

it('reopens full details only with an exact display snapshot; a cold marker is compact', () => {
  expect(observeShareWindowPresentation(null, 'scope', marker)).toMatchObject({ compact: true, snapshot: null })
  const cached = { ...marker, displaySnapshot: { core: full.core, author: full.author } }
  expect(observeShareWindowPresentation(null, 'scope', cached)).toMatchObject({ compact: false, snapshot: cached.displaySnapshot })
})

it.each(['session-b:target-a', 'session-a:target-b'])('does not carry details across scope changes to %s', scope => {
  const opened = observeShareWindowPresentation(null, 'session-a:target-a', full)
  expect(observeShareWindowPresentation(opened, scope, marker)).toMatchObject({ scope, compact: true, snapshot: null })
})

it('does not borrow an accepted snapshot for another share, revision, unaccepted draft or no record', () => {
  const opened = observeShareWindowPresentation(null, 'scope', full)
  for (const changed of [{ ...marker, id: 'other' }, { ...marker, draftRevision: 3 }])
    expect(observeShareWindowPresentation(opened, 'scope', changed).snapshot).toBeNull()
  expect(observeShareWindowPresentation(opened, 'scope', { ...full, status: 'ready', accepted: false }).snapshot).toBeNull()
  expect(observeShareWindowPresentation(opened, 'scope', null).snapshot).toBeNull()
})

it('replaces the open snapshot with the exact accepted revision instead of retaining earlier copied bytes', () => {
  const opened = observeShareWindowPresentation(null, 'scope', full)
  const next = { ...full, draftRevision: 3, core: 'new accepted bytes' }
  expect(observeShareWindowPresentation(opened, 'scope', next).snapshot?.core).toBe(next.core)
})
