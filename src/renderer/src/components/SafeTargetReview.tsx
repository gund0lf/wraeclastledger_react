import { Alert, Button, Group, Stack, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import type { StrategyTarget } from '../../../shared/strategyTarget'
import type { SafeDetail } from '../../../shared/safeStrategy'
import { useSessionStore } from '../store/useSessionStore'
import { safeStrategyReader } from '../utils/safeStrategyReader'
import { bindSafeTarget, refreshSafeAuthorState } from '../utils/safeStrategyTarget'

export function SafeTargetReview({ target }: { target: StrategyTarget }) {
  const [review, setReview] = useState<{ detail: SafeDetail; operation: 'replace' | 'evidence' } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const context = useSessionStore(s => `${s.activeSessionId ?? 'working'}:${s.sessionNonce}`)
  const active = useRef({ generation: 0 })
  useEffect(() => { active.current.generation++; setReview(null); setError(null); setBusy(false); const fence = active.current; return () => { fence.generation++ } }, [target, context])
  const inspect = async (id: string, operation: 'replace' | 'evidence') => {
    const generation = ++active.current.generation; setBusy(true); setError(null); setReview(null)
    try {
      const d = await safeStrategyReader.detail({ id, scope: 'current', snapshot_key: null, revision: 1, read_version: id }, true)
      if (active.current.generation === generation) setReview({ detail: d, operation })
    } catch (e) { if (active.current.generation === generation) setError(e instanceof Error ? e.message : 'Could not review target.') }
    finally { if (active.current.generation === generation) setBusy(false) }
  }
  const bind = async () => {
    if (!review) return
    const generation = ++active.current.generation; setBusy(true); setError(null)
    try {
      // The displayed revision is the one being accepted. Never bind a newer response silently.
      await refreshSafeAuthorState()
      const fresh = await safeStrategyReader.detail(review.detail)
      const next = await bindSafeTarget(fresh, review.operation, useSessionStore.getState().authorPreferences,
        target.state === 'legacy_review' ? target : undefined)
      if (active.current.generation !== generation) return
      if (target.state !== 'legacy_review' && target.operation === 'evidence' && target.state !== 'acknowledged' &&
        (target.revision !== next.revision || JSON.stringify(target.seed) !== JSON.stringify(next.seed)))
        throw new Error('This run is linked to its original strategy version. Clear the saved link before choosing a different version or action.')
      useSessionStore.getState().updateSetting('strategyTarget', next)
    } catch (e) { if (active.current.generation === generation) setError(e instanceof Error ? e.message : 'Could not use this strategy version.') }
    finally { if (active.current.generation === generation) setBusy(false) }
  }
  const candidates = target.state === 'legacy_review'
    ? [{ value: target.replace, operation: 'replace' as const }, { value: target.evidence, operation: 'evidence' as const }].filter(v => v.value)
    : [{ value: target, operation: target.operation }]
  return <Alert color="gray" p="xs"><Stack gap="xs">
    <Text size="sm" fw={600}>{target.state === 'legacy_review' ? 'Saved target needs review' : target.state === 'acknowledged' ? 'Submission confirmed — review before continuing again' : 'Saved continuation target'}</Text>
    {target.state !== 'legacy_review' && <Text size="xs" fw={600}>{target.operation === 'replace'
      ? 'This share replaces the saved strategy with a new revision; it does not create a separate strategy.'
      : 'This share adds another run to the saved strategy; it does not create a separate strategy.'}</Text>}
    {candidates.map(c => <Group key={c.operation}><Text size="xs">{c.value!.title || c.value!.id} · {c.operation}</Text>
      <Button size="compact-xs" variant="default" loading={busy} onClick={() => void inspect(c.value!.id, c.operation)}>Review current revision</Button></Group>)}
    <Text size="xs">{target.state !== 'legacy_review' && `Pinned revision ${target.revision}. `}Your maps, loot and prices are retained if this target cannot be checked. A timeout does not mean the Discord submission failed.</Text>
    {review && <><Text size="xs">{review.detail.title} · current revision {review.detail.revision} · {review.detail.attribution?.display_name ?? 'Author name not set'}</Text>
      <Button size="xs" variant="light" loading={busy} onClick={() => void bind()}>Use this version for my next share</Button></>}
    {error && <Text size="xs" c="red">{error}</Text>}
    <Button size="compact-xs" variant="subtle" onClick={() => { active.current.generation++; useSessionStore.getState().updateSetting('strategyTarget', null) }}>Clear target and share as a separate strategy</Button>
  </Stack></Alert>
}
