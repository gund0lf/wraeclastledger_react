import { Alert, Button, CopyButton, Group, Select, Stack, Text } from '@mantine/core'
import { IconClipboard } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import type { AuthorConfirmation, AuthorContext, AuthorStatus, PreparedAuthorRequest } from '../../../shared/authorHandoff'
import { acceptExactNameVerification, applyAuthorRecovery, applyReviewedNameVerification, authorConfirmationNeedsReview, invalidateAuthorEpoch, previewAuthorRecovery } from '../../../shared/authorRecognition'
import { useSessionStore } from '../store/useSessionStore'
import { flushRepositoryNow } from '../repository/sessionRepositoryRuntime'
import { startAuthorPolling } from '../utils/authorPolling'
import { authorCommandHelp } from '../utils/authorCommandHelp'
import { PUBLIC_NAME_RETIRE_NOTICE } from '../../../shared/authorNames'
import { COLOR, FONT } from '../utils/uiTokens'

/** Private code plus revalidation verifies a name; public status never does. */
export function AuthorConfirmationPanel({ context, request, action, onCancel, onAccepted, firstNameVerification = false, expectedName }: {
  context: AuthorContext; request: PreparedAuthorRequest
  action: 'recover' | 'preview' | 'confirmation'; onCancel: () => void
  onAccepted?: (receipt: AuthorConfirmation) => void
  firstNameVerification?: boolean
  expectedName?: string
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
          const saved = await window.api.authorHandoff({ action: 'name-saved', context, requestId: request.request_id })
          if (!current()) return
          if (!saved.ok) { setError(saved.error); return }
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
        setError(firstNameVerification ? 'The confirmed name changed. Review it before saving.'
          : 'The confirmed names changed. Review this updated list and choose the default again.')
        return
      }
      const store = useSessionStore.getState()
      store.setAuthorPreferences(firstNameVerification
        ? applyReviewedNameVerification(store.authorPreferences, refreshed.value)
        : applyAuthorRecovery(store.authorPreferences, refreshed.value,
          { defaultRegistrationId: defaultId, forgetObsoleteIds: [] }))
      await flushRepositoryNow()
      const saved = await window.api.authorHandoff({ action: 'name-saved', context, requestId: request.request_id })
      if (!current()) return
      if (!saved.ok) { setError(saved.error); return }
      setAccepted(true); setReceipt(null)
      onAccepted?.(refreshed.value)
    } catch { if (current()) setError('Saved names changed. Paste the confirmation again to review them.') }
    finally { if (current()) setBusy(false) }
  }
  const pasteAction = status?.outcome?.status !== 'retired' && !accepted && !preview &&
    <Button size="xs" variant="filled" leftSection={<IconClipboard size={15} />} loading={busy} onClick={() => void paste()}>
      {firstNameVerification ? 'Paste code' : 'Paste private confirmation from clipboard'}
    </Button>
  const saveAction = preview && <Button size="xs" loading={busy} onClick={() => void apply()}>Save name</Button>
  const feedback = <>
    {statusError && <Alert color="red" p="xs">{statusError}
      <Button size="compact-xs" variant="subtle" onClick={() => polling.current?.retry()}>Retry status</Button>
    </Alert>}
    {error && <Alert color="red" p="xs">{error}</Alert>}
    {receipt && !preview && <Alert color="red">The confirmation conflicts with a saved registration. Review saved names before continuing.</Alert>}
  </>
  const review = preview && <Stack gap="xs">
      <Text size="sm" fw={600}>Review confirmed public names</Text>
      {preview.confirmed.length === 0 && <Text size="xs">No active names are registered to this Discord account.</Text>}
      {preview.confirmed.map((v) => <Text size="xs" key={v.registrationId}>{v.name} — {v.state.replaceAll('_', ' ')}</Text>)}
      {preview.notConfirmed.length > 0 && <Text size="xs" c="dimmed">Not confirmed: {preview.notConfirmed.map((v) => v.name).join(', ')}. These entries remain saved but cannot be used as confirmed names.</Text>}
      <Select size="xs" label="Default for new shares" value={defaultId ?? ''} onChange={(v) => setDefaultId(v || null)}
        allowDeselect={false} data={[{ value: '', label: 'Choose each time' }, ...preview.confirmed.map((v) => ({ value: v.registrationId, label: v.name }))]} />
      {saveAction}
    </Stack>
  if (firstNameVerification) return <Stack gap={6}>
    {feedback}
    {accepted ? <Text size="xs" c="teal">Confirmed names saved on this PC.</Text> : preview ? <Stack gap={8}
      p="xs" style={{ background: COLOR.bgDeep, border: `1px solid ${COLOR.borderSoft}`, borderRadius: 6 }}>
      <Text size="xs">{preview.confirmed.length === 1
        ? preview.confirmed[0].name !== expectedName
          ? `Discord confirmed “${preview.confirmed[0].name}”, not “${expectedName}”. Save “${preview.confirmed[0].name}” on this PC?`
          : `Discord confirmed “${preview.confirmed[0].name}” with changed registration details. Save this name on this PC?`
        : preview.confirmed.length ? `Discord confirmed these names: ${preview.confirmed.map(v => `“${v.name}”`).join(', ')}. Save them on this PC?`
          : 'Discord confirmed no active names. Review your saved names before continuing.'}</Text>
      {preview.confirmed.length > 0 && saveAction}
    </Stack> : <Stack gap={8} p="xs" style={{ background: COLOR.bgDeep, border: `1px solid ${COLOR.borderSoft}`, borderRadius: 6 }}>
      <Text size="xs" fw={600}>Last step: verify your name</Text>
      <Text size="xs" c="dimmed">Use the private code from Discord.</Text>
      {pasteAction}
      <details>
        <summary style={{ color: COLOR.accent, cursor: 'pointer', fontSize: FONT.body }}>No code arrived?</summary>
        <Stack gap="xs" mt={6}>
          <Text size="xs">{authorCommandHelp('confirmation')}</Text>
          <CopyButton value={request.request_id}>{({ copied, copy }) => <Button size="compact-xs" variant="default" onClick={copy}>{copied ? 'Request copied' : 'Copy request ID'}</Button>}</CopyButton>
        </Stack>
      </details>
      <Text size="xs" c="dimmed">You can do this later under the gear button.</Text>
    </Stack>}
  </Stack>
  const confirmed = status?.status === 'confirmed' || status?.status === 'consumed'
  return <Stack gap="xs">
    {feedback}
    {status?.outcome?.status === 'retired' ? <Alert color="orange">
      The name was retired for {status.outcome.count} strategies. Its saved entry now needs verification; if it was the default, the default is now Choose each time.
      {' '}{PUBLIC_NAME_RETIRE_NOTICE}
    </Alert> : accepted ? <Text size="xs" c="teal">Confirmed names saved on this PC.</Text> : preview ? review : confirmed ? <>
      <Text size="xs">Copy the private confirmation from Discord, then paste it here.</Text>
      {pasteAction}
    </> : <>
      <CopyButton value={request.request_id}>{({ copied, copy }) =>
        <Button size="xs" variant="filled" onClick={copy}>{copied ? 'Request copied' : 'Copy request ID'}</Button>
      }</CopyButton>
      <Text size="xs">{authorCommandHelp(action)}</Text>
      <Text size="xs" c="dimmed">Use it by {new Date(request.expires_at).toLocaleTimeString()}.</Text>
    </>}
    <Group justify="flex-end"><Button size="compact-xs" variant="subtle" c={COLOR.textDim} onClick={onCancel}>Close confirmation</Button></Group>
  </Stack>
}
