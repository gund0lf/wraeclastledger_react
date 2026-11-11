import { Alert, Button, Group, Stack, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import type { AuthorContext } from '../../../shared/authorHandoff'
import { COLOR } from '../utils/uiTokens'

/** Recovery is a deliberate local action; unreadable files are never adopted. */
export function ShareStorageRecovery({ context, onBusyChange, onRecovered }: {
  context: AuthorContext
  onBusyChange: (busy: boolean) => void
  onRecovered: () => void
}) {
  const [recoveryId, setRecoveryId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(true)
  const inFlight = useRef(false)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  const run = async (confirm: boolean) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true); onBusyChange(true); setError(null)
    try {
      if (!confirm) {
        const result = await window.api.authorHandoff({ action: 'storage-recovery-preview', context })
        if (!active.current) return
        if (!result.ok) { setError(result.error); return }
        setRecoveryId(result.value.recoveryId)
      } else if (recoveryId) {
        const result = await window.api.authorHandoff({ action: 'storage-recovery-confirm', context,
          recoveryId, confirmed: true })
        if (!active.current) return
        if (!result.ok) { setError(result.error); setRecoveryId(null); return }
        onRecovered()
      }
    } catch {
      if (active.current) setError('Could not start a new sharing history. Your old files are kept. Close and reopen Share to review the current state.')
    } finally {
      inFlight.current = false
      if (active.current) { setBusy(false); onBusyChange(false) }
    }
  }
  return <Stack gap="xs">
    {error && <Alert color="orange" p="xs" role="alert">{error}</Alert>}
    {recoveryId ? <Stack gap="xs" p="sm" role="group" aria-label="Confirm local sharing recovery"
      style={{ background: COLOR.tintGoldBg, borderRadius: 6 }}>
      <Text size="sm" fw={600}>Start a new sharing history on this PC?</Text>
      <Text size="xs">This starts an empty sharing history and moves the old files aside. Nothing is deleted. Shares that were still waiting for a result can no longer be tracked from this PC. Posted strategies and Discord cards are not changed.</Text>
      <Text size="xs">Sessions from before this reset will ask before being shared as new; if one was already shared, use Continue in the Strategy Browser.</Text>
      <Text size="xs">Unfinished name verification will need to be restarted.</Text>
      <Group gap="xs" justify="center">
        <Button size="xs" loading={busy} onClick={() => void run(true)}>Start new history</Button>
        <Button size="xs" variant="subtle" c={COLOR.textDim} disabled={busy}
          onClick={() => { setRecoveryId(null); setError(null) }}>Cancel</Button>
      </Group>
    </Stack> : <Button size="sm" variant="default" loading={busy} onClick={() => void run(false)}>Start new sharing history…</Button>}
  </Stack>
}
