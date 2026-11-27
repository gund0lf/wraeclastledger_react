import { Group, Paper, Stack, Text } from '@mantine/core';
import { surpassingOutcomes, type SurpassingChances } from '../../../shared/atlasSurpassingChance';

export function SurpassingChanceSection({ chances }: { chances?: SurpassingChances }) {
  if (!chances) return null;
  const rows = surpassingOutcomes.flatMap(({ key, label, unit }) => {
    const percent = chances[key];
    if (typeof percent !== 'number' || !Number.isSafeInteger(percent) || percent <= 0) return [];
    const guaranteed = Math.floor(percent / 100);
    const remainder = percent % 100;
    const details = guaranteed ? [`${guaranteed} guaranteed per ${unit}`] : [];
    if (remainder) details.push(guaranteed ? `${remainder}% chance of one more` : `${remainder}% chance per ${unit}`);
    return [<div key={key}>
      <Group justify="space-between" wrap="nowrap" gap="xs" align="baseline">
        <Text size="xs" fw={600}>{label}</Text>
        <Text size="sm" fw={700}>{percent}%</Text>
      </Group>
      {unit && <Text size="xs" c="dimmed">{details.join(' · ')}</Text>}
    </div>];
  });
  if (!rows.length) return null;
  return <Paper component="section" aria-label="Surpassing Chance" withBorder p="xs" radius="sm">
    <Stack gap="xs">
      <div>
        <Text size="sm" fw={700}>Surpassing Chance</Text>
        <Text size="xs" c="dimmed">From your synced Atlas tree. Other sources can add more.</Text>
      </div>
      {rows}
    </Stack>
  </Paper>;
}
