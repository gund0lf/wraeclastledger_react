import { useState, useEffect, useSyncExternalStore } from 'react';
import { Button, Group, Text, Stack, List, Badge, Collapse, ActionIcon } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconX } from '@tabler/icons-react';
import { CHANGELOG } from './utils/changelog';
import { useUIStore } from './store/useUIStore';
import pkg from '../../../package.json';
import { UpdaterPresentation, updaterCopy } from './utils/updaterPresentation';
import {
  repositoryLastSeenVersion,
  setRepositoryLastSeenVersion,
} from './repository/sessionRepositoryRuntime';

// WP3: single source of truth — electron-vite resolves the JSON import at
// build time, so bumping package.json is the ONLY version bump needed
// (plus the changelog entry).
export const APP_VERSION: string = pkg.version;

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
          {open ? <IconChevronDown size={9} /> : <IconChevronRight size={9} />}
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
  const [updater] = useState(() => new UpdaterPresentation());
  const { status, dismissed, upToDateFlash } = useSyncExternalStore(updater.subscribe, updater.getSnapshot);
  const downloaded = status.phase === 'ready';
  const failed = status.phase === 'failed';
  const copy = updaterCopy(status);
  const [showChangelog,  setShowChangelog]  = useState(false);
  const [showHistory,    setShowHistory]    = useState(false);

  useEffect(() => {
    const seen = repositoryLastSeenVersion();
    if (seen !== APP_VERSION) {
      setShowChangelog(true);
      setRepositoryLastSeenVersion(APP_VERSION);
    }
  }, []);

  // Title-bar version badge clicked -> reopen What's New (Sad 2026-07-10).
  const { changelogRequested, clearChangelogRequest } = useUIStore();
  useEffect(() => {
    if (!changelogRequested) return;
    setShowChangelog(true);
    clearChangelogRequest();
  }, [changelogRequested]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ipc = window.electron?.ipcRenderer;
    if (!ipc) return;
    return updater.connect(ipc);
  }, [updater]);

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
              <Text fw={700} size="sm">What&apos;s New</Text>
              <Badge size="xs" color="blue" variant="light">v{APP_VERSION}</Badge>
            </Group>
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => { setShowChangelog(false); setShowHistory(false); }}><IconX size={12} /></ActionIcon>
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
                    leftSection={showHistory ? <IconChevronDown size={9} /> : <IconChevronRight size={9} />}
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
          <Text size="xs" c="green">Already on the latest version</Text>
        </div>
      )}

      {!dismissed && ['checking', 'downloading', 'failed', 'ready'].includes(status.phase) && (
        <div style={{
          position: 'fixed', bottom: showChangelog ? 320 : 12, right: 12,
          zIndex: 9999, maxWidth: 300,
          background: '#1e1f22', border: `1px solid ${failed ? '#fa5252' : downloaded ? '#40c057' : '#4dabf7'}`,
          borderRadius: 8, padding: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
        }}>
          <Group justify="space-between" mb={4}>
            <Text size="sm" fw={700} c={failed ? 'red' : downloaded ? 'green' : 'blue'}>
              {copy.title}
            </Text>
            {!downloaded && (
              <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Dismiss update notice" onClick={updater.dismiss}><IconX size={12} /></ActionIcon>
            )}
          </Group>
          {downloaded ? (
            <Stack gap={4}>
              <Text size="xs" c="dimmed">{copy.body}</Text>
              <Button size="xs" color="teal" variant="light"
                onClick={() => window.electron?.ipcRenderer.send('install-update')}>
                Restart & Update
              </Button>
            </Stack>
          ) : failed ? (
            <Stack gap={4}>
              <Text size="xs" c="dimmed">{copy.body}</Text>
              <Button size="xs" color="blue" variant="light" onClick={updater.retry}>Retry</Button>
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">{copy.body}</Text>
          )}
        </div>
      )}
    </>
  );
};
