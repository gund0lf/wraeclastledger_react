import { useState, useEffect } from 'react';
import { Notification, Button, Group, Text } from '@mantine/core';

declare global {
  interface Window {
    electron?: {
      ipcRenderer: {
        on: (channel: string, listener: (...args: any[]) => void) => void;
        send: (channel: string, ...args: any[]) => void;
      }
    }
  }
}

export const UpdateBanner = () => {
  const [updateVersion, setUpdateVersion]   = useState<string | null>(null);
  const [downloaded,    setDownloaded]      = useState(false);

  useEffect(() => {
    const ipc = window.electron?.ipcRenderer;
    if (!ipc) return;

    ipc.on('update-available', (_, version: string) => {
      setUpdateVersion(version);
    });
    ipc.on('update-downloaded', () => {
      setDownloaded(true);
    });
  }, []);

  if (!updateVersion) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 12, right: 12, zIndex: 9999,
      maxWidth: 320,
    }}>
      <Notification
        color={downloaded ? 'teal' : 'blue'}
        title={downloaded ? `Update ${updateVersion} ready` : `Update ${updateVersion} downloading…`}
        withCloseButton={!downloaded}
        onClose={() => setUpdateVersion(null)}
      >
        {downloaded ? (
          <Group gap="xs" mt={4}>
            <Text size="xs">Downloaded. Restart to apply.</Text>
            <Button size="xs" color="teal" variant="light"
              onClick={() => window.electron?.ipcRenderer.send('install-update')}>
              Restart & Update
            </Button>
          </Group>
        ) : (
          <Text size="xs">Downloading in background…</Text>
        )}
      </Notification>
    </div>
  );
};
