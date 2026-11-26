import { Alert, Badge, Button, Card, Group, Stack, Text } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { safeIdentityKey, type SafeDetail, type SafeRun } from '../../../shared/safeStrategy'
import { safeStrategyReader } from '../utils/safeStrategyReader'
import { confirmedStrategyAuthor } from '../utils/safeStrategyTarget'
import { useSessionStore } from '../store/useSessionStore'
import { RegexLine } from './ui/RegexLine'
import { PoeItemIcon, type PoeItemCategory } from './ui/PoeItemIcon'
import { checkStrategyCompat } from '../utils/strategyCompat'
import { getManifest } from '../utils/gameData'
import { safeNumber, safeDate, recordedQuantityPrice, safePooledCostComponents, safeCostEvidenceMessage, safeSetupUnavailableMessage, safeContinuationMessage } from '../utils/safeStrategyPresentation'
import { PublicAuthorName } from './PublicAuthorName'
import { COLOR, FONT } from '../utils/uiTokens'
import { EconomicTile } from './StrategyCardPresentation'
import { LootEvidenceSummary } from './LootEvidenceSummary'
import { SectionLabel } from './ui/SectionLabel'
import { StatTile } from './ui/StatTile'
import { publicLootPresentation } from '../utils/strategyLootPresentation'
import { detailMoney, recordedCostBreakdown, recordedCount, publishedChiselName, safePooledPresentation } from '../utils/safeStrategyCardPresentation'
import { formatDivineValue } from '../utils/currencyDisplay'
import { formatRelativeAge } from '../utils/relativeTime'
import { TAG_COLORS, fullTagBadge } from '../utils/strategyConstants'
import { deliOrbItemName } from '../utils/itemIcons'
import { formatActiveTime } from '../utils/timeEstimate'
import './StrategyCard.css'

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
function Loot({ loot, quote }: { loot: SafeDetail['loot']; quote?: number | null }) {
  return loot ? <LootEvidenceSummary summary={publicLootPresentation(loot)} divinePrice={quote} />
    : <Text size="xs" c="dimmed">Loot evidence is unrecorded.</Text>
}
function SetupItem({ name, value, color = 'orange', category = 'scarab' }: { name: string; value: string; color?: string; category?: PoeItemCategory }) {
  return <Group gap={6} wrap="nowrap" className="strategy-card-setup-item">
    <PoeItemIcon name={name} size={20} category={category} /><Text size="xs" c={color} fw={600} style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{name}</Text>
    <Text size="xs" c="dimmed" style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</Text>
  </Group>
}
function CostLine({ name, value, total = false }: { name: string; value: number | null | undefined; total?: boolean }) {
  return <Group gap="md" justify="space-between" wrap="nowrap" pt={total ? 5 : undefined} style={total ? { borderTop: `1px solid ${COLOR.border}` } : undefined}>
    <Text size="xs" c="dimmed">{name}</Text><Text size="xs" fw={total ? 700 : undefined} c={total ? 'yellow' : undefined}>{safeNumber(value, 'c')}</Text>
  </Group>
}
const panelStyle = { background: COLOR.surfaceSectionBg, border: `1px solid ${COLOR.border}`, borderRadius: 6, padding: 10 };

export function SafeStrategyDetail({ detail: d, onLoad, onContinue, onName }: {
  detail: SafeDetail; onLoad: () => void; onContinue: () => void; onName: () => void
}) {
  const prefs = useSessionStore(s => s.authorPreferences)
  const [runs, setRuns] = useState<SafeRun[] | null>(null), [error, setError] = useState<string | null>(null), [retry, setRetry] = useState(0)
  const key = safeIdentityKey(d)
  useEffect(() => {
    let stop = false; setRuns(null); setError(null)
    if (d.scope === 'current' && (d.coverage.run_count ?? 0) > 0) void safeStrategyReader.evidence(d).then(r => {
      if (!stop) setRuns(r)
    }).catch(e => { if (!stop) setError(e.message) })
    return () => { stop = true }
  }, [d, key, retry])
  const pooledCosts = useMemo(() => runs && safePooledCostComponents(runs), [runs])
  const pooledView = useMemo(() => runs && (d.coverage.run_count ?? 0) > 1 ? safePooledPresentation(runs, d) : null, [runs, d])
  const authored = d.authored_history, reusable = d.reusable_setup.status === 'available' ? d.reusable_setup.value : null
  const own = confirmedStrategyAuthor(d, prefs), continuing = !!own && d.scope === 'current' && d.continuation_setup.status === 'available'
  const money = detailMoney(d), pooled = (d.coverage.run_count ?? 0) > 1
  const costs = authored?.setup_display?.cost_breakdown ?? null
  const breakdown = !pooled ? recordedCostBreakdown(costs,
    { ...d.setup, scarabs: d.setup.scarabs.map(s => s.name) },
    authored?.setup_display?.authored_map_count ?? null, d.economics.all_in_cost_per_map_chaos) : null
  const usesThreads = !!getManifest().leagueRules?.[d.league ?? '']?.threadSlots
  const scarabs = costs?.scarabs ?? d.setup.scarabs
  const chisel = costs?.chisel?.name ?? d.setup.chisel
  const deli = costs?.delirium ?? d.setup.delirium
  const astro = costs?.astrolabe
  const observedDeli = d.ancillary.observed_delirium
  const multiplier = d.observed.multiplier_average ?? (!pooled ? authored?.observed.multiplier : null)
  const costDivines = pooledView?.costPerMapDivines ?? money.costSecondary
  const compatibility = checkStrategyCompat({ scarabs: d.setup.scarabs.map(s => ({ name: s.name, cost: s.price_each_chaos ?? 0 })),
    chisel: d.setup.chisel, atlas_tree_url: d.setup.atlas.url, game_data_patch_version: d.setup.game_data.patch_version })
  return <div data-safe-detail className="strategy-card-expanded strategy-card-triptych strategy-card-refined" style={{ padding: '16px 20px' }}>
    <div className="strategy-card-header" style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${COLOR.border}` }}>
      <div className="strategy-card-hero">
        <Stack className="strategy-card-hero-identity" gap={6}>
          <Text size="xl" fw={800} style={{ overflowWrap: 'anywhere' }}>{d.title || 'Untitled strategy'}</Text>
          <Group className="strategy-card-hero-tags" gap={4} wrap="wrap">{d.tags.map(t => <Badge key={t} size="sm" color={Object.hasOwn(TAG_COLORS, t) ? TAG_COLORS[t] : 'gray'} variant="light">{fullTagBadge(t)}</Badge>)}</Group>
          <Badge color="gray" size="xs" variant="outline">{d.scope === 'current' ? 'Live' : 'Frozen'} · Revision {d.revision}</Badge>
        </Stack>
        <Stack className="strategy-card-hero-meta" gap={2}>
          <Stack className="strategy-card-hero-attribution" gap={2}>
            <Text size="sm" c="dimmed">by <PublicAuthorName attribution={d.attribution} /></Text>
            <Text size="xs" c="dimmed">Published {safeDate(d.published_at)}</Text>
            <Text size="xs" c="dimmed">{d.league ?? 'League unrecorded'} · {recordedCount(d.coverage.run_count, 'run')}</Text>
          </Stack>
          <Stack className="strategy-card-hero-facts" gap={2}>
            <Text size="xs" c="dimmed" tt="uppercase">{recordedCount(d.observed.map_count, 'map')} · {safeNumber(d.observed.mod_average)} mod</Text>
            <Text size="xs" c="dimmed">Latest activity <Text span c="gray.3">{formatRelativeAge(d.updated_at ?? d.published_at)}</Text> · Time {d.coverage.timed_minutes === null ? 'Unrecorded' : formatActiveTime(d.coverage.timed_minutes * 60_000)}</Text>
            <Text size="xs" c="dimmed">Divine {pooled ? 'per-run snapshots' : safeNumber(money.quote, 'c')} · Div/hr {safeNumber(d.coverage.net_divines_per_hour)}</Text>
            <Text size="xs" c="dimmed">Game data r{d.setup.game_data.revision ?? '—'} · {d.setup.game_data.patch_version ?? 'unrecorded'} · Atlas {safeNumber(d.setup.atlas.points)}/{safeNumber(d.setup.atlas.points_max)}</Text>
            <Text size="xs" c="dimmed">Author mult. <Text span c="blue">{multiplier == null ? 'Unrecorded' : `${multiplier.toFixed(3)}×`}</Text></Text>
          </Stack>
        </Stack>
      </div>
    </div>
    <div className="strategy-card-economics" style={{ marginBottom: 14 }}>
      <EconomicTile label={pooled ? 'Historical net' : 'Net profit'} primaryValue={money.net} secondaryValue={money.netSecondary} color={d.economics.net_profit_chaos === null ? COLOR.textMuted : d.economics.net_profit_chaos < 0 ? COLOR.loss : COLOR.profit} />
      <EconomicTile label="Total investment" primaryValue={money.invest} secondaryValue={money.investSecondary} color={COLOR.textSoft} />
      <EconomicTile label="Profit / map" primaryValue={money.perMapChaos} secondaryValue={d.economics.net_per_map_divines === null ? null : money.perMap} color={(d.economics.net_profit_chaos ?? 0) < 0 ? COLOR.loss : COLOR.gold} />
      <EconomicTile label="Cost / map" primaryValue={money.cost} secondaryValue={costDivines === null ? null : formatDivineValue(costDivines)} color={COLOR.warning} />
    </div>
    <div className="strategy-card-loot-panel" style={{ ...panelStyle, padding: 8, marginBottom: 12 }}><Loot loot={d.loot} quote={money.quote} /></div>
    {error && <Alert color="orange" p="xs">{error}<Button size="compact-xs" onClick={() => setRetry(v => v + 1)}>Retry evidence</Button></Alert>}
    {runs && <details className="strategy-card-runs-panel" style={{ ...panelStyle, marginBottom: 8 }}>
      <summary style={{ fontSize: FONT.body, cursor: 'pointer' }}>Recorded runs ({runs.length}) · {recordedCount(d.coverage.timed_run_count, 'timed run')} / {recordedCount(d.coverage.timed_map_count, 'timed map')}</summary>
      <Stack mt="xs">{runs.map(r => <Card key={r.ordinal} withBorder p="xs"><Stack gap="xs">
        <Text size="sm" fw={600}>Run {r.ordinal} · {r.contributed_on ?? 'date unrecorded'}</Text>
        <Metrics values={[[ 'Maps', r.observed.map_count ], ['Investment', r.economics.total_invest_chaos, 'c'], ['Net', r.economics.net_profit_chaos, 'c'], ['Divine at time', r.economics.divine_price_chaos, 'c'], ['Minutes', r.timing.reported_minutes]]} />
        <Costs value={r.cost_breakdown ?? r.display_cost_breakdown} maps={r.observed.map_count} source={r.cost_breakdown ? 'Exact recorded run prices' : 'Legacy display prices (not exact setup proof)'} /><Loot loot={r.loot} quote={r.economics.divine_price_chaos} />
      </Stack></Card>)}</Stack>
    </details>}
    {d.scope === 'frozen' && <Text size="xs" c="dimmed">Frozen aggregate snapshot. Individual run evidence is not available.</Text>}
    {compatibility.level !== 'ok' && <Alert color={compatibility.level === 'removed' ? 'red' : 'yellow'} p="xs" mb="xs" title="Historical setup compatibility">
      {compatibility.issues.map(issue => <Text key={`${issue.kind}:${issue.storedName}`} size="xs">{issue.detail}</Text>)}
    </Alert>}
    <div className="strategy-card-lower-grid">
      <div className="strategy-card-lower-panel" style={panelStyle} />
      <Stack gap={3} className="strategy-card-setup-scarabs">
        <SectionLabel>{usesThreads ? 'Map investment' : 'Scarabs'} · {pooledView ? 'map-weighted costs' : 'published setup prices'}</SectionLabel>
        <div className="strategy-card-scarab-list">{pooledView?.scarabItems.length ? pooledView.scarabItems.map((s, i) => <SetupItem key={i} name={s.name} value={safeNumber(s.perMap, 'c/map')} />)
          : scarabs.map((s, i) => <SetupItem key={i} name={s.name} value={safeNumber(s.price_each_chaos, 'c')} />)}</div>
        {!scarabs.length && !pooledView?.scarabItems.length && <Text size="xs" c="dimmed">{usesThreads ? 'Thread and Ember details may be recorded in the strategy notes.' : 'No recorded scarabs'}</Text>}
      </Stack>
      <Stack gap={3} className="strategy-card-setup-chisel"><SectionLabel>Chisel</SectionLabel>
        {pooledView?.chiselItems.length ? pooledView.chiselItems.map(s => <SetupItem key={s.name} category="chisel" name={publishedChiselName(s.name)!} color="yellow" value={safeNumber(s.perMap, 'c/map')} />)
          : chisel && chisel.toLowerCase() !== 'none' ? <SetupItem category="chisel" name={publishedChiselName(chisel)!} color="yellow" value={safeNumber(costs?.chisel?.price_each_chaos, 'c/map')} /> : <Text size="xs" c="dimmed">{chisel ? 'None' : 'Unrecorded'}</Text>}
      </Stack>
      <Stack gap={3} className="strategy-card-setup-deli"><SectionLabel>Delirium orbs</SectionLabel>
        {pooledView?.deliriumItems.length ? pooledView.deliriumItems.map(s => <SetupItem key={s.name} category="orb" name={deliOrbItemName(s.name) ?? s.name} color="grape" value={safeNumber(s.perMap, 'c/map')} />)
          : deli?.type ? <SetupItem category="orb" name={deliOrbItemName(deli.type) ?? deli.type} color="grape" value={recordedQuantityPrice(deli.count_per_map, costs?.delirium?.price_each_chaos, true)} /> : <Text size="xs" c="dimmed">{deli ? 'None' : 'Unrecorded'}</Text>}
      </Stack>
      <Stack gap={3} className="strategy-card-setup-astro"><SectionLabel>Astrolabe</SectionLabel>
        {pooledView?.astrolabeItems.length ? pooledView.astrolabeItems.map(s => <SetupItem key={s.name} category="astrolabe" name={s.name} color="teal" value={safeNumber(s.perMap, 'c/map')} />)
          : astro?.type || d.setup.astrolabe ? <SetupItem category="astrolabe" name={astro?.type ?? d.setup.astrolabe!} color="teal" value={recordedQuantityPrice(astro?.count, astro?.price_each_chaos)} /> : <Text size="xs" c="dimmed">Unrecorded</Text>}
        {authored?.setup_display?.source === 'legacy_display' && <Text size="xs" c="dimmed">Legacy display prices; not exact setup proof.</Text>}
      </Stack>
      <div className="strategy-card-cost-panel" style={panelStyle}>
        <SectionLabel mb={3}>{pooled ? 'Historical cost breakdown / map' : 'Cost breakdown / map'}</SectionLabel>
        <Stack gap={6} className="strategy-card-cost-list">
          <CostLine name="Base map + rolling costs" value={pooled ? pooledView?.baseAndRolling : authored?.setup_display?.combined_map_rolling_cost_per_map_chaos ?? breakdown?.baseAndRolling} />
          <CostLine name={publishedChiselName(chisel) ?? 'Chisels'} value={pooled ? pooledCosts?.Chisel : breakdown?.chisel} />
          <CostLine name="Scarabs" value={pooled ? pooledCosts?.Scarabs : breakdown?.scarabs} />
          <CostLine name="Delirium orbs" value={pooled ? pooledCosts?.['Delirium orbs'] : breakdown?.deliriumOrbs} />
          <CostLine name="Astrolabe" value={pooled ? pooledCosts?.Astrolabe : breakdown?.astrolabe} />
          <CostLine name={pooled ? 'Map-weighted all-in' : '= All-in'} value={d.economics.all_in_cost_per_map_chaos} total />
          {pooled && <Text size="xs" c="dimmed">{pooledView ? 'Map-weighted authored costs. Base map and rolling costs remain combined.' : pooledCosts ? 'Map-weighted components only. The complete base / rolling remainder is unrecorded.' : safeCostEvidenceMessage(runs, error, d.scope)} Exact run prices remain under Recorded runs.</Text>}
        </Stack>
      </div>
      <div className="strategy-card-map-panel" style={panelStyle}>
        <Group justify="space-between" mb={6}><SectionLabel>Map requirements</SectionLabel>
          {observedDeli && <Badge size="xs" color="grape" variant="outline">Observed Delirium · {observedDeli.sample_size} maps</Badge>}</Group>
        <div className="strategy-card-map-stats">
          <StatTile boxed centered label="Quantity" value={safeNumber(d.observed.quantity_average, '%')} color={COLOR.accent} />
          <StatTile boxed centered label="Rarity" value={safeNumber(d.observed.rarity_average, '%')} color={COLOR.accent} />
          <StatTile boxed centered label="Pack size" value={safeNumber(d.observed.pack_size_average, '%')} color={COLOR.accent} />
          <StatTile boxed centered label="Currency" value={safeNumber(d.observed.currency_average, '%')} color={COLOR.accent} />
        </div>
        <Stack gap={4} mt="xs"><Text size="xs" c="dimmed">{d.setup.map_type ?? 'Map setup unrecorded'} · Party {d.setup.party_size ?? 'unrecorded'}</Text>
          <Text size="xs" c="dimmed">Multiplying Modifiers: {d.setup.multiplying_modifiers?.allocated == null ? 'Unrecorded' : d.setup.multiplying_modifiers.allocated ? `allocated · ${safeNumber(d.setup.multiplying_modifiers.fragment_count)} fragments` : 'not allocated'}</Text>
          {observedDeli && <Text size="xs" c="dimmed">{observedDeli.levels.map(l => `${l.percentage}% on ${l.count} maps`).join(', ')}{observedDeli.rewards.length > 0 && ` · ${observedDeli.rewards.map(r => `${r.name}: ${r.count}`).join(', ')}`}</Text>}
        </Stack>
      </div>
      {d.notes && <div className="strategy-card-supporting-note" style={panelStyle}><SectionLabel>Notes</SectionLabel><Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{d.notes}</Text></div>}
      <Stack gap={5} className="strategy-card-supporting-evidence">
        {d.ancillary.excluded_drops && <Text size="xs">Excluded drops ({safeNumber(d.ancillary.excluded_drops.declared_count)}): {d.ancillary.excluded_drops.entries.map(e => `${e.name} (${safeNumber(e.chaos, 'c')})`).join(', ')} · Total {safeNumber(d.ancillary.excluded_drops.total_chaos, 'c')} · {d.ancillary.excluded_drops.complete ? 'complete' : 'partial list'}</Text>}
        {d.ancillary.gem_leveling && <Text size="xs">Gem leveling outside map profit: {safeNumber(d.ancillary.gem_leveling.count)} gems · Buy {safeNumber(d.ancillary.gem_leveling.buy_chaos, 'c')} · Sell {safeNumber(d.ancillary.gem_leveling.sell_chaos, 'c')} · Net {safeNumber(d.ancillary.gem_leveling.net_chaos, 'c')}</Text>}
      </Stack>
    </div>
    {(d.setup.run_regex || d.setup.slam_regex) && <Stack gap={6} className="strategy-card-regex-wide" style={panelStyle}>
      {d.setup.run_regex && <RegexLine value={d.setup.run_regex} badge="Run" badgeColor="green" />}
      {d.setup.slam_regex && <RegexLine value={d.setup.slam_regex} badge="Slam" badgeColor="orange" />}
    </Stack>}
    <Group className="strategy-card-actions">
      <Button size="xs" variant="light" disabled={!reusable} onClick={onLoad}>Load Build Settings</Button>
      {d.setup.atlas.url && <Button size="xs" variant="default" onClick={() => window.open(d.setup.atlas.url!, '_blank', 'noopener,noreferrer')}>Atlas Tree · {safeNumber(d.setup.atlas.points)} / {safeNumber(d.setup.atlas.points_max)}</Button>}
      <Button size="xs" variant="light" disabled={!continuing} onClick={onContinue}>Continue strategy</Button>
      {(d.attribution === null || d.scope === 'current' && d.attribution.status === 'active') && <Button size="xs" variant="default" onClick={onName}>{d.attribution === null ? 'Name this strategy' : 'Manage attribution'}</Button>}
    </Group>
    <Stack gap={3} mt="xs" align="center">
      {!continuing && <Text size="xs" c="dimmed">{d.scope === 'frozen' ? 'Frozen strategies cannot be continued.' : d.continuation_setup.status === 'unavailable'
        ? safeContinuationMessage(d.continuation_setup.reason, d.attribution === null) : 'Confirm the assigned public name to continue. Discord verifies ownership.'}</Text>}
      {!reusable && <Text size="xs" c="dimmed">{d.reusable_setup.status === 'unavailable' && safeSetupUnavailableMessage(d.reusable_setup.reason)}</Text>}
    </Stack>
  </div>
}
