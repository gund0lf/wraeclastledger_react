import { useState, useEffect } from 'react';
import { Button, Group, Text, Stack, List, Badge, Collapse, ActionIcon } from '@mantine/core';
import { FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { CHANGELOG } from './utils/changelog';

export const APP_VERSION = '1.0.56';
const SEEN_KEY = 'wraeclast-seen-version';

const VersionEntry = ({ entry, defaultOpen }: { entry: typeof CHANGELOG[0]; defaultOpen: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Stack gap={4}>
      <Group
        gap={8}
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <ActionIcon size={14} variant="transparent" c="dimmed">
          {open ? <FaChevronDown size={9} /> : <FaChevronRight size={9} />}
        </ActionIcon>
        <Text size="xs" fw={700} c="blue">v{entry.version}</Text>
        <Text size="xs" c="dimmed">{entry.date}</Text>
        <Badge size="xs" color="gray" variant="outline">{entry.changes.length} changes</Badge>
      </Group>
      <Collapse in={open}>
        <List size="xs" spacing={3} style={{ paddingLeft: 22 }}>
          {entry.changes.map((c, i) => (
            <List.Item key={i}><Text size="xs" c="dimmed">{c}</Text></List.Item>
          ))}
        </List>
      </Collapse>
    </Stack>
  );
};

export const UpdateBanner = () => {
  const [updateVersion,  setUpdateVersion]  = useState<string | null>(null);
  const [downloaded,     setDownloaded]     = useState(false);
  const [showChangelog,  setShowChangelog]  = useState(false);
  const [showHistory,    setShowHistory]    = useState(false);
  const [upToDateFlash,  setUpToDateFlash]  = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(SEEN_KEY);
    if (seen !== APP_VERSION) {
      setShowChangelog(true);
      localStorage.setItem(SEEN_KEY, APP_VERSION);
    }
  }, []);

  useEffect(() => {
    const ipc = window.electron?.ipcRenderer;
    if (!ipc) return;
    ipc.on('update-available',     (_, version: string) => setUpdateVersion(version));
    ipc.on('update-downloaded',    ()                   => setDownloaded(true));
    ipc.on('update-not-available', ()                   => {
      setUpToDateFlash(true);
      setTimeout(() => setUpToDateFlash(false), 3000);
    });
  }, []);

  // Entries for the current version (shown expanded by default)
  const currentEntries = CHANGELOG.filter((e) => {
    const ev = e.version.split('.').map(Number);
    const sv = APP_VERSION.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((ev[i] ?? 0) > (sv[i] ?? 0)) return true;
      if ((ev[i] ?? 0) < (sv[i] ?? 0)) return false;
    }
    return true;
  });

  // All older entries
  const historyEntries = CHANGELOG.filter((e) => !currentEntries.includes(e));

  return (
    <>
      {showChangelog && (
        <div style={{
          position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9998, width: 480,
          background: '#1e1f22', border: '1px solid #4dabf7',
          borderRadius: 8, padding: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
        }}>
          <Group justify="space-between" mb={8}>
            <Group gap={6}>
              <Text fw={700} size="sm">What's New</Text>
              <Badge size="xs" color="blue" variant="light">v{APP_VERSION}</Badge>
            </Group>
            <Button size="xs" variant="subtle" color="gray" onClick={() => { setShowChangelog(false); setShowHistory(false); }}>×</Button>
          </Group>

          <div style={{ maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
            <Stack gap={12}>
              {/* Current version entries — open by default */}
              {currentEntries.map((entry) => (
                <VersionEntry key={entry.version} entry={entry} defaultOpen={true} />
              ))}

              {/* Past versions toggle */}
              {historyEntries.length > 0 && (
                <>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="gray"
                    leftSection={showHistory ? <FaChevronDown size={9} /> : <FaChevronRight size={9} />}
                    onClick={() => setShowHistory((v) => !v)}
                    style={{ alignSelf: 'flex-start', fontSize: 10 }}
                  >
                    {showHistory ? 'Hide' : 'Show'} past versions ({historyEntries.length})
                  </Button>
                  <Collapse in={showHistory}>
                    <Stack gap={10}>
                      {historyEntries.map((entry) => (
                        <VersionEntry key={entry.version} entry={entry} defaultOpen={false} />
                      ))}
                    </Stack>
                  </Collapse>
                </>
              )}
            </Stack>
          </div>

          <Button size="xs" variant="light" color="blue" fullWidth mt={10}
            onClick={() => { setShowChangelog(false); setShowHistory(false); }}>
            Got it
          </Button>
        </div>
      )}

      {upToDateFlash && (
        <div style={{
          position: 'fixed', bottom: 12, right: 12, zIndex: 9999,
          background: '#1e1f22', border: '1px solid #40c057',
          borderRadius: 6, padding: '6px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        }}>
          <Text size="xs" c="green">✓ Already on the latest version</Text>
        </div>
      )}

      {updateVersion && (
        <div style={{
          position: 'fixed', bottom: showChangelog ? 320 : 12, right: 12,
          zIndex: 9999, maxWidth: 300,
          background: '#1e1f22', border: `1px solid ${downloaded ? '#40c057' : '#4dabf7'}`,
          borderRadius: 8, padding: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
        }}>
          <Group justify="space-between" mb={4}>
            <Text size="sm" fw={700} c={downloaded ? 'green' : 'blue'}>
              {downloaded ? `v${updateVersion} Ready` : `v${updateVersion} Downloading…`}
            </Text>
            {!downloaded && (
              <Button size="xs" variant="subtle" color="gray" onClick={() => setUpdateVersion(null)}>×</Button>
            )}
          </Group>
          {downloaded ? (
            <Stack gap={4}>
              <Text size="xs" c="dimmed">Downloaded and ready to install.</Text>
              <Button size="xs" color="teal" variant="light"
                onClick={() => window.electron?.ipcRenderer.send('install-update')}>
                Restart & Update
              </Button>
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">Downloading in background…</Text>
          )}
        </div>
      )}
    </>
  );
};
