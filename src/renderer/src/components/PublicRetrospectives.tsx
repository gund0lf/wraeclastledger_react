import {
  ActionIcon, Alert, Badge, Card, Group, Loader, Stack, Text, Tooltip,
} from '@mantine/core';
import { IconCoins, IconRefresh, IconSnowflake, IconTrophy } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { Strategy } from '../utils/strategyConstants';
import { BROWSER_MIN_CONTENT_WIDTH } from '../utils/strategyConstants';
import {
  fetchRetrospectiveBoard,
  fetchRetrospectiveCatalog,
  fetchRetrospectiveStrategy,
  type RetrospectiveBoardResponse,
  type RetrospectiveSnapshot,
} from '../utils/retrospectiveApi';
import { COLOR } from '../utils/uiTokens';
import { StrategyCard } from './StrategyCard';

interface Props {
  onLoadStrategy: (strategy: Strategy) => void;
}

interface SnapshotBoards {
  rated: RetrospectiveBoardResponse;
  profit: RetrospectiveBoardResponse;
}

function displayTime(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : iso;
}

const FrozenBoard = ({
  title,
  description,
  strategies,
  total,
  profit = false,
  loadingStrategyId,
  onLoad,
}: {
  title: string;
  description: string;
  strategies: Strategy[];
  total: number;
  profit?: boolean;
  loadingStrategyId: string | null;
  onLoad: (strategy: Strategy) => void;
}) => (
  <Card
    padding="xs"
    radius="sm"
    withBorder
    style={{
      background: profit ? COLOR.tintOliveBg : COLOR.surfaceInfoBg,
      borderColor: profit ? COLOR.tintOliveBorder : COLOR.surfaceInfoBorder,
    }}
  >
    <Stack gap={6}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap={6} wrap="nowrap">
          {profit
            ? <IconCoins size={15} color={COLOR.warning} />
            : <IconTrophy size={15} color={COLOR.accent} />}
          <div>
            <Text size="xs" fw={700}>{title}</Text>
            <Text size="xs" c="dimmed">{description}</Text>
          </div>
        </Group>
        {profit && (
          <Badge size="xs" color="yellow" variant="light">
            Author-reported
          </Badge>
        )}
      </Group>

      {strategies.length === 0 ? (
        <Text size="xs" c="dimmed">No strategies qualified for this board.</Text>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Stack gap={3} style={{ minWidth: BROWSER_MIN_CONTENT_WIDTH }}>
            {strategies.map((strategy) => (
              <div key={strategy.id} style={{ position: 'relative' }}>
                <StrategyCard
                  strategy={strategy}
                  frozen
                  onLoadBuild={onLoad}
                />
                {loadingStrategyId === strategy.id && (
                  <Loader
                    size="xs"
                    style={{ position: 'absolute', top: 10, right: 10 }}
                  />
                )}
              </div>
            ))}
          </Stack>
        </div>
      )}

      {total > strategies.length && (
        <Text size="xs" c="dimmed" ta="right">
          Showing {strategies.length} of {total}
        </Text>
      )}
    </Stack>
  </Card>
);

export const PublicRetrospectives = ({ onLoadStrategy }: Props) => {
  const [snapshots, setSnapshots] = useState<RetrospectiveSnapshot[]>([]);
  const [boards, setBoards] = useState<Record<string, SnapshotBoards>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingStrategyId, setLoadingStrategyId] = useState<string | null>(null);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const catalog = await fetchRetrospectiveCatalog();
      setSnapshots(catalog.retrospectives);
      const loadedBoards = await Promise.all(catalog.retrospectives.map(async (snapshot) => {
        const [rated, profit] = await Promise.all([
          fetchRetrospectiveBoard(snapshot.league_key, 'score'),
          fetchRetrospectiveBoard(snapshot.league_key, 'div_per_map'),
        ]);
        return [snapshot.league_key, { rated, profit }] as const;
      }));
      setBoards(Object.fromEntries(loadedBoards));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load public snapshots.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  const loadFrozenStrategy = async (leagueKey: string, strategy: Strategy) => {
    setLoadingStrategyId(strategy.id);
    setError(null);
    try {
      const detail = await fetchRetrospectiveStrategy(leagueKey, strategy.id);
      onLoadStrategy(detail.strategy);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load this frozen strategy.');
    } finally {
      setLoadingStrategyId(null);
    }
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap={6}>
            <IconSnowflake size={14} color={COLOR.accent} />
            <Text size="sm" fw={700}>Public frozen snapshots</Text>
          </Group>
          <Text size="xs" c="dimmed">
            Results are captured at league close and never follow later votes or strategy updates.
          </Text>
        </div>
        <Tooltip label="Refresh public snapshots" withArrow>
          <ActionIcon
            size="md"
            variant="default"
            loading={loading}
            aria-label="Refresh public snapshots"
            onClick={() => void loadSnapshots()}
          >
            <IconRefresh size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {error && (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      )}

      {loading && snapshots.length === 0 ? (
        <Group justify="center" py="lg"><Loader size="sm" /></Group>
      ) : snapshots.length === 0 && !error ? (
        <Alert color="blue" variant="light">
          Public snapshot not published yet.
        </Alert>
      ) : (
        snapshots.map((snapshot) => {
          const snapshotBoards = boards[snapshot.league_key];
          return (
            <Card key={snapshot.league_key} padding="xs" radius="sm" withBorder>
              <Stack gap="xs">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <div>
                    <Group gap={6}>
                      <Text size="sm" fw={700}>{snapshot.league_name}</Text>
                      <Badge size="xs" color="blue" variant="light">
                        {snapshot.strategy_count} frozen
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      Cutoff {displayTime(snapshot.cutoff_utc)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Snapshot created {displayTime(snapshot.frozen_at)}
                    </Text>
                  </div>
                  <Badge size="xs" color="cyan" variant="outline">Immutable</Badge>
                </Group>

                {!snapshotBoards ? (
                  <Group justify="center" py="md"><Loader size="sm" /></Group>
                ) : (
                  <>
                    <FrozenBoard
                      title="Top Rated"
                      description="Community score captured when this snapshot was created."
                      strategies={snapshotBoards.rated.strategies}
                      total={snapshotBoards.rated.total}
                      loadingStrategyId={loadingStrategyId}
                      onLoad={(strategy) => void loadFrozenStrategy(snapshot.league_key, strategy)}
                    />
                    <FrozenBoard
                      title="Top Profit"
                      description="Divines per map reported by each strategy author."
                      strategies={snapshotBoards.profit.strategies}
                      total={snapshotBoards.profit.total}
                      profit
                      loadingStrategyId={loadingStrategyId}
                      onLoad={(strategy) => void loadFrozenStrategy(snapshot.league_key, strategy)}
                    />
                  </>
                )}
              </Stack>
            </Card>
          );
        })
      )}
    </Stack>
  );
};
