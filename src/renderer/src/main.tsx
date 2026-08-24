import React, { useCallback, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Alert, Button, Center, Group, Loader, MantineProvider, Stack, Text } from '@mantine/core'
import App from './App'
import OverlayApp from './OverlayApp'
import { appTheme } from './utils/uiTokens'
// Import Mantine core styles
import '@mantine/core/styles.css'
// Import FlexLayout styles (Light or Dark)
import 'flexlayout-react/style/dark.css' 
import './flexlayout-overrides.css'
import {
  bootstrapSessionRepository,
  exportLegacyStorageBackup,
  openRepositoryFolder,
} from './repository/sessionRepositoryRuntime'

function downloadLegacyBackup(): void {
  const blob = new Blob([exportLegacyStorageBackup()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `wraeclast-legacy-backup-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function BootstrapGate(): React.JSX.Element {
  const [attempt, setAttempt] = useState(0)
  const [layoutRawValue, setLayoutRawValue] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  const retry = useCallback(() => {
    setError(null)
    setLayoutRawValue(undefined)
    setAttempt((value) => value + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    bootstrapSessionRepository()
      .then((result) => {
        if (!cancelled) setLayoutRawValue(result.layoutRawValue)
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => { cancelled = true }
  }, [attempt])

  if (error) {
    return (
      <Center h="100vh">
        <Stack maw={560} p="xl">
          <Alert color="red" title="Sessions could not be loaded">{error}</Alert>
          <Text size="sm" c="dimmed">
            Editing is blocked so the file repository and legacy browser data cannot become competing sources of truth.
          </Text>
          <Group>
            <Button onClick={retry}>Retry</Button>
            <Button variant="default" onClick={downloadLegacyBackup}>Export legacy backup</Button>
            <Button variant="default" onClick={() => {
              void openRepositoryFolder().catch((reason) => {
                setError(reason instanceof Error ? reason.message : String(reason))
              })
            }}>Open data folder</Button>
          </Group>
        </Stack>
      </Center>
    )
  }
  if (layoutRawValue === undefined) {
    return (
      <Center h="100vh">
        <Stack align="center" gap="sm">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">Loading sessions...</Text>
        </Stack>
      </Center>
    )
  }
  return <App initialLayoutRawValue={layoutRawValue} />
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MantineProvider theme={appTheme} defaultColorScheme="dark">
      {new URLSearchParams(window.location.search).get('overlay') === '1'
        ? <OverlayApp />
        : <BootstrapGate />}
    </MantineProvider>
  </React.StrictMode>
)
