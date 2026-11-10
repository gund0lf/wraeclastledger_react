import { Alert } from '@mantine/core'
import { useEffect, useRef } from 'react'
import type { AuthorContext } from '../../../shared/authorHandoff'
import { shareStatusText, type DurableShareView } from '../../../shared/durableShare'
import { acknowledgeStrategyTarget, migrateStrategyTarget } from '../../../shared/strategyTarget'
import { useSessionStore } from '../store/useSessionStore'
import { flushRepositoryNow } from '../repository/sessionRepositoryRuntime'

/** Local UI observation only; main owns the private read key and network checks. */
export function AuthorOperationPanel({ context, share, sessionIdentity, onChange }: {
  context: AuthorContext; share: DurableShareView; sessionIdentity: string; onChange: (view: DurableShareView) => void
}) {
  const changed = useRef(onChange)
  changed.current = onChange
  useEffect(() => {
    let stopped = false, done = false, timer: ReturnType<typeof setTimeout> | undefined
    const current = () => !stopped && useSessionStore.getState().currentSessionIdentity === sessionIdentity
    const poll = async () => {
      try {
        const result = await window.api.authorHandoff({ action: 'share-result', context, sessionIdentity,
          targetGeneration: share.targetGeneration })
        if (!current()) return
        if (result.ok && result.value?.id === share.id) {
          changed.current(result.value)
          if (result.value.status === 'complete' && result.value.outcome && share.targetGeneration) {
            const store = useSessionStore.getState()
            const target = migrateStrategyTarget(store.settings as unknown as Record<string, unknown>)
            const next = acknowledgeStrategyTarget(target, share.targetGeneration,
              result.value.outcome.strategy_id, result.value.outcome.revision)
            if (next !== target) { store.updateSetting('strategyTarget', next); await flushRepositoryNow() }
          }
          if (result.value.status === 'complete' || result.value.status === 'restore_review') { done = true; return }
        }
      } finally { if (current() && !done) timer = setTimeout(() => { void poll().catch(() => undefined) }, 1500) }
    }
    void poll().catch(() => undefined)
    return () => { stopped = true; clearTimeout(timer) }
  }, [context, sessionIdentity, share.id, share.targetGeneration])
  return <Alert color={share.status === 'complete' ? 'teal' : share.status === 'restore_review' ? 'orange' : 'gray'}
    p="sm" styles={{ title: { justifyContent: 'center', width: '100%' }, message: { textAlign: 'center' } }}
    title={shareStatusText(share)}>
    {share.status === 'checking' && "Can't reach the server right now. It keeps trying."}
  </Alert>
}
