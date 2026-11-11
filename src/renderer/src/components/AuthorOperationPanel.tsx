import { Alert } from '@mantine/core'
import { useEffect, useRef } from 'react'
import type { AuthorContext, ShareStorageCode } from '../../../shared/authorHandoff'
import { shareStatusText, type DurableShareView } from '../../../shared/durableShare'
import { acknowledgeStrategyTarget, migrateStrategyTarget } from '../../../shared/strategyTarget'
import { useSessionStore } from '../store/useSessionStore'
import { flushRepositoryNow } from '../repository/sessionRepositoryRuntime'

/** Local UI observation only; main owns the private read key and network checks. */
export function AuthorOperationPanel({ context, share, sessionIdentity, onChange, onError, onStorageError, observeOnly = false }: {
  context: AuthorContext; share: DurableShareView; sessionIdentity: string; onChange: (view: DurableShareView) => void
  onError?: (message: string | null) => void
  onStorageError?: (code: ShareStorageCode | null) => void
  observeOnly?: boolean
}) {
  const changed = useRef(onChange)
  changed.current = onChange
  const reportError = useRef(onError)
  reportError.current = onError
  const reportStorageError = useRef(onStorageError)
  reportStorageError.current = onStorageError
  useEffect(() => {
    let stopped = false, done = false, timer: ReturnType<typeof setTimeout> | undefined
    const current = () => !stopped && useSessionStore.getState().currentSessionIdentity === sessionIdentity
    const poll = async () => {
      try {
        const result = await window.api.authorHandoff({ action: 'share-result', context, sessionIdentity,
          targetGeneration: share.targetGeneration })
        if (!current()) return
        if (!result.ok) {
          reportError.current?.(result.error)
          reportStorageError.current?.(result.storageCode ?? null)
          return
        }
        if (result.value?.id === share.id) {
          reportError.current?.(null)
          reportStorageError.current?.(null)
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
      } catch {
        if (current()) reportError.current?.('Could not read sharing status. The app will keep trying; your prepared share is kept.')
      } finally { if (current() && !done) timer = setTimeout(() => { void poll().catch(() => undefined) }, 1500) }
    }
    void poll().catch(() => undefined)
    return () => { stopped = true; clearTimeout(timer) }
  }, [context, sessionIdentity, share.id, share.targetGeneration])
  if (observeOnly) return null
  return <Alert color={share.status === 'complete' ? 'teal' : share.status === 'restore_review' ? 'orange' : 'gray'}
    p="sm" styles={{ title: { justifyContent: 'center', width: '100%' }, message: { textAlign: 'center' } }}
    title={shareStatusText(share)}>
    {share.status === 'checking' && "Can't reach the server right now. It keeps trying."}
  </Alert>
}
