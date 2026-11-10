import { Alert } from '@mantine/core'
import { useEffect, useState } from 'react'
import { shareStatusText } from '../../../shared/durableShare'

/** A brief result notice, not another confirmation or tracking control. */
export function ShareResultNotice() {
  const [text, setText] = useState<string | null>(null)
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
        setText(shareStatusText(next))
        clearTimeout(hide)
        hide = setTimeout(() => { if (!stopped) setText(null) }, 6000)
        await window.api.authorHandoff({ action: 'share-noticed', shareId: next.id })
      } finally { if (!stopped) timer = setTimeout(() => { void poll().catch(() => undefined) }, 3000) }
    }
    void poll().catch(() => undefined)
    return () => { stopped = true; clearTimeout(timer); clearTimeout(hide) }
  }, [])
  return text ? <Alert color="teal" title={text} role="status" style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 400 }} /> : null
}
