import { Group, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronRight, IconSnowflake, IconThumbDown, IconThumbUp, IconUsers } from '@tabler/icons-react'
import type { SafeRow, SafeSort } from '../../../shared/safeStrategy'
import { BROWSER_GRID_TEMPLATE, BROWSER_MAXIMIZED_GRID_TEMPLATE, BROWSER_SETUP_COLLAPSED_GRID_TEMPLATE,
  BROWSER_MAXIMIZED_SETUP_COLLAPSED_GRID_TEMPLATE, BROWSER_ROW_GAP, BROWSER_ROW_PAD_X } from '../utils/strategyConstants'
import { safeAuthorLabel } from '../utils/safeStrategyPresentation'
import { compactChaos, listRunCount, listDivineTotal, groupLabel } from '../utils/safeStrategyCardPresentation'
import { formatRelativeAge } from '../utils/relativeTime'
import { COLOR, FONT } from '../utils/uiTokens'
import { TagStrip } from './StrategyCardPresentation'
import { PublicAuthorName } from './PublicAuthorName'

const safeRowGrid = (maximized: boolean, activity: boolean) => activity
  ? maximized ? BROWSER_MAXIMIZED_SETUP_COLLAPSED_GRID_TEMPLATE : BROWSER_SETUP_COLLAPSED_GRID_TEMPLATE
  : maximized ? BROWSER_MAXIMIZED_GRID_TEMPLATE : BROWSER_GRID_TEMPLATE

const gridStyle = (maximized: boolean, activity: boolean) => ({ display: 'grid',
  gridTemplateColumns: safeRowGrid(maximized, activity), columnGap: BROWSER_ROW_GAP,
  alignItems: 'center', padding: `8px ${BROWSER_ROW_PAD_X}px` })

export function SafeStrategyListEmpty({ scope }: { scope: SafeRow['scope'] }) {
  return <Stack m="sm" gap={4}>
    <Text size="sm" fw={600}>No matching strategies</Text>
    {scope === 'current' && <Text size="sm" c="dimmed">Try another league or clear your filters.</Text>}
  </Stack>
}

export function SafeStrategyHeaders({ maximized, activity, sort, order, onSort }: {
  maximized: boolean; activity: boolean; sort?: SafeSort; order?: 'asc' | 'desc'; onSort?: (s: SafeSort) => void
}) {
  const column = (key: SafeSort, label: string) => <UnstyledButton key={key} disabled={!onSort}
    aria-pressed={sort === key} onClick={() => onSort?.(key)}
    style={{ color: COLOR.textFaint, fontSize: FONT.small, textAlign: key === 'title' || key === 'activity' ? 'left' : 'center' }}>
    {label}{sort === key ? order === 'asc' ? ' ▲' : ' ▼' : ''}
  </UnstyledButton>
  return <div className="safe-strategy-headers" style={gridStyle(maximized, activity)}>
    <span />{column('title', 'Strategy')}<Text size="xs" c="dimmed">Tags</Text>
    {activity && column('activity', 'Published / updated')}
    {column('mod', 'Mod')}{column('maps', 'Maps')}{column('cost_per_map', 'Cost/map')}
    {column('total_invest', 'Total Invest')}{column('net_profit', 'Total Profit')}
    {column('score', 'Score')}{column('div_per_hour', 'div/h')}{column('profit_per_map', 'Profit/map')}
  </div>
}

export function SafeStrategyRow({ row: r, expanded, maximized, activity, onToggle }: {
  row: SafeRow; own: boolean; expanded: boolean; maximized: boolean; activity: boolean; onToggle: () => void
}) {
  const score = r.score, profit = r.results.net_profit_chaos, perMap = r.results.net_per_map_divines
  const scoreColor = score === null || score === 0 ? COLOR.textMuted : score > 0 ? COLOR.profit : COLOR.loss
  const metric = (text: string, color: string = COLOR.textSoft, strong = false) => <Text size="xs" fw={strong ? 700 : 600}
    title={text === '—' ? 'Unrecorded' : undefined} ta="center" style={{ color, fontSize: FONT.body, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{text}</Text>
  const name = safeAuthorLabel(r.attribution)
  const runs = listRunCount(r.evidence.run_count)
  const group = groupLabel(r.group_play, r.party_size)
  const total = (chaos: number | null, divines: number | null, signed = false) => <Text size="xs" ta="center" fw={600}
    style={{ color: signed ? chaos === null ? COLOR.textFaint : chaos < 0 ? COLOR.loss : COLOR.profit : COLOR.textSoft, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
    {compactChaos(chaos, signed)}{divines !== null && <Text span c="dimmed" fw={400} style={{ fontSize: FONT.label }}> ({listDivineTotal(divines, signed)})</Text>}
  </Text>
  return <UnstyledButton className="safe-strategy-row" aria-expanded={expanded}
    aria-label={`${expanded ? 'Collapse' : 'Open'} ${r.title || 'Untitled strategy'}`}
    onClick={onToggle} style={{ ...gridStyle(maximized, activity), width: '100%' }}>
    {expanded ? <IconChevronDown size={12} color={COLOR.textFaint} /> : <IconChevronRight size={12} color={COLOR.textFaint} />}
    <Stack gap={1} style={{ minWidth: 0 }}>
      <Group gap={3} wrap="nowrap"><Text size="xs" fw={700} truncate="end" title={r.title || 'Untitled strategy'} style={{ flex: 1, minWidth: 0, lineHeight: 1.15 }}>{r.title || 'Untitled strategy'}</Text>
        {group && <Tooltip withArrow label={group}><IconUsers size={12} color={COLOR.textMuted} aria-label={group} style={{ flexShrink: 0 }} /></Tooltip>}
        {r.scope === 'frozen' && <IconSnowflake size={10} color={COLOR.accent} />}
      </Group>
      <div title={`by ${name}${runs === null ? '' : ` · ${runs}`}`} className="safe-strategy-byline" style={{ color: COLOR.textMuted, fontSize: FONT.label }}>
        <span>by</span><PublicAuthorName attribution={r.attribution} compact />{runs !== null && <span>· {runs}</span>}
      </div>
    </Stack>
    <div style={{ minWidth: 0 }}><TagStrip tagStr={r.tags.join(',')} layoutKey={expanded} /></div>
    {activity && <Tooltip withArrow label={`${r.updated_at ? 'Updated' : 'Published'} ${r.updated_at ?? r.published_at ?? 'date unrecorded'}`}>
      <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>{formatRelativeAge(r.updated_at ?? r.published_at)}</Text>
    </Tooltip>}
    {metric(r.observed.mod_average === null ? '—' : r.observed.mod_average.toFixed(1))}
    {metric(r.observed.map_count === null ? '—' : r.observed.map_count.toLocaleString('en-US'))}
    {metric(compactChaos(r.results.all_in_cost_per_map_chaos))}
    {total(r.results.total_invest_chaos, r.results.historical_invest_divines)}
    {total(profit, r.results.historical_net_divines, true)}
    <Group gap={2} justify="center" wrap="nowrap" title={score === null ? 'Score unrecorded' : 'Aggregate community score'}>
      {score !== null && (score < 0 ? <IconThumbDown size={10} color={scoreColor} /> : <IconThumbUp size={10} color={scoreColor} />)}
      {metric(score === null ? '—' : `${score > 0 ? '+' : ''}${score}`, scoreColor)}
    </Group>
    {metric(r.results.net_divines_per_hour === null ? '—' : r.results.net_divines_per_hour.toFixed(1))}
    <Stack gap={0} align="flex-end"><Text size="sm" fw={800} style={{ color: perMap === null ? COLOR.textFaint : perMap < 0 ? COLOR.loss : COLOR.gold,
      fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{perMap === null ? '—' : `${perMap.toFixed(3)}d`}</Text>
      {(r.evidence.run_count ?? 0) > 1 && <Text c="dimmed" style={{ fontSize: FONT.micro, lineHeight: 1.1 }}>historical</Text>}
    </Stack>
  </UnstyledButton>
}
