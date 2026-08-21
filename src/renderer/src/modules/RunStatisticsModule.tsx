import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { ModuleHeader } from '../components/ui/ModuleHeader';
import { useSessionKeys } from '../store/useSessionStore';
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

export const RunStatisticsModule = () => {
  const {
    maps,
    settings,
    baselineItems,
    lootItems,
    manualStatistics,
    setManualStatistic,
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
    'setManualStatistic',
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
  const [clearOpen, { open: openClear, close: closeClear }] = useDisclosure(false);

  const mapCount = maps.length;
  const anomalyRows = useMemo(() => [...(manualStatistics.atlasAnomalies ?? [])].sort(
    (left, right) => left.name.localeCompare(right.name),
  ), [manualStatistics.atlasAnomalies]);
  const anomalyTotal = totalAtlasAnomalies(manualStatistics);
  const mercenaryRows = useMemo(() => [...(manualStatistics.mercenaries ?? [])].sort(
    (left, right) => left.archetype.localeCompare(right.archetype),
  ), [manualStatistics.mercenaries]);
  const mercenaryTotal = totalMercenaryEncounters(manualStatistics);
  const untrackedMercenaryMaps = remainingUntrackedMaps(mercenaryTotal, mapCount);
  const beastGains = useMemo(
    () => deriveValuableBeastGains(baselineItems, lootItems),
    [baselineItems, lootItems],
  );
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
  const hasLootSnapshots = baselineItems.length > 0 && lootItems.length > 0;
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
          <Tooltip label={hasStatistics ? 'Clear manual statistics' : 'Nothing recorded manually'}>
            <Button
              size="compact-xs"
              variant="subtle"
              color="red"
              disabled={!hasStatistics}
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
          <Alert color="blue" variant="light">
            <Text size="xs">
              Optional and local. Encounter counts are entered manually; valuable beast gains come
              from your Baseline and Return loot snapshots. Map-based percentages use the current
              session&apos;s Map Log ({mapCount.toLocaleString()} maps); Svalinn uses recorded Craters.
              Nothing here is included in Discord shares.
            </Text>
          </Alert>

          <Box>
            <Text size="sm" fw={700} mb="xs">Random Atlas encounters</Text>
            <Box
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                gap: 'var(--mantine-spacing-sm)',
              }}
            >
              {COUNTER_FIELDS.map(({ field, label }) => {
                const value = manualStatistics[field];
                return (
                  <NumberInput
                    key={field}
                    size="xs"
                    label={label}
                    description={counterDescription(field)}
                    value={value ?? ''}
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
          </Box>

          <Divider />

          <Box>
            <Group justify="space-between" align="center" mb="xs">
              <Box>
                <Text size="sm" fw={700}>Atlas anomalies</Text>
                <Text size="xs" c="dimmed">Each named anomaly shown as an observed percentage of maps.</Text>
              </Box>
              <Badge size="sm" variant="light" color="violet">
                {anomalyTotal.toLocaleString()} total
              </Badge>
            </Group>
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
            {anomalyRows.length > 0 ? (
              <Stack gap={6} mt="xs">
                {anomalyRows.map((row) => (
                  <Paper key={row.name} withBorder p="xs">
                    <Group justify="space-between" wrap="wrap" gap="xs">
                      <Box style={{ flex: 1, minWidth: 160 }}>
                        <Text size="xs" fw={600}>{row.name}</Text>
                        <Text size="xs" c="dimmed">
                          {row.count.toLocaleString()} / {mapCount.toLocaleString()} maps
                          {' · '}{formatPercent(observedRatePercent(row.count, mapCount))}
                        </Text>
                      </Box>
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
                    </Group>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Text size="xs" c="dimmed" ta="center" py="md">No Atlas anomalies recorded yet.</Text>
            )}
          </Box>

          <Divider />

          <Box>
            <Group justify="space-between" align="center" mb="xs">
              <Box>
                <Text size="sm" fw={700}>Valuable beast gains</Text>
                <Text size="xs" c="dimmed">Observed stash gains with a separately labelled setup estimate.</Text>
              </Box>
              <Badge size="sm" variant="light" color="orange">
                {beastTotal.toLocaleString()} captured
              </Badge>
            </Group>

            {beastModel ? (
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
            ) : (
              <Alert color="yellow" variant="light" mb="xs">
                <Text size="xs">
                  A setup estimate needs current Atlas stats and guaranteed Einhar (+100% Atlas chance or a
                  Bestiary Scarab). Raw captured quantities remain available; no base encounter chance is assumed.
                </Text>
              </Alert>
            )}

            {beastGains.length > 0 ? (
              <Stack gap={6}>
                {beastGains.map((gain) => {
                  const estimate = beastModel
                    ? estimateBestiaryEncounter(gain.gainedQuantity, mapCount, beastModel)
                    : null;
                  return (
                    <Paper key={gain.name} withBorder p="xs">
                      <Group justify="space-between" wrap="nowrap" gap="xs">
                        <Box style={{ minWidth: 0 }}>
                          <Text size="xs" fw={600} truncate>{gain.name}</Text>
                          <Text size="xs" c="dimmed">
                            {gain.baselineQuantity.toLocaleString()} → {gain.returnQuantity.toLocaleString()}
                            {mapCount > 0 && ` · ${formatDecimal(gain.gainedQuantity / mapCount)} captured/map`}
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
                  : 'Import both Baseline and Return loot to derive beast gains.'}
              </Text>
            )}
            <Text size="xs" c="dimmed" mt="xs">
              Estimated chance assumes independent red-beast rolls and that captured beasts stayed in the
              Return snapshot. It is a model, not a directly observed per-map outcome.
            </Text>
          </Box>

          <Divider />

          <Box>
            <Group justify="space-between" align="center" mb="xs">
              <Box>
                <Text size="sm" fw={700}>Mercenary encounters</Text>
                <Text size="xs" c="dimmed">Track only the archetypes you care about; the remainder is shown as Other.</Text>
              </Box>
              <Badge size="sm" variant="light" color="blue">
                {mercenaryTotal.toLocaleString()} tracked
              </Badge>
            </Group>

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
          </Box>

          {mercenaryRows.length > 0 ? (
            <Stack gap={6}>
              {mercenaryRows.map((row) => {
                const profile = mercenaryProfile(row.archetype);
                const targeting = settings.mercenaryAtlasSetup
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
                          {row.count.toLocaleString()} / {mapCount.toLocaleString()} maps
                          {' · '}{formatPercent(observedRatePercent(row.count, mapCount))}
                          {' · '}{formatPercent(observedRatePercent(row.count, mercenaryTotal))} of tracked
                        </Text>
                        <Text size="xs" c="dimmed">{profileText}</Text>
                        {targeting && targeting.penalties.length > 0 && (
                          <Text size="xs" c="red">Tree penalty: {targeting.penalties.join(', ')}</Text>
                        )}
                      </Box>
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
                    </Group>
                  </Paper>
                );
              })}

              {mapCount > 0 && (
                <Paper withBorder p="xs">
                  <Text size="xs" fw={600}>Other / untracked remainder</Text>
                  <Text size="xs" c="dimmed">
                    {untrackedMercenaryMaps.toLocaleString()} / {mapCount.toLocaleString()} maps
                    {' · '}{formatPercent(observedRatePercent(untrackedMercenaryMaps, mapCount))}
                  </Text>
                  {(mercenaryScarabSetup.infamy || mercenaryTotal > mapCount) && (
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
              No tracked Mercenary archetypes yet. Maps without a tracked row remain Other.
            </Text>
          )}
        </Stack>
      </ScrollArea>
    </Card>
  );
};
