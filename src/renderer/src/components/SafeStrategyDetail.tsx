import { Alert, Badge, Button, Card, Group, Stack, Table, Text } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { safeIdentityKey, type SafeDetail, type SafeRun } from '../../../shared/safeStrategy'
import { safeStrategyReader } from '../utils/safeStrategyReader'
import { confirmedStrategyAuthor } from '../utils/safeStrategyTarget'
import { useSessionStore } from '../store/useSessionStore'
import { RegexLine } from './ui/RegexLine'
import { PoeItemIcon } from './ui/PoeItemIcon'
import { safeNumber, safePooledCostComponents, safeCostEvidenceMessage, safeAuthorLabel, safeAuthorStatus, safeSetupUnavailableMessage, safeContinuationMessage } from '../utils/safeStrategyPresentation'
import { FONT } from '../utils/uiTokens'
import { lootCategoryLabel } from '../utils/lootCategories'

function Metrics({ values }: { values: Array<[string, number | null | undefined, string?]> }) {
  return <Group gap="xs" grow>{values.map(([label, value, unit]) => <Card key={label} withBorder p="xs" style={{ minWidth: 105 }}>
    <Text size="xs" c="dimmed">{label}</Text><Text size="sm" fw={600} c={value != null && value < 0 ? 'red' : undefined}>{safeNumber(value, unit)}</Text>
  </Card>)}</Group>
}
function Costs({ value, maps, source }: { value: SafeRun['cost_breakdown']; maps: number | null; source: string }) {
  if (!value) return <Text size="xs" c="dimmed">No recorded itemized costs.</Text>
  const rows = [...(value.chisel ? [{ name: value.chisel.name, label: 'Chisel / map', price: value.chisel.price_each_chaos }] : []),
    ...value.scarabs.map(s => ({ name: s.name, label: 'Scarab', price: s.price_each_chaos })),
    ...(value.delirium ? [{ name: value.delirium.type, label: `${value.delirium.count_per_map} orb(s) / map · price each`, price: value.delirium.price_each_chaos }] : []),
    ...(value.astrolabe ? [{ name: value.astrolabe.type, label: `${value.astrolabe.count} used in ${safeNumber(maps)} maps · price each`, price: value.astrolabe.price_each_chaos }] : [])]
  return <Stack gap={3}><Text size="xs" c="dimmed">{source}</Text>{rows.map((r, i) => <Group key={i} justify="space-between">
    <Group gap={5}><PoeItemIcon name={r.name} size={18} /><Text size="xs">{r.name}</Text></Group>
    <Text size="xs">{r.label} · {safeNumber(r.price, 'c')}</Text>
  </Group>)}</Stack>
}
function Loot({ loot }: { loot: SafeDetail['loot'] }) {
  if (!loot) return <Text size="xs" c="dimmed">Loot evidence is unrecorded.</Text>
  return <Stack gap="xs"><Group gap="xs">{loot.categories.map(c => <Card key={c.category} withBorder p="xs"><Text size="xs">{lootCategoryLabel(c.category)}</Text><Text size="sm">{safeNumber(c.value_chaos, 'c')}</Text></Card>)}</Group>
    <Text size="xs" c="dimmed">{loot.has_baseline ? 'Baseline recorded' : 'No recorded baseline'} · Manual additions {safeNumber(loot.manual_total_chaos, 'c')} · Inventory flow {safeNumber(loot.inventory_flow_chaos, 'c')} · Market revaluation {safeNumber(loot.market_revaluation_chaos, 'c')}</Text>
    <details><summary style={{ fontSize: FONT.body, cursor: 'pointer' }}>Show item breakdown ({loot.rows.length} rows)</summary>
      <Table><Table.Thead><Table.Tr><Table.Th>Item</Table.Th><Table.Th>Quantity</Table.Th><Table.Th>Value</Table.Th></Table.Tr></Table.Thead><Table.Tbody>
        {loot.rows.map((r, i) => <Table.Tr key={i}><Table.Td><Group gap={5}><PoeItemIcon name={r.name} size={18} /><Text size="xs">{r.name} · {lootCategoryLabel(r.category)} · {r.source === 'manual' ? 'Manual addition' : r.source === 'wealthyexile' ? 'CSV' : 'Recorded source'}</Text></Group>
          {r.note && <Text size="xs" c="dimmed">{r.note}</Text>}
          {r.identity && <Text size="xs" c="dimmed">{Object.entries(r.identity).filter(([k]) => k !== 'kind').map(([k, v]) => `${k.replaceAll('_', ' ')}: ${v ?? 'unrecorded'}`).join(' · ')}</Text>}
          {r.valuation && <Text size="xs" c="dimmed">Quantity {safeNumber(r.valuation.baseline_quantity)} → {safeNumber(r.valuation.current_quantity)} · Value {safeNumber(r.valuation.baseline_value_chaos, 'c')} → {safeNumber(r.valuation.current_value_chaos, 'c')}</Text>}
        </Table.Td><Table.Td>{safeNumber(r.quantity)}</Table.Td><Table.Td>{safeNumber(r.value_chaos, 'c')}</Table.Td></Table.Tr>)}
      </Table.Tbody></Table>
    </details><Text size="xs" c="dimmed">Omitted CSV rows: {safeNumber(loot.omitted_csv_rows)} ({safeNumber(loot.omitted_csv_value_chaos, 'c')}); manual rows: {safeNumber(loot.omitted_manual_rows)} ({safeNumber(loot.omitted_manual_value_chaos, 'c')}).</Text>
  </Stack>
}

export function SafeStrategyDetail({ detail: d, onLoad, onContinue, onName }: {
  detail: SafeDetail; onLoad: () => void; onContinue: () => void; onName: () => void
}) {
  const prefs = useSessionStore(s => s.authorPreferences)
  const [runs, setRuns] = useState<SafeRun[] | null>(null), [error, setError] = useState<string | null>(null), [retry, setRetry] = useState(0)
  const [unit, setUnit] = useState<'c' | 'd'>('c')
  const key = safeIdentityKey(d)
  useEffect(() => {
    let stop = false; setRuns(null); setError(null)
    if (d.scope === 'current' && (d.coverage.run_count ?? 0) > 0) void safeStrategyReader.evidence(d).then(r => {
      if (!stop) setRuns(r)
    }).catch(e => { if (!stop) setError(e.message) })
    return () => { stop = true }
  }, [d, key, retry])
  const pooledCosts = useMemo(() => runs && safePooledCostComponents(runs), [runs])
  const authored = d.authored_history, reusable = d.reusable_setup.status === 'available' ? d.reusable_setup.value : null
  const own = confirmedStrategyAuthor(d, prefs), continuing = !!own && d.scope === 'current' && d.continuation_setup.status === 'available'
  const quote = authored?.economics.divine_price_chaos
  const economics: Array<[string, number | null | undefined, string?]> = unit === 'c'
    ? [['Net profit', d.economics.net_profit_chaos, 'c'], ['Total investment', d.economics.total_invest_chaos, 'c'], ['Cost / map', d.economics.all_in_cost_per_map_chaos, 'c']]
    : [['Historical net', d.economics.historical_net_divines ?? ((d.coverage.run_count ?? 0) <= 1 && quote && d.economics.net_profit_chaos !== null ? d.economics.net_profit_chaos / quote : null), 'd'],
      ['Historical investment', d.economics.historical_invest_divines ?? ((d.coverage.run_count ?? 0) <= 1 && quote && d.economics.total_invest_chaos !== null ? d.economics.total_invest_chaos / quote : null), 'd']]
  return <Card withBorder p="sm"><Stack gap="sm">
    <Group justify="space-between"><Text fw={700} style={{ overflowWrap: 'anywhere' }}>{d.title || 'Untitled strategy'}</Text><Badge color="gray">{d.scope === 'current' ? 'Live' : 'Frozen'} · Revision {d.revision}</Badge></Group>
    <Text size="xs" style={{ overflowWrap: 'anywhere' }} c={own ? 'teal' : 'dimmed'}>{safeAuthorLabel(d.attribution)}{safeAuthorStatus(d.attribution) && ` · ${safeAuthorStatus(d.attribution)}`} · {d.league ?? 'League unrecorded'}</Text>
    <Text size="xs" c="dimmed">Published {d.published_at ? new Date(d.published_at).toLocaleString() : 'unrecorded'} · Updated {d.updated_at ? new Date(d.updated_at).toLocaleString() : 'unrecorded'}</Text>
    <Group gap={4}>{d.tags.map(t => <Badge key={t} size="xs" color="gray">{t}</Badge>)}</Group>
    <Group justify="space-between"><Text size="sm" fw={600}>Recorded results</Text><Button size="compact-xs" variant="default" onClick={() => setUnit(unit === 'c' ? 'd' : 'c')}>{unit === 'c' ? 'Show Divines' : 'Show Chaos'}</Button></Group>
    <Metrics values={[...economics, ['Maps', d.observed.map_count], ['Observed Mod', d.observed.mod_average], ['Profit / map', d.economics.net_per_map_divines, 'd'], ['Div / hour', d.coverage.net_divines_per_hour, 'd']]} />
    <Text size="xs" c="dimmed">{safeNumber(d.coverage.run_count)} runs · Timed sample {safeNumber(d.coverage.timed_run_count)} runs / {safeNumber(d.coverage.timed_map_count)} maps · {safeNumber(d.coverage.timed_minutes)} minutes. Prices remain historical.</Text>
    <Loot loot={d.loot} />
    <Text size="sm" fw={600}>Published setup</Text>
    <Text size="xs">{d.setup.map_type ?? 'Map setup unrecorded'} · Party {d.setup.party_size ?? 'unrecorded'} · Author multiplier {safeNumber(authored?.observed.multiplier, '×')} · Game data {d.setup.game_data.revision ?? 'unrecorded'} / {d.setup.game_data.patch_version ?? 'unrecorded'}</Text>
    <Group gap={6}>{d.setup.scarabs.map(({ name }, i) => <Group key={i} gap={4}><PoeItemIcon name={name} size={18} /><Text size="xs">{name}</Text></Group>)}</Group>
    <Text size="xs">Chisel: {d.setup.chisel ?? 'Unrecorded'} · Delirium: {d.setup.delirium ? `${d.setup.delirium.type ?? 'Unrecorded'} (${safeNumber(d.setup.delirium.count_per_map)} / map)` : 'Unrecorded'} · Astrolabe: {d.setup.astrolabe ?? 'Unrecorded'}</Text>
    <Text size="xs">Multiplying Modifiers: {d.setup.multiplying_modifiers?.allocated == null ? 'Unrecorded' : d.setup.multiplying_modifiers.allocated ? `allocated · ${safeNumber(d.setup.multiplying_modifiers.fragment_count)} fragments` : 'not allocated'}</Text>
    <Costs value={authored?.setup_display?.cost_breakdown ?? null} maps={authored?.setup_display?.authored_map_count ?? null} source={authored?.setup_display?.source === 'structured' ? 'Authored run prices' : 'Legacy display prices (not exact setup proof)'} />
    {(d.coverage.run_count ?? 0) > 1 && <><Text size="sm" fw={600}>Map-weighted historical setup costs / map</Text>
      {pooledCosts ? <Metrics values={Object.entries(pooledCosts).map(([k, v]) => [k, v, 'c'])} /> : <Text size="xs" c="dimmed">{safeCostEvidenceMessage(runs, error, d.scope)}</Text>}
      <Text size="xs" c="dimmed">Base map / rolling split is unrecorded. All-in {safeNumber(d.economics.all_in_cost_per_map_chaos, 'c')} per map.</Text></>}
    {d.notes && <Card withBorder p="xs"><Text size="xs" c="dimmed">Notes</Text><Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{d.notes}</Text></Card>}
    <Metrics values={[[ 'Quantity', d.observed.quantity_average, '%' ], ['Rarity', d.observed.rarity_average, '%'], ['Pack size', d.observed.pack_size_average, '%'], ['Currency', d.observed.currency_average, '%']]} />
    {d.ancillary.observed_delirium && <Text size="xs">Observed Delirium: {d.ancillary.observed_delirium.sample_size} maps · {d.ancillary.observed_delirium.levels.map(l => `${l.percentage}% on ${l.count} maps`).join(', ')} · {d.ancillary.observed_delirium.rewards.map(r => `${r.name}: ${r.count}`).join(', ')}</Text>}
    {d.ancillary.excluded_drops && <Text size="xs">Excluded drops ({safeNumber(d.ancillary.excluded_drops.declared_count)}): {d.ancillary.excluded_drops.entries.map(e => `${e.name} (${safeNumber(e.chaos, 'c')})`).join(', ')} · Total {safeNumber(d.ancillary.excluded_drops.total_chaos, 'c')} · {d.ancillary.excluded_drops.complete ? 'complete' : 'partial list'}</Text>}
    {d.ancillary.gem_leveling && <Text size="xs">Gem leveling outside map profit: {safeNumber(d.ancillary.gem_leveling.count)} gems · Buy {safeNumber(d.ancillary.gem_leveling.buy_chaos, 'c')} · Sell {safeNumber(d.ancillary.gem_leveling.sell_chaos, 'c')} · Net {safeNumber(d.ancillary.gem_leveling.net_chaos, 'c')}</Text>}
    {d.setup.run_regex && <RegexLine value={d.setup.run_regex} badge="Run" badgeColor="green" />}
    {d.setup.slam_regex && <RegexLine value={d.setup.slam_regex} badge="Slam" badgeColor="orange" />}
    {error && <Alert color="orange" p="xs">{error}<Button size="compact-xs" onClick={() => setRetry(v => v + 1)}>Retry evidence</Button></Alert>}
    {runs && <details><summary style={{ fontSize: FONT.body, cursor: 'pointer' }}>Recorded runs ({runs.length})</summary><Stack mt="xs">{runs.map(r => <Card key={r.ordinal} withBorder p="xs"><Stack gap="xs">
      <Text size="sm" fw={600}>Run {r.ordinal} · {r.contributed_on ?? 'date unrecorded'}</Text>
      <Metrics values={[[ 'Maps', r.observed.map_count ], ['Investment', r.economics.total_invest_chaos, 'c'], ['Net', r.economics.net_profit_chaos, 'c'], ['Divine at time', r.economics.divine_price_chaos, 'c'], ['Minutes', r.timing.reported_minutes]]} />
      <Costs value={r.cost_breakdown ?? r.display_cost_breakdown} maps={r.observed.map_count} source={r.cost_breakdown ? 'Exact recorded run prices' : 'Legacy display prices'} /><Loot loot={r.loot} />
    </Stack></Card>)}</Stack></details>}
    <Group><Button size="xs" variant="light" disabled={!reusable} onClick={onLoad}>Load Build Settings</Button>
      {d.setup.atlas.url && <Button size="xs" variant="default" onClick={() => window.open(d.setup.atlas.url!, '_blank', 'noopener,noreferrer')}>Atlas Tree · {safeNumber(d.setup.atlas.points)} / {safeNumber(d.setup.atlas.points_max)}</Button>}
      <Button size="xs" variant="light" disabled={!continuing} onClick={onContinue}>Continue strategy</Button>
      {(d.attribution === null || d.scope === 'current' && d.attribution.status === 'active') && <Button size="xs" variant="default" onClick={onName}>{d.attribution === null ? 'Name this strategy' : 'Manage attribution'}</Button>}
    </Group>
    {!continuing && <Text size="xs" c="dimmed">{d.scope === 'frozen' ? 'Frozen strategies cannot be continued.' : d.continuation_setup.status === 'unavailable'
        ? safeContinuationMessage(d.continuation_setup.reason) : 'Confirm the assigned public name to continue. Discord verifies ownership.'}</Text>}
    {!reusable && <Text size="xs" c="dimmed">{d.reusable_setup.status === 'unavailable' && safeSetupUnavailableMessage(d.reusable_setup.reason)}</Text>}
  </Stack></Card>
}
