/**
 * NotesModule — per-session notes.
 * Saved and loaded with each session via sessionNotes in the store.
 * Cleared when starting a new session.
 */
import { Card, Text, Group, Textarea, ActionIcon, Tooltip, Badge, Modal, Stack, Button } from '@mantine/core';
import { useState } from 'react';
import { useDisclosure } from '@mantine/hooks';
import { useSessionKeys } from '../store/useSessionStore';
import { IconTrash } from '@tabler/icons-react';
import { ModuleHeader } from '../components/ui/ModuleHeader';
import { COLOR, FONT } from '../utils/uiTokens'

export const NotesModule = () => {
  const { sessionNotes, setSessionNotes, activeSessionId, activeSessionName } =
    useSessionKeys('sessionNotes', 'setSessionNotes', 'activeSessionId', 'activeSessionName');

  const [hoveredClear, setHoveredClear] = useState(false); // clear-notes icon red hover (Sessions pattern)
  // With auto-save, a misclicked clear persists within a second - confirm first
  // (delete-confirms round 2 pattern; same modal shape as Dashboard clear-loot).
  const [clearOpen, { open: openClear, close: closeClear }] = useDisclosure(false);
  const wordCount = sessionNotes.trim() ? sessionNotes.trim().split(/\s+/).length : 0;
  const lineCount = sessionNotes ? sessionNotes.split('\n').length : 0;

  return (
    <Card shadow="sm" padding="sm" radius="md" withBorder h="100%"
      style={{ display: 'flex', flexDirection: 'column' }}>

      <ModuleHeader
        title={
          /* session-16: the "Notes" title was redundant with the tab label —
             the session badge (now size sm, matching Sessions' Auto-saved) is
             the whole header. */
          activeSessionName
            ? <Badge size="sm" color="green" variant="dot">{activeSessionName}</Badge>
            : <Badge size="sm" color="orange" variant="dot">unsaved session</Badge>
        }
        right={
          <Group gap={4}>
            {sessionNotes && (
              <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {wordCount}w · {lineCount}L
              </Text>
            )}
            {sessionNotes && (
              <Tooltip label="Clear notes">
                <ActionIcon size="md" variant="default" aria-label="Clear notes"
                  onMouseEnter={() => setHoveredClear(true)}
                  onMouseLeave={() => setHoveredClear(false)}
                  style={hoveredClear ? { color: 'var(--mantine-color-red-4)', borderColor: 'var(--mantine-color-red-7)' } : undefined}
                  onClick={() => { setHoveredClear(false); openClear(); }}>
                  <IconTrash size={15} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        }
      />

      <Modal opened={clearOpen} onClose={closeClear} title="Clear notes?" size="sm">
        <Stack gap="md">
          <Text size="sm" c="dimmed">This will erase all notes for this session. This cannot be undone.</Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={closeClear}>Cancel</Button>
            <Button color="red" onClick={() => { setSessionNotes(''); closeClear(); }}>Clear Notes</Button>
          </Group>
        </Stack>
      </Modal>

      {!activeSessionId && (
        <Text size="xs" c="dimmed" mb={6} style={{ flexShrink: 0, fontStyle: 'italic' }}>
          Save your session to persist these notes.
        </Text>
      )}

      <Textarea
        placeholder={[
          'Session notes — strategy observations, market prices, what worked...',
          '',
          'These notes are saved and loaded with the session.',
          'For a strategy share note, use the Notes field in the Share modal.',
        ].join('\n')}
        value={sessionNotes}
        onChange={(e) => setSessionNotes(e.currentTarget.value)}
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        styles={{
          wrapper: { flex: 1, display: 'flex', flexDirection: 'column' },
          input: {
            flex: 1,
            fontFamily: 'monospace',
            fontSize: FONT.md,
            lineHeight: 1.6,
            resize: 'none',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            color: COLOR.textSoft,
          },
        }}
        autosize={false}
      />
    </Card>
  );
};
