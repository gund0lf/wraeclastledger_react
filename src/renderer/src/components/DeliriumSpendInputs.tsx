import { ActionIcon, Group, NumberInput, Select, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type { SessionSettings } from '../types';
import { deliOrbItemName } from '../utils/itemIcons';
import { selectableDeliriumOrbList } from '../utils/gameData';

type Rows = NonNullable<SessionSettings['deliriumOrbSpend']>;

export function DeliriumSpendInputs({ rows, onChange }: { rows: Rows; onChange: (rows: Rows) => void }) {
  function update(type: string, values: Partial<Rows[number]>) {
    onChange(rows.map(row => row.type === type ? { ...row, ...values } : row));
  }
  const options = selectableDeliriumOrbList().filter(option => !rows.some(row => row.type === option.value));
  return <Stack gap="xs">
    {rows.map(row => <Stack key={row.type} gap={4}>
      <Group justify="space-between">
        <Text size="xs">{deliOrbItemName(row.type)}</Text>
        <ActionIcon size="xs" variant="subtle" aria-label={`Remove ${row.type} orbs`}
          onClick={() => onChange(rows.filter(item => item.type !== row.type))}><IconTrash size={14} /></ActionIcon>
      </Group>
      <Group grow align="end" wrap="nowrap">
        <NumberInput label="Used this session" size="xs" min={0} allowNegative={false} allowDecimal={false}
          value={row.count} onChange={value => {
            const count = Number(value);
            if (Number.isSafeInteger(count) && count >= 0) update(row.type, { count });
          }} />
        <NumberInput label="Price each (c)" size="xs" min={0} allowNegative={false}
          value={row.priceEach ?? ''} onChange={value => {
            const price = value === '' ? null : Number(value);
            if (price === null || (Number.isFinite(price) && price >= 0)) update(row.type, { priceEach: price });
          }} />
      </Group>
    </Stack>)}
    {options.length > 0 && <Select size="xs" label="Add orb type" searchable value={null} data={options}
      onChange={type => { if (type) onChange([...rows, { type, count: 0, priceEach: null }]); }} />}
  </Stack>;
}
