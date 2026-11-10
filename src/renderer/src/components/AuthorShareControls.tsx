import { Alert, Button, Group, Select, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AuthorContext, AuthorResults } from '../../../shared/authorHandoff'
import { shareCopyPresentation, type DurableShareView } from '../../../shared/durableShare'
import { invalidateAuthorEpoch } from '../../../shared/authorRecognition'
import { normalizePublicAuthorName, PUBLIC_NAME_RETENTION_NOTICE } from '../../../shared/authorNames'
import { useSessionStore } from '../store/useSessionStore'
import { AuthorConfirmationPanel } from './AuthorConfirmationPanel'
import { migrateStrategyTarget } from '../../../shared/strategyTarget'
import { safeStrategyReader } from '../utils/safeStrategyReader'
import { prepareSafeContinuation, refreshSafeAuthorState } from '../utils/safeStrategyTarget'
import { defaultShareConfirmation } from '../../../shared/shareIntent'
import { AuthorOperationPanel } from './AuthorOperationPanel'

export function AuthorShareControls({ core, raw, blocked, onManage, onClose, fieldContainer, confirmationContainer, enabled, onTrackingChange }: {
  core: string; raw: string; blocked: boolean; onManage: () => void; fieldContainer: HTMLElement | null; enabled: boolean
  confirmationContainer: HTMLElement | null
  onTrackingChange: (pending: boolean) => void; onClose: () => void
}) {
  const preferences = useSessionStore(s => s.authorPreferences)
  const settings = useSessionStore(s => s.settings)
  const maps = useSessionStore(s => s.maps)
  const target = useMemo(() => migrateStrategyTarget(settings as unknown as Record<string, unknown>), [settings])
  const targetGeneration = target && target.state !== 'legacy_review' ? target.generation : null
  const sessionId = useSessionStore(s => `${s.activeSessionId ?? 'working'}:${s.sessionNonce}`)
  const sessionIdentity = useSessionStore(s => s.currentSessionIdentity)
  const [selection, setSelection] = useState<string | null>(preferences.defaultRegistrationId)
  const [name, setName] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorElement = useRef<HTMLDivElement | null>(null)
  const [wire, setWire] = useState<({ context: AuthorContext } & AuthorResults['publication']) | null>(null)
  const [share, setShare] = useState<DurableShareView | null>(null)
  const [nameRequest, setNameRequest] = useState<AuthorResults['resume-name']>(null)
  const restoredNameFor = useRef<string | null>(null)
  const selected = preferences.registrations.find(r => r.registrationId ===
    (target && target.state !== 'legacy_review' ? target.registrationId : selection))
  const confirmation = defaultShareConfirmation(!!target, !!selected?.confirmed)
  // A completed target's bookkeeping may change while the same share stays open.
  const context: AuthorContext = useMemo(() => ({ sessionId, generation: crypto.randomUUID() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, core, selection, name, confirmation, enabled, targetGeneration])
  const active = useRef(context)
  active.current = context
  const currentTarget = useRef(target)
  currentTarget.current = target
  useEffect(() => { if (error) errorElement.current?.scrollIntoView({ block: 'nearest' }) }, [error])
  useEffect(() => { onTrackingChange(busy || share?.accepted === true); return () => onTrackingChange(false) }, [busy, share?.accepted, onTrackingChange])
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    const current = () => !stopped && active.current === context
    setReady(false); setWire(null); setShare(null); setNameRequest(null); setError(null); setBusy(false)
    void (async () => {
      const activated = await window.api.authorHandoff({ action: 'activate', context })
      if (!current()) return
      if (!activated.ok) { setError(activated.error); return }
      if (sessionIdentity) {
        const result = await window.api.authorHandoff({ action: 'share-result', context, sessionIdentity, targetGeneration })
        if (!current()) return
        if (!result.ok) { setError(result.error); return }
        setShare(result.value)
        if (result.value && !currentTarget.current) {
          const resumed = await window.api.authorHandoff({ action: 'resume-name', context, sessionIdentity })
          if (!current()) return
          if (!resumed.ok) { setError(resumed.error); return }
          setNameRequest(resumed.value)
        }
        if (result.value && restoredNameFor.current !== sessionIdentity && !currentTarget.current) {
          restoredNameFor.current = sessionIdentity
          const registration = preferences.registrations.find(r => r.confirmed && r.name === result.value!.author.name)
          if (registration) setSelection(registration.registrationId)
          else { setSelection(null); setName(result.value.author.name) }
        }
      }
      await window.api.authorHandoff({ action: 'share-refresh' })
      if (!current()) return
      setReady(true)
      const state = await window.api.authorHandoff({ action: 'state' })
      if (!current()) return
      if (state.ok) {
        const store = useSessionStore.getState()
        store.setAuthorPreferences(invalidateAuthorEpoch(store.authorPreferences, state.value.epoch))
      }
    })().catch(() => { if (current()) setError('Could not reach sharing. Your draft is kept; try again when the service is available.') })
    return () => { stopped = true; void window.api.authorHandoff({ action: 'activate', context: null }) }
    // Preferences are read only for initial field restoration, not as a new request trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, enabled, sessionIdentity, targetGeneration])
  const prepareAndCopy = async () => {
    setBusy(true); setError(null)
    try {
      if (!sessionIdentity) throw new Error('The selected session is still loading. Try again when it is ready.')
      let author = selected?.confirmed ? { name: selected.name, registration_id: selected.registrationId }
        : { name: normalizePublicAuthorName(name).name, registration_id: null }
      let preparedCore = core, revision: number | null = null
      if (target) {
        if (target.state !== 'ready') throw new Error('Choose Continue from the Strategy Browser for your next update.')
        await refreshSafeAuthorState()
        if (active.current !== context) return
        const detail = await safeStrategyReader.detail({ scope: 'current', snapshot_key: null, id: target.id,
          revision: target.revision, read_version: target.generation }, true)
        if (active.current !== context) return
        const proof = await prepareSafeContinuation(target, detail, useSessionStore.getState().authorPreferences, raw, maps.map(m => m.parsedAt))
        if (active.current !== context) return
        const tuple = JSON.parse(core); tuple[1] = proof.operation
        preparedCore = JSON.stringify(tuple); author = proof.author; revision = proof.revision
      }
      let value = wire?.context === context ? wire : null
      if (!value) {
        const r = await window.api.authorHandoff({ action: 'publication', context, core: preparedCore,
          metadata: { author, expected_revision: revision, confirmation_request_id: null },
          confirmation, newIntent: false, sessionIdentity, targetGeneration })
        if (active.current !== context) return
        if (!r.ok) { setError(r.error); return }
        value = { context, ...r.value }
        setWire(value)
        setNameRequest(value.acknowledgement === 'name' ? value.request : null)
        if (value.share) setShare(value.share)
      }
      if (value.share?.accepted) return
      if (value.token.length > 6000) throw new Error('The share is too long for Discord. Shorten the notes.')
      // Clipboard writes happen only for this deliberate Copy action.
      await navigator.clipboard.writeText(value.token)
      if (active.current !== context) return
      if (value.share) {
        const marked = await window.api.authorHandoff({ action: 'share-copied', context, sessionIdentity,
          shareId: value.share.id, draftRevision: value.share.draftRevision })
        if (active.current !== context) return
        if (!marked.ok) { setError(marked.error); return }
        setShare(marked.value)
      }
    } catch (e) { if (active.current === context) setError(e instanceof Error ? e.message : 'Could not prepare the share.') }
    finally { if (active.current === context) setBusy(false) }
  }
  if (!enabled) return null
  const complete = share?.status === 'complete'
  const accepted = share?.accepted === true
  const currentWire = wire?.context === context ? wire : null
  const canChoose = !target || target.state === 'ready'
  const copy = shareCopyPresentation(share, core, selected?.confirmed ? selected.name : name, target)
  const fields = <Stack gap="xs">
    <Group justify="space-between"><Text size="sm" fw={600}>Public name</Text>
      <Button size="compact-xs" variant="subtle" disabled={busy} onClick={onManage}>Manage public names</Button></Group>
    <Select size="xs" label="Use a saved name" value={target && target.state !== 'legacy_review' ? target.registrationId : selection ?? ''}
      disabled={!!target || busy || accepted} allowDeselect={false} onChange={v => setSelection(v || null)}
      data={[{ value: '', label: 'Enter a public name' }, ...preferences.registrations.map(r => ({ value: r.registrationId,
        label: r.name + (r.confirmed ? '' : ' (needs verification)'), disabled: !r.confirmed }))]} />
    {!target && !selection && <TextInput size="xs" label="Public name" value={name} maxLength={256}
      disabled={busy || accepted} onChange={e => setName(e.currentTarget.value)} />}
    {!target && !selected?.confirmed && !complete && <>
      <Text size="xs" c="dimmed">Verify this name once using the private code sent in Discord.</Text>
      <Text size="xs" c="dimmed">{PUBLIC_NAME_RETENTION_NOTICE}</Text>
      <Text size="xs" c="dimmed">People in the Discord channel can see who pastes a share before the bot removes it.</Text>
    </>}
    {selected?.confirmed && <Text size="xs" c="dimmed">Name verified.</Text>}
  </Stack>
  return <Stack gap="xs">
    {fieldContainer && createPortal(fields, fieldContainer)}
    {!complete && <Text size="sm">{target && target.state !== 'legacy_review'
      ? `${target.operation === 'evidence' ? 'Adding to' : 'Replacing'}: ${target.title || 'Saved strategy'}`
      : target ? 'Choose Continue in the Strategy Browser to review this older saved target.' : 'Creates a new strategy and Discord card.'}</Text>}
    {error && <Alert ref={errorElement} color="orange" p="xs" role="alert" title="Sharing needs attention">{error}</Alert>}
    {share && sessionIdentity && <AuthorOperationPanel context={context} share={share} sessionIdentity={sessionIdentity} onChange={setShare} />}
    {!accepted && share?.status !== 'restore_review' && <Button size="xs" variant="light" disabled={!ready || blocked || !canChoose || !core}
      loading={busy} onClick={() => void prepareAndCopy()}>
      {copy.label === 'Copy to Discord' && currentWire && currentWire.token.length > 2000 ? 'Copy for /wledger-share' : copy.label}
    </Button>}
    {copy.pasteHint && <Text size="xs" c="dimmed">Paste it in the sharing channel. You can close this window; the app keeps checking.</Text>}
    {nameRequest && !selected?.confirmed &&
      <AuthorConfirmationPanel key={nameRequest.request_id} context={context} firstNameVerification
        expectedName={share?.author.name ?? name}
        onAccepted={receipt => { const registration = receipt.registrations.find(r => r.name === (share?.author.name ?? name));
          if (registration) setSelection(registration.registration_id) }}
        request={nameRequest} action="confirmation" onCancel={onClose} detailsContainer={confirmationContainer} />}
    {complete && !target && !selected?.confirmed && !nameRequest && <Text size="xs" c="dimmed">
      Your share is published. To verify its name on this device, open Manage public names and choose Recover.
    </Text>}
    <Button size="xs" variant={complete ? 'filled' : 'subtle'} onClick={onClose}>Close</Button>
  </Stack>
}
