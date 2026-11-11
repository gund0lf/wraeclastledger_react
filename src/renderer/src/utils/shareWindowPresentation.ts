import type { DurableShareView, ShareDisplaySnapshot } from '../../../shared/durableShare'

export interface ShareWindowPresentation {
  scope: string
  shareId: string | null
  draftRevision: number | null
  snapshot: ShareDisplaySnapshot | null
  compact: boolean
}

/** Exact accepted bytes only. A window may keep its matching snapshot after the
 * main-process display cache evicts it; another session, target, share or revision
 * must never inherit those details. This is display data, not replay authority. */
export function observeShareWindowPresentation(current: ShareWindowPresentation | null,
  scope: string, share: DurableShareView | null): ShareWindowPresentation {
  const same = current?.scope === scope && current.shareId === (share?.id ?? null)
    && current.draftRevision === (share?.draftRevision ?? null)
  const incoming = !share?.accepted ? null : share.archived ? share.displaySnapshot ?? null
    : { core: share.core, author: share.author }
  const snapshot = incoming ?? (share?.accepted && same ? current.snapshot : null)
  const compact = share?.archived === true && !snapshot
  if (same && compact === current.compact && snapshot?.core === current.snapshot?.core
    && snapshot?.author.name === current.snapshot?.author.name
    && snapshot?.author.registration_id === current.snapshot?.author.registration_id) return current
  return { scope, shareId: share?.id ?? null, draftRevision: share?.draftRevision ?? null, snapshot, compact }
}
