import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Switch,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { IconChevronDown, IconChevronRight, IconRefresh, IconTree, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useSessionKeys, useSessionStore } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import { computeMultiplier } from '../utils/profit';
import { inferMapType } from '../utils/mapTypeDetection';
import { confirmedLeagueSync } from '../utils/league';
import { COLOR, FONT } from '../utils/uiTokens';
import { isPathofpathingTreeUrl } from '../utils/atlasUrl';
import {
  atlasSyncPresentation,
  atlasSyncState,
  describeMapModifierSource,
  fragmentSourceLabel,
  shouldShowAtlasSyncGuidance,
} from '../utils/atlasCalcPresentation';
import { applyAtlasStatsSyncPatch, buildAtlasStatsSyncPatch } from '../utils/atlasStatsSync';
import { MULTIPLYING_EFFECT_PER_FRAGMENT } from '../../../shared/mapDevice';
import './AtlasCalcModule.css';

const SectionBar = ({ title, meta, open, onClick }: {
  title: string;
  meta: string;
  open: boolean;
  onClick: () => void;
}) => (
  <UnstyledButton
    className="atlas-calc-section-bar"
    data-open={open}
    onClick={onClick}
    aria-expanded={open}
  >
    {open
      ? <IconChevronDown size={12} color={COLOR.textMuted} />
      : <IconChevronRight size={12} color={COLOR.textMuted} />}
    <Text size="xs" fw={600} className="atlas-calc-section-title">{title}</Text>
    <div className="atlas-calc-section-meta">
      <Text component="span" size="xs" c="dimmed" className="atlas-calc-section-meta-text">
        {meta}
      </Text>
    </div>
  </UnstyledButton>
);

const SourceRow = ({ name, value, source, detail, active = false }: {
  name: string;
  value: string;
  source: string;
  detail: string;
  active?: boolean;
}) => (
  <Tooltip label={detail} multiline w={300} withArrow openDelay={350}>
    <div className="atlas-calc-source-row">
      <div className="atlas-calc-source-copy">
        <Text size="xs" fw={600}>{name}</Text>
        <Text size="xs" c="dimmed" className="atlas-calc-source-label">{source}</Text>
      </div>
      <Text size="xs" fw={700} className={active ? 'atlas-calc-source-value is-active' : 'atlas-calc-source-value'}>
        {value}
      </Text>
    </div>
  </Tooltip>
);

const fmt1 = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(1);

export const AtlasCalcModule = ({ embedded = false }: { embedded?: boolean } = {}) => {
  const { ref: panelRef, width: panelWidth } = useElementSize();
  const compactPanel = panelWidth > 0 && panelWidth < 280;
  const {
    maps,
    settings,
    updateSetting,
    setAtlasBonus,
    atlasBonusByLeague,
    sessionNonce,
    sessionLifecycle,
  } = useSessionKeys(
    'maps',
    'settings',
    'updateSetting',
    'setAtlasBonus',
    'atlasBonusByLeague',
    'sessionNonce',
    'sessionLifecycle',
  );
  const requestPanel = useUIStore((state) => state.requestPanel);
  const [inputsOpen, setInputsOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [legacyNoticeDismissed, setLegacyNoticeDismissed] = useState(false);
  const [autoDetectMsg, setAutoDetectMsg] = useState<string | null>(null);

  useEffect(() => {
    setInputsOpen(false);
    setBreakdownOpen(false);
    setRefreshing(false);
    setSyncError(null);
    setLegacyNoticeDismissed(false);
  }, [sessionNonce]);

  useEffect(() => {
    setSyncError(null);
    setLegacyNoticeDismissed(false);
  }, [settings.atlasTreeUrl]);

  // The compatibility map type remains persisted/wire-visible, but ordinary
  // sessions no longer edit it here. Map Log evidence updates the fallback.
  useEffect(() => {
    if (maps.length === 0) return undefined;
    const inferred = inferMapType(maps, settings.mapType);
    if (inferred !== settings.mapType) {
      updateSetting('mapType', inferred, 'automatic');
      setAutoDetectMsg(`Fallback updated to ${inferred} from ${maps.length} maps`);
      const timer = setTimeout(() => setAutoDetectMsg(null), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [maps.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const multiplierResult = computeMultiplier(settings, maps);
  const {
    multiplier,
    fragmentCount,
    fragmentCountSource,
    fragmentEffect,
    nodeEffect,
    scarabOfRiskMods,
    effectiveMods,
    mountBonus,
  } = multiplierResult;

  const mapSource = describeMapModifierSource(maps, settings.mapType);
  const syncState = atlasSyncState(settings, sessionLifecycle);
  const syncStatus = atlasSyncPresentation(syncState);
  const hasTree = isPathofpathingTreeUrl(settings.atlasTreeUrl);
  const riskScarabs = scarabOfRiskMods / 2;
  const atlasSource = syncState === 'current'
    ? 'Atlas Tree · current sync'
    : syncState === 'changed-since-read'
      ? 'Atlas Tree · last sync is stale'
      : syncState === 'previous-league'
        ? 'Atlas Tree · previous league'
        : syncState === 'legacy-imported'
          ? 'Legacy/imported setup'
          : 'Atlas Tree · not synced';
  const readAt = settings.atlasStatsRead?.readAt;
  const readDetail = readAt && Number.isFinite(Date.parse(readAt))
    ? ` Last successful read: ${new Date(readAt).toLocaleString()}.`
    : '';
  const activeLeague = confirmedLeagueSync();
  const showBonusHint = sessionLifecycle === 'live'
    && !!activeLeague
    && !settings.atlasBonus
    && atlasBonusByLeague[activeLeague] === undefined;
  const showGuidance = shouldShowAtlasSyncGuidance(syncState, {
    syncUnavailable: syncError !== null,
    legacyNoticeDismissed,
  });
  const guidance = syncError
    ? {
        title: 'Atlas sync unavailable',
        detail: `The Atlas Tree could not be read: ${syncError}`,
      }
    : syncState === 'changed-since-read'
        ? {
            title: 'Atlas Tree changed',
            detail: 'A different tree URL was detected. Sync again to refresh the derived setup.',
          }
        : syncState === 'previous-league'
          ? {
              title: 'Previous league setup',
              detail: 'This session belongs to a previous league. Its saved Atlas inputs remain visible for reference.',
            }
          : syncState === 'legacy-imported'
            ? {
                title: 'Verify Atlas setup',
                detail: 'This session has Atlas values without a verified tree snapshot. Sync to verify them.',
              }
            : hasTree
              ? {
                  title: 'Sync Atlas setup',
                  detail: 'No Atlas setup has been synced for this session. Sync to read its allocated modifiers.',
                }
              : {
                  title: 'Set up the Atlas Tree',
                  detail: 'Build or paste your tree in Atlas Tree, then return here to sync its allocated modifiers.',
                };
  const showGuidanceAction = syncError !== null
    || syncState === 'never-read'
    || syncState === 'changed-since-read'
    || syncState === 'legacy-imported';

  const refreshFromAtlas = async () => {
    if (!hasTree || refreshing) return;
    const targetNonce = sessionNonce;
    const sourceUrl = settings.atlasTreeUrl;
    setRefreshing(true);
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
      if (useSessionStore.getState().sessionNonce === targetNonce) setRefreshing(false);
    }
  };

  const mapInputMeta = mapSource.observed
    ? mapSource.value
    : maps.length === 0
      ? 'No map sample'
      : `${settings.mapType} fallback · ${mapSource.source.replace('Map Log · ', '')}`;
  const inputsMeta = `${mapInputMeta} · ${fragmentCount} ${fragmentCount === 1 ? 'frag' : 'frags'}`;
  const breakdownMeta = `+${fmt1(mountBonus + fragmentEffect + nodeEffect)}% mods · ${settings.atlasBonus ? '+25% IIQ' : 'Bonus off'}`;
  const heroContext = mapSource.observed
    ? `${fmt1(effectiveMods)} effective modifiers · observed`
    : maps.length === 0
      ? `No map evidence · ${settings.mapType} provisional fallback`
      : `${fmt1(effectiveMods)} fallback modifiers · ${mapSource.source.replace('Map Log · ', '')}`;

  return (
    <Card
      ref={panelRef}
      shadow={embedded ? undefined : 'sm'}
      padding={embedded ? 0 : 'sm'}
      radius="md"
      withBorder={!embedded}
      h={embedded ? 'auto' : '100%'}
      className="atlas-calc-card atlas-calc-refined"
      style={{ background: embedded ? 'transparent' : undefined, overflow: embedded ? 'visible' : 'auto' }}
    >
      <Stack gap={8}>
        <div className="atlas-calc-hero">
          <Tooltip label={syncError ?? `${syncStatus.detail}${readDetail}`} multiline w={280} withArrow>
            <Badge
              className="atlas-calc-hero-status"
              size="xs"
              variant="light"
              color={syncError ? 'red' : syncStatus.color}
            >
              {syncError ? 'Unavailable' : syncStatus.label}
            </Badge>
          </Tooltip>
          <div className="atlas-calc-hero-main" style={{ padding: compactPanel ? '7px 8px' : '8px 10px' }}>
            <Text fw={700} className="atlas-calc-hero-value" style={{ fontSize: compactPanel ? FONT.xl : 24 }}>
              {multiplier.toFixed(3)}×
            </Text>
            <Text tt="uppercase" c="dimmed" className="atlas-calc-hero-label">Atlas Multiplier</Text>
            <Text c="dimmed" className="atlas-calc-hero-context" title={heroContext}>{heroContext}</Text>
          </div>
        </div>

        {showGuidance && (
          <div
            className={`atlas-calc-guidance${syncError ? ' is-error' : syncState === 'current' ? '' : ' is-attention'}`}
            role={syncError ? 'alert' : 'status'}
          >
            <div className="atlas-calc-guidance-main">
              <div className="atlas-calc-guidance-row">
                <div className="atlas-calc-guidance-copy">
                  <Text size="xs" fw={600}>{guidance.title}</Text>
                  <Text size="xs" c={syncError ? 'red' : 'dimmed'} className="atlas-calc-guidance-detail">
                    {guidance.detail}
                  </Text>
                </div>
                <Group gap={5} wrap="nowrap" className="atlas-calc-guidance-actions">
                  {showGuidanceAction && (hasTree ? (
                    <Button
                      size="compact-xs"
                      variant="default"
                      leftSection={<IconRefresh size={12} />}
                      loading={refreshing}
                      onClick={() => void refreshFromAtlas()}
                    >
                      Sync
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
                  {syncState === 'legacy-imported' && syncError === null && (
                    <Tooltip label="Dismiss while viewing this session">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        aria-label="Dismiss legacy Atlas setup notice"
                        onClick={() => setLegacyNoticeDismissed(true)}
                      >
                        <IconX size={12} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </div>
            </div>
          </div>
        )}

        {showBonusHint && (
          <div className="atlas-calc-guidance atlas-calc-bonus-guidance" role="status">
            <div className="atlas-calc-guidance-row">
              <div className="atlas-calc-guidance-copy">
                <Text size="xs" fw={600}>Atlas Bonus</Text>
                <Text size="xs" c="dimmed" className="atlas-calc-guidance-detail">
                  Is it complete for {activeLeague}? This choice is reused for new sessions in the league.
                </Text>
              </div>
              <Group gap={5} wrap="nowrap" className="atlas-calc-guidance-actions">
                <Button size="compact-xs" variant="light" onClick={() => setAtlasBonus(true)}>
                  Complete · +25% IIQ
                </Button>
                <Button size="compact-xs" variant="default" onClick={() => setAtlasBonus(false)}>
                  Not yet
                </Button>
              </Group>
            </div>
          </div>
        )}

        <Stack gap={0}>
          <SectionBar
            title="Inputs"
            meta={inputsMeta}
            open={inputsOpen}
            onClick={() => setInputsOpen((open) => !open)}
          />
          {inputsOpen && (
            <div className="atlas-calc-section-content atlas-calc-setup-content">
              <Stack gap={8}>
                {autoDetectMsg && <Text size="xs" c="teal">{autoDetectMsg}</Text>}

                <div className="atlas-calc-source-list" aria-label="Atlas multiplier input sources">
                  <SourceRow
                    name="Map modifiers"
                    value={mapSource.value}
                    source={mapSource.source}
                    detail={mapSource.detail}
                    active={mapSource.observed}
                  />
                  <SourceRow
                    name="Scarab of Risk"
                    value={riskScarabs > 0 ? `+${scarabOfRiskMods} modifiers` : 'None'}
                    source={`Investment · ${riskScarabs} ${riskScarabs === 1 ? 'scarab' : 'scarabs'}`}
                    detail="Each Cartography Scarab of Risk adds two explicit modifiers before Mounting Modifiers is calculated."
                    active={riskScarabs > 0}
                  />
                  <SourceRow
                    name="Mounting Modifiers"
                    value={settings.mountingModifiers ? `On · +${fmt1(mountBonus)}%` : 'Off'}
                    source={atlasSource}
                    detail="Allocation is derived only from a successful Atlas Tree setup sync."
                    active={settings.mountingModifiers}
                  />
                  <SourceRow
                    name="Multiplying Modifiers"
                    value={settings.multiplyingModifiersAllocated ? `On · +${fmt1(fragmentEffect)}%` : 'Off'}
                    source={atlasSource}
                    detail="Node allocation comes from Atlas Tree; the number of fragments comes from Investment when slots are populated."
                    active={settings.multiplyingModifiersAllocated}
                  />
                  <SourceRow
                    name="Fragments"
                    value={settings.multiplyingModifiersAllocated ? `${fragmentCount} · +${fmt1(fragmentEffect)}%` : 'Not used'}
                    source={fragmentSourceLabel(fragmentCountSource, fragmentCount)}
                    detail={`${MULTIPLYING_EFFECT_PER_FRAGMENT}% increased effect per fragment. Legacy/imported counts are used only when Investment has no occupied slots.`}
                    active={settings.multiplyingModifiersAllocated && fragmentCount > 0}
                  />
                  <SourceRow
                    name="Small modifier nodes"
                    value={settings.smallNodesAllocated > 0 ? `${settings.smallNodesAllocated} · +${fmt1(nodeEffect)}%` : 'None'}
                    source={atlasSource}
                    detail="The allocated small-node count is derived only from a successful Atlas Tree setup sync."
                    active={settings.smallNodesAllocated > 0}
                  />
                </div>

                <div className="atlas-calc-bonus-row">
                  <div>
                    <Text size="xs" fw={600}>Atlas Bonus</Text>
                    <Text size="xs" c="dimmed" className="atlas-calc-source-label">
                      {activeLeague ? `${activeLeague} league preference` : 'League preference'} · Quantity only
                    </Text>
                  </div>
                  <Tooltip label="Completing all 100 Atlas Bonus Objectives grants a flat +25% IIQ. Atlas progress resets each league." multiline w={260}>
                    <Switch
                      size="xs"
                      checked={settings.atlasBonus}
                      onChange={(event) => setAtlasBonus(event.currentTarget.checked)}
                      label={settings.atlasBonus ? '+25% IIQ' : 'Off'}
                      labelPosition="left"
                    />
                  </Tooltip>
                </div>
              </Stack>
            </div>
          )}
        </Stack>

        <Stack gap={0}>
          <SectionBar
            title="Calculation"
            meta={breakdownMeta}
            open={breakdownOpen}
            onClick={() => setBreakdownOpen((open) => !open)}
          />
          {breakdownOpen && (
            <div className="atlas-calc-section-content">
              <Stack gap={3} className="atlas-calc-calculation-list">
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs" c="dimmed">Base modifiers</Text>
                  <Text size="xs">{mapSource.value}</Text>
                </Group>
                {scarabOfRiskMods > 0 && (
                  <Group justify="space-between" wrap="nowrap">
                    <Text size="xs" c="dimmed">Risk ({riskScarabs} × 2 modifiers)</Text>
                    <Text size="xs">{fmt1(effectiveMods)} effective</Text>
                  </Group>
                )}
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs" c="dimmed">Mounting ({fmt1(effectiveMods)} × 2%)</Text>
                  <Text size="xs">+{fmt1(mountBonus)}%</Text>
                </Group>
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs" c="dimmed">Multiplying ({fragmentCount} × {MULTIPLYING_EFFECT_PER_FRAGMENT}%)</Text>
                  <Text size="xs">+{fmt1(fragmentEffect)}%</Text>
                </Group>
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs" c="dimmed">Small nodes ({settings.smallNodesAllocated} × 2%)</Text>
                  <Text size="xs">+{fmt1(nodeEffect)}%</Text>
                </Group>
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs" c="dimmed">Atlas Bonus (Quantity only)</Text>
                  <Text size="xs">{settings.atlasBonus ? '+25% flat IIQ' : 'Off'}</Text>
                </Group>
              </Stack>
            </div>
          )}
        </Stack>
      </Stack>
    </Card>
  );
};
