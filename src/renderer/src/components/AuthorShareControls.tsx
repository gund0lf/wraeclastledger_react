import { Alert, Button, Checkbox, CopyButton, Group, Select, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AuthorContext, PreparedAuthorRequest } from '../../../shared/authorHandoff'
import { invalidateAuthorEpoch } from '../../../shared/authorRecognition'
import { normalizePublicAuthorName } from '../../../shared/authorNames'
import { useSessionStore } from '../store/useSessionStore'
import { AuthorConfirmationPanel } from './AuthorConfirmationPanel'
import { migrateStrategyTarget, acknowledgeStrategyTarget } from '../../../shared/strategyTarget'
import { safeStrategyReader } from '../utils/safeStrategyReader'
import { prepareSafeContinuation, refreshSafeAuthorState } from '../utils/safeStrategyTarget'
import { SafeTargetReview } from './SafeTargetReview'

export function AuthorShareControls({ core, raw, blocked, onManage, fieldContainer, enabled }: {
  core: string; raw: string; blocked: boolean; onManage: () => void; fieldContainer: HTMLElement | null; enabled: boolean
}) {
  const preferences = useSessionStore((s) => s.authorPreferences)
  const settings = useSessionStore((s) => s.settings)
  const maps = useSessionStore((s) => s.maps)
  const target = useMemo(() => migrateStrategyTarget(settings as unknown as Record<string, unknown>), [settings])
  const targetKey = JSON.stringify(target)
  const sessionId = useSessionStore((s) => `${s.activeSessionId ?? 'working'}:${s.sessionNonce}`)
  const [selection, setSelection] = useState<string | null>(preferences.defaultRegistrationId)
  const [name, setName] = useState('')
  const [confirmation, setConfirmation] = useState(true)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestGeneration, setRequestGeneration] = useState(0)
  const [dismissalNotice, setDismissalNotice] = useState<string | null>(null)
  const [wire, setWire] = useState<{ context: AuthorContext; token: string; request: PreparedAuthorRequest | null } | null>(null)
  const context: AuthorContext = useMemo(() => ({ sessionId, generation: crypto.randomUUID() }),
    // Any edited submission input invalidates the previous confirmation context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, core, selection, name, confirmation, enabled, requestGeneration, targetKey])
  const active = useRef(context)
  active.current = context
  const selected = preferences.registrations.find((r) => r.registrationId === (target && target.state !== 'legacy_review' ? target.registrationId : selection))
  const usableSelection = target ? target.state === 'ready' && !!selected?.confirmed : selection === null || !!selected?.confirmed
  useEffect(() => {
    if (!enabled) return
    let stop = false
    setReady(false); setWire(null); setError(null); setBusy(false)
    void (async () => {
      const a = await window.api.authorHandoff({ action: 'activate', context })
      if (stop) return
      if (!a.ok) { setError(a.error); return }
      setReady(true)
      const state = await window.api.authorHandoff({ action: 'state' })
      if (stop) return
      if (state.ok) {
        const store = useSessionStore.getState()
        store.setAuthorPreferences(invalidateAuthorEpoch(store.authorPreferences, state.value.epoch))
        if (!state.value.author_actions_available) setError('Author confirmation is unavailable. You can prepare a share without local confirmation and recover names later.')
      } else setError('Local confirmation is unavailable. Prepare without confirmation to share offline; recover your names later.')
    })().catch(() => { if (!stop) setError('Could not check the author service. You can retry or prepare without local confirmation.') })
    return () => { stop = true; void window.api.authorHandoff({ action: 'activate', context: null }) }
  }, [context, enabled])
  const prepare = async () => {
    setBusy(true); setError(null); setDismissalNotice(null)
    try {
      let author = selected && selected.confirmed ? { name: selected.name, registration_id: selected.registrationId }
        : { name: normalizePublicAuthorName(name).name, registration_id: null }
      let preparedCore = core, revision: number | null = null
      if (target) {
        if (target.state !== 'ready') throw new Error('Review the saved strategy target first.')
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
      const r = await window.api.authorHandoff({ action: 'publication', context, core: preparedCore,
        metadata: { author, expected_revision: revision, confirmation_request_id: null }, confirmation })
      if (active.current !== context) return
      if (!r.ok) { setError(r.error); return }
      setWire({ context, ...r.value })
    } catch (e) { if (active.current === context) setError(e instanceof Error ? e.message : 'Could not prepare the share.') }
    finally { if (active.current === context) setBusy(false) }
  }
  const currentWire = wire?.context === context ? wire : null
  if (!enabled) return null
  const fields = <Stack gap="xs">
    <Group justify="space-between"><Text size="sm" fw={600}>Public author name</Text>
      <Button size="compact-xs" variant="subtle" onClick={onManage}>Manage public names</Button></Group>
    <Text size="xs" c="dimmed">This name is public on your strategies. Discord confirms that it belongs to you. Copying a share does not confirm it.</Text>
    <Select size="xs" label="Use a saved name" value={target && target.state !== 'legacy_review' ? target.registrationId : selection ?? ''} disabled={!!target} allowDeselect={false} onChange={(v) => setSelection(v || null)}
      data={[{ value: '', label: 'Enter a public name' }, ...preferences.registrations.map((r) => ({ value: r.registrationId,
        label: r.name + (r.confirmed ? '' : ' (needs confirmation)'), disabled: !r.confirmed }))]} />
    {!target && !selection && <TextInput size="xs" label="Public name" value={name} maxLength={256} onChange={(e) => setName(e.currentTarget.value)} />}
    <Checkbox size="xs" label="Prepare local name confirmation with this share" checked={confirmation}
      onChange={(e) => setConfirmation(e.currentTarget.checked)} />
    {!confirmation && <Text size="xs" c="dimmed">After sharing, use Recover in Manage public names to confirm this name on this installation.</Text>}
  </Stack>
  return <Stack gap="xs">
    {fieldContainer && createPortal(fields, fieldContainer)}
    {target && <SafeTargetReview target={target} />}
    {error && <Alert color="orange" p="xs">{error}</Alert>}
    {dismissalNotice && <Alert color="orange" p="xs">{dismissalNotice}</Alert>}
    <Button size="xs" variant="light" disabled={!ready || blocked || !usableSelection || !core} loading={busy} onClick={() => void prepare()}>
      Prepare Discord share
    </Button>
    {currentWire && <>
      {currentWire.token.length > 6000 ? <Alert color="red">The share exceeds the Discord command limit. Shorten the notes.</Alert>
        : <CopyButton value={currentWire.token}>{({ copied, copy }) => <Button size="xs" variant="light"
          disabled={blocked || !usableSelection} onClick={copy}>
          {copied ? 'Share copied' : currentWire.token.length > 2000 ? 'Copy for /wledger-share' : 'Copy to Discord'}
        </Button>}</CopyButton>}
      {currentWire.request && <AuthorConfirmationPanel key={currentWire.request.request_id} context={context}
        onAccepted={(receipt) => {
          if (active.current !== context || !target || target.state !== 'ready' || receipt.outcome.status !== 'published') return
          const store = useSessionStore.getState()
          if (`${store.activeSessionId ?? 'working'}:${store.sessionNonce}` !== context.sessionId ||
            !receipt.registrations.some(r => r.registration_id === target.registrationId)) return
          const current = migrateStrategyTarget(store.settings as unknown as Record<string, unknown>)
          const next = acknowledgeStrategyTarget(current, target.generation, receipt.outcome.strategy_id, receipt.outcome.revision)
          if (next !== current) store.updateSetting('strategyTarget', next)
        }}
        request={currentWire.request} action="confirmation" onCancel={() => {
          setWire(null); setReady(false); setRequestGeneration((v) => v + 1)
          void window.api.authorHandoff({ action: 'cancel', context, requestId: currentWire.request!.request_id })
            .then((r) => { if (!r.ok) setDismissalNotice(r.error) })
            .catch(() => setDismissalNotice('Closed locally. Server cancellation could not be confirmed; the old request may remain active until it expires.'))
        }} />}
    </>}
  </Stack>
}
