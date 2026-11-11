import { Alert, Button, Stack, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { shareStatusText } from '../../../shared/durableShare'
import { useUIStore } from '../store/useUIStore'
import { decodeDiscordSharePayload } from '../utils/discordShareWire'
import { COLOR } from '../utils/uiTokens'

/** A brief result notice, not another confirmation or tracking control. */
export function ShareResultNotice() {
  const [notice, setNotice] = useState<{ title: string; strategy: string | null } | null>(null)
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, hide: ReturnType<typeof setTimeout> | undefined
    const shown = new Set<string>()
    const poll = async () => {
      try {
        const result = await window.api.authorHandoff({ action: 'share-results' })
        if (stopped || !result.ok) return
        const next = result.value.find(v => v.status === 'complete' && !v.noticed && !shown.has(v.id))
        if (!next) return
        shown.add(next.id)
        const strategy = next.core ? decodeDiscordSharePayload(next.core)?.strategyName.trim() || null : null
        setNotice({ title: next.operation.kind === 'publication' ? 'Strategy published' : shareStatusText(next), strategy })
        clearTimeout(hide)
        hide = setTimeout(() => { if (!stopped) setNotice(null) }, 6000)
        await window.api.authorHandoff({ action: 'share-noticed', shareId: next.id })
      } finally { if (!stopped) timer = setTimeout(() => { void poll().catch(() => undefined) }, 3000) }
    }
    void poll().catch(() => undefined)
    return () => { stopped = true; clearTimeout(timer); clearTimeout(hide) }
  }, [])
  return notice ? <Alert color="teal" title={notice.title} role="status" withCloseButton closeButtonLabel="Dismiss share result"
    onClose={() => setNotice(null)} styles={{ title: { color: COLOR.text } }}
    style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 400, width: 360, maxWidth: 'calc(100vw - 32px)',
      backgroundColor: COLOR.bgRaised, border: `1px solid ${COLOR.borderSoft}`, borderLeft: `4px solid ${COLOR.profit}` }}>
    <Stack gap={8}>
      <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>{notice.strategy ? `${notice.strategy} · Your card is in Discord.` : 'Your card is in Discord.'}</Text>
      <Button size="compact-sm" variant="transparent" p={0} style={{ alignSelf: 'flex-start' }} onClick={() => {
        useUIStore.getState().requestPanel('strategy-browser')
        setNotice(null)
      }}>Show in Strategy Browser</Button>
    </Stack>
  </Alert> : null
}
