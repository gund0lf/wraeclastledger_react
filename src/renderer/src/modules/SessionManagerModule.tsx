import {
  Card, Text, Button, Group, Stack, Select, TextInput, ActionIcon,
  Badge, Modal, Divider, Tooltip, Checkbox, Radio, Alert, ScrollArea, SimpleGrid, Collapse,
} from '@mantine/core';
import { useDisclosure, useElementSize } from '@mantine/hooks';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useSessionKeys, useSessionStore } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import { IconTrash, IconPencil, IconDeviceFloppy, IconShare2, IconBrandDiscord, IconDownload, IconUpload, IconX, IconArrowsLeftRight, IconCheck, IconFolderOpen, IconRefresh, IconHistory, IconRestore, IconPlayerPlay } from '@tabler/icons-react';
import type { SavedSession } from '../types';
import { SessionCompareModal } from '../components/SessionCompareModal';
import { ShareModal } from '../components/ShareModal';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { WorkingSessionGuardModal } from '../components/WorkingSessionGuardModal';
import { resolveReselectedNewSessionIntent, resolveSessionSelectionIntent } from '../utils/workingSession';
import { usePanelMaximized } from '../layout/panelLayoutContext';
import {
  deleteNamed,
  exportRepositorySessions,
  forkCurrentToConfirmedLeague,
  defaultExpandedCheckpointIds,
  inspectWorkingReplacement,
  importRepositoryDocument,
  loadNamed,
  nameCurrent,
  nameWorking,
  openRepositoryFolder,
  listCurrentVersionHistory,
  listRecentlyDeleted,
  permanentlyDeleteRecentlyDeleted,
  renameNamed,
  restoreRecentlyDeleted,
  restoreCurrentCheckpoint,
  resumeCurrent,
  retryRepositorySave,
  startWorking,
  undoChangesSinceOpening,
} from '../repository/sessionRepositoryRuntime';
import {
  SESSION_REPOSITORY_MAX_IMPORT_BYTES,
  type RepositoryCheckpointSummary,
  type RepositoryTrashSummary,
} from '../../../shared/sessionRepositoryIpc';
import { confirmedLeagueSync } from '../utils/league';
import { deriveShareTags } from '../utils/shareTags';
import './SessionManagerModule.css';

const TILE_STYLES = { inner: { width: '100%' }, label: { flex: 1, textAlign: 'center' as const } };
const RECOVERY_LIST_SCROLL_PROPS = {
  mah: 420,
  type: 'hover',
  scrollHideDelay: 650,
  scrollbarSize: 8,
  scrollbars: 'y',
  offsetScrollbars: 'y',
} as const;

function summaryCount(summary: RepositoryCheckpointSummary['summary'], key: string): number {
  return typeof summary[key] === 'number' ? Number(summary[key]) : 0;
}

function checkpointSummaryText(checkpoint: RepositoryCheckpointSummary): string {
  const before = checkpoint.summary;
  const after = checkpoint.afterSummary;
  if (!after) {
    return `${summaryCount(before, 'mapCount')} maps · ${summaryCount(before, 'lootItemCount')} loot rows · ${summaryCount(before, 'baselineItemCount')} baseline rows`;
  }
  const parts = [
    `${summaryCount(before, 'mapCount')} → ${summaryCount(after, 'mapCount')} maps`,
    `${summaryCount(before, 'lootItemCount')} → ${summaryCount(after, 'lootItemCount')} loot rows`,
    `${summaryCount(before, 'baselineItemCount')} → ${summaryCount(after, 'baselineItemCount')} baseline rows`,
  ];
  if (before.costsHash && after.costsHash && before.costsHash !== after.costsHash) parts.push('costs changed');
  if (before.notesHash && after.notesHash && before.notesHash !== after.notesHash) parts.push('notes changed');
  if (before.settingsHash && after.settingsHash && before.settingsHash !== after.settingsHash &&
      before.costsHash === after.costsHash) parts.push('settings changed');
  return parts.join(' · ');
}

function checkpointReasonLabel(checkpoint: RepositoryCheckpointSummary): string {
  if (checkpoint.isActivationBaseline) return 'When session opened';
  if (checkpoint.reason === 'destructive') return 'Before destructive change';
  if (checkpoint.reason === 'pre-restore') return 'Before restore';
  if (checkpoint.reason === 'periodic') return 'Automatic recovery';
  return 'Session opened';
}

export const SessionManagerModule = ({ embedded = false }: { embedded?: boolean } = {}) => {
  const panelIsMaximized = usePanelMaximized('session-manager');
  const isMaximized = !embedded && panelIsMaximized;
  const { ref: panelRef, width: panelWidth } = useElementSize();
  const compactPanel = panelWidth > 0 && panelWidth < 285;
  const {
    settings, repositorySessions, activeSessionId, activeSessionName,
    repositorySizeBytes, saveStatus, saveError, sessionLifecycle, liveSessionId,
    activationCheckpointNotice, historyStoragePressure, dismissActivationCheckpointNotice,
  } = useSessionKeys(
    'settings', 'repositorySessions', 'activeSessionId', 'activeSessionName',
    'repositorySizeBytes', 'saveStatus', 'saveError', 'sessionLifecycle', 'liveSessionId',
    'activationCheckpointNotice', 'historyStoragePressure', 'dismissActivationCheckpointNotice',
  );

  const [saveOpen,   { open: openSave,   close: closeSave   }] = useDisclosure(false);
  const [forkOpen,   { open: openFork,   close: closeFork   }] = useDisclosure(false);
  const [renameOpen, { open: openRename, close: closeRename }] = useDisclosure(false);
  const [bulkDeleteOpen, { open: openBulkDelete, close: closeBulkDelete }] = useDisclosure(false);
  const [importOpen, { open: openImport, close: closeImport }] = useDisclosure(false);
  const [compareOpen, { open: openCompare, close: closeCompare }] = useDisclosure(false);
  const [switchGuardOpen, { open: openSwitchGuard, close: closeSwitchGuard }] = useDisclosure(false);
  const [versionsOpen, { open: openVersions, close: closeVersions }] = useDisclosure(false);
  const [trashOpen, { open: openTrash, close: closeTrash }] = useDisclosure(false);
  const [shareOpen, { open: openShare, close: closeShare }] = useDisclosure(false);

  const [nameInput, setNameInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null); // WP5: single-delete confirmation
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null); // guard: session to switch to once the unsaved one is handled
  const [guardedWorkingMapCount, setGuardedWorkingMapCount] = useState(0);
  const [savedFlash, setSavedFlash] = useState(false); // brief green confirmation on the Save tile after a save
  const [sessionSelectOpen, setSessionSelectOpen] = useState(false);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null); // row hover for history tile reveal
  const [hoveredTrashTop, setHoveredTrashTop] = useState(false); // top-right delete icon red hover
  const [hoveredTrashId, setHoveredTrashId] = useState<string | null>(null); // history row delete icon red hover
  const [hoveredBulkDelete, setHoveredBulkDelete] = useState(false); // bulk-bar delete button red hover
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importData, setImportData] = useState<SavedSession[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [conflictMode, setConflictMode] = useState<'skip' | 'overwrite'>('skip');
  const [operationError, setOperationError] = useState<string | null>(null);
  const [versionHistory, setVersionHistory] = useState<RepositoryCheckpointSummary[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [expandedCheckpointIds, setExpandedCheckpointIds] = useState<Set<string>>(new Set());
  const [restoreTarget, setRestoreTarget] = useState<RepositoryCheckpointSummary | null>(null);
  const [trashEntries, setTrashEntries] = useState<RepositoryTrashSummary[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<RepositoryTrashSummary | null>(null);
  const [shareTags, setShareTags] = useState<string[]>([]);
  const importFileRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []); // clear pending flash on unmount
  useEffect(() => {
    if (!activationCheckpointNotice) return undefined;
    const timer = setTimeout(dismissActivationCheckpointNotice, 10_000);
    return () => clearTimeout(timer);
  }, [activationCheckpointNotice, dismissActivationCheckpointNotice]);

  const sessionEntries = useMemo(() =>
    [...repositorySessions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
  [repositorySessions]);
  const selectableSessionEntries = useMemo(
    () => sessionEntries.filter(({ status }) => status === 'ready'),
    [sessionEntries],
  );

  const storageMB = (repositorySizeBytes / 1024 / 1024).toFixed(2);
  const sessionMapCount = (session: typeof sessionEntries[number]): number =>
    typeof session.summary.mapCount === 'number' ? session.summary.mapCount : 0;

  const runOperation = async (action: () => Promise<void>, onSuccess?: () => void): Promise<void> => {
    setOperationError(null);
    try {
      await action();
      onSuccess?.();
    } catch (error: unknown) {
      setOperationError(error instanceof Error ? error.message : 'The repository operation failed.');
    }
  };

  const refreshVersionHistory = async (): Promise<void> => {
    setVersionsLoading(true);
    try {
      const data = await listCurrentVersionHistory();
      setVersionHistory(data.checkpoints);
      setExpandedCheckpointIds(defaultExpandedCheckpointIds(data.checkpoints));
    } finally {
      setVersionsLoading(false);
    }
  };

  const showVersionHistory = (): void => {
    setOperationError(null);
    openVersions();
    void refreshVersionHistory().catch((error) => {
      setOperationError(error instanceof Error ? error.message : 'Version history could not be loaded.');
    });
  };

  const refreshRecentlyDeleted = async (): Promise<void> => {
    setTrashLoading(true);
    try {
      const data = await listRecentlyDeleted();
      setTrashEntries(data.entries);
    } finally {
      setTrashLoading(false);
    }
  };

  const showRecentlyDeleted = (): void => {
    setOperationError(null);
    openTrash();
    void refreshRecentlyDeleted().catch((error) => {
      setOperationError(error instanceof Error ? error.message : 'Recently Deleted could not be loaded.');
    });
  };

  const performSwitch = async (target: string): Promise<void> => {
    if (target === '__new__') await startWorking(true);
    else await loadNamed(target);
  };

  // Peeking at a named session preserves the live working target. Only a
  // deliberate new-live-session transition can replace the working slot.
  const requestSwitch = (target: string) => {
    void runOperation(async () => {
      if (target === '__new__') {
        const inspection = await inspectWorkingReplacement();
        if (inspection.requiresProtection) {
          setPendingSwitch(target);
          setGuardedWorkingMapCount(inspection.mapCount);
          setNameInput('');
          openSwitchGuard();
          return;
        }
      }
      await performSwitch(target);
    });
  };

  const handleSessionSelect = (val: string | null) => {
    setSessionSelectOpen(false);
    if (val === (activeSessionId ?? '__new__')) return;
    const intent = resolveSessionSelectionIntent(val);
    if (intent !== undefined) requestSwitch(intent);
  };

  const doSaveAndSwitch = async () => {
    const name = nameInput.trim();
    if (!name || pendingSwitch === null) return;
    await runOperation(async () => {
      await nameWorking(name);
      await performSwitch(pendingSwitch);
    }, () => {
      setNameInput('');
      setPendingSwitch(null);
      setGuardedWorkingMapCount(0);
      closeSwitchGuard();
    });
  };

  const doDiscardAndSwitch = () => {
    if (pendingSwitch === null) return;
    void runOperation(() => performSwitch(pendingSwitch));
    setPendingSwitch(null);
    setGuardedWorkingMapCount(0);
    closeSwitchGuard();
  };

  const cancelSwitch = () => {
    setPendingSwitch(null);
    setGuardedWorkingMapCount(0);
    closeSwitchGuard();
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === selectableSessionEntries.length) setSelected(new Set());
    else setSelected(new Set(selectableSessionEntries.map((s) => s.id)));
  };

  const clearSelection = () => setSelected(new Set());

  // ── Export selected ────────────────────────────────────────────────────────
  const handleExport = async () => {
    const payload = await exportRepositorySessions(sessionEntries.filter((s) => selected.has(s.id)).map(({ id }) => id));
    const blob = new Blob([payload], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `wraeclast-sessions-${new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Import ─────────────────────────────────────────────────────────────────
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > SESSION_REPOSITORY_MAX_IMPORT_BYTES) {
      setImportError('This backup is larger than the supported 32 MB import limit.');
      setImportData(null);
      openImport();
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const sessions: unknown = parsed?.sessions ?? (Array.isArray(parsed) ? parsed : null);
        if (!Array.isArray(sessions) || sessions.length === 0 || sessions.length > 10_000 ||
            !sessions.every((session) => session && typeof session === 'object' &&
              typeof session.id === 'string' && typeof session.name === 'string' && Array.isArray(session.maps))) {
          setImportError('No valid sessions found in this file.');
          setImportData(null);
        } else {
          setImportData(sessions as SavedSession[]);
          setImportError(null);
        }
      } catch {
        setImportError('Could not parse file — make sure it\'s a valid WraeclastLedger export.');
        setImportData(null);
      }
      openImport();
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!importData) return;
    await importRepositoryDocument(JSON.stringify({ version: '1.0', sessions: importData }), conflictMode);
    setImportData(null);
    closeImport();
  };

  const conflictCount = importData
    ? importData.filter((s) => repositorySessions.some(({ id }) => id === s.id)).length
    : 0;

  const isUnsaved = !activeSessionId;
  const confirmedLeague = confirmedLeagueSync();
  const crossLeague = sessionLifecycle === 'historical' && !!confirmedLeague &&
    !!settings.leagueName.trim() && settings.leagueName !== confirmedLeague;
  const flashSaved = () => {
    setSavedFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(false), 1600);
  };
  const { triggerStrategyAction } = useUIStore();
  const handleOpenShare = (): void => {
    const { settings: currentSettings, maps: currentMaps } = useSessionStore.getState();
    setShareTags(deriveShareTags(currentSettings, currentMaps));
    openShare();
  };

  return (
    <>
      <ShareModal opened={shareOpen} onClose={closeShare} initialTags={shareTags} />

      {/* ── Save modal ── */}
      <Modal opened={saveOpen} onClose={closeSave} title={isUnsaved ? 'Save to Sessions' : 'Duplicate session'} size="sm">
        <Stack gap="sm">
          {isUnsaved && (
            <Text size="sm" c="dimmed">
              This working session is already auto-saved. Give it a name to keep it in Saved sessions.
            </Text>
          )}
          <TextInput label="Session name" placeholder="e.g. T16 Deli — 72 maps"
            value={nameInput} onChange={(e) => setNameInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && nameInput.trim() && void runOperation(
              () => nameCurrent(nameInput.trim()),
              () => { setNameInput(''); closeSave(); flashSaved(); },
            )}
            autoFocus />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeSave}>Cancel</Button>
            <Button onClick={() => { void runOperation(
              () => nameCurrent(nameInput.trim()),
              () => { setNameInput(''); closeSave(); flashSaved(); },
            ); }}
              disabled={!nameInput.trim()}>{isUnsaved ? 'Save to Sessions' : 'Duplicate session'}</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={forkOpen} onClose={closeFork}
        title={`Fork into ${confirmedLeague ?? 'current league'}`} size="sm">
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            This creates a new live copy and updates only the copy&apos;s league provenance. The original historical session remains unchanged.
          </Text>
          <TextInput label="New session name" value={nameInput}
            onChange={(event) => setNameInput(event.currentTarget.value)}
            onKeyDown={(event) => event.key === 'Enter' && nameInput.trim() && void runOperation(
              () => forkCurrentToConfirmedLeague(nameInput.trim()),
              () => { setNameInput(''); closeFork(); },
            )}
            autoFocus />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeFork}>Cancel</Button>
            <Button disabled={!nameInput.trim()} onClick={() => { void runOperation(
              () => forkCurrentToConfirmedLeague(nameInput.trim()),
              () => { setNameInput(''); closeFork(); },
            ); }}>Fork session</Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── Rename modal ── */}
      <Modal opened={renameOpen} onClose={closeRename} title="Rename Session" size="sm">
        <Stack gap="sm">
          <TextInput label="New Name" value={nameInput}
            onChange={(e) => setNameInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && nameInput.trim() && activeSessionId && void runOperation(
              () => renameNamed(activeSessionId, nameInput.trim()),
              () => { setNameInput(''); closeRename(); },
            )}
            autoFocus />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeRename}>Cancel</Button>
            <Button onClick={() => { if (activeSessionId) void runOperation(
              () => renameNamed(activeSessionId, nameInput.trim()),
              () => { setNameInput(''); closeRename(); },
            ); }}
              disabled={!nameInput.trim()}>Rename</Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── Single delete confirmation (WP5) ── */}
      <Modal opened={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Move Session to Recently Deleted" size="sm">
        <Stack gap="sm">
          <Text size="sm">
            Move <Text span fw={700}>{deleteTarget ? repositorySessions.find(({ id }) => id === deleteTarget)?.name : ''}</Text> to Recently Deleted?
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button color="red" onClick={() => {
              if (deleteTarget) {
                void runOperation(() => deleteNamed(deleteTarget));
                setSelected((prev) => { const next = new Set(prev); next.delete(deleteTarget); return next; }); // prune stale selection id
              }
              setDeleteTarget(null);
            }}>Move</Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── Bulk delete confirmation ── */}
      <Modal opened={bulkDeleteOpen} onClose={closeBulkDelete} title="Move Sessions to Recently Deleted" size="sm">
        <Stack gap="sm">
          <Text size="sm">
            Move <Text span fw={700}>{selected.size} session{selected.size !== 1 ? 's' : ''}</Text> to Recently Deleted?
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeBulkDelete}>Cancel</Button>
            <Button color="red" onClick={() => { void runOperation(async () => {
              for (const id of selected) await deleteNamed(id);
            }, () => {
              clearSelection();
              closeBulkDelete();
            }); }}>
              Move {selected.size}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── Import preview modal ── */}
      <Modal opened={importOpen} onClose={() => { closeImport(); setImportData(null); setImportError(null); }}
        title="Import Sessions" size="md">
        <Stack gap="sm">
          {importError && <Alert color="red" variant="light" p="xs"><Text size="xs">{importError}</Text></Alert>}
          {importData && (
            <>
              <Text size="xs" c="dimmed">Found <Text span fw={600}>{importData.length} session{importData.length !== 1 ? 's' : ''}</Text> in the file:</Text>
              <ScrollArea mah={200}>
                <Stack gap={4}>
                  {importData.map((s) => {
                    const exists = repositorySessions.some(({ id }) => id === s.id);
                    return (
                      <Group key={s.id} justify="space-between" wrap="nowrap">
                        <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                          <Text size="xs" fw={600} lineClamp={1}>{s.name}</Text>
                          <Text size="xs" c="dimmed">{s.maps.length} maps · {new Date(s.createdAt).toLocaleDateString()}</Text>
                        </Stack>
                        {exists && <Badge size="xs" color="orange" variant="light">exists</Badge>}
                      </Group>
                    );
                  })}
                </Stack>
              </ScrollArea>
              {conflictCount > 0 && (
                <>
                  <Divider label={`${conflictCount} conflict${conflictCount !== 1 ? 's' : ''}`} labelPosition="left" />
                  <Radio.Group value={conflictMode} onChange={(v) => setConflictMode(v as 'skip' | 'overwrite')}>
                    <Stack gap={6}>
                      <Radio value="skip" size="xs" label="Skip existing — only import sessions I don't already have" />
                      <Radio value="overwrite" size="xs" label="Overwrite existing — replace sessions with the same ID" />
                    </Stack>
                  </Radio.Group>
                </>
              )}
              <Group justify="flex-end">
                <Button variant="default" onClick={() => { closeImport(); setImportData(null); }}>Cancel</Button>
                <Button color="teal" leftSection={<IconUpload size={12} />}
                  onClick={() => { void runOperation(handleConfirmImport); }}>
                  Import {conflictMode === 'skip' ? importData.length - conflictCount : importData.length} session{importData.length !== 1 ? 's' : ''}
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>

      <Modal opened={versionsOpen} onClose={closeVersions} title="Version history" size="lg">
        <Stack gap="sm">
          <Text size="xs" c="dimmed">
            Restoring a version first preserves the current state, then makes the selected timestamp current.
          </Text>
          {historyStoragePressure && (
            <Alert color="yellow" variant="light" p="xs">
              <Text size="xs">Protected recovery versions exceed the normal history budget. They remain available; optional recovery points are paused.</Text>
            </Alert>
          )}
          {versionsLoading ? (
            <Text size="sm" c="dimmed">Loading version history…</Text>
          ) : versionHistory.length === 0 ? (
            <Text size="sm" c="dimmed">No earlier versions have been recorded for this session yet.</Text>
          ) : (
            <ScrollArea.Autosize {...RECOVERY_LIST_SCROLL_PROPS}>
              <Stack gap={6}>
                {versionHistory.map((checkpoint) => (
                  <Card key={checkpoint.id} withBorder padding="sm" radius="sm">
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <Stack gap={2} style={{ minWidth: 0 }}>
                        <Group gap={6}>
                          <Text size="sm" fw={600}>{checkpointReasonLabel(checkpoint)}</Text>
                          {checkpoint.isActivationBaseline && <Badge size="xs" color="blue" variant="light">Undo available</Badge>}
                        </Group>
                        <Text size="xs" c="dimmed">{new Date(checkpoint.createdAt).toLocaleString()}</Text>
                        <Text size="xs">{checkpointSummaryText(checkpoint)}</Text>
                        {checkpoint.changeCount > 0 && (
                          <>
                            <Button size="compact-xs" variant="subtle" px={0}
                              style={{ alignSelf: 'flex-start' }}
                              onClick={() => setExpandedCheckpointIds((current) => {
                                const next = new Set(current);
                                if (next.has(checkpoint.id)) next.delete(checkpoint.id);
                                else next.add(checkpoint.id);
                                return next;
                              })}>
                              {expandedCheckpointIds.has(checkpoint.id) ? 'Hide' : 'Show'} changes ({checkpoint.changeCount})
                            </Button>
                            <Collapse in={expandedCheckpointIds.has(checkpoint.id)}>
                              <Stack gap={2} pt={2}>
                                {checkpoint.changes.map((change, index) => (
                                  <Group key={`${checkpoint.id}-${index}`} gap={6} justify="space-between" wrap="nowrap">
                                    <Text size="xs" c="dimmed">{change.label}</Text>
                                    <Text size="xs" ta="right">{change.before} → {change.after}</Text>
                                  </Group>
                                ))}
                                {checkpoint.changeCount > checkpoint.changes.length && (
                                  <Text size="xs" c="dimmed">
                                    {checkpoint.changeCount - checkpoint.changes.length} additional changes omitted by the display limit.
                                  </Text>
                                )}
                              </Stack>
                            </Collapse>
                          </>
                        )}
                      </Stack>
                      <Button size="compact-xs" variant="default" leftSection={<IconRestore size={11} />}
                        onClick={() => setRestoreTarget(checkpoint)}>Restore</Button>
                    </Group>
                  </Card>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          )}
        </Stack>
      </Modal>

      <Modal opened={restoreTarget !== null} onClose={() => setRestoreTarget(null)}
        title="Restore session version" size="sm">
        <Stack gap="sm">
          <Text size="sm">
            Restore the version from <Text span fw={700}>{restoreTarget ? new Date(restoreTarget.createdAt).toLocaleString() : ''}</Text>?
          </Text>
          <Text size="xs" c="dimmed">Your current state will be preserved first, so this restore can also be undone.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRestoreTarget(null)}>Cancel</Button>
            <Button leftSection={<IconRestore size={12} />} onClick={() => {
              if (!restoreTarget) return;
              const checkpointId = restoreTarget.id;
              void runOperation(async () => {
                await restoreCurrentCheckpoint(checkpointId);
                await refreshVersionHistory();
              }, () => setRestoreTarget(null));
            }}>Restore version</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={trashOpen} onClose={closeTrash} title="Recently Deleted" size="lg">
        <Stack gap="sm">
          <Text size="xs" c="dimmed">
            Deleted sessions remain recoverable for up to 30 days, subject to the 20-entry and 32 MB Recently Deleted limits.
            Restoring returns a session to Saved sessions without changing the capture target. Load it, then use Resume capture if you want to continue it.
          </Text>
          {trashLoading ? (
            <Text size="sm" c="dimmed">Loading Recently Deleted…</Text>
          ) : trashEntries.length === 0 ? (
            <Text size="sm" c="dimmed">Recently Deleted is empty.</Text>
          ) : (
            <ScrollArea.Autosize {...RECOVERY_LIST_SCROLL_PROPS}>
              <Stack gap={6}>
                {trashEntries.map((entry) => (
                  <Card key={entry.recoveryId} withBorder padding="sm" radius="sm">
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <Stack gap={2} style={{ minWidth: 0 }}>
                        <Group gap={6}>
                          <Text size="sm" fw={600} lineClamp={1}>{entry.displayName}</Text>
                          {entry.status === 'damaged' && <Badge size="xs" color="red" variant="light">Damaged</Badge>}
                        </Group>
                        <Text size="xs" c="dimmed">
                          Deleted {new Date(entry.deletedAt).toLocaleString()} · available until {new Date(entry.expiresAt).toLocaleString()} · {(entry.bytes / 1024 / 1024).toFixed(2)} MB
                        </Text>
                      </Stack>
                      <Group gap={4} wrap="nowrap">
                        <Button size="compact-xs" variant="default" leftSection={<IconRestore size={11} />}
                          disabled={entry.status !== 'ready'} onClick={() => {
                            void runOperation(async () => {
                              await restoreRecentlyDeleted(entry.recoveryId);
                              await refreshRecentlyDeleted();
                            });
                          }}>Restore</Button>
                        <Button size="compact-xs" variant="subtle" color="red"
                          onClick={() => setPermanentDeleteTarget(entry)}>Delete permanently</Button>
                      </Group>
                    </Group>
                  </Card>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          )}
        </Stack>
      </Modal>

      <Modal opened={permanentDeleteTarget !== null} onClose={() => setPermanentDeleteTarget(null)}
        title="Permanently delete session" size="sm">
        <Stack gap="sm">
          <Text size="sm">
            Permanently delete <Text span fw={700}>{permanentDeleteTarget?.displayName ?? ''}</Text>? This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setPermanentDeleteTarget(null)}>Cancel</Button>
            <Button color="red" onClick={() => {
              if (!permanentDeleteTarget) return;
              const recoveryId = permanentDeleteTarget.recoveryId;
              void runOperation(async () => {
                const data = await permanentlyDeleteRecentlyDeleted(recoveryId);
                setTrashEntries(data.entries);
              }, () => setPermanentDeleteTarget(null));
            }}>Delete permanently</Button>
          </Group>
        </Stack>
      </Modal>

      {/* The working slot is durable too; this guard decides identity/replacement. */}
      <WorkingSessionGuardModal
        opened={switchGuardOpen}
        mapCount={guardedWorkingMapCount}
        name={nameInput}
        actionDescription="Switching sessions"
        onNameChange={setNameInput}
        onSave={doSaveAndSwitch}
        onDiscard={doDiscardAndSwitch}
        onCancel={cancelSwitch}
      />

      <SessionCompareModal
        opened={compareOpen}
        onClose={closeCompare}
        initialSelectedIds={[...selected]}
      />

      <Card
        ref={panelRef}
        shadow={embedded ? undefined : 'sm'}
        padding={embedded ? 0 : (isMaximized ? 'md' : 'sm')}
        radius="md"
        withBorder={!embedded}
        h={embedded ? 'auto' : '100%'}
        className="session-manager-card session-manager-refined"
        style={{ background: embedded ? 'transparent' : undefined, overflow: embedded ? 'visible' : 'auto' }}
      >
        <Stack gap={isMaximized ? 10 : 6}>
          {operationError && (
            <Alert color="red" variant="light" p="xs" withCloseButton
              onClose={() => setOperationError(null)}>
              <Text size="xs">{operationError}</Text>
            </Alert>
          )}
          {activationCheckpointNotice && (
            <Group className="session-manager-undo-toast" gap={6} wrap="nowrap" role="status">
              <IconRestore size={13} aria-hidden="true" />
              <Text size="xs" c="dimmed" style={{ flex: 1 }}>Change saved</Text>
              <Button size="compact-xs" variant="subtle"
                onClick={() => { void runOperation(undoChangesSinceOpening); }}>
                Undo
              </Button>
              <ActionIcon size="xs" variant="subtle" color="gray" aria-label="Dismiss Undo"
                onClick={dismissActivationCheckpointNotice}>
                <IconX size={11} />
              </ActionIcon>
            </Group>
          )}
          {sessionLifecycle === 'historical' && crossLeague && (
            <Alert color="yellow" variant="light" p="xs"
              title={`Previous league: ${settings.leagueName}`}>
              <Stack gap={6}>
                <Text size="xs">
                  Capture and automatic repricing stay paused because {confirmedLeague} is the current league. Keep this session as history or fork a current-league copy.
                </Text>
                <Group gap={6}>
                  <Button size="compact-xs" variant="light"
                    onClick={() => {
                      setNameInput(`${activeSessionName ?? 'Session'} — ${confirmedLeague}`);
                      openFork();
                    }}>Fork into {confirmedLeague}</Button>
                  <Button size="compact-xs" variant="default"
                    onClick={() => requestSwitch('__new__')}>Start empty {confirmedLeague} session</Button>
                </Group>
              </Stack>
            </Alert>
          )}
          <div className="session-manager-overview">
            <Group justify="space-between" gap={6} wrap="nowrap" className="session-manager-status-row">
              {/* Storage indicator lives left; the folder is the complete
                  user-authored ledger-data backup unit. */}
              <Group gap={4} wrap="nowrap">
                <Tooltip label="Complete ledger-data backup size" position="right" withArrow>
                  <Text size={isMaximized ? 'sm' : 'xs'} c="dimmed" style={{ cursor: 'default' }}>{storageMB} MB</Text>
                </Tooltip>
                <Tooltip label="Open complete data folder" withArrow>
                  <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Open data folder"
                    onClick={() => { void runOperation(openRepositoryFolder); }}>
                    <IconFolderOpen size={12} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <Tooltip label={saveError ?? 'The latest acknowledged filesystem save'} position="left" withArrow>
                <Badge
                  color={saveStatus === 'failed' ? 'red' : saveStatus === 'saving' ? 'yellow' : 'green'}
                  variant="dot"
                  size={isMaximized ? 'md' : 'sm'}
                >
                  {saveStatus === 'failed' ? 'Save failed' : saveStatus === 'saving' ? 'Saving' : 'Auto-saved'}
                </Badge>
              </Tooltip>
            </Group>
            {saveStatus === 'failed' && (
              <Alert color="red" variant="light" p="xs">
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs" lineClamp={2}>{saveError ?? 'The latest changes were not saved.'}</Text>
                  <Button size="compact-xs" variant="default" leftSection={<IconRefresh size={11} />}
                    onClick={() => { void runOperation(retryRepositorySave); }}>Retry</Button>
                </Group>
              </Alert>
            )}
            <Group gap={4} wrap="nowrap" align="center">
              <Select
                style={{ flex: 1, minWidth: 0 }}
                data={[
                  { value: '__new__', label: `— New Session —${liveSessionId === null ? ' · capture target' : ''}` },
                  ...sessionEntries.map((s) => ({
                    value: s.id,
                    label: `${s.name}${s.id === liveSessionId ? ' · capture target' : ''}${s.status === 'ready' ? '' : ` — ${s.status}`} (${sessionMapCount(s)} maps, ${new Date(s.createdAt).toLocaleDateString()})`,
                    disabled: s.status !== 'ready',
                  })),
                ]}
                value={activeSessionId ?? '__new__'}
                onChange={handleSessionSelect}
                onOptionSubmit={(value) => {
                  const intent = resolveReselectedNewSessionIntent(
                    value,
                    activeSessionId ?? '__new__',
                  );
                  if (intent) {
                    setSessionSelectOpen(false);
                    requestSwitch(intent);
                  }
                }}
                allowDeselect={false}
                dropdownOpened={sessionSelectOpen}
                onDropdownOpen={() => setSessionSelectOpen(true)}
                onDropdownClose={() => setSessionSelectOpen(false)}
                searchable size={isMaximized ? 'md' : 'sm'}
              />
              {!isUnsaved && (
                <>
                  <Tooltip label="Rename session" withArrow>
                    <ActionIcon variant="default" size="lg" aria-label="Rename session"
                      onClick={() => { setNameInput(activeSessionName ?? ''); openRename(); }}>
                      <IconPencil size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Move session to Recently Deleted" withArrow>
                    <ActionIcon variant="default" size="lg" aria-label="Move session to Recently Deleted"
                      onMouseEnter={() => setHoveredTrashTop(true)}
                      onMouseLeave={() => setHoveredTrashTop(false)}
                      style={hoveredTrashTop ? { borderColor: 'var(--mantine-color-red-7)', color: 'var(--mantine-color-red-4)' } : undefined}
                      onClick={() => { setHoveredTrashTop(false); if (activeSessionId) setDeleteTarget(activeSessionId); }}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </>
              )}
            </Group>
            {sessionLifecycle === 'historical' && !crossLeague && (
              <Group justify="space-between" gap={6} wrap="nowrap" className="session-manager-viewing-status">
                <Text size="xs" c="dimmed" lineClamp={1}>Viewing saved session</Text>
                <Button size="compact-xs" variant="subtle" leftSection={<IconPlayerPlay size={11} />}
                  onClick={() => { void runOperation(resumeCurrent); }}>
                  Resume capture
                </Button>
              </Group>
            )}
          </div>
          <Stack gap={4} className="session-manager-actions">
            <SimpleGrid cols={2} spacing={isMaximized ? 8 : 4}>
              <Button size={isMaximized ? 'sm' : 'xs'} variant={savedFlash ? 'light' : 'default'} color={savedFlash ? 'green' : undefined}
                leftSection={savedFlash ? <IconCheck size={12} /> : <IconDeviceFloppy size={12} />}
                rightSection={compactPanel ? undefined : <span style={{ width: 12 }} aria-hidden="true" />}
                styles={TILE_STYLES}
                onClick={() => { setNameInput(''); openSave(); }}>
                {savedFlash ? 'Saved' : isUnsaved ? (compactPanel ? 'Save' : 'Save to Sessions') : (compactPanel ? 'Duplicate' : 'Duplicate as new')}
              </Button>
              <Tooltip label={selectableSessionEntries.length < 2 ? 'Save at least 2 sessions to compare' : 'Compare up to 6 saved sessions side by side'} withArrow>
                <span style={{ display: 'flex', flex: 1 }}>
                  <Button size={isMaximized ? 'sm' : 'xs'} variant="default"
                    leftSection={<IconArrowsLeftRight size={12} />}
                    rightSection={compactPanel ? undefined : <span style={{ width: 12 }} aria-hidden="true" />}
                    styles={TILE_STYLES}
                    disabled={selectableSessionEntries.length < 2}
                    onClick={openCompare} style={{ flex: 1 }}>
                    Compare
                  </Button>
                </span>
              </Tooltip>
            </SimpleGrid>
            <SimpleGrid cols={2} spacing={isMaximized ? 8 : 4}>
              <Button size={isMaximized ? 'sm' : 'xs'} variant="default"
                leftSection={<IconBrandDiscord size={12} />}
                rightSection={compactPanel ? undefined : <span style={{ width: 12 }} aria-hidden="true" />}
                styles={TILE_STYLES}
                onClick={() => triggerStrategyAction('import')}>
                {compactPanel ? 'Import' : 'Import Strategy'}
              </Button>
              <Button size={isMaximized ? 'sm' : 'xs'} variant="default"
                leftSection={<IconShare2 size={12} />}
                rightSection={compactPanel ? undefined : <span style={{ width: 12 }} aria-hidden="true" />}
                styles={TILE_STYLES}
                onClick={handleOpenShare}>
                {compactPanel ? 'Share' : 'Share Strategy'}
              </Button>
            </SimpleGrid>
            <SimpleGrid cols={2} spacing={isMaximized ? 8 : 4}>
              <Button size={isMaximized ? 'sm' : 'xs'} variant="default"
                leftSection={<IconHistory size={12} />} styles={TILE_STYLES}
                onClick={showVersionHistory}>
                {compactPanel ? 'Versions' : 'Version history'}
              </Button>
              <Button size={isMaximized ? 'sm' : 'xs'} variant="default"
                leftSection={<IconTrash size={12} />} styles={TILE_STYLES}
                onClick={showRecentlyDeleted}>
                {compactPanel ? 'Deleted' : 'Recently Deleted'}
              </Button>
            </SimpleGrid>
          </Stack>
          {sessionEntries.length > 0 && (
            <CollapsibleSection variant="group" defaultOpen={false} title="Saved sessions"
              className="session-manager-saved-section"
              headerClassName="session-manager-saved-section-header"
              contentClassName="session-manager-saved-section-content"
              right={<Badge size={isMaximized ? 'sm' : 'xs'} variant="light" color="gray">{sessionEntries.length}</Badge>}>

              {/* Bulk action bar — ALWAYS mounted, revealed via visibility so
                  selecting a row never reflows the list under the cursor
                  (Sad, 2026-07-20). visibility (not opacity) also removes the
                  hidden buttons from pointer + accessibility trees. */}
              <Group gap={4} wrap="nowrap"
                style={{ visibility: selected.size > 0 ? 'visible' : 'hidden' }}>
                  <Text size={isMaximized ? 'sm' : 'xs'} c="dimmed" style={{ flex: 1 }}>{selected.size} selected</Text>
                  <Tooltip label="Export selected as JSON" withArrow>
                    <Button size={isMaximized ? 'sm' : 'xs'} variant="default" leftSection={<IconDownload size={11} />}
                      onClick={() => { void runOperation(handleExport); }}>
                      Export
                    </Button>
                  </Tooltip>
                  <Tooltip label="Move selected to Recently Deleted" withArrow>
                    <Button size={isMaximized ? 'sm' : 'xs'} variant="default" leftSection={<IconTrash size={11} />}
                      onMouseEnter={() => setHoveredBulkDelete(true)}
                      onMouseLeave={() => setHoveredBulkDelete(false)}
                      style={hoveredBulkDelete ? { borderColor: 'var(--mantine-color-red-7)', color: 'var(--mantine-color-red-4)' } : undefined}
                      onClick={() => { setHoveredBulkDelete(false); openBulkDelete(); }}>
                      Move
                    </Button>
                  </Tooltip>
                  <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Clear selection" onClick={clearSelection}><IconX size={11} /></ActionIcon>
              </Group>

              {/* Select all header */}
              <Group gap={6} justify="space-between">
                <Group gap={6}>
                  <Checkbox size={isMaximized ? 'sm' : 'xs'}
                    checked={selected.size === selectableSessionEntries.length && selectableSessionEntries.length > 0}
                    indeterminate={selected.size > 0 && selected.size < selectableSessionEntries.length}
                    disabled={selectableSessionEntries.length === 0}
                    onChange={toggleSelectAll} />
                  <Text size={isMaximized ? 'sm' : 'xs'} c="dimmed">Select all</Text>
                </Group>
                <Tooltip label="Import sessions from a JSON backup file" withArrow>
                  <Button size={isMaximized ? 'sm' : 'xs'} variant="subtle" color="gray" leftSection={<IconUpload size={11} />}
                    onClick={() => importFileRef.current?.click()}>
                    Restore from Backup
                  </Button>
                </Tooltip>
                <input ref={importFileRef} type="file" accept=".json" style={{ display: 'none' }}
                  onChange={handleImportFile} />
              </Group>

              {/* Session rows */}
              <Stack gap={isMaximized ? 5 : 3}>
                {sessionEntries.map((s) => {
                  const isHovered = hoveredRowId === s.id;
                  const isSelected = selected.has(s.id);
                  return (
                    <Group key={s.id} gap={6} wrap="nowrap"
                      className={`session-manager-saved-row${isSelected ? ' is-selected' : ''}${isHovered ? ' is-hovered' : ''}`}
                      onMouseEnter={() => setHoveredRowId(s.id)}
                      onMouseLeave={() => setHoveredRowId(null)}
                      style={{
                        padding: isMaximized ? '7px 8px' : '3px 4px', borderRadius: 4,
                        transition: 'background 120ms ease',
                      }}>
                      <Checkbox size={isMaximized ? 'sm' : 'xs'} checked={isSelected}
                        disabled={s.status !== 'ready'}
                        onChange={() => toggleSelect(s.id)} style={{ flexShrink: 0 }} />
                      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                        <Group gap={4} wrap="nowrap">
                          <Text size={isMaximized ? 'sm' : 'xs'} fw={600} lineClamp={1}>{s.name}</Text>
                          {s.status !== 'ready' && (
                            <Badge size="xs" color="red" variant="light">{s.status}</Badge>
                          )}
                        </Group>
                        <Text size={isMaximized ? 'sm' : 'xs'} c="dimmed">{sessionMapCount(s)} maps · {new Date(s.createdAt).toLocaleDateString()}</Text>
                      </Stack>
                      <Group gap={4} wrap="nowrap">
                        <Button size={isMaximized ? 'sm' : 'xs'} variant="default"
                          styles={{ root: { opacity: isHovered ? 1 : 0, transition: 'opacity 120ms ease' } }}
                          onFocus={() => setHoveredRowId(s.id)}
                          onBlur={() => setHoveredRowId(null)}
                          disabled={s.status !== 'ready'}
                          onClick={() => requestSwitch(s.id)}>Load</Button>
                        <ActionIcon size={isMaximized ? 'lg' : 'md'} variant="default" aria-label={`Move session ${s.name} to Recently Deleted`}
                          onMouseEnter={() => setHoveredTrashId(s.id)}
                          onMouseLeave={() => setHoveredTrashId(null)}
                          onFocus={() => { setHoveredRowId(s.id); setHoveredTrashId(s.id); }}
                          onBlur={() => { setHoveredRowId(null); setHoveredTrashId(null); }}
                          style={{
                            opacity: isHovered ? 1 : 0,
                            transition: 'opacity 120ms ease',
                            color: hoveredTrashId === s.id ? 'var(--mantine-color-red-4)' : undefined,
                            borderColor: hoveredTrashId === s.id ? 'var(--mantine-color-red-7)' : undefined,
                          }}
                          onClick={() => { setHoveredTrashId(null); setDeleteTarget(s.id); }}>
                          <IconTrash size={15} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  );
                })}
              </Stack>
            </CollapsibleSection>
          )}
        </Stack>
      </Card>
    </>
  );
};
