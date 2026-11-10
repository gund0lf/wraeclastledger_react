import { Alert, Button, CopyButton, Group, Select, Stack, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AuthorConfirmation, AuthorContext, AuthorStatus, PreparedAuthorRequest } from '../../../shared/authorHandoff'
import { acceptExactNameVerification, applyAuthorRecovery, authorConfirmationNeedsReview, invalidateAuthorEpoch, previewAuthorRecovery } from '../../../shared/authorRecognition'
import { useSessionStore } from '../store/useSessionStore'
import { flushRepositoryNow } from '../repository/sessionRepositoryRuntime'
import { startAuthorPolling } from '../utils/authorPolling'
import { PUBLIC_NAME_RETIRE_NOTICE } from '../../../shared/authorNames'

/** Private code plus revalidation verifies a name; public status never does. */
export function AuthorConfirmationPanel({ context, request, action, onCancel, onAccepted, firstNameVerification = false, expectedName, detailsContainer }: {
  context: AuthorContext; request: PreparedAuthorRequest
  action: 'recover' | 'preview' | 'confirmation'; onCancel: () => void
  onAccepted?: (receipt: AuthorConfirmation) => void
  firstNameVerification?: boolean
  expectedName?: string
  /** Share keeps the action in its footer and the longer review in its scroll area. */
  detailsContainer?: HTMLElement | null
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
  const active = useRef({ context, request })
  active.current = { context, request }
  const current = () => live.current && active.current.context === context && active.current.request === request
  const polling = useRef<ReturnType<typeof startAuthorPolling> | null>(null)
  const reviewElement = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (receipt && detailsContainer) reviewElement.current?.scrollIntoView({ block: 'start' })
  }, [receipt, detailsContainer])
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
      if (!current()) return
      if (!r.ok) { setError(r.error); return }
      if (firstNameVerification && expectedName &&
        acceptExactNameVerification(useSessionStore.getState().authorPreferences, r.value, expectedName)) {
        const refreshed = await window.api.authorHandoff({ action: 'accept', context, requestId: request.request_id })
        if (!current()) return
        if (!refreshed.ok) { setError(refreshed.error); return }
        const store = useSessionStore.getState()
        const exact = !authorConfirmationNeedsReview(r.value, refreshed.value) &&
          acceptExactNameVerification(store.authorPreferences, refreshed.value, expectedName)
        if (exact) {
          store.setAuthorPreferences(exact)
          await flushRepositoryNow()
          if (!current()) return
          setAccepted(true); setReceipt(null); onAccepted?.(refreshed.value)
          return
        }
        setReceipt(refreshed.value); setDefaultId(null)
        setError('The confirmed name changed. Review it before saving.')
        return
      }
      const p = previewAuthorRecovery(useSessionStore.getState().authorPreferences, r.value)
      setDefaultId(p.defaultStillConfirmed ? useSessionStore.getState().authorPreferences.defaultRegistrationId : null)
      setReceipt(r.value)
    } catch { if (current()) setError('The name could not be saved. Copy the private code and try again.') }
    finally { if (current()) setBusy(false) }
  }
  const apply = async () => {
    if (!receipt || !preview || !current()) return
    setBusy(true); setError(null)
    try {
      const refreshed = await window.api.authorHandoff({ action: 'accept', context, requestId: request.request_id })
      if (!current()) return
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
      if (!current()) return
      setAccepted(true); setReceipt(null)
      onAccepted?.(refreshed.value)
    } catch { if (current()) setError('Saved names changed. Paste the confirmation again to review them.') }
    finally { if (current()) setBusy(false) }
  }
  const pasteAction = status?.outcome?.status !== 'retired' && !accepted && (!detailsContainer || !preview) &&
    <Button size="xs" variant="light" loading={busy} onClick={() => void paste()}>
      {firstNameVerification ? 'Paste name verification code' : 'Paste private confirmation from clipboard'}
    </Button>
  const saveAction = preview && <Button size="xs" loading={busy} onClick={() => void apply()}>Save name</Button>
  const feedback = <>
    {statusError && <Alert color="red" p="xs">{statusError}
      <Button size="compact-xs" variant="subtle" onClick={() => polling.current?.retry()}>Retry status</Button>
    </Alert>}
    {error && <Alert color="red" p="xs">{error}</Alert>}
    {receipt && !preview && <Alert color="red">The confirmation conflicts with a saved registration. Review saved names before continuing.</Alert>}
  </>
  const details = <Stack gap="xs">
    {firstNameVerification && !accepted && <Text size="xs">After posting, copy the bot’s private code from Discord and paste it here to verify your name once. Later shares and updates need no code.</Text>}
    {firstNameVerification ? <details><summary>Didn’t receive a code?</summary>
      <Text size="xs">In the sharing channel, use /wledger-author with action confirmation and this request. The reply is private.</Text>
      <CopyButton value={request.request_id}>{({ copied, copy }) => <Button size="compact-xs" variant="default" onClick={copy}>{copied ? 'Request copied' : 'Copy request ID'}</Button>}</CopyButton>
    </details> : <>
      <Text size="xs">In the sharing channel, use /wledger-author with action {action} and this request. Its response is private.</Text>
      <CopyButton value={request.request_id}>{({ copied, copy }) =>
        <Button size="xs" variant="default" onClick={copy}>{copied ? 'Request copied' : 'Copy request ID'}</Button>
      }</CopyButton>
    </>}
    {!accepted && <Text size="xs" c="dimmed">Verify by {new Date(request.expires_at).toLocaleTimeString()}.</Text>}
    {status?.outcome?.status === 'retired' ? <Alert color="orange">
      The name was unregistered for {status.outcome.count} strategies. Its saved entry is now unconfirmed; if it was the default, the default is now Choose each time.
      {' '}{PUBLIC_NAME_RETIRE_NOTICE}
    </Alert> : !detailsContainer && pasteAction}
    {!detailsContainer && feedback}
    {accepted && <Text size="xs" c="teal">Name verified.</Text>}
    {preview && <Stack ref={reviewElement} gap="xs">
      <Text size="sm" fw={600}>Review confirmed public names</Text>
      {preview.confirmed.length === 0 && <Text size="xs">No active names were confirmed.</Text>}
      {preview.confirmed.map((v) => <Text size="xs" key={v.registrationId}>{v.name} — {v.state.replaceAll('_', ' ')}</Text>)}
      {preview.notConfirmed.length > 0 && <Text size="xs" c="dimmed">Not confirmed: {preview.notConfirmed.map((v) => v.name).join(', ')}. These entries remain saved but cannot be used as confirmed names.</Text>}
      <Select size="xs" label="Default for new shares" value={defaultId ?? ''} onChange={(v) => setDefaultId(v || null)}
        allowDeselect={false} data={[{ value: '', label: 'Choose each time' }, ...preview.confirmed.map((v) => ({ value: v.registrationId, label: v.name }))]} />
      {!detailsContainer && saveAction}
    </Stack>}
    {!detailsContainer && <Group justify="flex-end"><Button size="compact-xs" variant="subtle" onClick={onCancel}>Close confirmation</Button></Group>}
  </Stack>
  return detailsContainer ? <>
    {createPortal(details, detailsContainer)}
    {feedback}
    {pasteAction}
    {saveAction}
  </> : details
}
