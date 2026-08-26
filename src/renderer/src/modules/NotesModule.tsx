/**
 * NotesModule — per-session notes.
 * Saved and loaded with each session via sessionNotes in the store.
 * Cleared when starting a new session.
 */
import { Text, Group, Textarea, ActionIcon, Tooltip, Badge, Modal, Stack, Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useSessionKeys } from '../store/useSessionStore';
import { IconInfoCircle, IconTrash } from '@tabler/icons-react';
import './NotesModule.css';

export const NotesModule = () => {
  const { sessionNotes, setSessionNotes, activeSessionName } =
    useSessionKeys('sessionNotes', 'setSessionNotes', 'activeSessionName');

  // With auto-save, a misclicked clear persists within a second - confirm first
  // (delete-confirms round 2 pattern; same modal shape as Dashboard clear-loot).
  const [clearOpen, { open: openClear, close: closeClear }] = useDisclosure(false);
  const wordCount = sessionNotes.trim() ? sessionNotes.trim().split(/\s+/).length : 0;
  const lineCount = sessionNotes ? sessionNotes.split('\n').length : 0;
  const wordLabel = `${wordCount} ${wordCount === 1 ? 'word' : 'words'}`;
  const lineLabel = `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`;

  return (
    <div className="notes-root">
      <div className="notes-workspace">
        <Group className="notes-toolbar" justify="space-between" wrap="nowrap" gap="sm">
          <Tooltip
            label={activeSessionName
              ? 'Notes saved with this named session'
              : 'Notes saved with the current working session'}
          >
            <Badge
              className="notes-session-badge"
              size="sm"
              color={activeSessionName ? 'green' : 'gray'}
              variant="dot"
            >
              {activeSessionName ?? 'Working session'}
            </Badge>
          </Tooltip>

          <Group className="notes-toolbar-meta" gap={6} wrap="nowrap">
            <Text
              className="notes-count"
              size="xs"
              c="dimmed"
              data-compact={`${wordCount}w · ${lineCount}L`}
            >
              {wordLabel} · {lineLabel}
            </Text>
            <Tooltip label={sessionNotes ? 'Clear notes' : 'Notes are already empty'}>
              <span className="notes-clear-wrap">
                <ActionIcon
                  className="notes-clear"
                  size="md"
                  variant="default"
                  color="gray"
                  aria-label="Clear notes"
                  disabled={!sessionNotes}
                  onClick={openClear}
                >
                  <IconTrash size={15} />
                </ActionIcon>
              </span>
            </Tooltip>
          </Group>
        </Group>

        <Group className="notes-guidance" gap={6} wrap="nowrap" align="flex-start">
          <IconInfoCircle className="notes-guidance-icon" size={14} />
          <Text size="xs" c="dimmed">
            Auto-saved with this session. Strategy shares use the separate Notes field in Share.
          </Text>
        </Group>

        <div className="notes-editor-shell" data-empty={!sessionNotes || undefined}>
          <Textarea
            classNames={{
              root: 'notes-editor',
              wrapper: 'notes-editor-wrapper',
              input: 'notes-editor-input',
            }}
            aria-label="Session notes"
            placeholder="Record strategy observations, useful prices, route details, or adjustments for the next run..."
            value={sessionNotes}
            onChange={(e) => setSessionNotes(e.currentTarget.value)}
            autosize={false}
          />
        </div>
      </div>

      <Modal opened={clearOpen} onClose={closeClear} title="Clear notes?" size="sm">
        <Stack gap="md">
          <Text size="sm" c="dimmed">This removes all notes from the current session.</Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={closeClear}>Cancel</Button>
            <Button color="red" onClick={() => { setSessionNotes(''); closeClear(); }}>Clear notes</Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
};
