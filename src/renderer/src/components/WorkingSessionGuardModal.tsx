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
    <Modal opened={opened} onClose={onCancel} title="Protect current session" size="sm" returnFocus={false}>
      <Stack gap="sm">
        <Text size="sm">
          Your unnamed current session contains work
          {mapCount > 0 ? ` (${mapCount} map${mapCount !== 1 ? 's' : ''})` : ''}.
          {' '}{actionDescription} will replace its working slot. WraeclastLedger will move it to Recently Deleted,
          or you can name it now to keep it in Sessions.
        </Text>
        <TextInput
          label="Save as"
          placeholder="e.g. T16 Deli - 72 maps"
          value={name}
          onChange={(event) => onNameChange(event.currentTarget.value)}
          onKeyDown={(event) => event.key === 'Enter' && trimmedName && onSave()}
          autoFocus
        />
        <Group justify="space-between">
          <Button variant="subtle" color="red" onClick={onDiscard}>Move &amp; continue</Button>
          <Group gap="xs">
            <Button variant="default" onClick={onCancel}>Cancel</Button>
            <Button color="blue" onClick={onSave} disabled={!trimmedName}>Name &amp; continue</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
