import {
  Card, Text, Button, Group, Stack, Select, TextInput, ActionIcon,
  Badge, Modal, Divider, Tooltip, Checkbox, Radio, Alert, ScrollArea,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useMemo, useRef } from 'react';
import { useSessionStore } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import { FaTrash, FaPen, FaSave, FaPlus, FaShareAlt, FaDiscord, FaDownload, FaUpload } from 'react-icons/fa';
import type { SavedSession } from '../types';

export const SessionManagerModule = () => {
  const {
    maps, savedSessions, activeSessionId, activeSessionName,
    saveAsNewSession, updateCurrentSession, loadSession, deleteSession, renameSession, newSession,
    importSessions,
  } = useSessionStore();

  const [saveOpen,   { open: openSave,   close: closeSave   }] = useDisclosure(false);
  const [renameOpen, { open: openRename, close: closeRename }] = useDisclosure(false);
  const [bulkDeleteOpen, { open: openBulkDelete, close: closeBulkDelete }] = useDisclosure(false);
  const [importOpen, { open: openImport, close: closeImport }] = useDisclosure(false);

  const [nameInput, setNameInput] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importData, setImportData] = useState<SavedSession[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [conflictMode, setConflictMode] = useState<'skip' | 'overwrite'>('skip');
  const importFileRef = useRef<HTMLInputElement>(null);

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

  const handleSessionSelect = (val: string | null) => {
    if (!val || val === '__new__') newSession();
    else loadSession(val);
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
    a.download = `wraeclast-sessions-${new Date().toISOString().slice(0, 10)}.json`;
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
  const { triggerStrategyAction } = useUIStore();

  return (
    <>
      {/* ── Save modal ── */}
      <Modal opened={saveOpen} onClose={closeSave} title="Save Session" size="sm">
        <Stack gap="sm">
          <TextInput label="Session Name" placeholder="e.g. T16 Deli — 72 maps"
            value={nameInput} onChange={(e) => setNameInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && nameInput.trim() && (saveAsNewSession(nameInput.trim()), setNameInput(''), closeSave())}
            autoFocus />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeSave}>Cancel</Button>
            <Button onClick={() => { saveAsNewSession(nameInput.trim()); setNameInput(''); closeSave(); }}
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
                <Button color="teal" leftSection={<FaUpload size={10} />} onClick={handleConfirmImport}>
                  Import {conflictMode === 'skip' ? importData.length - conflictCount : importData.length} session{importData.length !== 1 ? 's' : ''}
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>

      <Card shadow="sm" padding="sm" radius="md" withBorder h="100%" style={{ overflow: 'auto' }}>
        <Stack gap={6}>
          <Select
            label="Load Session"
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
          <Group gap={4} grow>
            <Button size="xs" leftSection={<FaSave size={10} />} variant="light" color="blue"
              onClick={() => { setNameInput(''); openSave(); }}>
              Save as New
            </Button>
            {!isUnsaved && (
              <Button size="xs" leftSection={<FaSave size={10} />} variant="light" color="teal"
                onClick={updateCurrentSession}>Update</Button>
            )}
          </Group>
          <Group gap={4} grow>
            <Button size="xs" leftSection={<FaDiscord size={10} />} variant="subtle" color="indigo"
              onClick={() => triggerStrategyAction('import')}>
              Import
            </Button>
            <Button size="xs" leftSection={<FaShareAlt size={10} />} variant="subtle" color="teal"
              onClick={() => triggerStrategyAction('share')}>
              Share
            </Button>
          </Group>
          {!isUnsaved && (
            <Group gap={4} grow>
              <Button size="xs" leftSection={<FaPen size={10} />} variant="subtle"
                onClick={() => { setNameInput(activeSessionName ?? ''); openRename(); }}>Rename</Button>
              <Button size="xs" leftSection={<FaTrash size={10} />} variant="subtle" color="red"
                onClick={() => activeSessionId && deleteSession(activeSessionId)}>Delete</Button>
              <Button size="xs" leftSection={<FaPlus size={10} />} variant="subtle" color="gray"
                onClick={newSession}>New</Button>
            </Group>
          )}
          <Group justify="space-between">
            <Text size="xs" c="dimmed">Status</Text>
            {isUnsaved
              ? <Badge color="orange" variant="dot" size="sm">Unsaved</Badge>
              : <Badge color="green"  variant="dot" size="sm">{activeSessionName}</Badge>
            }
          </Group>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">Maps / Saved</Text>
            <Text size="xs">{maps.length} / {sessionEntries.length}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">Storage</Text>
            <Tooltip label="Total localStorage used by WraeclastLedger" position="left" withArrow>
              <Text size="xs" c={parseFloat(storageMB) > 4 ? 'orange' : 'dimmed'}
                style={{ cursor: 'default' }}>
                {sessionEntries.length} sessions · {storageMB} MB
              </Text>
            </Tooltip>
          </Group>

          {sessionEntries.length > 0 && (
            <>
              <Divider label="History" labelPosition="left" />

              {/* Bulk action bar — visible when ≥1 selected */}
              {selected.size > 0 && (
                <Group gap={4} wrap="nowrap">
                  <Text size="xs" c="dimmed" style={{ flex: 1 }}>{selected.size} selected</Text>
                  <Tooltip label="Export selected as JSON" withArrow>
                    <Button size="xs" variant="light" color="blue" leftSection={<FaDownload size={9} />}
                      onClick={handleExport}>
                      Export
                    </Button>
                  </Tooltip>
                  <Tooltip label="Delete selected" withArrow>
                    <Button size="xs" variant="light" color="red" leftSection={<FaTrash size={9} />}
                      onClick={openBulkDelete}>
                      Delete
                    </Button>
                  </Tooltip>
                  <Button size="xs" variant="subtle" color="gray" onClick={clearSelection}>✕</Button>
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
                <Tooltip label="Import sessions from a JSON file" withArrow>
                  <Button size="xs" variant="subtle" color="gray" leftSection={<FaUpload size={9} />}
                    onClick={() => importFileRef.current?.click()}>
                    Import JSON
                  </Button>
                </Tooltip>
                <input ref={importFileRef} type="file" accept=".json" style={{ display: 'none' }}
                  onChange={handleImportFile} />
              </Group>

              {/* Session rows */}
              <Stack gap={3}>
                {sessionEntries.map((s) => (
                  <Group key={s.id} gap={6} wrap="nowrap"
                    style={{
                      padding: '3px 4px', borderRadius: 4,
                      background: selected.has(s.id) ? 'rgba(74,158,255,0.07)' : undefined,
                    }}>
                    <Checkbox size="xs" checked={selected.has(s.id)}
                      onChange={() => toggleSelect(s.id)} style={{ flexShrink: 0 }} />
                    <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                      <Text size="xs" fw={600} lineClamp={1}>{s.name}</Text>
                      <Text size="xs" c="dimmed">{s.maps.length} maps · {new Date(s.createdAt).toLocaleDateString()}</Text>
                    </Stack>
                    <Group gap={4} wrap="nowrap">
                      <Button size="xs" variant="subtle" onClick={() => loadSession(s.id)}>Load</Button>
                      <ActionIcon size="xs" color="red" variant="subtle" onClick={() => deleteSession(s.id)}>
                        <FaTrash size={8} />
                      </ActionIcon>
                    </Group>
                  </Group>
                ))}
              </Stack>
            </>
          )}
        </Stack>
      </Card>
    </>
  );
};
