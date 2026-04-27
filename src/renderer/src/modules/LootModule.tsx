import { Card, Text, Stack } from '@mantine/core';

/**
 * Deprecated as of v1.0.58 — replaced by DashboardModule, which combines
 * loot and statistics into a single panel with the corrected math and
 * the investment auto-detection banner.
 *
 * Kept in the registry so saved layouts referencing 'loot' don't render
 * an "Unknown Module" tile. The stub tells the user what to do.
 */
export const LootModule = () => (
  <Card shadow="sm" padding="md" radius="md" withBorder h="100%"
    style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
    <Stack gap={6} align="center" maw={280}>
      <Text fw={700} size="sm">Loot merged into Dashboard</Text>
      <Text size="xs" c="dimmed" ta="center">
        This panel was retired in v1.0.58. The Dashboard panel has the same
        list/diff/breakdown views plus the investment auto-detection banner
        and the corrected gem-leveling offset.
      </Text>
      <Text size="xs" c="dimmed" ta="center">
        Close this tab and open <Text span c="blue" fw={600}>Dashboard</Text> from <Text span c="blue" fw={600}>+ Add Panel</Text>.
      </Text>
    </Stack>
  </Card>
);
