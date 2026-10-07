import { Alert, Button, CopyButton, Group, Select, Stack, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import type { AuthorConfirmation, AuthorContext, AuthorStatus, PreparedAuthorRequest } from '../../../shared/authorHandoff'
import { applyAuthorRecovery, authorConfirmationNeedsReview, invalidateAuthorEpoch, previewAuthorRecovery } from '../../../shared/authorRecognition'
import { useSessionStore } from '../store/useSessionStore'
import { flushRepositoryNow } from '../repository/sessionRepositoryRuntime'
import { startAuthorPolling } from '../utils/authorPolling'

/** Receipts are previewed and explicitly accepted; status alone never recognizes a name. */
export function AuthorConfirmationPanel({ context, request, action, onCancel, onAccepted }: {
  context: AuthorContext; request: PreparedAuthorRequest
  action: 'recover' | 'preview' | 'confirmation'; onCancel: () => void
  onAccepted?: (receipt: AuthorConfirmation) => void
}) {
  const [status, setStatus] = useState<AuthorStatus | null>(null)
  const [receipt, setReceipt] = useState<AuthorConfirmation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [defaultId, setDefaultId] = useState<string | null>(null)
  const preferences = useSessionStore((s) => s.authorPreferences)
  const live = useRef(true)
  const polling = useRef<ReturnType<typeof startAuthorPolling> | null>(null)
  useEffect(() => {
    live.current = true
    let stop = false
    const poll = async () => {
      if (stop) return false
      if (document.visibilityState !== 'hidden' && navigator.onLine) {
        const r = await window.api.authorHandoff({ action: 'status', context, requestId: request.request_id })
        if (stop) return false
        if (!r.ok) { setStatusError(r.error); return !r.terminal }
        setStatusError(null)
        setStatus(r.value)
        const store = useSessionStore.getState()
        const invalidated = invalidateAuthorEpoch(store.authorPreferences, r.value.epoch)
        if (JSON.stringify(invalidated) !== JSON.stringify(store.authorPreferences)) store.setAuthorPreferences(invalidated)
        if (r.value.outcome?.status === 'retired') {
          const retiredId = r.value.outcome.registration_id
          store.setAuthorPreferences({ ...invalidated,
            defaultRegistrationId: invalidated.defaultRegistrationId === retiredId ? null : invalidated.defaultRegistrationId,
            registrations: invalidated.registrations.map((v) => v.registrationId === retiredId ? { ...v, confirmed: false } : v) })
          return false
        }
        if (['consumed', 'cancelled', 'expired'].includes(r.value.status)) return false
      }
      return true
    }
    const controller = startAuthorPolling(poll, () => {
      if (!stop) setStatusError('Could not check confirmation status. Retrying automatically; you can also retry now.')
    })
    polling.current = controller
    return () => { stop = true; live.current = false; controller.stop(); polling.current = null }
  }, [context, request])
  let preview: ReturnType<typeof previewAuthorRecovery> | null = null
  try { if (receipt) preview = previewAuthorRecovery(preferences, receipt) }
  catch { /* A conflicting local identity leaves Apply disabled. */ }
  const paste = async () => {
    setBusy(true); setError(null)
    try {
      const r = await window.api.authorHandoff({ action: 'paste', context, requestId: request.request_id })
      if (!live.current) return
      if (!r.ok) { setError(r.error); return }
      const p = previewAuthorRecovery(useSessionStore.getState().authorPreferences, r.value)
      setDefaultId(p.defaultStillConfirmed ? useSessionStore.getState().authorPreferences.defaultRegistrationId : null)
      setReceipt(r.value)
    } catch { if (live.current) setError('The confirmation could not be read. Copy the private token and retry.') }
    finally { if (live.current) setBusy(false) }
  }
  const apply = async () => {
    if (!receipt || !preview || !live.current) return
    setBusy(true); setError(null)
    try {
      const refreshed = await window.api.authorHandoff({ action: 'accept', context, requestId: request.request_id })
      if (!live.current) return
      if (!refreshed.ok) { setError(refreshed.error); return }
      if (authorConfirmationNeedsReview(receipt, refreshed.value)) {
        setReceipt(refreshed.value); setDefaultId(null)
        setError('The confirmed names changed. Review this updated list and choose the default again.')
        return
      }
      const store = useSessionStore.getState()
      store.setAuthorPreferences(applyAuthorRecovery(store.authorPreferences, refreshed.value,
        { defaultRegistrationId: defaultId, forgetObsoleteIds: [] }))
      await flushRepositoryNow()
      if (!live.current) return
      setAccepted(true); setReceipt(null)
      onAccepted?.(refreshed.value)
    } catch { if (live.current) setError('Saved names changed. Paste the confirmation again to review them.') }
    finally { if (live.current) setBusy(false) }
  }
  return <Stack gap="xs">
    <Text size="xs">In the sharing channel, use /wledger-author with action {action} and this request. Its response is private.</Text>
    <CopyButton value={request.request_id}>{({ copied, copy }) =>
      <Button size="xs" variant="default" onClick={copy}>{copied ? 'Request copied' : 'Copy request ID'}</Button>
    }</CopyButton>
    <Text size="xs" c="dimmed">Expires {new Date(request.expires_at).toLocaleTimeString()}. {status ? `Status: ${status.status}.` : ''}</Text>
    {status?.outcome?.status === 'retired' ? <Alert color="orange">
      The name was unregistered for {status.outcome.count} strategies. Its saved entry is now unconfirmed; if it was the default, the default is now Choose each time.
    </Alert> : !accepted && <Button size="xs" variant="light" loading={busy} onClick={() => void paste()}>
      Paste private confirmation from clipboard
    </Button>}
    {statusError && <Alert color="red" p="xs">{statusError}
      <Button size="compact-xs" variant="subtle" onClick={() => polling.current?.retry()}>Retry status</Button>
    </Alert>}
    {error && <Alert color="red" p="xs">{error}</Alert>}
    {accepted && <Text size="xs" c="teal">Confirmed names saved. Your maps, loot and run settings have not been changed.</Text>}
    {receipt && !preview && <Alert color="red">The confirmation conflicts with a saved registration. Review saved names before continuing.</Alert>}
    {preview && <Stack gap="xs">
      <Text size="sm" fw={600}>Review confirmed public names</Text>
      {preview.confirmed.length === 0 && <Text size="xs">No active names were confirmed.</Text>}
      {preview.confirmed.map((v) => <Text size="xs" key={v.registrationId}>{v.name} — {v.state.replaceAll('_', ' ')}</Text>)}
      {preview.notConfirmed.length > 0 && <Text size="xs" c="dimmed">Not confirmed: {preview.notConfirmed.map((v) => v.name).join(', ')}. These entries remain saved but cannot be used as confirmed names.</Text>}
      <Select size="xs" label="Default for new shares" value={defaultId ?? ''} onChange={(v) => setDefaultId(v || null)}
        allowDeselect={false} data={[{ value: '', label: 'Choose each time' }, ...preview.confirmed.map((v) => ({ value: v.registrationId, label: v.name }))]} />
      <Button size="xs" loading={busy} onClick={() => void apply()}>Save confirmed names and this default</Button>
    </Stack>}
    <Group justify="flex-end"><Button size="compact-xs" variant="subtle" onClick={onCancel}>Close confirmation</Button></Group>
  </Stack>
}
