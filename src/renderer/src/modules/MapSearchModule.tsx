import { Card, LoadingOverlay, ActionIcon, Group, Text, Tooltip, Box } from '@mantine/core';
import { useState } from 'react';
import { IconRefresh, IconExternalLink } from '@tabler/icons-react';
import { COLOR } from '../utils/uiTokens'

export const MapSearchModule = () => {
  const [loading, setLoading] = useState(true);
  const [key, setKey]         = useState(0);

  const reload = () => {
    setLoading(true);
    setKey((prev) => prev + 1);
  };

  return (
    <Card
      shadow="sm"
      padding={0}
      radius="md"
      withBorder
      h="100%"
      style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      <Group
        justify="space-between"
        px="xs"
        py={5}
        bg={COLOR.bgSunken}
        style={{ borderBottom: `1px solid ${COLOR.border}`, flexShrink: 0 }}
      >
        <Text size="xs" fw={700} c="dimmed">Map Search — poe.re</Text>
        <Group gap={4}>
          <Tooltip label="Open in browser">
            <ActionIcon
              size="sm"
              variant="subtle"
              component="a"
              href="https://poe.re/#/maps"
              target="_blank"
            >
              <IconExternalLink size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Reload">
            <ActionIcon size="sm" variant="subtle" onClick={reload}>
              <IconRefresh size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Box style={{ flex: 1, position: 'relative' }}>
        <LoadingOverlay visible={loading} zIndex={1000} />
        <iframe
          key={key}
          src="https://poe.re/#/maps"
          width="100%"
          height="100%"
          style={{ border: 'none' }}
          onLoad={() => setLoading(false)}
        />
      </Box>
    </Card>
  );
};
