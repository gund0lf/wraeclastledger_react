import {
  Card, Text, Button, Group, Stack, Select, TextInput, ActionIcon,
  Badge, Modal, Divider,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState } from 'react';
import { useSessionStore } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import { FaTrash, FaPen, FaSave, FaPlus, FaShareAlt, FaDiscord } from 'react-icons/fa';

export const SessionManagerModule = () => {
  const {
    maps, lootItems, savedSessions, activeSessionId, activeSessionName,
    saveAsNewSession, updateCurrentSession, loadSession, deleteSession, renameSession, newSession,
  } = useSessionStore();

  const [saveOpen,   { open: openSave,   close: closeSave   }] = useDisclosure(false);
  const [renameOpen, { open: openRename, close: closeRename }] = useDisclosure(false);
  const [nameInput, setNameInput] = useState('');

  const sessionEntries = Object.values(savedSessions).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const handleSessionSelect = (val: string | null) => {
    if (!val || val === '__new__') newSession();
    else loadSession(val);
  };

  const isUnsaved = !activeSessionId;
  const { triggerStrategyAction } = useUIStore();

  return (
    <>
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
          {sessionEntries.length > 0 && (
            <>
              <Divider label="History" labelPosition="left" />
              <Stack gap={3}>
                {sessionEntries.map((s) => (
                  <Group key={s.id} justify="space-between" wrap="nowrap">
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
