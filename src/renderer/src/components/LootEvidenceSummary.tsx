import {
  Badge, Button, Collapse, Group, Progress, Stack, Table, Text, Tooltip,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import type { LootSummary } from '../utils/lootSummary';
import { CAT_COLORS, lootCategoryLabel } from '../utils/lootCategories';
import { fcSep } from '../utils/parseDiscordExport';
import { COLOR, FONT } from '../utils/uiTokens';
import { SectionLabel } from './ui/SectionLabel';
import { LootCategoryIcon, LootCategoryGlyph } from './ui/LootCategoryIcon';
import { PoeItemIcon } from './ui/PoeItemIcon';
import {
  hasDivinePrice,
  lootCurrencyPresentation,
} from '../utils/currencyDisplay';
import {
  LootCurrencyPair,
  LootCurrencyToggle,
  LootCurrencyValue,
} from './ui/LootCurrencyDisplay';
import { useSessionKeys } from '../store/useSessionStore';
import { manualLootIdentityArtName } from '../../../shared/manualLoot';

export const LootEvidenceSummary = ({
  summary,
  divinePrice,
}: {
  summary: LootSummary;
  /** The exact authored snapshot for this run. Pooled summaries deliberately
   * omit it because their rows can span several historical Divine prices. */
  divinePrice?: number | null;
}) => {
  const { lootCurrencyMode, setLootCurrencyMode } = useSessionKeys(
    'lootCurrencyMode',
    'setLootCurrencyMode',
  );
  const [rowsOpen, setRowsOpen] = useState(false);
  const categoryTotal = summary.categories.reduce((sum, entry) => sum + entry.value, 0) || 1;
  const manualRows = summary.rows.filter((row) => row.source === 'manual');
  const valuationRows = summary.rows.filter((row) => row.valuation !== undefined);
  const omittedRows = summary.omittedCsvRows + summary.omittedManualRows;
  const omittedValue = summary.omittedCsvValue + summary.omittedManualValue;
  const displayValue = (value: number, sign = false) => lootCurrencyPresentation(
    value,
    divinePrice,
    lootCurrencyMode,
    { sign },
  ).primary;

  return (
    <Stack gap={8}>
      <Group justify="space-between" align="center">
        <Group gap={5}>
          <SectionLabel>Loot breakdown</SectionLabel>
          <LootCurrencyPair
            chaosValue={summary.reportedReturn}
            divinePrice={divinePrice}
            mode={lootCurrencyMode}
            color="var(--mantine-color-teal-4)"
            align="left"
          />
        </Group>
        <Group gap={5} wrap="wrap" justify="flex-end">
          <Badge size="xs" color="teal" variant="light">Top {summary.rows.length}</Badge>
          {manualRows.length > 0 && (
            <Tooltip label="Author-valued drops that were not present or correctly priced in the Return CSV" withArrow>
              <Badge size="xs" color="yellow" variant="outline" style={{ cursor: 'help' }}>
                {manualRows.length} manual / {displayValue(summary.manualTotal)}
              </Badge>
            </Tooltip>
          )}
          {valuationRows.length > 0 && (
            <Tooltip label="Value gains from items already held at the baseline; quantity and before/after values are verified in the evidence payload" withArrow>
              <Badge size="xs" color="blue" variant="outline" style={{ cursor: 'help' }}>
                {valuationRows.length} market
              </Badge>
            </Tooltip>
          )}
        </Group>
      </Group>

      <Progress.Root size={8} radius="xl">
        {summary.categories.map((entry) => (
          <Progress.Section key={entry.category} value={(entry.value / categoryTotal) * 100}
            color={CAT_COLORS[entry.category] ?? 'gray'} />
        ))}
      </Progress.Root>

      <div className="loot-evidence-categories">
        {summary.categories.map((entry) => (
          <Tooltip key={entry.category}
            label={`${lootCategoryLabel(entry.category)}: ${displayValue(entry.value)} (${((entry.value / categoryTotal) * 100).toFixed(0)}%)`}
            withArrow>
            <Stack gap={4} p={8} className="loot-evidence-category"
              style={{ background: COLOR.surfaceSectionBg, borderRadius: 6, cursor: 'help', minWidth: 0 }}>
              <Text size="xs" c="dimmed" lineClamp={1}>{lootCategoryLabel(entry.category)}</Text>
              <Group gap={8} wrap="nowrap" justify="center">
                <LootCategoryIcon category={entry.category} size={28} />
                <Stack gap={0} align="center">
                  <LootCurrencyValue
                    chaosValue={entry.value}
                    divinePrice={divinePrice}
                    mode={lootCurrencyMode}
                    align="left"
                  />
                  <Text size="xs" fw={600} c={CAT_COLORS[entry.category] ?? 'dimmed'}>
                    {((entry.value / categoryTotal) * 100).toFixed(1)}%
                  </Text>
                </Stack>
              </Group>
            </Stack>
          </Tooltip>
        ))}
      </div>

      <Group justify="space-between" align="center" wrap="wrap" gap={6}>
        <Button size="compact-xs" variant="subtle" color="gray"
          leftSection={rowsOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
          onClick={() => setRowsOpen((value) => !value)}>
          {rowsOpen ? 'Hide item breakdown' : `Show item breakdown (${summary.rows.length}${omittedRows > 0 ? ` + ${omittedRows} omitted` : ''})`}
        </Button>
        <LootCurrencyToggle
          mode={lootCurrencyMode}
          onChange={setLootCurrencyMode}
          divineAvailable={hasDivinePrice(divinePrice)}
          compact
          unavailableReason="Pooled evidence spans several authored Divine snapshots, so its item rows stay in chaos rather than inventing one conversion rate."
        />
      </Group>

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
              {summary.rows.map((row, index) => {
                return (
                <Table.Tr key={`${row.source}-${row.name}-${index}`}>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <PoeItemIcon name={manualLootIdentityArtName(row.identity) ?? row.name} size={22}
                        fallback={<LootCategoryGlyph category={row.category} size={22} />} />
                      <Stack gap={0} style={{ minWidth: 0 }}>
                        <Group gap={4} wrap="nowrap">
                          <Text size="xs" lineClamp={1}>{row.name}</Text>
                          {row.source === 'manual' && (
                            <Tooltip label={row.note || 'Manually added by the strategy author'} withArrow>
                              <Badge size="xs" color="yellow" variant="outline" style={{ cursor: 'help' }}>Manual</Badge>
                            </Tooltip>
                          )}
                          {row.identity?.kind === 'syndicate-reward' && (
                            <Badge size="xs" color="gray" variant="light">Syndicate</Badge>
                          )}
                          {row.valuation && (
                            <Tooltip
                              label={`${row.valuation.baselineQuantity} -> ${row.valuation.currentQuantity} held; ${fcSep(row.valuation.baselineValue)} -> ${fcSep(row.valuation.currentValue)}`}
                              withArrow>
                              <Badge size="xs" color="blue" variant="outline" style={{ cursor: 'help' }}>Market</Badge>
                            </Tooltip>
                          )}
                        </Group>
                        <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>{lootCategoryLabel(row.category)}</Text>
                      </Stack>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {row.valuation
                        ? `${row.valuation.baselineQuantity} -> ${row.valuation.currentQuantity}`
                        : row.quantity}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <LootCurrencyValue
                      chaosValue={row.value}
                      divinePrice={divinePrice}
                      mode={lootCurrencyMode}
                      color="var(--mantine-color-teal-4)"
                    />
                  </Table.Td>
                </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
          {omittedRows > 0 && (
            <Text size="xs" c="dimmed">
              {omittedRows} lower-value row{omittedRows === 1 ? '' : 's'} omitted from the public top-30 view ({displayValue(omittedValue)}).
            </Text>
          )}
          <Group gap="md" wrap="wrap">
            <Text size="xs" c="dimmed">CSV net: {displayValue(summary.csvNet, true)}</Text>
            <Text size="xs" c="dimmed">
              Inventory movement: {displayValue(summary.inventoryFlow ?? summary.csvNet - summary.csvAdjustment, true)}
            </Text>
            <Text size="xs" c={summary.marketRevaluation ? 'blue' : 'dimmed'}>
              Market revaluation: {displayValue(summary.marketRevaluation ?? 0, true)}
            </Text>
            {summary.csvAdjustment !== 0 && <Text size="xs" c="dimmed">CSV adjustment: {displayValue(summary.csvAdjustment, true)}</Text>}
            {summary.gemCorrection !== 0 && <Text size="xs" c="dimmed">Gem correction: {displayValue(summary.gemCorrection, true)}</Text>}
            {summary.investmentCorrection !== 0 && <Text size="xs" c="dimmed">Investment correction: {displayValue(summary.investmentCorrection, true)}</Text>}
            {summary.manualTotal !== 0 && <Text size="xs" c="yellow">Manual: {displayValue(summary.manualTotal, true)}</Text>}
          </Group>
        </Stack>
      </Collapse>
    </Stack>
  );
};
