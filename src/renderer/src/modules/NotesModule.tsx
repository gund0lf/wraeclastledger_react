/**
 * NotesModule — per-session notes.
 * Saved and loaded with each session via sessionNotes in the store.
 * Cleared when starting a new session.
 */
import { Card, Text, Group, Textarea, ActionIcon, Tooltip, Badge } from '@mantine/core';
import { useSessionStore } from '../store/useSessionStore';
import { FaTrash } from 'react-icons/fa';

export const NotesModule = () => {
  const { sessionNotes, setSessionNotes, activeSessionId, activeSessionName } = useSessionStore();

  const wordCount = sessionNotes.trim() ? sessionNotes.trim().split(/\s+/).length : 0;
  const lineCount = sessionNotes ? sessionNotes.split('\n').length : 0;

  return (
    <Card shadow="sm" padding="sm" radius="md" withBorder h="100%"
      style={{ display: 'flex', flexDirection: 'column' }}>

      <Group justify="space-between" mb={6} style={{ flexShrink: 0 }}>
        <Group gap={6}>
          <Text fw={700} size="sm">Notes</Text>
          {activeSessionName
            ? <Badge size="xs" color="green" variant="dot">{activeSessionName}</Badge>
            : <Badge size="xs" color="orange" variant="dot">unsaved session</Badge>
          }
        </Group>
        <Group gap={4}>
          {sessionNotes && (
            <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {wordCount}w · {lineCount}L
            </Text>
          )}
          {sessionNotes && (
            <Tooltip label="Clear notes">
              <ActionIcon size="xs" variant="subtle" color="red"
                onClick={() => setSessionNotes('')}>
                <FaTrash size={9} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>

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
            fontSize: 12,
            lineHeight: 1.6,
            resize: 'none',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            color: '#ccc',
          },
        }}
        autosize={false}
      />
    </Card>
  );
};
