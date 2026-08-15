import {
  Badge, Button, Collapse, Group, Progress, Stack, Table, Text, Tooltip,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import type { LootSummary } from '../utils/lootSummary';
import { CAT_COLORS } from '../utils/lootCategories';
import { fcSep } from '../utils/parseDiscordExport';
import { COLOR, FONT } from '../utils/uiTokens';
import { SectionLabel } from './ui/SectionLabel';
import { LootCategoryIcon, LootCategoryGlyph } from './ui/LootCategoryIcon';
import { PoeItemIcon } from './ui/PoeItemIcon';

export const LootEvidenceSummary = ({ summary }: { summary: LootSummary }) => {
  const [rowsOpen, setRowsOpen] = useState(false);
  const categoryTotal = summary.categories.reduce((sum, entry) => sum + entry.value, 0) || 1;
  const manualRows = summary.rows.filter((row) => row.source === 'manual');
  const omittedRows = summary.omittedCsvRows + summary.omittedManualRows;
  const omittedValue = summary.omittedCsvValue + summary.omittedManualValue;

  return (
    <Stack gap={5} mb={8} p={8}
      style={{ background: COLOR.bgSunken, border: `1px solid ${COLOR.border}`, borderRadius: 6 }}>
      <Group justify="space-between" align="center">
        <Group gap={5}>
          <SectionLabel>Loot evidence</SectionLabel>
          <Badge size="xs" color="teal" variant="light">Top {summary.rows.length}</Badge>
          {manualRows.length > 0 && (
            <Tooltip label="Author-valued drops that were not present or correctly priced in the Return CSV" withArrow>
              <Badge size="xs" color="yellow" variant="outline" style={{ cursor: 'help' }}>
                {manualRows.length} manual / {fcSep(summary.manualTotal)}
              </Badge>
            </Tooltip>
          )}
        </Group>
        <Text size="xs" fw={700} c="teal">{fcSep(summary.reportedReturn)}</Text>
      </Group>

      <Group gap={5} wrap="wrap">
        {summary.categories.map((entry) => (
          <Tooltip key={entry.category}
            label={`${entry.category}: ${fcSep(entry.value)} (${((entry.value / categoryTotal) * 100).toFixed(0)}%)`}
            withArrow>
            <Group gap={4} wrap="nowrap" px={5} py={3}
              style={{ background: COLOR.bgInset, border: `1px solid ${COLOR.borderDeep}`, borderRadius: 5, cursor: 'help' }}>
              <LootCategoryIcon category={entry.category} size={18} />
              <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>{entry.category}</Text>
              <Text size="xs" fw={600}>{fcSep(entry.value)}</Text>
            </Group>
          </Tooltip>
        ))}
      </Group>

      <Progress.Root size={6} radius="xl">
        {summary.categories.map((entry) => (
          <Progress.Section key={entry.category} value={(entry.value / categoryTotal) * 100}
            color={CAT_COLORS[entry.category] ?? 'gray'} />
        ))}
      </Progress.Root>

      <Button size="compact-xs" variant="subtle" color="gray"
        leftSection={rowsOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        onClick={() => setRowsOpen((value) => !value)} style={{ alignSelf: 'flex-start' }}>
        {rowsOpen ? 'Hide item breakdown' : `Show item breakdown (${summary.rows.length}${omittedRows > 0 ? ` + ${omittedRows} omitted` : ''})`}
      </Button>

      <Collapse in={rowsOpen}>
        <Stack gap={4}>
          <Table verticalSpacing={4} horizontalSpacing={5}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Item</Table.Th>
                <Table.Th>Qty</Table.Th>
                <Table.Th ta="right">Value</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {summary.rows.map((row, index) => (
                <Table.Tr key={`${row.source}-${row.name}-${index}`}>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <PoeItemIcon name={row.name} size={22}
                        fallback={<LootCategoryGlyph category={row.category} size={22} />} />
                      <Stack gap={0} style={{ minWidth: 0 }}>
                        <Group gap={4} wrap="nowrap">
                          <Text size="xs" lineClamp={1}>{row.name}</Text>
                          {row.source === 'manual' && (
                            <Tooltip label={row.note || 'Manually added by the strategy author'} withArrow>
                              <Badge size="xs" color="yellow" variant="outline" style={{ cursor: 'help' }}>Manual</Badge>
                            </Tooltip>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>{row.category}</Text>
                      </Stack>
                    </Group>
                  </Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{row.quantity}</Text></Table.Td>
                  <Table.Td ta="right"><Text size="xs" fw={700} c="teal">{fcSep(row.value)}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {omittedRows > 0 && (
            <Text size="xs" c="dimmed">
              {omittedRows} lower-value row{omittedRows === 1 ? '' : 's'} omitted from the public top-30 view ({fcSep(omittedValue)}).
            </Text>
          )}
          <Group gap="md" wrap="wrap">
            <Text size="xs" c="dimmed">CSV net: {fcSep(summary.csvNet, true)}</Text>
            {summary.csvAdjustment !== 0 && <Text size="xs" c="dimmed">CSV adjustment: {fcSep(summary.csvAdjustment, true)}</Text>}
            {summary.gemCorrection !== 0 && <Text size="xs" c="dimmed">Gem correction: {fcSep(summary.gemCorrection, true)}</Text>}
            {summary.investmentCorrection !== 0 && <Text size="xs" c="dimmed">Investment correction: {fcSep(summary.investmentCorrection, true)}</Text>}
            {summary.manualTotal !== 0 && <Text size="xs" c="yellow">Manual: {fcSep(summary.manualTotal, true)}</Text>}
          </Group>
        </Stack>
      </Collapse>
    </Stack>
  );
};
