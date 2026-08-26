import { Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';

interface WorkingSessionGuardModalProps {
  opened: boolean;
  mapCount: number;
  name: string;
  actionDescription: string;
  onNameChange: (value: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function WorkingSessionGuardModal({
  opened,
  mapCount,
  name,
  actionDescription,
  onNameChange,
  onSave,
  onDiscard,
  onCancel,
}: WorkingSessionGuardModalProps) {
  const trimmedName = name.trim();
  return (
    <Modal opened={opened} onClose={onCancel} title="Keep this working session?" size="sm" returnFocus={false}>
      <Stack gap="sm">
        <Text size="sm">
          Your working session is auto-saved and contains work
          {mapCount > 0 ? ` (${mapCount} map${mapCount !== 1 ? 's' : ''})` : ''}.
          {' '}{actionDescription} will replace it. Continue without saving to Sessions to move it to Recently Deleted,
          or give it a name to keep it in Sessions.
        </Text>
        <TextInput
          label="Session name"
          placeholder="e.g. T16 Deli - 72 maps"
          value={name}
          onChange={(event) => onNameChange(event.currentTarget.value)}
          onKeyDown={(event) => event.key === 'Enter' && trimmedName && onSave()}
          autoFocus
        />
        <Group justify="space-between">
          <Button variant="subtle" color="red" onClick={onDiscard}>Continue without saving</Button>
          <Group gap="xs">
            <Button variant="default" onClick={onCancel}>Cancel</Button>
            <Button color="blue" onClick={onSave} disabled={!trimmedName}>Save to Sessions</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
