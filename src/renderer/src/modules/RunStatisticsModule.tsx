import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Collapse,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronDown, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMemo, useState, type ReactNode } from 'react';
import { ModuleHeader } from '../components/ui/ModuleHeader';
import { RunTimerPanel } from '../components/RunTimerPanel';
import type {
  RunStatisticsSetupAttribution,
  RunStatisticsSetupCategory,
  RunStatisticsSetupContext,
  ScarabSlot,
} from '../types';
import { useSessionKeys } from '../store/useSessionStore';
import { useRepositorySessions } from '../repository/useRepositorySessions';
import {
  ATLAS_ANOMALIES,
  MERCENARY_ARCHETYPES,
  hasManualStatistics,
  mercenaryProfile,
  totalAtlasAnomalies,
  totalMercenaryEncounters,
  type ManualStatisticField,
} from '../utils/manualStatistics';
import {
  buildBestiaryRateModel,
  aggregateRunStatisticsSessions,
  collectRunStatisticsSessions,
  deriveMercenaryScarabSetup,
  deriveMercenaryTargetingImpact,
  deriveValuableBeastGains,
  estimateBestiaryEncounter,
  observedRatePercent,
  remainingUntrackedMaps,
  totalValuableBeastGains,
} from '../utils/runStatistics';

const COUNTER_FIELDS: Array<{
  field: ManualStatisticField;
  label: string;
}> = [
  { field: 'starfallCraters', label: 'Starfall Craters' },
  { field: 'svalinnDrops', label: 'Svalinn drops' },
  { field: 'wildwoodEncounters', label: 'Wildwood encounters' },
];

const validPositiveInteger = (value: number | string): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const formatPercent = (value: number | null): string =>
  value === null ? 'rate unavailable' : `${value.toFixed(1)}%`;

const formatCollapsedRate = (
  count: number,
  denominator: number,
  label: string,
): string => `${count.toLocaleString()} ${label} · ${formatPercent(observedRatePercent(count, denominator))}`;

const formatDecimal = (value: number): string => value.toLocaleString(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const setupScarabSlots = (context: RunStatisticsSetupContext): ScarabSlot[] =>
  context.scarabNames.map((name) => ({ name, cost: 0 }));

const atlasSourceIdentity = (url: string | null): string => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const version = parsed.searchParams.get('v');
    const allocation = parsed.hash.slice(1);
    const allocationLabel = allocation.length > 0
      ? `${allocation.slice(0, 8)}${allocation.length > 8 ? '…' : ''}`
      : 'no allocation hash';
    return ` · ${version ?? 'unknown version'} · tree ${allocationLabel}`;
  } catch {
    return '';
  }
};

const modelEligibleContext = (
  attribution: RunStatisticsSetupAttribution | undefined,
): RunStatisticsSetupContext | null => (
  attribution
  && !attribution.legacyUnattributed
  && !attribution.overflowed
  && attribution.contexts.length === 1
    ? attribution.contexts[0]
    : null
);

interface SetupContextBlockProps {
  attribution?: RunStatisticsSetupAttribution;
  category: RunStatisticsSetupCategory;
  hasObservedResult: boolean;
  isGlobal: boolean;
}

const SetupContextBlock = ({
  attribution,
  category,
  hasObservedResult,
  isGlobal,
}: SetupContextBlockProps) => {
  const contexts = attribution?.contexts ?? [];
  const sourceLabel = category === 'beasts'
    ? 'Baseline/Return CSV imports'
    : 'authored counter updates that add observations';
  return (
    <>
      <Text size="xs" fw={700} mt="sm" mb={4}>Setup context</Text>
      <Paper withBorder p="xs">
        {isGlobal ? (
          <Text size="xs" c="dimmed">
            Setup evidence remains attached to each individual session. This combined view does not
            merge distinct Atlas/scarab configurations into one implied setup.
          </Text>
        ) : contexts.length === 0 ? (
          <Text size="xs" c="dimmed">
            {hasObservedResult
              ? 'Unattributed legacy result. The current/final session setup is deliberately not applied retroactively.'
              : `No recorded setup yet. Atlas/scarab context will be captured from ${sourceLabel}.`}
          </Text>
        ) : (
          <Stack gap={4}>
            {contexts.map((context, index) => (
              <Box key={`${context.modelRevision}-${index}`}>
                <Text size="xs" fw={600}>
                  {contexts.length > 1 ? `Recorded setup ${index + 1}` : 'Recorded setup'} · {context.leagueName}
                </Text>
                <Text size="xs" c="dimmed" title={context.atlasTreeUrl ?? undefined}>
                  Atlas: {context.atlasSource === 'path-of-pathing'
                    ? `Path of Pathing Show stats${atlasSourceIdentity(context.atlasTreeUrl)}`
                    : 'not captured'}
                  {context.atlasDetectedTags.length > 0
                    ? ` · ${context.atlasDetectedTags.join(', ')}`
                    : ''}
                </Text>
                <Text size="xs" c="dimmed">
                  Scarabs: {context.scarabNames.length > 0
                    ? context.scarabNames.join(' · ')
                    : 'none occupied'}
                  {' · '}source {context.captureSource === 'loot-snapshots'
                    ? 'loot snapshots'
                    : 'manual entry'}
                  {' · '}model {context.modelRevision}
                </Text>
              </Box>
            ))}
          </Stack>
        )}
      </Paper>
    </>
  );
};

const DataQualityBlock = ({
  attribution,
  category,
  hasObservedResult,
  isGlobal,
}: SetupContextBlockProps) => {
  const contexts = attribution?.contexts ?? [];
  const sourceLabel = category === 'beasts'
    ? 'Baseline/Return CSV imports'
    : 'authored counter updates that add observations';
  return (
    <>
      <Text size="xs" fw={700} mt="sm" mb={4}>Data quality</Text>
      <Paper withBorder p="xs">
        <Text size="xs" c="dimmed">
          {isGlobal
            ? 'Observed totals use only explicitly reporting sessions. Setup differences are not normalized or presented as causal.'
            : attribution?.overflowed
              ? 'More setup changes were observed than the bounded record retains. Model and normalization are disabled.'
              : attribution?.legacyUnattributed
                ? 'Some results predate setup capture. Current settings are not substituted; model and normalization are disabled.'
                : contexts.length > 1
                  ? `${contexts.length} setup contexts were recorded. The total and Map Log denominator cannot be split between them, so model and normalization are disabled.`
                  : contexts.length === 1
                    ? `One setup was captured from ${sourceLabel}. The full Map Log remains the denominator; this is setup provenance, not a per-map timing boundary.`
                    : hasObservedResult
                      ? 'No historical setup evidence exists for this result. Only the observed value is shown.'
                      : 'No observed result has been reported for this category.'}
        </Text>
      </Paper>
    </>
  );
};

type StatisticsSectionId = 'kalguuran' | 'wildwood' | 'anomalies' | 'beasts' | 'mercenaries';
type StatisticsView = 'session' | 'all';

interface StatisticsSectionProps {
  id: StatisticsSectionId;
  title: string;
  description: string;
  badge?: ReactNode;
  opened: boolean;
  onToggle: (id: StatisticsSectionId) => void;
  children: ReactNode;
}

const StatisticsSection = ({
  id,
  title,
  description,
  badge,
  opened,
  onToggle,
  children,
}: StatisticsSectionProps) => (
  <Box>
    <UnstyledButton
      w="100%"
      aria-expanded={opened}
      aria-controls={`run-statistics-${id}`}
      onClick={() => onToggle(id)}
    >
      <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
        <Group align="center" wrap="nowrap" gap="xs" style={{ minWidth: 0 }}>
          <IconChevronDown
            size={16}
            aria-hidden
            style={{
              flexShrink: 0,
              transform: opened ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 120ms ease',
            }}
          />
          <Box style={{ minWidth: 0 }}>
            <Text size="sm" fw={700}>{title}</Text>
            <Text size="xs" c="dimmed">{description}</Text>
          </Box>
        </Group>
        {badge}
      </Group>
    </UnstyledButton>
    <Collapse in={opened} id={`run-statistics-${id}`}>
      <Box pt="xs">{children}</Box>
    </Collapse>
  </Box>
);

export const RunStatisticsModule = () => {
  const {
    maps,
    baselineItems,
    lootItems,
    manualStatistics,
    repositorySessions,
    activeSessionId,
    setManualStatistic,
    setRunStatisticsInfoDismissed,
    setBeastStatisticsInfoDismissed,
    addManualAtlasAnomalyCount,
    setManualAtlasAnomalyCount,
    addManualMercenaryCount,
    setManualMercenaryCount,
    clearManualStatistics,
  } = useSessionKeys(
    'maps',
    'baselineItems',
    'lootItems',
    'manualStatistics',
    'repositorySessions',
    'activeSessionId',
    'setManualStatistic',
    'setRunStatisticsInfoDismissed',
    'setBeastStatisticsInfoDismissed',
    'addManualAtlasAnomalyCount',
    'setManualAtlasAnomalyCount',
    'addManualMercenaryCount',
    'setManualMercenaryCount',
    'clearManualStatistics',
  );
  const [anomalyName, setAnomalyName] = useState<string | null>(null);
  const [anomalyAmount, setAnomalyAmount] = useState<number | string>(1);
  const [mercenaryArchetype, setMercenaryArchetype] = useState<string | null>(null);
  const [mercenaryAmount, setMercenaryAmount] = useState<number | string>(1);
  const [statisticsView, setStatisticsView] = useState<StatisticsView>('session');
  const [openSections, setOpenSections] = useState<Record<StatisticsSectionId, boolean>>({
    kalguuran: false,
    wildwood: false,
    anomalies: false,
    beasts: false,
    mercenaries: false,
  });
  const [clearOpen, { open: openClear, close: closeClear }] = useDisclosure(false);

  const toggleSection = (id: StatisticsSectionId): void => {
    setOpenSections((current) => ({ ...current, [id]: !current[id] }));
  };

  const isGlobal = statisticsView === 'all';
  const repositorySessionIds = useMemo(
    () => repositorySessions.filter(({ status }) => status === 'ready').map(({ id }) => id),
    [repositorySessions],
  );
  const {
    sessions: savedSessions,
    loading: globalLoading,
    error: globalLoadError,
  } = useRepositorySessions(repositorySessionIds, isGlobal);
  const globalStatistics = useMemo(() => aggregateRunStatisticsSessions(
    collectRunStatisticsSessions({
      mapCount: maps.length,
      manualStatistics,
      baselineItems,
      lootItems,
    }, activeSessionId, savedSessions),
  ), [activeSessionId, baselineItems, lootItems, manualStatistics, maps.length, savedSessions]);
  const mapCount = isGlobal ? globalStatistics.mapCount : maps.length;
  const sessionAnomalyRows = useMemo(() => [...(manualStatistics.atlasAnomalies ?? [])].sort(
    (left, right) => left.name.localeCompare(right.name),
  ), [manualStatistics.atlasAnomalies]);
  const anomalyRows = isGlobal
    ? globalStatistics.atlasAnomalies
    : sessionAnomalyRows.map((row) => ({ ...row, mapCount, sessionCount: 1 }));
  const anomalyTotal = isGlobal
    ? globalStatistics.anomalyTotal
    : totalAtlasAnomalies(manualStatistics);
  const anomalyMapCount = isGlobal ? globalStatistics.anomalyMapCount : mapCount;
  const sessionMercenaryRows = useMemo(() => [...(manualStatistics.mercenaries ?? [])].sort(
    (left, right) => left.archetype.localeCompare(right.archetype),
  ), [manualStatistics.mercenaries]);
  const mercenaryRows = isGlobal
    ? globalStatistics.mercenaries
    : sessionMercenaryRows.map((row) => ({ ...row, mapCount, sessionCount: 1 }));
  const mercenaryTotal = isGlobal
    ? globalStatistics.mercenaryTotal
    : totalMercenaryEncounters(manualStatistics);
  const mercenaryMapCount = isGlobal ? globalStatistics.mercenaryMapCount : mapCount;
  const untrackedMercenaryMaps = isGlobal
    ? globalStatistics.untrackedMercenaryMaps
    : remainingUntrackedMaps(mercenaryTotal, mapCount);
  const sessionBeastGains = useMemo(
    () => deriveValuableBeastGains(baselineItems, lootItems),
    [baselineItems, lootItems],
  );
  const beastGains = isGlobal ? globalStatistics.beastGains : sessionBeastGains;
  const beastMapCount = isGlobal ? globalStatistics.beastMapCount : mapCount;
  const beastTotal = totalValuableBeastGains(beastGains);
  const kalguuranSetup = manualStatistics.setupProvenance?.kalguuran;
  const wildwoodSetup = manualStatistics.setupProvenance?.wildwood;
  const anomalySetup = manualStatistics.setupProvenance?.anomalies;
  const beastSetup = manualStatistics.setupProvenance?.beasts;
  const mercenarySetup = manualStatistics.setupProvenance?.mercenaries;
  const beastSetupContext = modelEligibleContext(beastSetup);
  const mercenarySetupContext = modelEligibleContext(mercenarySetup);
  const beastModel = useMemo(() => (
    beastSetupContext?.bestiaryAtlasSetup
      ? buildBestiaryRateModel(
        beastSetupContext.bestiaryAtlasSetup,
        setupScarabSlots(beastSetupContext),
      )
      : null
  ), [beastSetupContext]);
  const mercenaryScarabSetup = useMemo(
    () => deriveMercenaryScarabSetup(
      mercenarySetupContext ? setupScarabSlots(mercenarySetupContext) : [],
    ),
    [mercenarySetupContext],
  );
  const mercenaryAtlasSetup = mercenarySetupContext?.mercenaryAtlasSetup;
  const hasLootSnapshots = isGlobal
    ? globalStatistics.beastSessionCount > 0
    : baselineItems.length > 0 && lootItems.length > 0;
  const hasStatistics = hasManualStatistics(manualStatistics);
  const canAddAnomaly = anomalyName !== null && validPositiveInteger(anomalyAmount);
  const canAddMercenary = mercenaryArchetype !== null && validPositiveInteger(mercenaryAmount);
  const starfallMetric = globalStatistics.counters.starfallCraters;
  const starfallReported = isGlobal
    ? starfallMetric.sessionCount > 0
    : manualStatistics.starfallCraters !== undefined;
  const starfallCount = isGlobal
    ? starfallMetric.count
    : manualStatistics.starfallCraters ?? 0;
  const starfallMapCount = isGlobal ? starfallMetric.mapCount : mapCount;
  const wildwoodMetric = globalStatistics.counters.wildwoodEncounters;
  const wildwoodReported = isGlobal
    ? wildwoodMetric.sessionCount > 0
    : manualStatistics.wildwoodEncounters !== undefined;
  const wildwoodCount = isGlobal
    ? wildwoodMetric.count
    : manualStatistics.wildwoodEncounters ?? 0;
  const wildwoodMapCount = isGlobal ? wildwoodMetric.mapCount : mapCount;

  const addAnomaly = (): void => {
    if (!anomalyName || !validPositiveInteger(anomalyAmount)) return;
    addManualAtlasAnomalyCount(anomalyName, anomalyAmount);
    setAnomalyName(null);
    setAnomalyAmount(1);
  };

  const addMercenary = (): void => {
    if (!mercenaryArchetype || !validPositiveInteger(mercenaryAmount)) return;
    addManualMercenaryCount(mercenaryArchetype, mercenaryAmount);
    setMercenaryArchetype(null);
    setMercenaryAmount(1);
  };

  const counterDescription = (field: ManualStatisticField): string => {
    if (isGlobal) {
      const metric = globalStatistics.counters[field];
      if (metric.sessionCount === 0) return 'Not recorded in any session';
      const sessionText = `${metric.sessionCount.toLocaleString()} ${metric.sessionCount === 1 ? 'session' : 'sessions'}`;
      if (field === 'svalinnDrops') {
        if (!globalStatistics.svalinnDenominatorComplete) {
          return `${metric.count.toLocaleString()} total · rate unavailable because at least one reporting session has no Crater count`;
        }
        return globalStatistics.svalinnCraterCount > 0
          ? `${metric.count.toLocaleString()} / ${globalStatistics.svalinnCraterCount.toLocaleString()} recorded Craters · ${formatPercent(observedRatePercent(metric.count, globalStatistics.svalinnCraterCount))} · ${sessionText}`
          : `Record Starfall Craters in the ${sessionText} reporting Svalinn`;
      }
      return metric.mapCount > 0
        ? `${metric.count.toLocaleString()} / ${metric.mapCount.toLocaleString()} tracked maps · ${formatPercent(observedRatePercent(metric.count, metric.mapCount))} · ${sessionText}`
        : `${metric.count.toLocaleString()} recorded · add maps to calculate the rate`;
    }
    const value = manualStatistics[field];
    if (value === undefined) return 'Not recorded';
    if (field === 'svalinnDrops') {
      const craters = manualStatistics.starfallCraters;
      return craters !== undefined && craters > 0
        ? `${value.toLocaleString()} / ${craters.toLocaleString()} Craters · ${formatPercent(observedRatePercent(value, craters))}`
        : 'Record Starfall Craters for the drop rate';
    }
    return mapCount > 0
      ? `${value.toLocaleString()} / ${mapCount.toLocaleString()} maps · ${formatPercent(observedRatePercent(value, mapCount))}`
      : 'Add maps to calculate the rate';
  };

  return (
    <Card
      shadow="sm"
      padding="sm"
      radius="md"
      withBorder
      h="100%"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <ModuleHeader
        title="Run Statistics"
        right={
          <Tooltip label={
            isGlobal
              ? 'Switch to Session to edit or clear its manual statistics'
              : hasStatistics
                ? 'Clear manual statistics'
                : 'Nothing recorded manually'
          }>
            <Button
              size="compact-xs"
              variant="subtle"
              color="red"
              disabled={isGlobal || !hasStatistics}
              leftSection={<IconTrash size={13} />}
              onClick={openClear}
            >
              Clear manual
            </Button>
          </Tooltip>
        }
      />

      <Modal opened={clearOpen} onClose={closeClear} title="Clear manual run statistics?" size="sm">
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            This removes the Starfall, Svalinn, Wildwood, Atlas anomaly, and Mercenary values from
            the current session. Loot-derived beast gains are unaffected. This cannot be undone.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={closeClear}>Cancel</Button>
            <Button
              color="red"
              onClick={() => {
                clearManualStatistics();
                closeClear();
              }}
            >
              Clear manual statistics
            </Button>
          </Group>
        </Stack>
      </Modal>

      <ScrollArea style={{ flex: 1 }} type="auto" offsetScrollbars>
        <Stack gap="md" pr="xs">
          <RunTimerPanel />

          {!manualStatistics.infoDismissed && (
            <Alert
              color="blue"
              variant="light"
              withCloseButton
              closeButtonLabel="Dismiss Run Statistics information for this session"
              onClose={() => setRunStatisticsInfoDismissed(true)}
            >
              <Text size="xs">
                Optional and local. Encounter counts are entered manually; valuable beast gains come
                from Baseline and Return loot snapshots. The Session view is editable. All sessions is
                read-only and combines each explicitly reported metric without treating missing values
                as zero. Svalinn uses recorded Craters. Nothing here is included in Discord shares.
              </Text>
            </Alert>
          )}

          <Group justify="space-between" align="center" wrap="wrap" gap="xs">
            <SegmentedControl
              size="xs"
              value={statisticsView}
              data={[
                { label: 'Session', value: 'session' },
                { label: 'All sessions', value: 'all' },
              ]}
              onChange={(value) => setStatisticsView(value as StatisticsView)}
            />
            <Text size="xs" c="dimmed">
              {isGlobal
                ? `${globalStatistics.sessionCount.toLocaleString()} sessions · ${globalStatistics.mapCount.toLocaleString()} maps`
                : `${maps.length.toLocaleString()} maps in this session`}
            </Text>
          </Group>

          {isGlobal && globalLoading && (
            <Text size="xs" c="dimmed">Loading saved-session statistics...</Text>
          )}
          {isGlobal && globalLoadError && (
            <Alert color="red" variant="light"><Text size="xs">{globalLoadError}</Text></Alert>
          )}

          <StatisticsSection
            id="kalguuran"
            title="Kalguuran"
            description="Record Starfall Craters and Svalinn drops from The Black Knight."
            badge={(
              <Badge size="sm" variant="light" color="yellow" style={{ flexShrink: 0 }}>
                {starfallReported
                  ? formatCollapsedRate(
                    starfallCount,
                    starfallMapCount,
                    starfallCount === 1 ? 'Crater' : 'Craters',
                  )
                  : 'Not recorded'}
              </Badge>
            )}
            opened={openSections.kalguuran}
            onToggle={toggleSection}
          >
            <Text size="xs" fw={700} mb={4}>Observed</Text>
            <Paper withBorder p="xs">
              <Text size="xs" fw={600}>Starfall Crater</Text>
              <Text size="xs" c="dimmed" mb="xs">
                Crater chance uses the Map Log; Svalinn is a Black Knight outcome within recorded Craters.
              </Text>
              <Box
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                  gap: 'var(--mantine-spacing-sm)',
                }}
              >
                {COUNTER_FIELDS.filter(({ field }) => field !== 'wildwoodEncounters').map(({ field, label }) => {
                  if (isGlobal) {
                    const metric = globalStatistics.counters[field];
                    return (
                      <Paper key={field} withBorder p="xs">
                        <Text size="xs" fw={600}>{label}</Text>
                        <Text size="sm" fw={700}>
                          {metric.sessionCount > 0 ? metric.count.toLocaleString() : 'Not recorded'}
                        </Text>
                        <Text size="xs" c="dimmed">{counterDescription(field)}</Text>
                      </Paper>
                    );
                  }
                  return (
                    <NumberInput
                      key={field}
                      size="xs"
                      label={label}
                      description={counterDescription(field)}
                      value={manualStatistics[field] ?? ''}
                      min={0}
                      step={1}
                      allowDecimal={false}
                      allowNegative={false}
                      thousandSeparator=","
                      onChange={(next) => {
                        setManualStatistic(
                          field,
                          typeof next === 'number' && Number.isSafeInteger(next) ? next : null,
                        );
                      }}
                    />
                  );
                })}
              </Box>
            </Paper>
            <SetupContextBlock
              attribution={kalguuranSetup}
              category="kalguuran"
              hasObservedResult={starfallReported || (!isGlobal && manualStatistics.svalinnDrops !== undefined)}
              isGlobal={isGlobal}
            />
            <Text size="xs" fw={700} mt="sm" mb={4}>Model / normalization</Text>
            <Paper withBorder p="xs">
              <Text size="xs" c="dimmed">
                Observed Crater rate uses the Map Log and Svalinn uses recorded Craters. No Atlas or
                scarab adjustment is applied in this first setup-aware slice.
              </Text>
            </Paper>
            <DataQualityBlock
              attribution={kalguuranSetup}
              category="kalguuran"
              hasObservedResult={starfallReported || (!isGlobal && manualStatistics.svalinnDrops !== undefined)}
              isGlobal={isGlobal}
            />
          </StatisticsSection>

          <Divider />

          <StatisticsSection
            id="wildwood"
            title="Wildwood"
            description="Observed Wildwood encounters as a percentage of maps."
            badge={(
              <Badge size="sm" variant="light" color="green" style={{ flexShrink: 0 }}>
                {wildwoodReported
                  ? formatCollapsedRate(wildwoodCount, wildwoodMapCount, 'Total')
                  : 'Not recorded'}
              </Badge>
            )}
            opened={openSections.wildwood}
            onToggle={toggleSection}
          >
            <Text size="xs" fw={700} mb={4}>Observed</Text>
            {isGlobal ? (
              <Paper withBorder p="xs">
                <Text size="xs" fw={600}>Wildwood encounters</Text>
                <Text size="sm" fw={700}>
                  {globalStatistics.counters.wildwoodEncounters.sessionCount > 0
                    ? globalStatistics.counters.wildwoodEncounters.count.toLocaleString()
                    : 'Not recorded'}
                </Text>
                <Text size="xs" c="dimmed">{counterDescription('wildwoodEncounters')}</Text>
              </Paper>
            ) : (
              <NumberInput
                size="xs"
                label="Wildwood encounters"
                description={counterDescription('wildwoodEncounters')}
                value={manualStatistics.wildwoodEncounters ?? ''}
                min={0}
                step={1}
                allowDecimal={false}
                allowNegative={false}
                thousandSeparator=","
                onChange={(next) => {
                  setManualStatistic(
                    'wildwoodEncounters',
                    typeof next === 'number' && Number.isSafeInteger(next) ? next : null,
                  );
                }}
              />
            )}
            <SetupContextBlock
              attribution={wildwoodSetup}
              category="wildwood"
              hasObservedResult={wildwoodReported}
              isGlobal={isGlobal}
            />
            <Text size="xs" fw={700} mt="sm" mb={4}>Model / normalization</Text>
            <Paper withBorder p="xs">
              <Text size="xs" c="dimmed">
                No spawn-rate adjustment is made. Scarab of Wisps pre-empowers monsters with wisps;
                it is retained as setup context, not treated as proven extra Wildwood chance.
              </Text>
            </Paper>
            <DataQualityBlock
              attribution={wildwoodSetup}
              category="wildwood"
              hasObservedResult={wildwoodReported}
              isGlobal={isGlobal}
            />
          </StatisticsSection>

          <Divider />

          <StatisticsSection
            id="anomalies"
            title="Anomalies"
            description="Each named Atlas anomaly shown as an observed percentage of maps."
            badge={(
              <Badge size="sm" variant="light" color="violet" style={{ flexShrink: 0 }}>
                {formatCollapsedRate(anomalyTotal, anomalyMapCount, 'Total')}
              </Badge>
            )}
            opened={openSections.anomalies}
            onToggle={toggleSection}
          >
            <Text size="xs" fw={700} mb={4}>Observed</Text>
            {!isGlobal && (
              <Box
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(180px, 2fr) minmax(90px, 1fr) auto',
                  gap: 'var(--mantine-spacing-xs)',
                  alignItems: 'end',
                }}
              >
                <Select
                  size="xs"
                  label="Anomaly"
                  placeholder="Search anomalies"
                  searchable
                  clearable
                  data={[...ATLAS_ANOMALIES]}
                  value={anomalyName}
                  onChange={setAnomalyName}
                />
                <NumberInput
                  size="xs"
                  label="Count"
                  value={anomalyAmount}
                  min={1}
                  step={1}
                  allowDecimal={false}
                  allowNegative={false}
                  thousandSeparator=","
                  onChange={setAnomalyAmount}
                />
                <Button
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  disabled={!canAddAnomaly}
                  onClick={addAnomaly}
                >
                  Add
                </Button>
              </Box>
            )}
            {anomalyRows.length > 0 ? (
              <Stack gap={6} mt="xs">
                {anomalyRows.map((row) => (
                  <Paper key={row.name} withBorder p="xs">
                    <Group justify="space-between" wrap="wrap" gap="xs">
                      <Box style={{ flex: 1, minWidth: 160 }}>
                        <Text size="xs" fw={600}>{row.name}</Text>
                        <Text size="xs" c="dimmed">
                          {row.count.toLocaleString()} / {row.mapCount.toLocaleString()} tracked maps
                          {' · '}{formatPercent(observedRatePercent(row.count, row.mapCount))}
                          {isGlobal && ` · ${row.sessionCount.toLocaleString()} ${row.sessionCount === 1 ? 'session' : 'sessions'}`}
                        </Text>
                      </Box>
                      {!isGlobal && (
                        <Group gap={4} wrap="nowrap">
                          <NumberInput
                            size="xs"
                            aria-label={`${row.name} anomaly count`}
                            value={row.count}
                            min={1}
                            step={1}
                            allowDecimal={false}
                            allowNegative={false}
                            thousandSeparator=","
                            style={{ width: 95 }}
                            onChange={(next) => {
                              if (validPositiveInteger(next)) {
                                setManualAtlasAnomalyCount(row.name, next);
                              }
                            }}
                          />
                          <Tooltip label={`Remove ${row.name}`}>
                            <ActionIcon
                              size="md"
                              variant="subtle"
                              color="red"
                              aria-label={`Remove ${row.name}`}
                              onClick={() => setManualAtlasAnomalyCount(row.name, null)}
                            >
                              <IconTrash size={15} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      )}
                    </Group>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Text size="xs" c="dimmed" ta="center" py="md">
                {isGlobal ? 'No Atlas anomalies recorded across sessions.' : 'No Atlas anomalies recorded yet.'}
              </Text>
            )}
            <SetupContextBlock
              attribution={anomalySetup}
              category="anomalies"
              hasObservedResult={anomalyRows.length > 0}
              isGlobal={isGlobal}
            />
            <Text size="xs" fw={700} mt="sm" mb={4}>Model / normalization</Text>
            <Paper withBorder p="xs">
              <Text size="xs" c="dimmed">
                Each anomaly remains a direct observed rate. Map modifiers and Risk-scarab setup are
                not normalized or claimed to cause the result; stable cohorts come later.
              </Text>
            </Paper>
            <DataQualityBlock
              attribution={anomalySetup}
              category="anomalies"
              hasObservedResult={anomalyRows.length > 0}
              isGlobal={isGlobal}
            />
          </StatisticsSection>

          <Divider />

          <StatisticsSection
            id="beasts"
            title="Beasts"
            description="Valuable beast gains observed in loot, with a separately labelled setup estimate."
            badge={(
              <Badge size="sm" variant="light" color="orange">
                {beastTotal.toLocaleString()} captured
              </Badge>
            )}
            opened={openSections.beasts}
            onToggle={toggleSection}
          >
            <Text size="xs" fw={700} mb={4}>Observed</Text>
            {isGlobal && (
              <Paper withBorder p="xs" mb="xs">
                <Text size="xs" fw={600}>Combined observed gains</Text>
                <Text size="xs" c="dimmed">
                  {globalStatistics.beastSessionCount.toLocaleString()} snapshot
                  {globalStatistics.beastSessionCount === 1 ? ' session' : ' sessions'}
                  {' · '}{globalStatistics.beastMapCount.toLocaleString()} maps. Setup estimates stay in
                  Session view because Atlas and scarab configurations can differ between runs.
                </Text>
              </Paper>
            )}

            {beastGains.length > 0 ? (
              <Stack gap={6}>
                {beastGains.map((gain) => (
                  <Paper key={gain.name} withBorder p="xs">
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <Box style={{ minWidth: 0 }}>
                        <Text size="xs" fw={600} truncate>{gain.name}</Text>
                        <Text size="xs" c="dimmed">
                          {isGlobal
                            ? `${gain.gainedQuantity.toLocaleString()} combined positive net gain`
                            : `${gain.baselineQuantity.toLocaleString()} → ${gain.returnQuantity.toLocaleString()}`}
                          {beastMapCount > 0 && ` · ${formatDecimal(gain.gainedQuantity / beastMapCount)} captured/map`}
                        </Text>
                      </Box>
                      <Badge size="sm" variant="light" color="orange">
                        +{gain.gainedQuantity.toLocaleString()}
                      </Badge>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Text size="xs" c="dimmed" ta="center" py="md">
                {hasLootSnapshots
                  ? 'No valuable beast quantity gains found.'
                  : isGlobal
                    ? 'No sessions have both Baseline and Return loot snapshots.'
                    : 'Import both Baseline and Return loot to derive beast gains.'}
              </Text>
            )}
            <Text size="xs" c="dimmed" mt="xs">
              Each run contributes only its positive Baseline-to-Return quantity delta; price changes
              and exclusions do not affect these totals.
            </Text>

            <SetupContextBlock
              attribution={beastSetup}
              category="beasts"
              hasObservedResult={hasLootSnapshots}
              isGlobal={isGlobal}
            />
            <Text size="xs" fw={700} mt="sm" mb={4}>Model / normalization</Text>
            {isGlobal ? (
              <Paper withBorder p="xs">
                <Text size="xs" c="dimmed">
                  No cross-session Bestiary model is calculated because each run can have a different
                  Atlas tree, scarabs, and capture multiplier.
                </Text>
              </Paper>
            ) : beastModel ? (
              <Paper withBorder p="xs">
                <Text size="xs" fw={600}>Bestiary model input</Text>
                <Text size="xs" c="dimmed">
                  {beastModel.herdCount} Herd · {beastModel.duplicatesCapturedBeasts ? 'Duplicating' : 'no Duplicating'}
                  {' · '}Einhar guaranteed by {beastModel.einharGuaranteedBy === 'atlas' ? 'Atlas chance' : 'Bestiary Scarab'}
                  {' · '}{formatDecimal(beastModel.expectedBaseRedRollsPerMap)} expected base red rolls/map
                  {' · '}×{formatDecimal(beastModel.capturedQuantityMultiplier)} capture quantity
                </Text>
                <Text size="xs" c="dimmed">
                  Estimated chance assumes independent red-beast rolls, retained captures, and enough
                  Menagerie capacity. Atlas rarity/classification bias remains un-reversed because exact
                  archetype weights are not published. This is model {beastSetupContext?.modelRevision},
                  not a directly observed per-map outcome.
                </Text>
                {beastGains.length > 0 && (
                  <Stack gap={4} mt="xs">
                    {beastGains.map((gain) => {
                      const estimate = estimateBestiaryEncounter(
                        gain.gainedQuantity,
                        mapCount,
                        beastModel,
                      );
                      return estimate ? (
                        <Text key={gain.name} size="xs" c="dimmed">
                          {gain.name}: {estimate.estimatedChancePerMapPct.toFixed(1)}% estimated chance/map
                          {' · '}{formatDecimal(estimate.estimatedBaseSightingsPerMap)} base sightings/map
                          {' · '}{formatDecimal(estimate.estimatedBaseSightings)} total
                          {estimate.saturated && ' · model saturated'}
                        </Text>
                      ) : null;
                    })}
                  </Stack>
                )}
              </Paper>
            ) : !manualStatistics.beastInfoDismissed ? (
              <Alert
                color="yellow"
                variant="light"
                withCloseButton
                closeButtonLabel="Dismiss Bestiary model information for this session"
                onClose={() => setBeastStatisticsInfoDismissed(true)}
              >
                <Text size="xs">
                  A setup estimate requires one fully attributed setup with Path of Pathing stats and
                  guaranteed Einhar (+100% Atlas chance or a Bestiary Scarab). Raw gains remain visible;
                  mixed, legacy, or unavailable setup evidence is never replaced by current settings.
                </Text>
              </Alert>
            ) : null}
            <DataQualityBlock
              attribution={beastSetup}
              category="beasts"
              hasObservedResult={hasLootSnapshots}
              isGlobal={isGlobal}
            />
          </StatisticsSection>

          <Divider />

          <StatisticsSection
            id="mercenaries"
            title="Mercenaries"
            description="Track only the archetypes you care about; the remainder is shown as Other."
            badge={(
              <Badge size="sm" variant="light" color="blue" style={{ flexShrink: 0 }}>
                {formatCollapsedRate(mercenaryTotal, mercenaryMapCount, 'Tracked')}
              </Badge>
            )}
            opened={openSections.mercenaries}
            onToggle={toggleSection}
          >
            <Text size="xs" fw={700} mb={4}>Observed</Text>
            {isGlobal && (
              <Paper withBorder p="xs" mb="xs">
                <Text size="xs" fw={600}>Combined tracked archetypes</Text>
                <Text size="xs" c="dimmed">
                  {globalStatistics.mercenarySessionCount.toLocaleString()} reporting
                  {globalStatistics.mercenarySessionCount === 1 ? ' session' : ' sessions'}
                  {' · '}{globalStatistics.mercenaryMapCount.toLocaleString()} tracked maps. Per-run Atlas
                  and scarab context stays in Session view.
                </Text>
              </Paper>
            )}

            {!isGlobal && (
              <Box
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(180px, 2fr) minmax(90px, 1fr) auto',
                  gap: 'var(--mantine-spacing-xs)',
                  alignItems: 'end',
                }}
              >
                <Select
                  size="xs"
                  label="Archetype"
                  placeholder="Search Mercenaries"
                  searchable
                  clearable
                  data={[...MERCENARY_ARCHETYPES]}
                  value={mercenaryArchetype}
                  onChange={setMercenaryArchetype}
                />
                <NumberInput
                  size="xs"
                  label="Count"
                  value={mercenaryAmount}
                  min={1}
                  step={1}
                  allowDecimal={false}
                  allowNegative={false}
                  thousandSeparator=","
                  onChange={setMercenaryAmount}
                />
                <Button
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  disabled={!canAddMercenary}
                  onClick={addMercenary}
                >
                  Add
                </Button>
              </Box>
            )}
            {mercenaryRows.length > 0 ? (
              <Stack gap={6}>
                {mercenaryRows.map((row) => {
                  const profile = mercenaryProfile(row.archetype);
                  const profileText = profile
                    ? `${profile.attributes.join(' / ')} · House ${profile.house}${profile.house === 'Bardiya' ? ' · no Atlas boost' : ''}`
                    : 'Target profile unavailable';
                  return (
                    <Paper key={row.archetype} withBorder p="xs">
                      <Group justify="space-between" wrap="wrap" gap="xs">
                        <Box style={{ flex: 1, minWidth: 220 }}>
                          <Text size="xs" fw={600}>{row.archetype}</Text>
                          <Text size="xs" c="dimmed">
                            {row.count.toLocaleString()} / {row.mapCount.toLocaleString()} tracked maps
                            {' · '}{formatPercent(observedRatePercent(row.count, row.mapCount))}
                            {' · '}{formatPercent(observedRatePercent(row.count, mercenaryTotal))} of tracked
                            {isGlobal && ` · ${row.sessionCount.toLocaleString()} ${row.sessionCount === 1 ? 'session' : 'sessions'}`}
                          </Text>
                          <Text size="xs" c="dimmed">{profileText}</Text>
                        </Box>
                        {!isGlobal && (
                          <Group gap={4} wrap="nowrap">
                            <NumberInput
                              size="xs"
                              aria-label={`${row.archetype} encounter count`}
                              value={row.count}
                              min={1}
                              step={1}
                              allowDecimal={false}
                              allowNegative={false}
                              thousandSeparator=","
                              style={{ width: 95 }}
                              onChange={(next) => {
                                if (validPositiveInteger(next)) {
                                  setManualMercenaryCount(row.archetype, next);
                                }
                              }}
                            />
                            <Tooltip label={`Remove ${row.archetype}`}>
                              <ActionIcon
                                size="md"
                                variant="subtle"
                                color="red"
                                aria-label={`Remove ${row.archetype}`}
                                onClick={() => setManualMercenaryCount(row.archetype, null)}
                              >
                                <IconTrash size={15} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        )}
                      </Group>
                    </Paper>
                  );
                })}

                {mercenaryMapCount > 0 && (
                  <Paper withBorder p="xs">
                    <Text size="xs" fw={600}>Other / untracked remainder</Text>
                    <Text size="xs" c="dimmed">
                      {untrackedMercenaryMaps.toLocaleString()} / {mercenaryMapCount.toLocaleString()} tracked maps
                      {' · '}{formatPercent(observedRatePercent(untrackedMercenaryMaps, mercenaryMapCount))}
                    </Text>
                    {((!isGlobal && mercenaryScarabSetup.infamy) || mercenaryTotal > mercenaryMapCount) && (
                      <Text size="xs" c="dimmed">
                        Approximation only: extra or overlapping Mercenaries mean aggregate counts cannot prove
                        exactly how many maps contained none of the tracked archetypes.
                      </Text>
                    )}
                  </Paper>
                )}
              </Stack>
            ) : (
              <Text size="xs" c="dimmed" ta="center" py="md">
                {isGlobal
                  ? 'No Mercenary archetypes recorded across sessions.'
                  : 'No tracked Mercenary archetypes yet. Maps without a tracked row remain Other.'}
              </Text>
            )}
            <SetupContextBlock
              attribution={mercenarySetup}
              category="mercenaries"
              hasObservedResult={mercenaryRows.length > 0}
              isGlobal={isGlobal}
            />
            <Text size="xs" fw={700} mt="sm" mb={4}>Model / normalization</Text>
            {isGlobal ? (
              <Paper withBorder p="xs">
                <Text size="xs" c="dimmed">
                  Combined archetype rates are not normalized across different attribute suppression,
                  House bias, encounter chance, or Trarthan scarab setups.
                </Text>
              </Paper>
            ) : mercenarySetupContext && mercenaryAtlasSetup ? (
              <Paper withBorder p="xs">
                <Text size="xs" fw={600}>Recorded Mercenary setup</Text>
                <Text size="xs" c="dimmed">
                  {mercenaryScarabSetup.infamy
                    ? `Trarthan Scarab of Infamy guarantees Infamous encounters and adds ${mercenaryScarabSetup.additionalWildMercenaries} Wild Mercenaries.`
                    : `Atlas Infamous modifier: +${mercenaryAtlasSetup.increasedInfamousChancePct}% increased (relative; base rate unknown).`}
                </Text>
                {mercenaryScarabSetup.infamy
                  && mercenaryAtlasSetup.increasedInfamousChancePct > 0 && (
                  <Text size="xs" c="dimmed">
                    The Atlas&apos;s +{mercenaryAtlasSetup.increasedInfamousChancePct}% relative modifier is
                    superseded by the recorded scarab guarantee.
                  </Text>
                )}
                <Text size="xs" c="dimmed">
                  {mercenaryScarabSetup.forcesEncounter
                    ? 'Trarthan Scarab guarantees a Mercenary encounter.'
                    : mercenaryAtlasSetup.additionalEncounterChancePct > 0
                      ? `Atlas grants +${mercenaryAtlasSetup.additionalEncounterChancePct}% encounter chance${mercenaryAtlasSetup.additionalEncounterChancePct >= 100 ? ' (guaranteed after the cap).' : ' (flat addition; base chance is not assumed).'}`
                      : 'No recorded encounter guarantee or additional Atlas encounter chance.'}
                </Text>
                {mercenaryRows.length > 0 && (
                  <Stack gap={4} mt="xs">
                    {mercenaryRows.map((row) => {
                      const targeting = deriveMercenaryTargetingImpact(
                        row.archetype,
                        mercenaryAtlasSetup,
                      );
                      return targeting ? (
                        <Box key={row.archetype}>
                          <Text size="xs" c="dimmed">{row.archetype}: {targeting.profile}</Text>
                          {targeting.penalties.length > 0 && (
                            <Text size="xs" c="red">
                              Recorded tree penalty: {targeting.penalties.join(', ')}
                            </Text>
                          )}
                        </Box>
                      ) : null;
                    })}
                  </Stack>
                )}
              </Paper>
            ) : (
              <Paper withBorder p="xs">
                <Text size="xs" c="dimmed">
                  Descriptive targeting requires one fully attributed setup with Path of Pathing stats.
                  Mixed, legacy, and unavailable setup evidence is not replaced by current settings.
                </Text>
              </Paper>
            )}
            <DataQualityBlock
              attribution={mercenarySetup}
              category="mercenaries"
              hasObservedResult={mercenaryRows.length > 0}
              isGlobal={isGlobal}
            />
          </StatisticsSection>
        </Stack>
      </ScrollArea>
    </Card>
  );
};
