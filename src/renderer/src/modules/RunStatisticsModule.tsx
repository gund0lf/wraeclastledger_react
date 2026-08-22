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

const formatDecimal = (value: number): string => value.toLocaleString(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

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
    settings,
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
    'settings',
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
  const beastModel = useMemo(() => (
    settings.bestiaryAtlasSetup
      ? buildBestiaryRateModel(settings.bestiaryAtlasSetup, settings.scarabs)
      : null
  ), [settings.bestiaryAtlasSetup, settings.scarabs]);
  const mercenaryScarabSetup = useMemo(
    () => deriveMercenaryScarabSetup(settings.scarabs),
    [settings.scarabs],
  );
  const hasLootSnapshots = isGlobal
    ? globalStatistics.beastSessionCount > 0
    : baselineItems.length > 0 && lootItems.length > 0;
  const hasStatistics = hasManualStatistics(manualStatistics);
  const canAddAnomaly = anomalyName !== null && validPositiveInteger(anomalyAmount);
  const canAddMercenary = mercenaryArchetype !== null && validPositiveInteger(mercenaryAmount);

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
            opened={openSections.kalguuran}
            onToggle={toggleSection}
          >
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
          </StatisticsSection>

          <Divider />

          <StatisticsSection
            id="wildwood"
            title="Wildwood"
            description="Observed Wildwood encounters as a percentage of maps."
            opened={openSections.wildwood}
            onToggle={toggleSection}
          >
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
          </StatisticsSection>

          <Divider />

          <StatisticsSection
            id="anomalies"
            title="Anomalies"
            description="Each named Atlas anomaly shown as an observed percentage of maps."
            badge={(
              <Badge size="sm" variant="light" color="violet">
                {anomalyTotal.toLocaleString()} total
              </Badge>
            )}
            opened={openSections.anomalies}
            onToggle={toggleSection}
          >
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
            {isGlobal ? (
              <Paper withBorder p="xs" mb="xs">
                <Text size="xs" fw={600}>Combined observed gains</Text>
                <Text size="xs" c="dimmed">
                  {globalStatistics.beastSessionCount.toLocaleString()} snapshot
                  {globalStatistics.beastSessionCount === 1 ? ' session' : ' sessions'}
                  {' · '}{globalStatistics.beastMapCount.toLocaleString()} maps. Setup estimates stay in
                  Session view because Atlas and scarab configurations can differ between runs.
                </Text>
              </Paper>
            ) : beastModel ? (
              <Paper withBorder p="xs" mb="xs">
                <Text size="xs" fw={600}>Bestiary model input</Text>
                <Text size="xs" c="dimmed">
                  {beastModel.herdCount} Herd · {beastModel.duplicatesCapturedBeasts ? 'Duplicating' : 'no Duplicating'}
                  {' · '}Einhar guaranteed by {beastModel.einharGuaranteedBy === 'atlas' ? 'Atlas chance' : 'Bestiary Scarab'}
                  {' · '}{formatDecimal(beastModel.expectedBaseRedRollsPerMap)} expected base red rolls/map
                  {' · '}×{formatDecimal(beastModel.capturedQuantityMultiplier)} capture quantity
                </Text>
                <Text size="xs" c="dimmed">
                  Atlas classification and rarity biases remain part of this observed setup. They are not
                  reversed because their exact archetype weights are not published.
                </Text>
              </Paper>
            ) : !manualStatistics.beastInfoDismissed ? (
              <Alert
                color="yellow"
                variant="light"
                mb="xs"
                withCloseButton
                closeButtonLabel="Dismiss Bestiary model information for this session"
                onClose={() => setBeastStatisticsInfoDismissed(true)}
              >
                <Text size="xs">
                  A setup estimate needs current Atlas stats and guaranteed Einhar (+100% Atlas chance or a
                  Bestiary Scarab). Raw captured quantities remain available; no base encounter chance is assumed.
                </Text>
              </Alert>
            ) : null}

            {beastGains.length > 0 ? (
              <Stack gap={6}>
                {beastGains.map((gain) => {
                  const estimate = !isGlobal && beastModel
                    ? estimateBestiaryEncounter(gain.gainedQuantity, mapCount, beastModel)
                    : null;
                  return (
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
                          {estimate && (
                            <Text size="xs" c="dimmed">
                              Estimated chance per map: {estimate.estimatedChancePerMapPct.toFixed(1)}%
                              {' · '}{formatDecimal(estimate.estimatedBaseSightingsPerMap)} base sightings/map
                              {' · '}{formatDecimal(estimate.estimatedBaseSightings)} total
                              {estimate.saturated && ' · model saturated'}
                            </Text>
                          )}
                        </Box>
                        <Badge size="sm" variant="light" color="orange">
                          +{gain.gainedQuantity.toLocaleString()}
                        </Badge>
                      </Group>
                    </Paper>
                  );
                })}
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
              {isGlobal
                ? 'Each run contributes only its positive Baseline-to-Return quantity delta; price changes and exclusions do not affect these totals.'
                : 'Estimated chance assumes independent red-beast rolls and that captured beasts stayed in the Return snapshot. It is a model, not a directly observed per-map outcome.'}
            </Text>
          </StatisticsSection>

          <Divider />

          <StatisticsSection
            id="mercenaries"
            title="Mercenaries"
            description="Track only the archetypes you care about; the remainder is shown as Other."
            badge={(
              <Badge size="sm" variant="light" color="blue">
                {mercenaryTotal.toLocaleString()} tracked
              </Badge>
            )}
            opened={openSections.mercenaries}
            onToggle={toggleSection}
          >

            {isGlobal ? (
              <Paper withBorder p="xs" mb="xs">
                <Text size="xs" fw={600}>Combined tracked archetypes</Text>
                <Text size="xs" c="dimmed">
                  {globalStatistics.mercenarySessionCount.toLocaleString()} reporting
                  {globalStatistics.mercenarySessionCount === 1 ? ' session' : ' sessions'}
                  {' · '}{globalStatistics.mercenaryMapCount.toLocaleString()} tracked maps. Per-run Atlas
                  and scarab context stays in Session view.
                </Text>
              </Paper>
            ) : (
              <Paper withBorder p="xs" mb="xs">
              <Text size="xs" fw={600}>Mercenary setup context</Text>
              <Text size="xs" c="dimmed">
                {mercenaryScarabSetup.infamy
                  ? `Trarthan Scarab of Infamy: encountered Mercenaries are Infamous and accompanied by ${mercenaryScarabSetup.additionalWildMercenaries} Wild Mercenaries.`
                  : settings.mercenaryAtlasSetup
                    ? `Atlas: +${settings.mercenaryAtlasSetup.increasedInfamousChancePct}% increased Infamous chance (relative; base rate unknown).`
                    : 'Read Atlas Tree stats to show attribute, House, and Infamous targeting context.'}
              </Text>
              {mercenaryScarabSetup.infamy
                && settings.mercenaryAtlasSetup
                && settings.mercenaryAtlasSetup.increasedInfamousChancePct > 0 && (
                <Text size="xs" c="dimmed">
                  The Atlas also has +{settings.mercenaryAtlasSetup.increasedInfamousChancePct}% increased
                  Infamous chance, but that relative modifier is superseded by the scarab&apos;s guarantee.
                </Text>
              )}
              {mercenaryScarabSetup.forcesEncounter ? (
                <Text size="xs" c="dimmed">
                  Trarthan Scarab guarantees a Mercenary encounter.
                </Text>
              ) : settings.mercenaryAtlasSetup && settings.mercenaryAtlasSetup.additionalEncounterChancePct > 0 && (
                <Text size="xs" c="dimmed">
                  Atlas grants +{settings.mercenaryAtlasSetup.additionalEncounterChancePct}% encounter chance
                  {settings.mercenaryAtlasSetup.additionalEncounterChancePct >= 100
                    ? ' (guaranteed after the cap).'
                    : ' (flat addition; base chance is not assumed here).'}
                </Text>
              )}
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
                const targeting = !isGlobal && settings.mercenaryAtlasSetup
                  ? deriveMercenaryTargetingImpact(row.archetype, settings.mercenaryAtlasSetup)
                  : null;
                const profileText = targeting?.profile
                  ?? (profile
                    ? `${profile.attributes.join(' / ')} · House ${profile.house}${profile.house === 'Bardiya' ? ' · no Atlas boost' : ''}`
                    : 'Target profile unavailable');
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
                        {targeting && targeting.penalties.length > 0 && (
                          <Text size="xs" c="red">Tree penalty: {targeting.penalties.join(', ')}</Text>
                        )}
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
          </StatisticsSection>
        </Stack>
      </ScrollArea>
    </Card>
  );
};
