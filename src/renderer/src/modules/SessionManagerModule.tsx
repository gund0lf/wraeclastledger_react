import {
  Card, Text, Button, Group, Stack, Select, TextInput, ActionIcon,
  Badge, Modal, Divider, Tooltip, Checkbox, Radio, Alert, ScrollArea, SimpleGrid,
} from '@mantine/core';
import { useDisclosure, useElementSize } from '@mantine/hooks';
import { useState, useMemo, useRef, useEffect } from 'react';
import { DEFAULT_SETTINGS, useSessionKeys, useSessionStore } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import { IconTrash, IconPencil, IconDeviceFloppy, IconShare2, IconBrandDiscord, IconDownload, IconUpload, IconX, IconArrowsLeftRight, IconCheck, IconFolderOpen, IconRefresh } from '@tabler/icons-react';
import type { SavedSession } from '../types';
import { SessionCompareModal } from '../components/SessionCompareModal';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { WorkingSessionGuardModal } from '../components/WorkingSessionGuardModal';
import { isWorkingSessionMeaningful } from '../utils/workingSession';
import { usePanelMaximized } from '../layout/panelLayoutContext';
import {
  deleteNamed,
  exportRepositorySessions,
  forkCurrentToConfirmedLeague,
  importRepositoryDocument,
  loadNamed,
  nameCurrent,
  openRepositoryFolder,
  renameNamed,
  resumeCurrent,
  retryRepositorySave,
  startWorking,
} from '../repository/sessionRepositoryRuntime';
import { SESSION_REPOSITORY_MAX_IMPORT_BYTES } from '../../../shared/sessionRepositoryIpc';
import { confirmedLeagueSync } from '../utils/league';

const TILE_STYLES = { inner: { width: '100%' }, label: { flex: 1, textAlign: 'center' as const } };

export const SessionManagerModule = ({ embedded = false }: { embedded?: boolean } = {}) => {
  const panelIsMaximized = usePanelMaximized('session-manager');
  const isMaximized = !embedded && panelIsMaximized;
  const { ref: panelRef, width: panelWidth } = useElementSize();
  const compactPanel = panelWidth > 0 && panelWidth < 285;
  const {
    maps, settings, repositorySessions, activeSessionId, activeSessionName,
    repositorySizeBytes, saveStatus, saveError, sessionLifecycle, liveSessionId,
  } = useSessionKeys(
    'maps', 'settings', 'repositorySessions', 'activeSessionId', 'activeSessionName',
    'repositorySizeBytes', 'saveStatus', 'saveError', 'sessionLifecycle', 'liveSessionId',
  );

  const [saveOpen,   { open: openSave,   close: closeSave   }] = useDisclosure(false);
  const [forkOpen,   { open: openFork,   close: closeFork   }] = useDisclosure(false);
  const [renameOpen, { open: openRename, close: closeRename }] = useDisclosure(false);
  const [bulkDeleteOpen, { open: openBulkDelete, close: closeBulkDelete }] = useDisclosure(false);
  const [importOpen, { open: openImport, close: closeImport }] = useDisclosure(false);
  const [compareOpen, { open: openCompare, close: closeCompare }] = useDisclosure(false);
  const [switchGuardOpen, { open: openSwitchGuard, close: closeSwitchGuard }] = useDisclosure(false);

  const [nameInput, setNameInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null); // WP5: single-delete confirmation
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null); // guard: session to switch to once the unsaved one is handled
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
  const importFileRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []); // clear pending flash on unmount

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

  const performSwitch = async (target: string): Promise<void> => {
    if (target === '__new__') await startWorking(true);
    else await loadNamed(target);
  };

  const returnToLive = async (): Promise<void> => {
    if (liveSessionId) await loadNamed(liveSessionId);
    else await startWorking();
  };

  // Peeking at a named session preserves the live working target. Only a
  // deliberate new-live-session transition can replace the working slot.
  const requestSwitch = (target: string) => {
    const current = useSessionStore.getState();
    if (target === '__new__' && current.activeSessionId === null &&
        isWorkingSessionMeaningful(current, DEFAULT_SETTINGS)) {
      setPendingSwitch(target);
      setNameInput('');
      openSwitchGuard();
    } else {
      void runOperation(() => performSwitch(target));
    }
  };

  const handleSessionSelect = (val: string | null) => {
    setSessionSelectOpen(false);
    requestSwitch(val && val !== '__new__' ? val : '__new__');
  };

  const doSaveAndSwitch = async () => {
    const name = nameInput.trim();
    if (!name || pendingSwitch === null) return;
    await runOperation(async () => {
      await nameCurrent(name);
      await performSwitch(pendingSwitch);
    }, () => {
      setNameInput('');
      setPendingSwitch(null);
      closeSwitchGuard();
    });
  };

  const doDiscardAndSwitch = () => {
    if (pendingSwitch === null) return;
    void runOperation(() => performSwitch(pendingSwitch));
    setPendingSwitch(null);
    closeSwitchGuard();
  };

  const cancelSwitch = () => {
    setPendingSwitch(null);
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
  const hasDistinctLiveTarget = sessionLifecycle === 'historical' && activeSessionId !== liveSessionId;
  const flashSaved = () => {
    setSavedFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(false), 1600);
  };
  const { triggerStrategyAction } = useUIStore();

  return (
    <>
      {/* ── Save modal ── */}
      <Modal opened={saveOpen} onClose={closeSave} title={isUnsaved ? 'Name Session' : 'Duplicate Session'} size="sm">
        <Stack gap="sm">
          <TextInput label="Session Name" placeholder="e.g. T16 Deli — 72 maps"
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
              disabled={!nameInput.trim()}>Save</Button>
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
      <Modal opened={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Delete Session" size="sm">
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
      <Modal opened={bulkDeleteOpen} onClose={closeBulkDelete} title="Delete Sessions" size="sm">
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
              Delete {selected.size}
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

      {/* The working slot is durable too; this guard decides identity/replacement. */}
      <WorkingSessionGuardModal
        opened={switchGuardOpen}
        mapCount={maps.length}
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
        style={{ background: embedded ? 'transparent' : undefined, overflow: embedded ? 'visible' : 'auto' }}
      >
        <Stack gap={isMaximized ? 10 : 6}>
          {operationError && (
            <Alert color="red" variant="light" p="xs" withCloseButton
              onClose={() => setOperationError(null)}>
              <Text size="xs">{operationError}</Text>
            </Alert>
          )}
          {sessionLifecycle === 'historical' && (
            <Alert color="yellow" variant="light" p="xs"
              title={crossLeague ? 'Previous-league session' : 'Historical session'}>
              <Stack gap={6}>
                <Text size="xs">
                  {crossLeague
                    ? `This session belongs to ${settings.leagueName}. Capture and automatic repricing stay paused while ${confirmedLeague} is active.`
                    : 'Capture is paused while you inspect this session. Resume it to make it the live capture target.'}
                </Text>
                <Group gap={6}>
                  {hasDistinctLiveTarget && (
                    <Button size="compact-xs" variant="light"
                      onClick={() => { void runOperation(returnToLive); }}>Return to live session</Button>
                  )}
                  {crossLeague ? (
                    <>
                      <Button size="compact-xs" variant="default"
                        onClick={() => requestSwitch('__new__')}>Start new session</Button>
                      <Button size="compact-xs" variant="light"
                        onClick={() => {
                          setNameInput(`${activeSessionName ?? 'Session'} — ${confirmedLeague}`);
                          openFork();
                        }}>Fork into {confirmedLeague}</Button>
                    </>
                  ) : (
                    <>
                      <Button size="compact-xs" variant="light"
                        onClick={() => { void runOperation(resumeCurrent); }}>Resume session</Button>
                      <Button size="compact-xs" variant="default"
                        onClick={() => requestSwitch('__new__')}>Start new session</Button>
                    </>
                  )}
                </Group>
              </Stack>
            </Alert>
          )}
          <Group justify="space-between" gap={6} wrap="nowrap">
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
                { value: '__new__', label: '— New Session —' },
                ...sessionEntries.map((s) => ({
                  value: s.id,
                  label: `${s.name}${s.status === 'ready' ? '' : ` — ${s.status}`} (${sessionMapCount(s)} maps, ${new Date(s.createdAt).toLocaleDateString()})`,
                  disabled: s.status !== 'ready',
                })),
              ]}
              value={activeSessionId ?? '__new__'}
              onChange={handleSessionSelect}
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
                <Tooltip label="Delete session" withArrow>
                  <ActionIcon variant="default" size="lg" aria-label="Delete session"
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
          <SimpleGrid cols={2} spacing={isMaximized ? 8 : 4}>
            <Button size={isMaximized ? 'sm' : 'xs'} variant={savedFlash ? 'light' : 'default'} color={savedFlash ? 'green' : undefined}
              leftSection={savedFlash ? <IconCheck size={12} /> : <IconDeviceFloppy size={12} />}
              rightSection={compactPanel ? undefined : <span style={{ width: 12 }} aria-hidden="true" />}
              styles={TILE_STYLES}
              onClick={() => { setNameInput(''); openSave(); }}>
              {savedFlash ? 'Named' : isUnsaved ? (compactPanel ? 'Name' : 'Name session') : (compactPanel ? 'Duplicate' : 'Duplicate as new')}
            </Button>
            <Tooltip label={selectableSessionEntries.length < 2 ? 'Save at least 2 sessions to compare' : 'Compare 2-3 saved sessions side by side'} withArrow>
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
              onClick={() => triggerStrategyAction('share')}>
              {compactPanel ? 'Share' : 'Share Strategy'}
            </Button>
          </SimpleGrid>
          {sessionEntries.length > 0 && (
            <CollapsibleSection variant="group" defaultOpen={false} title="History"
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
                  <Tooltip label="Delete selected" withArrow>
                    <Button size={isMaximized ? 'sm' : 'xs'} variant="default" leftSection={<IconTrash size={11} />}
                      onMouseEnter={() => setHoveredBulkDelete(true)}
                      onMouseLeave={() => setHoveredBulkDelete(false)}
                      style={hoveredBulkDelete ? { borderColor: 'var(--mantine-color-red-7)', color: 'var(--mantine-color-red-4)' } : undefined}
                      onClick={() => { setHoveredBulkDelete(false); openBulkDelete(); }}>
                      Delete
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
                      onMouseEnter={() => setHoveredRowId(s.id)}
                      onMouseLeave={() => setHoveredRowId(null)}
                      style={{
                        padding: isMaximized ? '7px 8px' : '3px 4px', borderRadius: 4,
                        background: isSelected
                          ? 'rgba(74,158,255,0.07)'
                          : isHovered ? 'rgba(255,255,255,0.04)' : undefined,
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
                        <ActionIcon size={isMaximized ? 'lg' : 'md'} variant="default" aria-label={`Delete session ${s.name}`}
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
