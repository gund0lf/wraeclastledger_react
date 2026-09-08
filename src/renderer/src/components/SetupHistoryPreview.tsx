import { Alert, Divider, Group, NumberInput, Stack, Text } from '@mantine/core';
import type { SetupHistory } from '../../../shared/strategySetupCode';
import { formatActiveTime } from '../utils/timeEstimate';

const chaos = (value: number | null): string => value === null ? 'Unrecorded' : `${value.toFixed(1)}c`;
const historical = (value: number | null, divines: number | null): string =>
  value !== null ? chaos(value) : divines !== null ? `${divines.toFixed(3)}d` : 'Unrecorded';

export function SetupHistoryPreview({ history: h, approximateTotals, divinePrice, panelDivinePrice, onDivinePrice }: {
  history: SetupHistory;
  approximateTotals?: { totalInvest: boolean; netProfit: boolean };
  divinePrice: number;
  panelDivinePrice: number;
  onDivinePrice: (value: number) => void;
}) {
  const netNow = h.netProfit !== null && divinePrice > 0 ? h.netProfit / divinePrice : null;
  const perMapNow = netNow !== null && h.maps !== null && h.maps > 0 ? netNow / h.maps : null;
  const investPrefix = approximateTotals?.totalInvest && h.totalInvest !== null ? '\u2248' : '';
  const netPrefix = approximateTotals?.netProfit && h.netProfit !== null ? '\u2248' : '';
  return <>
    <Divider label={h.runs !== null && h.runs > 1 ? `Historical results · ${h.runs} runs` : 'Historical results'} labelPosition="left" />
    <Group gap="lg" wrap="wrap">
      <Stack gap={0}><Text size="xs" c="dimmed">Per map cost</Text><Text size="sm" fw={600}>{chaos(h.costPerMap)}</Text></Stack>
      <Stack gap={0}><Text size="xs" c="dimmed">Total invest</Text><Text size="sm" fw={600}>{investPrefix}{historical(h.totalInvest, h.historicalInvestDivines)}</Text></Stack>
      <Stack gap={0}><Text size="xs" c="dimmed">Net profit</Text><Text size="sm" fw={600}
        c={(h.netProfit ?? h.historicalNetDivines ?? 0) >= 0 ? 'green' : 'red'}>{netPrefix}{historical(h.netProfit, h.historicalNetDivines)}</Text></Stack>
      <Stack gap={0}><Text size="xs" c="dimmed">Divine at time</Text><Text size="sm" fw={600}>
        {h.divinePrice !== null ? chaos(h.divinePrice) : h.runs !== null && h.runs > 1 ? 'Varied / unrecorded' : 'Unrecorded'}</Text></Stack>
      <Stack gap={0}><Text size="xs" c="dimmed">Recorded time</Text><Text size="sm" fw={600}>
        {h.minutes !== null ? formatActiveTime(h.minutes * 60_000) : 'Unrecorded'}</Text>
        {h.timedMaps !== null && h.timedMaps !== h.maps && <Text size="xs" c="dimmed">{h.timedMaps} timed maps</Text>}</Stack>
    </Group>
    {(investPrefix || netPrefix) && <Text size="xs" c="dimmed">
      Totals converted from rounded Discord Divine amounts are approximate.
    </Text>}
    <Divider label="At Your Divine Price" labelPosition="left" />
    <Group gap="xs" align="flex-end">
      <NumberInput label="Current divine price" value={divinePrice} onChange={(v) => onDivinePrice(Number(v))}
        min={0} suffix="c" size="xs" w={140} />
      <Text size="xs" c="dimmed" mb={4}>Your panel: {panelDivinePrice}c</Text>
    </Group>
    <Group gap="lg" wrap="wrap">
      <Stack gap={0}><Text size="xs" c="dimmed">Net profit in divs now</Text><Text size="lg" fw={800}
        c={(netNow ?? 0) >= 0 ? 'green' : 'red'}>{netNow === null ? 'Unavailable' : `${netPrefix}${netNow >= 0 ? '+' : ''}${netNow.toFixed(2)}d`}</Text></Stack>
      <Stack gap={0}><Text size="xs" c="dimmed">Div/map now</Text><Text size="lg" fw={800}
        c={(perMapNow ?? 0) >= 0 ? 'teal' : 'red'}>{perMapNow === null ? 'Unavailable' : `${netPrefix}${perMapNow.toFixed(3)}d`}</Text></Stack>
      <Stack gap={0}><Text size="xs" c="dimmed">Originally</Text><Text size="sm" c="dimmed">
        {h.netPerMapDivines === null ? 'Unrecorded' : `${h.netPerMapDivines.toFixed(3)}d/map`}
        {h.divinePrice !== null ? ` at ${h.divinePrice}c div` : ''}</Text></Stack>
    </Group>
    <Alert color="blue" variant="light" p="xs"><Text size="xs">
      Historical information is for inspection. Chaos values stay fixed; only their Divine equivalent changes.
      {h.netProfit === null ? ' Complete Chaos totals are unrecorded, so the current-price comparison is unavailable.' : ''}
      {' '}Load Build Settings leaves new-run prices empty.
    </Text></Alert>
  </>;
}
