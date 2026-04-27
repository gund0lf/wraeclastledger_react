import { Card, Text, Stack } from '@mantine/core';

/**
 * Deprecated as of v1.0.58 — replaced by DashboardModule, which combines
 * statistics and loot into a single panel with the corrected math
 * (Atlas Bonus flat IIQ, gem-buy offset, investment neutralisation).
 *
 * Kept in the registry so saved layouts referencing 'statistics' don't
 * render an "Unknown Module" tile. The stub tells the user what to do.
 */
export const StatisticsModule = () => (
  <Card shadow="sm" padding="md" radius="md" withBorder h="100%"
    style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
    <Stack gap={6} align="center" maw={280}>
      <Text fw={700} size="sm">Statistics merged into Dashboard</Text>
      <Text size="xs" c="dimmed" ta="center">
        This panel was retired in v1.0.58. Its numbers were missing several
        recent corrections (Atlas Bonus, gem-buy offset, investment
        neutralisation), so it has been replaced by the Dashboard panel,
        which has the up-to-date math.
      </Text>
      <Text size="xs" c="dimmed" ta="center">
        Close this tab and open <Text span c="blue" fw={600}>Dashboard</Text> from <Text span c="blue" fw={600}>+ Add Panel</Text>.
      </Text>
    </Stack>
  </Card>
);
