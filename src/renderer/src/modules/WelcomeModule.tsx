import { Card, Text, Button, Group } from '@mantine/core';

export const WelcomeModule = () => {
  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder h="100%">
      <Group justify="space-between" mt="md" mb="xs">
        <Text fw={500}>Welcome, Exile</Text>
      </Group>
      <Text size="sm" c="dimmed">
        This is a dockable module. You can drag the tab, resize it, or close it.
      </Text>
      <Button color="blue" fullWidth mt="md" radius="md">
        Start Session
      </Button>
    </Card>
  );
};