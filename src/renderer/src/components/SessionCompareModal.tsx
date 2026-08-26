import { Modal, Stack, Text, Table, Group, Badge, ScrollArea, Checkbox, Divider, Tooltip } from '@mantine/core';
import { useMemo, useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { useSessionStore } from '../store/useSessionStore';
import {
  MAX_COMPARE_SESSIONS,
  buildCompareColumn,
  bestIndices,
  buildCompareSelectionSeed,
  sortReadyCompareSessions,
  type CompareColumn,
} from '../utils/sessionCompare';
import { COLOR, FONT } from '../utils/uiTokens';
import { useRepositorySessions } from '../repository/useRepositorySessions';
import { formatActiveTime } from '../utils/timeEstimate';
import './SessionCompareModal.css';

/**
 * WP11 — side-by-side comparison of up to six saved sessions.
 *
 * Self-sufficient: it reads the saved sessions itself and carries its own
 * session picker, so it works from a plain "Compare" button (no dependency on a
 * selection elsewhere). `initialSelectedIds` seeds the picker from whatever the
 * Sessions panel already had checked, as a convenience.
 *
 * All numbers come from utils/sessionCompare.ts, which derives each column from
 * a SavedSession via the shared profit engine — the SAME functions the
 * Dashboard/ShareModal use, so columns match what each session showed live
 * (including its persisted double-count correction, WP11 / C).
 *
 * Deliberate: div/map is the primary metric and uses EACH session's own stored
 * divine price (no cross-session normalization — see the design notes). Pace
 * remains an optional capture-derived estimate and never replaces div/map.
 */

interface Props {
  opened: boolean;
  onClose: () => void;
  initialSelectedIds?: string[];
}

// ── formatting helpers (match Dashboard precision) ──────────────────────────
const c0  = (n: number) => `${n.toFixed(0)}c`;
const sc0 = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(0)}c`;
const d3  = (n: number) => `${n.toFixed(3)}d`;
const pct = (n: number) => `${n.toFixed(1)}%`;
const x3  = (n: number) => `${n.toFixed(3)}\u00d7`;
const EMDASH = '\u2014';

const cellStyle: CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const NO_WINNERS: ReadonlySet<number> = new Set();

// A metric row: label on the left, one value per column, optional winner tint.
const MetricRow = ({
  cols, label, render, winners = NO_WINNERS, color, strong = false, muted = false,
}: {
  cols: CompareColumn[];
  label: string;
  render: (c: CompareColumn) => ReactNode;
  winners?: ReadonlySet<number>;
  color?: (c: CompareColumn) => string | undefined;
  strong?: boolean;
  muted?: boolean;
}) => (
  <Table.Tr>
    <Table.Td className="session-compare-metric-cell">
      <Text style={{ fontSize: FONT.body, color: muted ? COLOR.textMuted : COLOR.textDim }}>{label}</Text>
    </Table.Td>
    {cols.map((c, i) => (
      <Table.Td
        key={c.id}
        className={`session-compare-value-cell${winners.has(i) ? ' session-compare-winner' : ''}`}
        style={cellStyle}
      >
        <Text
          span
          style={{
            fontSize: FONT.body,
            fontWeight: strong ? 700 : winners.has(i) ? 600 : 400,
            color: color?.(c) ?? (muted ? COLOR.textMuted : COLOR.text),
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {render(c)}
        </Text>
      </Table.Td>
    ))}
  </Table.Tr>
);

// Sub-header row separating metric groups within the table body.
const SectionRow = ({ label, span }: { label: string; span: number }) => (
  <Table.Tr>
    <Table.Td colSpan={span} className="session-compare-section-cell">
      <Text
        style={{
          fontSize: FONT.label,
          color: COLOR.dim,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        {label}
      </Text>
    </Table.Td>
  </Table.Tr>
);

export const SessionCompareModal = ({ opened, onClose, initialSelectedIds }: Props) => {
  const repositorySessions = useSessionStore((s) => s.repositorySessions);

  const allSessions = useMemo(
    () => sortReadyCompareSessions(repositorySessions),
    [repositorySessions]
  );
  const summaryById = useMemo(
    () => new Map(allSessions.map((session) => [session.id, session])),
    [allSessions],
  );

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [seedOmittedCount, setSeedOmittedCount] = useState(0);

  // Seed the picker each time the modal opens, from whatever was pre-selected
  // (dropping ids that no longer exist). The bounded seed reports omissions
  // instead of silently truncating Retrospectives. Intentionally keyed on
  // `opened` only — re-seeding mid-interaction would fight the user.
  useEffect(() => {
    if (!opened) return;
    const seed = buildCompareSelectionSeed(initialSelectedIds ?? [], repositorySessions);
    setPicked(new Set(seed.selectedIds));
    setSeedOmittedCount(seed.omittedCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const toggle = (id: string) => {
    setSeedOmittedCount(0);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_COMPARE_SESSIONS) next.add(id);
      return next;
    });
  };

  const pickedIds = useMemo(() => [...picked], [picked]);
  const { sessions: loadedSessions, loading, error } = useRepositorySessions(pickedIds, opened);
  const cols = useMemo<CompareColumn[]>(
    () => pickedIds.flatMap((id) => loadedSessions[id] ? [buildCompareColumn(loadedSessions[id])] : []),
    [loadedSessions, pickedIds]
  );
  const anyReturn = cols.some((c) => c.hasReturn);
  const anyPace = cols.some((c) => c.pace !== null);
  const anyNeutralization = cols.some((c) => c.neutralization > 0);
  const span = cols.length + 1;

  return (
    <Modal opened={opened} onClose={onClose} title="Compare saved sessions" size={1120}>
      <Stack gap="sm">
        {allSessions.length < 2 ? (
          <Text size="sm" c="dimmed">Save at least two sessions to compare them.</Text>
        ) : (
          <>
            {/* ── Picker ── */}
            <Stack gap={4}>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">Pick 2–{MAX_COMPARE_SESSIONS} sessions to compare</Text>
                <Text size="xs" c={picked.size >= MAX_COMPARE_SESSIONS ? 'orange' : 'dimmed'}>
                  {picked.size}/{MAX_COMPARE_SESSIONS} selected
                </Text>
              </Group>
              {seedOmittedCount > 0 && (
                <Text size="xs" c="dimmed">
                  Selected the {MAX_COMPARE_SESSIONS} most recently active of{' '}
                  {MAX_COMPARE_SESSIONS + seedOmittedCount} sessions.
                  {' '}{seedOmittedCount} older session{seedOmittedCount === 1 ? ' remains' : 's remain'} available above.
                </Text>
              )}
              <ScrollArea.Autosize mah={150}>
                <Stack gap={2}>
                  {allSessions.map((s) => {
                    const checked = picked.has(s.id);
                    return (
                      <Checkbox
                        key={s.id}
                        size="xs"
                        checked={checked}
                        disabled={!checked && picked.size >= MAX_COMPARE_SESSIONS}
                        onChange={() => toggle(s.id)}
                        label={
                          <Text size="xs" lineClamp={1}>
                            {s.name}
                            <Text span c="dimmed">
                              {' '}· {typeof s.summary.mapCount === 'number' ? s.summary.mapCount : 0} maps
                              {' '}· updated {new Date(s.updatedAt).toLocaleDateString()}
                            </Text>
                          </Text>
                        }
                      />
                    );
                  })}
                </Stack>
              </ScrollArea.Autosize>
            </Stack>

            <Divider />

            {error ? (
              <Text size="sm" c="red" ta="center" py="md">{error}</Text>
            ) : loading ? (
              <Text size="sm" c="dimmed" ta="center" py="md">Loading selected sessions...</Text>
            ) : cols.length < 2 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                Select {2 - cols.length} more session{2 - cols.length !== 1 ? 's' : ''} above to see the comparison.
              </Text>
            ) : (
              <>
                <Text size="xs" c="dimmed">
                  Recomputed from each saved session with the shared profit engine.
                  div/map remains primary and uses each session&apos;s own divine price.
                  {anyPace ? ' Pace appears only where capture timestamps form a valid estimate.' : ''}
                </Text>

                <div
                  className="session-compare-results-scroll"
                  role="region"
                  aria-label="Session comparison results"
                  tabIndex={0}
                >
                  <Table
                    className="session-compare-table"
                    withRowBorders={false}
                    verticalSpacing={3}
                    horizontalSpacing="sm"
                  >
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th className="session-compare-metric-cell session-compare-corner-cell" />
                        {cols.map((c) => {
                          const summary = summaryById.get(c.id);
                          const activityAt = summary?.updatedAt ?? c.createdAt;
                          return (
                            <Table.Th key={c.id} className="session-compare-value-cell" style={{ textAlign: 'right' }}>
                              <Text style={{ fontSize: FONT.body, fontWeight: 700, color: COLOR.text }} lineClamp={1} title={c.name}>
                                {c.name}
                              </Text>
                              <Text style={{ fontSize: FONT.small, color: COLOR.textMuted }}>
                                Updated {new Date(activityAt).toLocaleDateString()}
                              </Text>
                            </Table.Th>
                          );
                        })}
                      </Table.Tr>
                    </Table.Thead>

                    <Table.Tbody>
                      <MetricRow cols={cols} label="Maps" render={(c) => c.n} />
                      <MetricRow cols={cols} label="Multiplier" winners={bestIndices(cols, (c) => c.multiplier)} render={(c) => x3(c.multiplier)} />
                      <MetricRow cols={cols} label="Divine price" muted render={(c) => (c.divPrice > 0 ? c0(c.divPrice) : EMDASH)} />
                      {anyPace && (
                        <MetricRow
                          cols={cols}
                          label="Pace (estimate)"
                          render={(c) => (c.pace
                            ? (
                              <Tooltip
                                multiline
                                w={260}
                                label={`${formatActiveTime(c.pace.activeMs)} active · ${c.pace.countedGaps} gaps counted · ${c.pace.excludedGaps} break-like gaps excluded`}
                              >
                                <Text span inherit style={{ cursor: 'help' }}>
                                  {c.pace.mapsPerHour.toFixed(1)} maps/h
                                </Text>
                              </Tooltip>
                            )
                            : EMDASH)}
                        />
                      )}

                      <SectionRow label="Avg map mods" span={span} />
                      <MetricRow cols={cols} label="Quantity" winners={bestIndices(cols, (c) => c.avgQuant)} render={(c) => pct(c.avgQuant)} />
                      <MetricRow cols={cols} label="Rarity" winners={bestIndices(cols, (c) => c.avgRarity)} render={(c) => pct(c.avgRarity)} />
                      <MetricRow cols={cols} label="Pack Size" winners={bestIndices(cols, (c) => c.avgPack)} render={(c) => pct(c.avgPack)} />
                      <MetricRow cols={cols} label="Currency" winners={bestIndices(cols, (c) => c.avgCurr)} render={(c) => pct(c.avgCurr)} />

                      <SectionRow label="Economy" span={span} />
                      <MetricRow cols={cols} label="Cost / map" render={(c) => c0(c.costPerMap)} />
                      <MetricRow cols={cols} label="Total invest" render={(c) => c0(c.totalInvest)} />
                      {anyReturn && (
                        <MetricRow
                          cols={cols}
                          label="Loot gain"
                          winners={bestIndices(cols, (c) => (c.hasReturn ? c.lootGain : null))}
                          color={(c) => (!c.hasReturn ? COLOR.textMuted : c.lootGain >= 0 ? COLOR.profit : COLOR.loss)}
                          render={(c) => (c.hasReturn ? sc0(c.lootGain) : EMDASH)}
                        />
                      )}
                      {anyNeutralization && (
                        <MetricRow
                          cols={cols}
                          label="incl. double-count fix"
                          color={(c) => (c.neutralization > 0 ? COLOR.profit : COLOR.textMuted)}
                          render={(c) => (c.neutralization > 0 ? `+${c.neutralization.toFixed(0)}c` : EMDASH)}
                        />
                      )}
                      <MetricRow
                        cols={cols}
                        label="Net profit"
                        strong
                        winners={bestIndices(cols, (c) => c.net)}
                        color={(c) => (c.net >= 0 ? COLOR.profit : COLOR.loss)}
                        render={(c) => sc0(c.net)}
                      />
                      <MetricRow
                        cols={cols}
                        label="Net / map"
                        winners={bestIndices(cols, (c) => c.cPerMap)}
                        color={(c) => (c.cPerMap >= 0 ? COLOR.profit : COLOR.loss)}
                        render={(c) => sc0(c.cPerMap)}
                      />
                      <MetricRow
                        cols={cols}
                        label="div / map"
                        strong
                        winners={bestIndices(cols, (c) => c.divPerMap)}
                        color={(c) => (c.divPerMap >= 0 ? COLOR.accent : COLOR.loss)}
                        render={(c) => d3(c.divPerMap)}
                      />
                    </Table.Tbody>
                  </Table>
                </div>

                <Group gap={6} justify="flex-end">
                  {!anyReturn && (
                    <Text style={{ fontSize: FONT.small, color: COLOR.textMuted }}>
                      No return CSV in these sessions — Net reflects costs only.
                    </Text>
                  )}
                  <Badge variant="light" color="blue" size="xs">
                    highlighted = best of {cols.length}
                  </Badge>
                </Group>
              </>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
};
