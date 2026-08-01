import {
  Alert,
  Badge,
  Button,
  Collapse,
  Group,
  Loader,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import { fetchEvidenceRuns, type PublicEvidenceRun } from '../utils/evidenceApi';
import { fcSep, f1 } from '../utils/parseDiscordExport';
import { formatActiveTime } from '../utils/timeEstimate';
import { COLOR, FONT } from '../utils/uiTokens';

function formatTimestamp(value: string | null): string {
  if (!value) return 'Legacy published run';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const RunRow = ({ run }: { run: PublicEvidenceRun }) => (
  <div style={{
    padding: '6px 8px',
    border: `1px solid ${COLOR.border}`,
    borderRadius: 4,
    background: COLOR.bgInset,
  }}>
    <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
      <Stack gap={1} style={{ minWidth: 0 }}>
        <Group gap={5} wrap="wrap">
          <Text size="xs" fw={700}>Run {run.ordinal}</Text>
          <Text size="xs" c="dimmed">{formatTimestamp(run.run_started_at)}</Text>
        </Group>
        <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>
          {run.avg_quant != null ? `${f1(run.avg_quant)}%Q` : 'Q --'}
          {' / '}{run.avg_rarity != null ? `${f1(run.avg_rarity)}%R` : 'R --'}
          {' / '}{run.avg_pack != null ? `${f1(run.avg_pack)}%P` : 'P --'}
          {' / '}{run.avg_currency != null ? `${f1(run.avg_currency)}% Curr` : 'Curr --'}
          {run.multiplier != null ? ` / ${run.multiplier.toFixed(3)}x` : ''}
        </Text>
        <Group gap="md" wrap="wrap">
          {run.divine_price != null && (
            <Text size="xs" c="dimmed">Divine snapshot {f1(run.divine_price)}c</Text>
          )}
          <Text size="xs" c="dimmed">
            {run.session_minutes != null && run.session_minutes > 0
              ? formatActiveTime(run.session_minutes * 60_000)
              : 'Duration unavailable'}
          </Text>
          {run.game_data_revision != null && (
            <Text size="xs" c="dimmed">
              Game data r{run.game_data_revision}
              {run.game_data_patch_version ? ` / ${run.game_data_patch_version}` : ''}
            </Text>
          )}
        </Group>
        {(run.total_invest != null || run.net_profit != null) && (
          <Text size="xs" c="dimmed">
            {run.total_invest != null ? `Invest ${fcSep(run.total_invest)}` : ''}
            {run.total_invest != null && run.net_profit != null ? ' / ' : ''}
            {run.net_profit != null ? `Net ${fcSep(run.net_profit, true)}` : ''}
          </Text>
        )}
      </Stack>
      <Stack gap={2} align="flex-end" style={{ flexShrink: 0 }}>
        <Badge size="sm" variant="light" color="blue">{run.map_count} maps</Badge>
        <Text size="xs" fw={700} style={{ color: COLOR.warning, fontVariantNumeric: 'tabular-nums' }}>
          {run.div_per_map != null ? `${run.div_per_map.toFixed(3)}d/map` : '--'}
        </Text>
      </Stack>
    </Group>
  </div>
);

export const EvidenceRunsDisclosure = ({
  strategyId,
  runCount,
  mapCount,
}: {
  strategyId: string;
  runCount: number;
  mapCount: number;
}) => {
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<PublicEvidenceRun[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = async (cursor: string | null) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchEvidenceRuns(strategyId, cursor);
      setRuns((current) => cursor ? [...current, ...page.runs] : page.runs);
      setNextCursor(page.next_cursor);
      setLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Evidence runs could not be loaded');
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && !loaded && !loading) void loadPage(null);
  };

  return (
    <div style={{
      border: `1px solid ${COLOR.border}`,
      borderRadius: 4,
      background: COLOR.bgSunken,
      marginBottom: 8,
      overflow: 'hidden',
    }}>
      <UnstyledButton onClick={toggle} style={{ width: '100%', padding: '6px 8px' }}>
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Group gap={5} wrap="nowrap">
            {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
            <Text size="xs" fw={700}>Evidence runs</Text>
            <Badge size="xs" variant="light" color="blue">{runCount} runs / {mapCount} maps</Badge>
          </Group>
          <Badge size="xs" variant="light" color="yellow">Historical</Badge>
        </Group>
      </UnstyledButton>
      <Collapse in={open}>
        <Stack gap={5} p={6} pt={0}>
          <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>
            Map-weighted history. Each run keeps its authored prices and divine snapshot; current prices are not substituted.
          </Text>
          {error && (
            <Alert color="red" variant="light" p="xs">
              <Group justify="space-between" gap="xs">
                <Text size="xs">{error}</Text>
                <Button size="compact-xs" variant="subtle" color="red" onClick={() => void loadPage(null)}>Retry</Button>
              </Group>
            </Alert>
          )}
          {runs.map((run) => <RunRow key={run.ordinal} run={run} />)}
          {loading && <Group justify="center" py={4}><Loader size="xs" /></Group>}
          {!loading && nextCursor && (
            <Button size="compact-xs" variant="subtle" onClick={() => void loadPage(nextCursor)}>
              Load more evidence
            </Button>
          )}
        </Stack>
      </Collapse>
    </div>
  );
};
