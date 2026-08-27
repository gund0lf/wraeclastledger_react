import { Badge, Button, Group, Paper, Text } from '@mantine/core';
import { IconRefresh, IconTree } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useSessionKeys, useSessionStore } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import {
  atlasSyncPresentation,
  atlasSyncState,
  type AtlasSyncState,
} from '../utils/atlasCalcPresentation';
import { applyAtlasStatsSyncPatch, buildAtlasStatsSyncPatch } from '../utils/atlasStatsSync';
import { isPathofpathingTreeUrl } from '../utils/atlasUrl';

const readinessCopy = (state: AtlasSyncState, hasTree: boolean): string => {
  switch (state) {
    case 'current':
      return 'New observations will record this verified tree together with the current scarabs.';
    case 'changed-since-read':
      return 'Sync before entering another observation so its recorded setup matches the changed tree.';
    case 'previous-league':
      return 'Existing observations keep their recorded setup. This previous-league tree is reference only.';
    case 'legacy-imported':
      return 'Stored Atlas values have no verified tree identity. Sync before entering another observation.';
    case 'never-read':
      return hasTree
        ? 'Sync before entering observations so their Atlas setup can be recorded.'
        : 'Build or paste your tree in Atlas Tree, then sync it before entering observations.';
  }
};

export function RunStatisticsSetupReadiness() {
  const {
    settings,
    sessionLifecycle,
    sessionNonce,
  } = useSessionKeys('settings', 'sessionLifecycle', 'sessionNonce');
  const requestPanel = useUIStore((state) => state.requestPanel);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const state = atlasSyncState(settings, sessionLifecycle);
  const presentation = atlasSyncPresentation(state);
  const hasTree = isPathofpathingTreeUrl(settings.atlasTreeUrl);
  const canSync = state !== 'current' && state !== 'previous-league';

  useEffect(() => {
    setSyncing(false);
    setSyncError(null);
  }, [sessionNonce, settings.atlasTreeUrl]);

  const syncSetup = async (): Promise<void> => {
    if (!hasTree || syncing) return;
    const targetNonce = sessionNonce;
    const sourceUrl = settings.atlasTreeUrl;
    setSyncing(true);
    setSyncError(null);
    try {
      if (!window.api) throw new Error('Atlas Tree reader is unavailable');
      const result = await window.api.readAtlasTreeStats(sourceUrl);
      if (useSessionStore.getState().sessionNonce !== targetNonce) return;
      if (!result.groups) throw new Error(result.error ?? 'No Atlas Tree stats were found');
      const current = useSessionStore.getState();
      const patch = buildAtlasStatsSyncPatch(
        result.groups,
        sourceUrl,
        current.settings.leagueName,
      );
      applyAtlasStatsSyncPatch(current.updateSetting, patch, 'automatic');
    } catch (error) {
      if (useSessionStore.getState().sessionNonce !== targetNonce) return;
      setSyncError(error instanceof Error ? error.message : 'Could not read Atlas Tree stats');
    } finally {
      if (useSessionStore.getState().sessionNonce === targetNonce) setSyncing(false);
    }
  };

  return (
    <Paper
      className="run-statistics-readiness"
      data-state={syncError ? 'unavailable' : state}
      withBorder
      p="xs"
      role={syncError ? 'alert' : 'status'}
    >
      <Group justify="space-between" align="center" gap="xs" wrap="wrap">
        <div className="run-statistics-readiness-copy">
          <Group gap={6} wrap="nowrap">
            <Text size="xs" fw={700}>Atlas setup</Text>
            <Badge
              size="xs"
              variant="light"
              color={syncError ? 'red' : presentation.color}
            >
              {syncError ? 'Unavailable' : presentation.label}
            </Badge>
          </Group>
          <Text size="xs" c={syncError ? 'red' : 'dimmed'}>
            {syncError
              ? `The Atlas Tree could not be read: ${syncError}`
              : readinessCopy(state, hasTree)}
          </Text>
        </div>
        {(canSync || syncError !== null) && (hasTree ? (
          <Button
            size="compact-xs"
            variant="default"
            leftSection={<IconRefresh size={12} />}
            loading={syncing}
            onClick={() => void syncSetup()}
          >
            {syncError ? 'Retry sync' : 'Sync setup'}
          </Button>
        ) : (
          <Button
            size="compact-xs"
            variant="default"
            leftSection={<IconTree size={12} />}
            onClick={() => requestPanel('atlas-tree')}
          >
            Open Atlas Tree
          </Button>
        ))}
      </Group>
    </Paper>
  );
}
