import { Alert, Badge, Button, Divider, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AuthorContext, AuthorManagement, PreparedAuthorRequest } from '../../../shared/authorHandoff'
import { forgetAuthor, initialAssignmentRegistration, invalidateAuthorEpoch } from '../../../shared/authorRecognition'
import { normalizePublicAuthorName, PUBLIC_NAME_RETENTION_NOTICE, PUBLIC_NAME_RETIRE_NOTICE } from '../../../shared/authorNames'
import { useSessionStore } from '../store/useSessionStore'
import { AuthorConfirmationPanel } from './AuthorConfirmationPanel'
import { COLOR, FONT } from '../utils/uiTokens'

const inputStyles = { input: { background: COLOR.bgInset } }

export function ManagePublicNames({ opened, onClose, selectedStrategy, embedded = false, initialAction }: { opened: boolean; onClose: () => void; embedded?: boolean;
  initialAction?: 'recover'
  selectedStrategy?: { id: string; scope: 'current' | 'frozen'; snapshotKey: string | null } }) {
  const preferences = useSessionStore((s) => s.authorPreferences)
  const sessionId = useSessionStore((s) => `${s.activeSessionId ?? 'working'}:${s.sessionNonce}`)
  const [kind, setKind] = useState<AuthorManagement['kind']>('recovery')
  const [actionOpen, setActionOpen] = useState(false)
  const selectedId = selectedStrategy?.id ?? null
  useEffect(() => { if (opened && selectedId) setKind('initial_assignment') }, [opened, selectedId])
  useEffect(() => {
    if (opened && initialAction === 'recover') { setKind('recovery'); setActionOpen(true) }
  }, [opened, initialAction])
  const [newName, setNewName] = useState('')
  const [nameChoice, setNameChoice] = useState<string | null>(null)
  const savedName = initialAssignmentRegistration(preferences, nameChoice)
  const name = savedName?.name ?? newName
  useEffect(() => {
    setNameChoice(null)
    setNewName('')
  }, [opened, selectedId])
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
  const content = <>
    <div className={embedded ? 'share-scroll-body' : undefined}>
    <Stack gap="sm">
      <Text size="sm" c="dimmed">Your names on this PC. The default is picked for new shares.</Text>
      {!embedded && <Select size="xs" label="Default for new shares" styles={inputStyles} value={preferences.defaultRegistrationId ?? ''} allowDeselect={false}
        data={[{ value: '', label: 'Choose each time' }, ...preferences.registrations.map((r) => ({ value: r.registrationId,
          label: r.name + (r.confirmed ? '' : ' (needs confirmation)'), disabled: !r.confirmed }))]}
        onChange={(v) => useSessionStore.getState().setAuthorPreferences({ ...preferences, defaultRegistrationId: v || null })} />}
      {preferences.registrations.length === 0 && embedded && <Text size="sm" c="dimmed">No names saved on this PC yet.</Text>}
      {preferences.registrations.map((r) => <Group key={r.registrationId} gap="sm" p={embedded ? 'sm' : 0} justify="space-between" align="flex-start"
        style={embedded ? { border: `1px solid ${COLOR.borderSoft}`, borderRadius: 6, background: COLOR.bgInset } : undefined}>
        <Stack gap={8} style={{ minWidth: 0, flex: 1 }}><Text size="sm" fw={600} style={{ overflowWrap: 'anywhere' }}>{r.name}</Text>
          <Group gap={6}><Badge size="sm" color={r.confirmed ? 'green' : 'orange'} variant="light" tt="none">{r.confirmed ? 'Verified' : 'Needs verification'}</Badge>
            {preferences.defaultRegistrationId === r.registrationId && <Badge size="sm" color="gray" variant="light" tt="none">Default</Badge>}
          </Group>
        </Stack>
        <Stack gap={4} align="flex-end">
          {embedded && r.confirmed && preferences.defaultRegistrationId !== r.registrationId && <Button size="compact-xs" variant="subtle" color="gray" c={COLOR.accent}
            onClick={() => { const latest = useSessionStore.getState(); latest.setAuthorPreferences({ ...latest.authorPreferences, defaultRegistrationId: r.registrationId }) }}>Make default</Button>}
          {!r.confirmed && <Button size="compact-xs" variant="subtle" color="gray" c={COLOR.textSoft} disabled={!!request}
            onClick={() => { setKind('recovery'); setRegistration(r.registrationId); setActionOpen(true) }}>Recover</Button>}
          <Button size="compact-xs" variant="subtle" color="gray" c={COLOR.accent} onClick={() => { setForgetId(r.registrationId); setReplacement(null) }}>
            {embedded ? 'Forget on this PC' : 'Forget locally'}</Button>
          {embedded && r.confirmed && <Button size="compact-xs" variant="subtle" color="gray" c={COLOR.loss} disabled={!!request}
            onClick={() => { setKind('unregister'); setRegistration(r.registrationId); setActionOpen(true) }}>Retire name…</Button>}
        </Stack>
      </Group>)}
      {forgetId && <Stack gap="xs">
        <Text size="xs">Forget this saved entry? Its public attribution and Discord ownership remain unchanged.</Text>
        {preferences.defaultRegistrationId === forgetId && <Select size="xs" label="Replacement default" styles={inputStyles} value={replacement ?? ''}
          allowDeselect={false} onChange={(v) => setReplacement(v || null)} data={[{ value: '', label: 'Choose each time' },
            ...preferences.registrations.filter((r) => r.confirmed && r.registrationId !== forgetId).map((r) => ({ value: r.registrationId, label: r.name }))]} />}
        <Group justify="center"><Button size="xs" variant="subtle" color="gray" c={COLOR.textDim} onClick={() => setForgetId(null)}>Keep</Button>
          <Button size="xs" variant="filled" onClick={() => {
            useSessionStore.getState().setAuthorPreferences(forgetAuthor(preferences, forgetId,
              { replacementDefault: preferences.defaultRegistrationId === forgetId ? replacement : preferences.defaultRegistrationId }))
            setForgetId(null)
          }}>{embedded ? 'Forget on this PC' : 'Forget locally'}</Button></Group>
      </Stack>}
      {embedded && <Stack gap={6}>
        <Text size="xs" c="dimmed" ta="center">Lost a name after reinstalling? Recover it with a private Discord code.</Text>
        <Button size="xs" variant="subtle" disabled={!!request} onClick={() => { setKind('recovery'); setActionOpen(true) }}>Recover your name</Button>
      </Stack>}
      {(!embedded || actionOpen) && <>
      <Divider />
      {!embedded && <Select size="xs" label="Discord action" styles={inputStyles} value={kind} allowDeselect={false} disabled={!!request}
        onChange={(v) => { if (v) setKind(v as AuthorManagement['kind']) }} data={[
          { value: 'recovery', label: 'Recover my public names' },
          { value: 'initial_assignment', label: 'Name my unnamed strategies' },
          { value: 'reassignment', label: 'Reassign my eligible strategies' },
          { value: 'unregister', label: 'Retire a public name' },
        ]} />}
      {embedded && <Text size="sm" fw={600} ta="center">{kind === 'unregister' ? 'Retire this name' : 'Recover your name'}</Text>}
      {kind === 'initial_assignment' && preferences.registrations.some(r => r.confirmed) && <Select size="xs" label="Choose a public name"
        styles={inputStyles} disabled={!!request} allowDeselect={false} value={savedName?.registrationId ?? 'new'}
        data={[...preferences.registrations.filter(r => r.confirmed).map(r => ({ value: r.registrationId, label: r.name })),
          { value: 'new', label: 'Use a new name' }]} onChange={setNameChoice} />}
      {kind === 'initial_assignment' && !savedName && <TextInput size="xs" label="Public author name" styles={inputStyles} value={name} maxLength={256}
        disabled={!!request} onChange={(e) => setNewName(e.currentTarget.value)} />}
      {kind === 'initial_assignment' && <Text size="xs" c="dimmed">{PUBLIC_NAME_RETENTION_NOTICE}</Text>}
      {embedded && kind === 'unregister'
        ? <Text fw={700} ta="center" mt={-6} style={{ fontSize: FONT.lg }} aria-label="Name to retire">{preferences.registrations.find((r) => r.registrationId === registration)?.name ?? 'Name no longer saved on this PC'}</Text>
        : (kind === 'reassignment' || kind === 'unregister') && <Select size="xs" label="Confirmed public name" styles={inputStyles} value={registration}
          disabled={!!request} onChange={setRegistration} data={preferences.registrations.filter((r) => r.confirmed).map((r) => ({ value: r.registrationId, label: r.name }))} />}
      {kind === 'unregister' ? !request && <Alert color="orange" p="xs"><Stack gap={5}>
        <Text size="xs">Retiring ends adding or replacing runs for these strategies and releases the name.</Text>
        <Text size="xs">{PUBLIC_NAME_RETIRE_NOTICE}</Text>
        <Text size="xs">Viewing and importing still work. Private recovery records are kept.</Text>
      </Stack></Alert>
        : kind !== 'recovery' && <Text size="xs">{selectedId
          ? 'This requests only the selected strategy. Initial naming includes its eligible unnamed current and frozen copies; reassignment applies only to an eligible current strategy.'
          : 'This requests all eligible strategies belonging to your Discord account.'} Review the exact list in Discord before confirming.</Text>}
      {error && <Alert color="red" p="xs">{error}</Alert>}
      {dismissalNotice && <Alert color="orange" p="xs">{dismissalNotice}</Alert>}
      {!request ? <>
        <Text size="xs" c="dimmed" ta={embedded ? 'center' : undefined}>{kind === 'recovery'
          ? 'Next, use the request in Discord to receive a private code for your saved names.'
          : 'Next, review the affected strategies in Discord before you confirm.'}</Text>
        <Button size="xs" variant="filled" disabled={!ready} loading={busy} onClick={() => void prepare()}>Prepare private Discord request</Button>
      </>
        : <AuthorConfirmationPanel key={request.request_id} context={context} request={request}
          action={kind === 'recovery' ? 'recover' : 'preview'} onCancel={() => void closeRequest()} />}
      </>}
    </Stack>
    </div>
    {embedded && <div className="share-footer" style={{ borderTop: `1px solid ${COLOR.borderSoft}` }}>
      <Button size="sm" variant="default" styles={{ root: { background: COLOR.bgInset } }} fullWidth onClick={onClose}>Done</Button>
    </div>}
  </>
  return embedded ? <section role="region" aria-label="Public names" style={{ display: 'flex', flexDirection: 'column', flex: '0 1 auto', minHeight: 0 }}>{content}</section>
    : <Modal opened={opened} onClose={onClose} title="Manage public names" size="md" centered closeButtonProps={{ 'aria-label': 'Close' }}>{content}</Modal>
}
