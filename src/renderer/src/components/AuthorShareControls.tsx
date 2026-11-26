import { ActionIcon, Alert, Badge, Box, Button, Combobox, Divider, Group, InputBase, Loader, Stack, Text, useCombobox } from '@mantine/core'
import { IconAlertTriangle, IconCheck, IconCopy, IconSettings } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { COVENS_SHARE_UNAVAILABLE } from '../../../shared/authorHandoff';
import { createPortal } from 'react-dom'
import type { AuthorContext, AuthorResult, AuthorResults } from '../../../shared/authorHandoff'
import { shareCopyPresentation, shareStatusText, type DurableShareView } from '../../../shared/durableShare'
import { invalidateAuthorEpoch } from '../../../shared/authorRecognition'
import { normalizePublicAuthorName, PUBLIC_NAME_RETENTION_NOTICE, SHARE_STATUS_RETENTION_NOTICE } from '../../../shared/authorNames'
import { COLOR, FONT } from '../utils/uiTokens'
import { useSessionStore } from '../store/useSessionStore'
import { AuthorConfirmationPanel } from './AuthorConfirmationPanel'
import { migrateStrategyTarget } from '../../../shared/strategyTarget'
import { safeStrategyReader } from '../utils/safeStrategyReader'
import { prepareSafeContinuation, refreshSafeAuthorState } from '../utils/safeStrategyTarget'
import { defaultShareConfirmation } from '../../../shared/shareIntent'
import { AuthorOperationPanel } from './AuthorOperationPanel'
import { observeShareWindowPresentation, type ShareWindowPresentation } from '../utils/shareWindowPresentation'
import { ShareStorageRecovery } from './ShareStorageRecovery'

function ShareStatusHeading({ children, icon, color }: { children: ReactNode; icon: ReactNode; color?: string }) {
  return <Box style={{ position: 'relative', maxWidth: '100%' }}>
    <Box aria-hidden style={{ position: 'absolute', right: 'calc(100% + 7px)', top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>{icon}</Box>
    <Text data-share-status-title fw={600} c={color} ta="center">{children}</Text>
  </Box>
}

export function AuthorShareControls({ core, raw, blocked, restorationError, onManage, onClose, fieldContainer, enabled, onTrackingChange, onPostedChange, onArchivedChange, onCompletedChange, onPresentationChange, onStorageRecovered }: {
  core: string; raw: string; blocked: boolean; onManage: (initialAction?: 'recover') => void; fieldContainer: HTMLElement | null; enabled: boolean
  restorationError?: string | null
  onTrackingChange: (pending: boolean) => void; onClose: () => void
  onPostedChange: (posted: boolean) => void
  onArchivedChange: (archived: boolean) => void
  onCompletedChange: (completed: boolean) => void
  onPresentationChange: (presentation: ShareWindowPresentation | null) => void
  onStorageRecovered: () => void
}) {
  const preferences = useSessionStore(s => s.authorPreferences)
  const settings = useSessionStore(s => s.settings)
  const maps = useSessionStore(s => s.maps)
  const target = useMemo(() => migrateStrategyTarget(settings as unknown as Record<string, unknown>), [settings])
  const targetGeneration = target && target.state !== 'legacy_review' ? target.generation : null
  const sessionId = useSessionStore(s => `${s.activeSessionId ?? 'working'}:${s.sessionNonce}`)
  const sessionIdentity = useSessionStore(s => s.currentSessionIdentity)
  const [selection, setSelection] = useState<string | null>(preferences.defaultRegistrationId)
  const [newName, setNewName] = useState(!preferences.registrations.some(r => r.confirmed))
  const [name, setName] = useState('')
  const names = useCombobox({ onDropdownClose: () => names.resetSelectedOption() })
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storageRecovery, setStorageRecovery] = useState(false)
  const [recoveryWarning, setRecoveryWarning] = useState<AuthorContext | null>(null)
  const [recoveryGeneration, setRecoveryGeneration] = useState(0)
  const [observationError, setObservationError] = useState<string | null>(null)
  const visibleError = error ?? observationError ?? restorationError ?? null
  const errorElement = useRef<HTMLDivElement | null>(null)
  const [wire, setWire] = useState<({ context: AuthorContext } & AuthorResults['publication']) | null>(null)
  const [observedShare, setShare] = useState<DurableShareView | null>(null)
  const [nameRequest, setNameRequest] = useState<AuthorResults['resume-name']>(null)
  const [verifiedHere, setVerifiedHere] = useState<string | null>(null)
  const restoredNameFor = useRef<string | null>(null)
  const shownShareScope = useRef<{ sessionIdentity: string | null; targetGeneration: string | null } | null>(null)
  const share = shownShareScope.current?.sessionIdentity === sessionIdentity
    && shownShareScope.current?.targetGeneration === targetGeneration ? observedShare : null
  const windowPresentation = useRef<ShareWindowPresentation | null>(null)
  const selected = preferences.registrations.find(r => r.registrationId ===
    (target && target.state !== 'legacy_review' ? target.registrationId : selection))
  const confirmation = defaultShareConfirmation(!!target, !!selected?.confirmed)
  // A completed target's bookkeeping may change while the same share stays open.
  const context: AuthorContext = useMemo(() => ({ sessionId, generation: crypto.randomUUID() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, core, selection, name, confirmation, enabled, targetGeneration, recoveryGeneration])
  const active = useRef(context)
  active.current = context
  const currentTarget = useRef(target)
  currentTarget.current = target
  const shareScope = JSON.stringify([sessionIdentity, targetGeneration])
  windowPresentation.current = observeShareWindowPresentation(windowPresentation.current, shareScope, share)
  const presentation = windowPresentation.current
  const showFailure = (result: Extract<AuthorResult<keyof AuthorResults>, { ok: false }>) => {
    setError(result.error)
    setStorageRecovery(result.storageCode === 'damaged' || result.storageCode === 'recovery_required')
  }
  useEffect(() => { if (visibleError) errorElement.current?.scrollIntoView({ block: 'nearest' }) }, [visibleError])
  useEffect(() => { onTrackingChange(busy || share?.accepted === true); return () => onTrackingChange(false) }, [busy, share?.accepted, onTrackingChange])
  useEffect(() => { onPostedChange(share?.accepted === true); return () => onPostedChange(false) }, [share?.accepted, onPostedChange])
  useEffect(() => { onArchivedChange(presentation.compact); return () => onArchivedChange(false) }, [presentation.compact, onArchivedChange])
  useEffect(() => { onPresentationChange(presentation) }, [presentation, onPresentationChange])
  useEffect(() => () => onPresentationChange(null), [onPresentationChange])
  useEffect(() => { onCompletedChange(share?.status === 'complete'); return () => onCompletedChange(false) }, [share?.status, onCompletedChange])
  useEffect(() => { setVerifiedHere(null) }, [sessionIdentity])
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    const current = () => !stopped && active.current === context
    const previousScope = shownShareScope.current
    if (!previousScope || previousScope.sessionIdentity !== sessionIdentity || previousScope.targetGeneration !== targetGeneration) {
      setShare(null); windowPresentation.current = null
    }
    shownShareScope.current = { sessionIdentity, targetGeneration }
    setReady(false); setWire(null); setNameRequest(null); setError(null); setObservationError(null); setBusy(false)
    setStorageRecovery(false); setRecoveryWarning(null)
    void (async () => {
      const activated = await window.api.authorHandoff({ action: 'activate', context })
      if (!current()) return
      if (!activated.ok) { showFailure(activated); return }
      if (sessionIdentity) {
        const result = await window.api.authorHandoff({ action: 'share-result', context, sessionIdentity, targetGeneration })
        if (!current()) return
        if (!result.ok) { showFailure(result); return }
        setShare(result.value)
        if (result.value && !result.value.archived) {
          const refreshed = await window.api.authorHandoff({ action: 'share-refresh', shareId: result.value.id })
          if (!current()) return
          if (!refreshed.ok) { showFailure(refreshed); return }
        }
        if (result.value && !result.value.archived && !currentTarget.current) {
          const resumed = await window.api.authorHandoff({ action: 'resume-name', context, sessionIdentity })
          if (!current()) return
          if (!resumed.ok) { showFailure(resumed); return }
          setNameRequest(resumed.value)
        }
        if (result.value && !result.value.archived && restoredNameFor.current !== sessionIdentity && !currentTarget.current) {
          restoredNameFor.current = sessionIdentity
          const restoredName = result.value.author.name
          const registration = preferences.registrations.find(r => r.confirmed && r.name === restoredName)
          if (registration) { setSelection(registration.registrationId); setNewName(false) }
          else { setSelection(null); setNewName(true); setName(result.value.author.name) }
        }
      }
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
  const prepareAndCopy = async (recoveryConfirmed = false) => {
    setBusy(true); setError(null)
    try {
      if (!sessionIdentity) throw new Error('The selected session is still loading. Try again when it is ready.')
      let author = selected?.confirmed ? { name: selected.name, registration_id: selected.registrationId }
        : { name: normalizePublicAuthorName(name).name, registration_id: null }
      if (JSON.parse(core)[0] === 8) {
        const capability = await window.api.authorHandoff({ action: 'share-formats' })
        if (!capability.ok || !capability.value) throw new Error(COVENS_SHARE_UNAVAILABLE)
        if (active.current !== context) return
      }
      let preparedCore = core, revision: number | null = null
      if (target) {
        if (target.state !== 'ready') throw new Error('Choose Continue from the Strategy Browser for your next update.')
        await refreshSafeAuthorState()
        if (active.current !== context) return
        const detail = await safeStrategyReader.detail({ scope: 'current', snapshot_key: null, id: target.id,
          revision: target.revision, read_version: target.generation }, true)
        if (active.current !== context) return
        const proof = await prepareSafeContinuation(target, detail, useSessionStore.getState().authorPreferences, raw, maps.map(m => m.parsedAt), JSON.parse(core)[12])
        if (active.current !== context) return
        const tuple = JSON.parse(core); tuple[1] = proof.operation
        preparedCore = JSON.stringify(tuple); author = proof.author; revision = proof.revision
      }
      let value = wire?.context === context ? wire : null
      if (!value) {
        const r = await window.api.authorHandoff({ action: 'publication', context, core: preparedCore,
          metadata: { author, expected_revision: revision, confirmation_request_id: null },
          confirmation, newIntent: false, sessionIdentity, targetGeneration,
          ...(recoveryConfirmed ? { recoveryConfirmed: true as const } : {}) })
        if (active.current !== context) return
        if (!r.ok) {
          if (r.recoveryConfirmationRequired) { setRecoveryWarning(context); setError(null) }
          else showFailure(r)
          return
        }
        setRecoveryWarning(null)
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
        if (!marked.ok) { showFailure(marked); return }
        setShare(marked.value)
      }
    } catch (e) { if (active.current === context) setError(e instanceof Error ? e.message : 'Could not prepare the share.') }
    finally { if (active.current === context) setBusy(false) }
  }
  if (!enabled) return null
  const complete = share?.status === 'complete'
  const accepted = share?.accepted === true
  const displayedName = accepted ? presentation.snapshot?.author.name ?? '' : selected?.name ?? (newName ? name : '')
  const displayedVerified = selected?.confirmed && (!accepted || displayedName === selected.name)
  const currentWire = wire?.context === context ? wire : null
  const canChoose = !target || target.state === 'ready'
  const copy = shareCopyPresentation(share, core, selected?.confirmed ? selected.name : name, target)
  const changed = copy.label === 'Copy updated share'
  const checking = share?.status === 'checking'
  const needsReview = share?.status === 'restore_review'
  const verifyName = complete && !!nameRequest && !selected?.confirmed && !storageRecovery
  const needsRecoveryConfirmation = recoveryWarning === context
  const showCopy = !accepted && !checking && !needsReview && !observationError && !storageRecovery && !needsRecoveryConfirmation
  const copyBlocked = !ready || blocked || !canChoose || !core || (selected != null && !selected.confirmed) || (!target && !selected && !newName)
  const resultDescription = share?.operation.kind === 'evidence' ? 'Your run is on the strategy’s Discord card.'
    : share?.operation.kind === 'replace' ? 'Your strategy and its Discord card are updated.' : 'Your card is in Discord.'
  const fields = <Stack gap={6}>
    <Text fw={600} c="dimmed" style={{ fontSize: FONT.small, letterSpacing: '.08em' }}>POSTING AS</Text>
    <Group gap="xs" wrap="nowrap" align="center">
      <Combobox store={names} withinPortal={false} onOptionSubmit={value => {
        if (accepted || target || busy) return
        setSelection(value === '__new__' ? null : value); setNewName(value === '__new__'); names.closeDropdown()
      }}>
        <Combobox.Target withKeyboardNavigation={!accepted && !target && !busy}>
          <InputBase size="sm" aria-label="Posting as" style={{ flex: 1 }}
            styles={{ input: { background: COLOR.bgInset, color: COLOR.text } }}
            rightSectionPointerEvents="all"
            rightSectionWidth={displayedVerified ? 112 : 32}
            value={displayedName} maxLength={256} placeholder={newName ? 'Your public name' : 'Choose a saved name'}
            readOnly={!!selected || !newName || !!target || accepted} disabled={busy && !accepted}
            onChange={e => setName(e.currentTarget.value)}
            onClick={() => { if (!accepted && !target && !busy && (selected || !newName)) names.toggleDropdown() }}
            rightSection={<Group gap={5} wrap="nowrap">
              {displayedVerified && <Badge size="sm" color="green" variant="light" tt="none">Verified</Badge>}
              <ActionIcon size="sm" variant="subtle" aria-label="Choose a public name"
                disabled={!!target || busy || accepted} onClick={e => { e.stopPropagation(); names.toggleDropdown() }}>
                <Combobox.Chevron />
              </ActionIcon>
            </Group>} />
        </Combobox.Target>
        <Combobox.Dropdown styles={{ dropdown: { background: COLOR.bgInset } }}><Combobox.Options>
          {preferences.registrations.filter(r => r.confirmed).map(r => <Combobox.Option key={r.registrationId} value={r.registrationId}
            active={selection === r.registrationId} className="share-name-option">
            <Group gap={6} wrap="wrap"><Text size="xs" style={{ flex: 1 }}>{r.name}</Text>
              {preferences.defaultRegistrationId === r.registrationId && <Badge size="sm" color="gray" variant="light" tt="none">Default</Badge>}
              <Badge size="sm" color="green" variant="light" tt="none">Verified</Badge>
            </Group>
          </Combobox.Option>)}
          {preferences.registrations.some(r => r.confirmed) && <Divider my={4} color={COLOR.border} />}
          <Combobox.Option value="__new__" className="share-name-option" style={{ color: COLOR.accent }}>+ Use a new name</Combobox.Option>
        </Combobox.Options></Combobox.Dropdown>
      </Combobox>
      <ActionIcon size="lg" variant="default" aria-label="Public names" disabled={busy} onClick={() => onManage()}>
        <IconSettings size={16} />
      </ActionIcon>
    </Group>
    {!target && newName && !selected && !complete && <Stack gap={4} p="xs"
      style={{ background: COLOR.bgDeep, border: `1px solid ${COLOR.borderSoft}`, borderRadius: 6 }}>
      <Text size="xs" fw={600}>New names are verified once</Text>
      <Text size="xs" c="dimmed">After your first post, the bot sends a private code. Paste it here to save this name on this PC.</Text>
      <details><summary style={{ color: COLOR.accent, cursor: 'pointer', fontSize: FONT.small }}>What is stored</summary>
        <Text size="xs" c="dimmed" mt={6}>{PUBLIC_NAME_RETENTION_NOTICE}</Text>
        <Text size="xs" c="dimmed" mt={6}>{SHARE_STATUS_RETENTION_NOTICE}</Text>
        <Text size="xs" c="dimmed" mt={6}>People in the Discord channel can see who pastes a share before the bot removes it.</Text>
      </details>
    </Stack>}
    {selected && !selected.confirmed && <Group gap={4}>
      <Text size="xs" c="orange">This saved name needs verification.</Text>
      <Button size="compact-xs" variant="subtle" onClick={() => onManage('recover')}>Recover your name</Button>
    </Group>}
  </Stack>
  return <Stack gap="xs">
    {fieldContainer && createPortal(fields, fieldContainer)}
    {visibleError && <Alert ref={errorElement} color="orange" p="xs" role="alert" title="Sharing needs attention">{visibleError}</Alert>}
    {storageRecovery && <ShareStorageRecovery key={context.generation} context={context} onBusyChange={setBusy}
      onRecovered={() => {
        if (active.current !== context) return
        setReady(false); setWire(null); setShare(null); setNameRequest(null); setVerifiedHere(null)
        setError(null); setObservationError(null); setStorageRecovery(false); setRecoveryWarning(null)
        restoredNameFor.current = null; shownShareScope.current = null; windowPresentation.current = null
        setRecoveryGeneration(generation => generation + 1)
        onStorageRecovered()
      }} />}
    {needsRecoveryConfirmation && <Alert color="orange" p="sm" role="alert" title="Review this older session">
      <Stack gap="xs">
        <Text size="xs">This session is from before the recovery. If you already shared it, use Continue in the Strategy Browser. Share as new anyway?</Text>
        <Group gap="xs" justify="center">
          <Button size="xs" loading={busy} disabled={copyBlocked} onClick={() => void prepareAndCopy(true)}>Share as new anyway</Button>
          <Button size="xs" variant="subtle" c={COLOR.textDim} disabled={busy}
            onClick={() => { setRecoveryWarning(null); setError(null) }}>Back</Button>
        </Group>
      </Stack>
    </Alert>}
    {share && sessionIdentity && !storageRecovery && <AuthorOperationPanel context={context} share={share} sessionIdentity={sessionIdentity}
      onChange={setShare} onError={setObservationError}
      onStorageError={code => setStorageRecovery(code === 'damaged' || code === 'recovery_required')} observeOnly />}
    {observationError || storageRecovery ? null : complete ? <Stack gap={5} p="sm" role="status" align="center" style={{ background: COLOR.tintGreenBg, borderRadius: 6, textAlign: 'center' }}>
      <ShareStatusHeading icon={<IconCheck size={19} color={COLOR.profit} />} color={COLOR.profit}>{shareStatusText(share)}</ShareStatusHeading>
      <Text size="xs" c="dimmed" maw={300}>{verifiedHere ? `${verifiedHere} is verified on this PC.` : resultDescription}</Text>
    </Stack> : checking ? <Stack gap={5} p="sm" role="status" align="center" style={{ background: COLOR.tintGoldBg, borderRadius: 6, textAlign: 'center' }}>
      <ShareStatusHeading icon={<Loader size={19} color={COLOR.orange} />} color={COLOR.orange}>Checking share status…</ShareStatusHeading>
      <Text size="xs" c="dimmed" maw={300}>Can&apos;t reach the server right now. Retrying…</Text>
    </Stack> : needsReview ? <Alert color="orange" p="sm" role="status">{shareStatusText(share!)}</Alert>
      : accepted ? <Stack gap={5} p="sm" role="status" align="center" style={{ background: COLOR.bgHover, borderRadius: 6, textAlign: 'center' }}>
      <ShareStatusHeading icon={<Loader size={19} color={COLOR.accent} />}>Posted, updating Discord…</ShareStatusHeading>
      <Text size="xs" c="dimmed" maw={300}>This usually takes a few seconds.<br />You can close this window.</Text>
    </Stack> : changed ? <Stack gap={5} p="sm" role="status" align="center" style={{ background: COLOR.tintGoldBg, borderRadius: 6, textAlign: 'center' }}>
        <ShareStatusHeading icon={<IconAlertTriangle size={19} color={COLOR.orange} />} color={COLOR.orange}>Changed after copying</ShareStatusHeading>
        <Text size="xs" c="dimmed" maw={300}>Copy and post this version.<br />Already posted the old one? Use Continue to change it.</Text>
      </Stack> : copy.pasteHint ? <Stack gap={5} p="sm" role="status" align="center" style={{ background: COLOR.bgHover, borderRadius: 6, textAlign: 'center' }}>
        <ShareStatusHeading icon={<IconCopy size={19} />}>Copied</ShareStatusHeading>
        <Text size="xs" c="dimmed" maw={300}>Paste it in the sharing channel.<br />You can close this window; the app keeps checking.</Text>
      </Stack> : null}
    {showCopy && <Button size="sm" variant={changed ? 'filled' : copy.pasteHint ? 'default' : 'filled'}
      styles={copy.pasteHint && !changed ? { root: { background: COLOR.bgInset } } : undefined}
      leftSection={copy.pasteHint ? undefined : <IconCopy size={17} />}
      disabled={copyBlocked}
      loading={busy} onClick={() => void prepareAndCopy()}>
      {copy.label === 'Copy to Discord' && currentWire && currentWire.token.length > 2000 ? 'Copy for /wledger-share' : copy.label}
    </Button>}
    {verifyName && nameRequest &&
      <AuthorConfirmationPanel key={nameRequest.request_id} context={context} firstNameVerification
        expectedName={share?.author?.name ?? name}
        onAccepted={receipt => { const registration = receipt.registrations.find(r => r.name === (share?.author?.name ?? name));
          if (registration) { setVerifiedHere(registration.name); setSelection(registration.registration_id); setNewName(false) } }}
        request={nameRequest} action="confirmation" onCancel={onClose} />}
    {complete && !share?.archived && !target && !selected?.confirmed && !nameRequest && <Text size="xs" c="dimmed">
      Your share is published. <Button size="compact-xs" variant="subtle" onClick={() => onManage('recover')}>Recover your name</Button> to verify it on this PC.
    </Text>}
    <Button size="sm" variant={complete && !verifyName ? 'filled' : 'subtle'} c={complete && !verifyName ? undefined : COLOR.textDim} onClick={onClose}>Close</Button>
  </Stack>
}
