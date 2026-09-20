import { Alert, Button, Divider, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AuthorContext, AuthorManagement, PreparedAuthorRequest } from '../../../shared/authorHandoff'
import { forgetAuthor, invalidateAuthorEpoch } from '../../../shared/authorRecognition'
import { normalizePublicAuthorName } from '../../../shared/authorNames'
import { useSessionStore } from '../store/useSessionStore'
import { AuthorConfirmationPanel } from './AuthorConfirmationPanel'

export function ManagePublicNames({ opened, onClose, selectedStrategy }: { opened: boolean; onClose: () => void;
  selectedStrategy?: { id: string; scope: 'current' | 'frozen'; snapshotKey: string | null } }) {
  const preferences = useSessionStore((s) => s.authorPreferences)
  const sessionId = useSessionStore((s) => `${s.activeSessionId ?? 'working'}:${s.sessionNonce}`)
  const [kind, setKind] = useState<AuthorManagement['kind']>('recovery')
  const selectedId = selectedStrategy?.id ?? null
  useEffect(() => { if (opened && selectedId) setKind('initial_assignment') }, [opened, selectedId])
  const [name, setName] = useState('')
  const [registration, setRegistration] = useState<string | null>(null)
  const [request, setRequest] = useState<PreparedAuthorRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [forgetId, setForgetId] = useState<string | null>(null)
  const [replacement, setReplacement] = useState<string | null>(null)
  const [requestGeneration, setRequestGeneration] = useState(0)
  const [dismissalNotice, setDismissalNotice] = useState<string | null>(null)
  // Field changes and reopening are distinct operations, including unsaved sessions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const context: AuthorContext = useMemo(() => ({ sessionId, generation: crypto.randomUUID() }), [sessionId, kind, name, registration, opened, requestGeneration, selectedId])
  const active = useRef(context)
  active.current = context
  useEffect(() => {
    if (!opened) return
    let stop = false
    setReady(false); setRequest(null); setError(null); setBusy(false)
    void (async () => {
      const a = await window.api.authorHandoff({ action: 'activate', context })
      if (stop) return
      if (!a.ok) { setError(a.error); return }
      const state = await window.api.authorHandoff({ action: 'state' })
      if (stop) return
      if (!state.ok) { setError(state.error); return }
      const store = useSessionStore.getState()
      store.setAuthorPreferences(invalidateAuthorEpoch(store.authorPreferences, state.value.epoch))
      setReady(state.value.author_actions_available)
      if (!state.value.author_actions_available) setError('Author controls are temporarily unavailable.')
    })().catch(() => { if (!stop) setError('Could not reach the author service.') })
    return () => { stop = true; void window.api.authorHandoff({ action: 'activate', context: null }) }
  }, [context, opened])
  const prepare = async () => {
    setBusy(true); setError(null); setDismissalNotice(null)
    try {
      let operation: AuthorManagement
      if (kind === 'recovery') operation = { kind, intent: null }
      else if (kind === 'initial_assignment') operation = { kind, intent: {
        author: { name: normalizePublicAuthorName(name).name, registration_id: null }, scope: selectedId ? { kind: 'selected', strategy_ids: [selectedId] } : { kind: 'all_eligible' } } }
      else {
        if (!registration || !preferences.registrations.some((v) => v.registrationId === registration && v.confirmed))
          throw new Error('Choose a confirmed name first.')
        operation = kind === 'unregister' ? { kind, intent: { registration_id: registration } }
          : { kind, intent: { registration_id: registration, scope: selectedId ? { kind: 'selected', strategy_ids: [selectedId] } : { kind: 'all_eligible' } } }
      }
      const r = await window.api.authorHandoff({ action: 'prepare', context, operation })
      if (active.current !== context) return
      if (!r.ok) setError(r.error)
      else setRequest(r.value)
    } catch (e) { if (active.current === context) setError(e instanceof Error ? e.message : 'Could not prepare the request.') }
    finally { if (active.current === context) setBusy(false) }
  }
  const closeRequest = async () => {
    if (!request) return
    const closing = request
    // Remove the panel immediately, so late status/receipt replies cannot apply.
    setRequest(null); setReady(false)
    setRequestGeneration((v) => v + 1)
    try {
      const r = await window.api.authorHandoff({ action: 'cancel', context, requestId: closing.request_id })
      if (!r.ok) setDismissalNotice(r.error)
    } catch { setDismissalNotice('Closed locally. Server cancellation could not be confirmed; the old request may remain active until it expires.') }
  }
  return <Modal opened={opened} onClose={onClose} title="Manage public names" size="md" closeButtonProps={{ 'aria-label': 'Close' }}>
    <Stack gap="sm">
      <Text size="xs" c="dimmed">Names saved here help you choose attribution. Discord verifies ownership when you submit an action.</Text>
      <Select size="xs" label="Default for new shares" value={preferences.defaultRegistrationId ?? ''} allowDeselect={false}
        data={[{ value: '', label: 'Choose each time' }, ...preferences.registrations.map((r) => ({ value: r.registrationId,
          label: r.name + (r.confirmed ? '' : ' (needs confirmation)'), disabled: !r.confirmed }))]}
        onChange={(v) => useSessionStore.getState().setAuthorPreferences({ ...preferences, defaultRegistrationId: v || null })} />
      {preferences.registrations.map((r) => <Group key={r.registrationId} justify="space-between">
        <Text size="xs">{r.name}{!r.confirmed && ' — needs confirmation'}</Text>
        <Button size="compact-xs" variant="subtle" onClick={() => { setForgetId(r.registrationId); setReplacement(null) }}>Forget locally</Button>
      </Group>)}
      {forgetId && <Stack gap="xs">
        <Text size="xs">Forget this saved entry? Its public attribution and Discord ownership remain unchanged.</Text>
        {preferences.defaultRegistrationId === forgetId && <Select size="xs" label="Replacement default" value={replacement ?? ''}
          allowDeselect={false} onChange={(v) => setReplacement(v || null)} data={[{ value: '', label: 'Choose each time' },
            ...preferences.registrations.filter((r) => r.confirmed && r.registrationId !== forgetId).map((r) => ({ value: r.registrationId, label: r.name }))]} />}
        <Group><Button size="xs" variant="default" onClick={() => setForgetId(null)}>Keep</Button>
          <Button size="xs" variant="light" onClick={() => {
            useSessionStore.getState().setAuthorPreferences(forgetAuthor(preferences, forgetId,
              { replacementDefault: preferences.defaultRegistrationId === forgetId ? replacement : preferences.defaultRegistrationId }))
            setForgetId(null)
          }}>Forget locally</Button></Group>
      </Stack>}
      <Divider />
      <Select size="xs" label="Discord action" value={kind} allowDeselect={false} disabled={!!request}
        onChange={(v) => { if (v) setKind(v as AuthorManagement['kind']) }} data={[
          { value: 'recovery', label: 'Recover my public names' },
          { value: 'initial_assignment', label: 'Name my unnamed strategies' },
          { value: 'reassignment', label: 'Reassign my eligible strategies' },
          { value: 'unregister', label: 'Unregister a public name' },
        ]} />
      {kind === 'initial_assignment' && <TextInput size="xs" label="Public author name" value={name} maxLength={256}
        disabled={!!request} onChange={(e) => setName(e.currentTarget.value)} />}
      {(kind === 'reassignment' || kind === 'unregister') && <Select size="xs" label="Confirmed public name" value={registration}
        disabled={!!request} onChange={setRegistration} data={preferences.registrations.filter((r) => r.confirmed).map((r) => ({ value: r.registrationId, label: r.name }))} />}
      {kind === 'unregister' ? <Alert color="orange" p="xs">Unregistering ends continuation for all affected strategies and releases the name. Viewing and importing remain available. Discord will show the complete affected list and require confirmation.</Alert>
        : kind !== 'recovery' && <Text size="xs">{selectedId
          ? 'This requests only the selected strategy. Initial naming includes its eligible unnamed current and frozen copies; reassignment applies only to an eligible current strategy.'
          : 'This requests all eligible strategies belonging to your Discord account.'} Review the exact list in Discord before confirming.</Text>}
      {error && <Alert color="red" p="xs">{error}</Alert>}
      {dismissalNotice && <Alert color="orange" p="xs">{dismissalNotice}</Alert>}
      {!request ? <Button size="xs" variant="light" disabled={!ready} loading={busy} onClick={() => void prepare()}>Prepare private Discord request</Button>
        : <AuthorConfirmationPanel key={request.request_id} context={context} request={request}
          action={kind === 'recovery' ? 'recover' : 'preview'} onCancel={() => void closeRequest()} />}
    </Stack>
  </Modal>
}
