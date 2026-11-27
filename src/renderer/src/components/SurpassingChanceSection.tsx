import { Group, Stack, Text } from '@mantine/core';
import { surpassingOutcomes, type SurpassingChances } from '../../../shared/atlasSurpassingChance';
import { AtlasCalcSectionBar } from './AtlasCalcSectionBar';

export function SurpassingChanceSection({ chances, open, onToggle }: {
  chances?: SurpassingChances;
  open: boolean;
  onToggle: () => void;
}) {
  if (!chances) return null;
  const rows = surpassingOutcomes.flatMap(({ key, label, unit, template }) => {
    const percent = chances[key];
    if (typeof percent !== 'number' || !Number.isSafeInteger(percent) || percent <= 0) return [];
    const guaranteed = Math.floor(percent / 100);
    const remainder = percent % 100;
    const details: string[] = [];
    if (unit) {
      const extra = unit !== 'map';
      if (guaranteed) details.push(`${guaranteed}${extra ? ' extra' : ''} guaranteed per ${unit}`);
      if (remainder) details.push(guaranteed ? `${remainder}% chance of one more` :
        `${remainder}% chance${extra ? ' of one extra' : ''} per ${unit}`);
    } else {
      details.push(template.replace('#% ', ''));
    }
    return [<div key={key}>
      <Group justify="space-between" wrap="nowrap" gap="xs" align="baseline">
        <Text size="xs" fw={600}>{label}</Text>
        <Text size="sm" fw={700}>{percent}%</Text>
      </Group>
      <Text size="xs" c="dimmed">{details.join(' · ')}</Text>
    </div>];
  });
  if (!rows.length) return null;
  return <section aria-label="Surpassing Chance">
    <AtlasCalcSectionBar title="Surpassing Chance" meta={`${rows.length} ${rows.length === 1 ? 'effect' : 'effects'}`}
      open={open} onClick={onToggle} />
    {open && <div className="atlas-calc-section-content">
      <Stack gap="xs">
        <Text size="xs" c="dimmed">From your synced Atlas tree. Other sources can add more.</Text>
        {rows}
      </Stack>
    </div>}
  </section>;
}
