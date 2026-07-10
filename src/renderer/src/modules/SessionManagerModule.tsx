import {
  Card, Text, Button, Group, Stack, Select, TextInput, ActionIcon,
  Badge, Modal, Divider, Tooltip, Checkbox, Radio, Alert, ScrollArea,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useSessionKeys } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import { IconTrash, IconPencil, IconDeviceFloppy, IconShare2, IconBrandDiscord, IconDownload, IconUpload, IconX, IconArrowsLeftRight, IconCheck } from '@tabler/icons-react';
import type { SavedSession } from '../types';
import { SessionCompareModal } from '../components/SessionCompareModal';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';

const TILE_STYLES = { inner: { width: '100%' }, label: { flex: 1, textAlign: 'center' as const } };

export const SessionManagerModule = () => {
  const {
    maps, savedSessions, activeSessionId, activeSessionName,
    saveAsNewSession, loadSession, deleteSession, renameSession, newSession,
    importSessions,
  } = useSessionKeys(
    'maps', 'savedSessions', 'activeSessionId', 'activeSessionName',
    'saveAsNewSession', 'loadSession', 'deleteSession', 'renameSession', 'newSession',
    'importSessions',
  );

  const [saveOpen,   { open: openSave,   close: closeSave   }] = useDisclosure(false);
  const [renameOpen, { open: openRename, close: closeRename }] = useDisclosure(false);
  const [bulkDeleteOpen, { open: openBulkDelete, close: closeBulkDelete }] = useDisclosure(false);
  const [importOpen, { open: openImport, close: closeImport }] = useDisclosure(false);
  const [compareOpen, { open: openCompare, close: closeCompare }] = useDisclosure(false);
  const [switchGuardOpen, { open: openSwitchGuard, close: closeSwitchGuard }] = useDisclosure(false);

  const [nameInput, setNameInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null); // WP5: single-delete confirmation
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null); // guard: session to switch to once the unsaved one is handled
  const [savedFlash, setSavedFlash] = useState(false); // brief green confirmation on the Save tile after a save
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null); // row hover for history tile reveal
  const [hoveredTrashTop, setHoveredTrashTop] = useState(false); // top-right delete icon red hover
  const [hoveredTrashId, setHoveredTrashId] = useState<string | null>(null); // history row delete icon red hover
  const [hoveredBulkDelete, setHoveredBulkDelete] = useState(false); // bulk-bar delete button red hover
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importData, setImportData] = useState<SavedSession[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [conflictMode, setConflictMode] = useState<'skip' | 'overwrite'>('skip');
  const importFileRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []); // clear pending flash on unmount

  const sessionEntries = useMemo(() =>
    Object.values(savedSessions).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
  [savedSessions]);

  const storageMB = useMemo(() => {
    try {
      const raw = localStorage.getItem('map-tracker-storage') ?? '';
      return (new Blob([raw]).size / 1024 / 1024).toFixed(2);
    } catch { return '?'; }
  }, [savedSessions]);

  const performSwitch = (target: string) => {
    if (target === '__new__') newSession();
    else loadSession(target);
  };

  // Guard ONLY the not-yet-saved session that has real work in it: a named
  // session auto-saves, so leaving it is always safe, but an unnamed new
  // session lives only in memory and switching would silently discard it.
  const requestSwitch = (target: string) => {
    if (!activeSessionId && maps.length > 0) {
      setPendingSwitch(target);
      setNameInput('');
      openSwitchGuard();
    } else {
      performSwitch(target);
    }
  };

  const handleSessionSelect = (val: string | null) => {
    requestSwitch(val && val !== '__new__' ? val : '__new__');
  };

  const doSaveAndSwitch = () => {
    const name = nameInput.trim();
    if (!name || pendingSwitch === null) return;
    saveAsNewSession(name);       // persist the current work under a name
    performSwitch(pendingSwitch); // then navigate to the requested session
    setNameInput('');
    setPendingSwitch(null);
    closeSwitchGuard();
  };

  const doDiscardAndSwitch = () => {
    if (pendingSwitch === null) return;
    performSwitch(pendingSwitch);
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
    if (selected.size === sessionEntries.length) setSelected(new Set());
    else setSelected(new Set(sessionEntries.map((s) => s.id)));
  };

  const clearSelection = () => setSelected(new Set());

  // ── Export selected ────────────────────────────────────────────────────────
  const handleExport = () => {
    const toExport = sessionEntries.filter((s) => selected.has(s.id));
    const payload = JSON.stringify({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      sessions: toExport,
    }, null, 2);
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
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const sessions: SavedSession[] = parsed.sessions ?? (Array.isArray(parsed) ? parsed : null);
        if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
          setImportError('No valid sessions found in this file.');
          setImportData(null);
        } else {
          setImportData(sessions);
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

  const handleConfirmImport = () => {
    if (!importData) return;
    importSessions(importData, conflictMode);
    setImportData(null);
    closeImport();
  };

  const conflictCount = importData
    ? importData.filter((s) => !!savedSessions[s.id]).length
    : 0;

  const isUnsaved = !activeSessionId;
  const flashSaved = () => {
    setSavedFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(false), 1600);
  };
  const { triggerStrategyAction } = useUIStore();

  return (
    <>
      {/* ── Save modal ── */}
      <Modal opened={saveOpen} onClose={closeSave} title="Save Session" size="sm">
        <Stack gap="sm">
          <TextInput label="Session Name" placeholder="e.g. T16 Deli — 72 maps"
            value={nameInput} onChange={(e) => setNameInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && nameInput.trim() && (saveAsNewSession(nameInput.trim()), setNameInput(''), closeSave(), flashSaved())}
            autoFocus />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeSave}>Cancel</Button>
            <Button onClick={() => { saveAsNewSession(nameInput.trim()); setNameInput(''); closeSave(); flashSaved(); }}
              disabled={!nameInput.trim()}>Save</Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── Rename modal ── */}
      <Modal opened={renameOpen} onClose={closeRename} title="Rename Session" size="sm">
        <Stack gap="sm">
          <TextInput label="New Name" value={nameInput}
            onChange={(e) => setNameInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && nameInput.trim() && activeSessionId && (renameSession(activeSessionId, nameInput.trim()), setNameInput(''), closeRename())}
            autoFocus />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeRename}>Cancel</Button>
            <Button onClick={() => { if (activeSessionId) renameSession(activeSessionId, nameInput.trim()); setNameInput(''); closeRename(); }}
              disabled={!nameInput.trim()}>Rename</Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── Single delete confirmation (WP5) ── */}
      <Modal opened={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Delete Session" size="sm">
        <Stack gap="sm">
          <Text size="sm">
            Permanently delete <Text span fw={700}>{deleteTarget ? savedSessions[deleteTarget]?.name : ''}</Text>? This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button color="red" onClick={() => {
              if (deleteTarget) {
                deleteSession(deleteTarget);
                setSelected((prev) => { const next = new Set(prev); next.delete(deleteTarget); return next; }); // prune stale selection id
              }
              setDeleteTarget(null);
            }}>Delete</Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── Bulk delete confirmation ── */}
      <Modal opened={bulkDeleteOpen} onClose={closeBulkDelete} title="Delete Sessions" size="sm">
        <Stack gap="sm">
          <Text size="sm">
            Permanently delete <Text span fw={700}>{selected.size} session{selected.size !== 1 ? 's' : ''}</Text>? This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeBulkDelete}>Cancel</Button>
            <Button color="red" onClick={() => {
              selected.forEach((id) => deleteSession(id));
              clearSelection();
              closeBulkDelete();
            }}>
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
                    const exists = !!savedSessions[s.id];
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
                <Button color="teal" leftSection={<IconUpload size={12} />} onClick={handleConfirmImport}>
                  Import {conflictMode === 'skip' ? importData.length - conflictCount : importData.length} session{importData.length !== 1 ? 's' : ''}
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>

      {/* ── Unsaved-session guard (no manual save button; auto-save only covers named sessions) ── */}
      <Modal opened={switchGuardOpen} onClose={cancelSwitch} title="Unsaved session" size="sm">
        <Stack gap="sm">
          <Text size="sm">
            Your current session has <Text span fw={700}>{maps.length} map{maps.length !== 1 ? 's' : ''}</Text> and
            isn&apos;t saved yet. Switching will discard it unless you save it first.
          </Text>
          <TextInput label="Save as" placeholder="e.g. T16 Deli — 72 maps"
            value={nameInput} onChange={(e) => setNameInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && nameInput.trim() && doSaveAndSwitch()}
            autoFocus />
          <Group justify="space-between">
            <Button variant="subtle" color="red" onClick={doDiscardAndSwitch}>Discard &amp; switch</Button>
            <Group gap="xs">
              <Button variant="default" onClick={cancelSwitch}>Cancel</Button>
              <Button color="blue" onClick={doSaveAndSwitch} disabled={!nameInput.trim()}>Save &amp; switch</Button>
            </Group>
          </Group>
        </Stack>
      </Modal>

      <SessionCompareModal
        opened={compareOpen}
        onClose={closeCompare}
        initialSelectedIds={[...selected]}
      />

      <Card shadow="sm" padding="sm" radius="md" withBorder h="100%" style={{ overflow: 'auto' }}>
        <Stack gap={6}>
          <Group justify="space-between" gap={6} wrap="nowrap">
            {/* Storage indicator lives LEFT (Sad 2026-07-06: balance — right side
                already carries the save-state badge). An "open save location"
                folder icon is deliberately DEFERRED to WP14: sessions live in
                localStorage (a LevelDB blob inside userData), so today the
                folder contains nothing user-usable — the icon lands when
                sessions-as-files makes it truthful. */}
            <Tooltip label="Total localStorage used by WraeclastLedger" position="right" withArrow>
              <Text size="xs" c={parseFloat(storageMB) > 4 ? 'orange' : 'dimmed'} style={{ cursor: 'default' }}>
                {storageMB} MB
              </Text>
            </Tooltip>
            {isUnsaved
              ? <Badge color="orange" variant="dot" size="sm">Unsaved</Badge>
              : (
                <Tooltip label="Changes to this session are saved automatically" position="left" withArrow>
                  <Badge color="green" variant="dot" size="sm">Auto-saved</Badge>
                </Tooltip>
              )
            }
          </Group>
          <Group gap={4} wrap="nowrap" align="center">
            <Select
              style={{ flex: 1, minWidth: 0 }}
              data={[
                { value: '__new__', label: '— New Session —' },
                ...sessionEntries.map((s) => ({
                  value: s.id,
                  label: `${s.name} (${s.maps.length} maps, ${new Date(s.createdAt).toLocaleDateString()})`,
                })),
              ]}
              value={activeSessionId ?? '__new__'}
              onChange={handleSessionSelect}
              searchable size="sm"
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
          <Group gap={4} grow>
            <Button size="xs" variant={savedFlash ? 'light' : 'default'} color={savedFlash ? 'green' : undefined}
              leftSection={savedFlash ? <IconCheck size={12} /> : <IconDeviceFloppy size={12} />}
              rightSection={<span style={{ width: 12 }} aria-hidden="true" />}
              styles={TILE_STYLES}
              onClick={() => { setNameInput(''); openSave(); }}>
              {savedFlash ? 'Saved' : 'Save as'}
            </Button>
            <Tooltip label={sessionEntries.length < 2 ? 'Save at least 2 sessions to compare' : 'Compare 2-3 saved sessions side by side'} withArrow>
              <span style={{ display: 'flex', flex: 1 }}>
                <Button size="xs" variant="default"
                  leftSection={<IconArrowsLeftRight size={12} />}
                  rightSection={<span style={{ width: 12 }} aria-hidden="true" />}
                  styles={TILE_STYLES}
                  disabled={sessionEntries.length < 2}
                  onClick={openCompare} style={{ flex: 1 }}>
                  Compare
                </Button>
              </span>
            </Tooltip>
          </Group>
          <Group gap={4} grow>
            <Button size="xs" variant="default"
              leftSection={<IconBrandDiscord size={12} />}
              rightSection={<span style={{ width: 12 }} aria-hidden="true" />}
              styles={TILE_STYLES}
              onClick={() => triggerStrategyAction('import')}>
              Import Strategy
            </Button>
            <Button size="xs" variant="default"
              leftSection={<IconShare2 size={12} />}
              rightSection={<span style={{ width: 12 }} aria-hidden="true" />}
              styles={TILE_STYLES}
              onClick={() => triggerStrategyAction('share')}>
              Share Strategy
            </Button>
          </Group>
          {sessionEntries.length > 0 && (
            <CollapsibleSection variant="group" defaultOpen={false} title="History"
              right={<Badge size="xs" variant="light" color="gray">{sessionEntries.length}</Badge>}>

              {/* Bulk action bar — visible when ≥1 selected */}
              {selected.size > 0 && (
                <Group gap={4} wrap="nowrap">
                  <Text size="xs" c="dimmed" style={{ flex: 1 }}>{selected.size} selected</Text>
                  <Tooltip label="Export selected as JSON" withArrow>
                    <Button size="xs" variant="default" leftSection={<IconDownload size={11} />}
                      onClick={handleExport}>
                      Export
                    </Button>
                  </Tooltip>
                  <Tooltip label="Delete selected" withArrow>
                    <Button size="xs" variant="default" leftSection={<IconTrash size={11} />}
                      onMouseEnter={() => setHoveredBulkDelete(true)}
                      onMouseLeave={() => setHoveredBulkDelete(false)}
                      style={hoveredBulkDelete ? { borderColor: 'var(--mantine-color-red-7)', color: 'var(--mantine-color-red-4)' } : undefined}
                      onClick={() => { setHoveredBulkDelete(false); openBulkDelete(); }}>
                      Delete
                    </Button>
                  </Tooltip>
                  <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Clear selection" onClick={clearSelection}><IconX size={11} /></ActionIcon>
                </Group>
              )}

              {/* Select all header */}
              <Group gap={6} justify="space-between">
                <Group gap={6}>
                  <Checkbox size="xs"
                    checked={selected.size === sessionEntries.length && sessionEntries.length > 0}
                    indeterminate={selected.size > 0 && selected.size < sessionEntries.length}
                    onChange={toggleSelectAll} />
                  <Text size="xs" c="dimmed">Select all</Text>
                </Group>
                <Tooltip label="Import sessions from a JSON backup file" withArrow>
                  <Button size="xs" variant="subtle" color="gray" leftSection={<IconUpload size={11} />}
                    onClick={() => importFileRef.current?.click()}>
                    Restore from Backup
                  </Button>
                </Tooltip>
                <input ref={importFileRef} type="file" accept=".json" style={{ display: 'none' }}
                  onChange={handleImportFile} />
              </Group>

              {/* Session rows */}
              <Stack gap={3}>
                {sessionEntries.map((s) => {
                  const isHovered = hoveredRowId === s.id;
                  const isSelected = selected.has(s.id);
                  return (
                    <Group key={s.id} gap={6} wrap="nowrap"
                      onMouseEnter={() => setHoveredRowId(s.id)}
                      onMouseLeave={() => setHoveredRowId(null)}
                      style={{
                        padding: '3px 4px', borderRadius: 4,
                        background: isSelected
                          ? 'rgba(74,158,255,0.07)'
                          : isHovered ? 'rgba(255,255,255,0.04)' : undefined,
                        transition: 'background 120ms ease',
                      }}>
                      <Checkbox size="xs" checked={isSelected}
                        onChange={() => toggleSelect(s.id)} style={{ flexShrink: 0 }} />
                      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                        <Text size="xs" fw={600} lineClamp={1}>{s.name}</Text>
                        <Text size="xs" c="dimmed">{s.maps.length} maps · {new Date(s.createdAt).toLocaleDateString()}</Text>
                      </Stack>
                      <Group gap={4} wrap="nowrap">
                        <Button size="xs" variant="default"
                          styles={{ root: { opacity: isHovered ? 1 : 0, transition: 'opacity 120ms ease' } }}
                          onFocus={() => setHoveredRowId(s.id)}
                          onBlur={() => setHoveredRowId(null)}
                          onClick={() => requestSwitch(s.id)}>Load</Button>
                        <ActionIcon size="md" variant="default" aria-label={`Delete session ${s.name}`}
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
