import { Alert, Button, Group, Stack, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import type { StrategyTarget } from '../../../shared/strategyTarget'
import type { SafeDetail } from '../../../shared/safeStrategy'
import { useSessionStore } from '../store/useSessionStore'
import { safeStrategyReader } from '../utils/safeStrategyReader'
import { bindSafeTarget, refreshSafeAuthorState } from '../utils/safeStrategyTarget'

export function SafeTargetReview({ target, disabled = false }: { target: StrategyTarget; disabled?: boolean }) {
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
    <Text size="sm" fw={600}>{target.state === 'legacy_review' ? 'Saved target needs review' : target.state === 'acknowledged' ? 'Update saved' : target.operation === 'evidence' ? 'Add a run' : 'Replace strategy'}</Text>
    {target.state !== 'legacy_review' && <Text size="xs" fw={600}>{target.operation === 'replace'
      ? 'Replaces the results on the same strategy and Discord card.'
      : 'Adds this run to the same strategy and Discord card.'}</Text>}
    {candidates.map(c => <Group key={c.operation}><Text size="xs">{c.value!.title || 'Saved strategy'}{target.state !== 'legacy_review' ? ` · revision ${target.revision}` : ''}</Text>
      <Button size="compact-xs" variant="default" disabled={disabled} loading={busy} onClick={() => void inspect(c.value!.id, c.operation)}>Check latest version</Button></Group>)}
    {target.state === 'acknowledged' && <Text size="xs">To submit another update, check the latest version and choose it below.</Text>}
    {review && <><Text size="xs">{review.detail.title} · current revision {review.detail.revision} · {review.detail.attribution?.display_name ?? 'Author name not set'}</Text>
      <Button size="xs" variant="light" disabled={disabled} loading={busy} onClick={() => void bind()}>Use this version for my next share</Button></>}
    {error && <Text size="xs" c="red">{error}</Text>}
    <Button size="compact-xs" variant="subtle" disabled={disabled} onClick={() => { active.current.generation++; useSessionStore.getState().updateSetting('strategyTarget', null) }}>Clear target and share as a separate strategy</Button>
  </Stack></Alert>
}
