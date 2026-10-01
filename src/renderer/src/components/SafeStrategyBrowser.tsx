import { Alert, Badge, Button, Card, Group, Loader, Modal, MultiSelect, SegmentedControl, Select, Stack, Table, Text, TextInput, UnstyledButton } from '@mantine/core'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { SAFE_SORTS, safeSortOrder, safeIdentityKey, type SafeDetail, type SafeRow, type SafeSnapshot, type SafeSort } from '../../../shared/safeStrategy'
import type { StrategySetupCode } from '../../../shared/strategySetupCode'
import { SafeBrowserRequests, safeStrategyReader } from '../utils/safeStrategyReader'
import { safeStrategyQuery } from '../utils/safeStrategyQuery'
import { bindSafeTarget, confirmedStrategyAuthor, refreshSafeAuthorState } from '../utils/safeStrategyTarget'
import { useSessionStore } from '../store/useSessionStore'
import { TAG_OPTIONS, TAG_COLORS } from '../utils/strategyConstants'
import { activeKnownLeagues, KNOWN_LEAGUES } from '../utils/league'
import { ManagePublicNames } from './ManagePublicNames'
import { PersonalRetrospectives } from './PersonalRetrospectives'
import { SafeStrategyDetail } from './SafeStrategyDetail'
import { isStrategyBackIntent } from '../utils/strategyBackNavigation'

import { safeNumber, safeAuthorLabel, safeSetupUnavailableMessage } from '../utils/safeStrategyPresentation'
import { FONT } from '../utils/uiTokens'
import { SafeStrategyActions, type SafeStrategyAction } from '../utils/safeStrategyActions'
const rowValues = (r: SafeRow) => [r.observed.mod_average, r.observed.map_count, r.results.all_in_cost_per_map_chaos,
  r.results.total_invest_chaos, r.results.net_profit_chaos, r.score, r.results.net_divines_per_hour, r.results.net_per_map_divines]
const columns: SafeSort[] = ['mod', 'maps', 'cost_per_map', 'total_invest', 'net_profit', 'score', 'div_per_hour', 'profit_per_map']

function SafeBoard({ path, title, onLoad, onContinue, onName, sort, order, onSort, invalidate }: {
  path: string; title?: string; onLoad: (d: SafeDetail) => void; onContinue: (d: SafeDetail) => void; onName: (d: SafeDetail) => void
  sort?: SafeSort; order?: 'asc' | 'desc'; onSort?: (s: SafeSort) => void
  invalidate: () => void
}) {
  const [requests] = useState(() => new SafeBrowserRequests())
  const state = useSyncExternalStore(requests.subscribe, requests.getSnapshot)
  const prefs = useSessionStore(s => s.authorPreferences)
  const viewport = useRef<HTMLDivElement>(null), scroll = useRef(0)
  useLayoutEffect(() => { requests.activate(path); return () => requests.deactivate() }, [requests, path])
  const current = state.path === path ? state : null
  const expanded = current?.expanded
  const back = () => { invalidate(); void requests.expand(null); requestAnimationFrame(() => { viewport.current?.scrollTo({ top: scroll.current }); viewport.current?.focus({ preventScroll: true }) }) }
  return <Stack gap="xs" onKeyDown={e => {
    const el = e.target as HTMLElement
    if (expanded && isStrategyBackIntent({ kind: 'keyboard', key: e.key, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey,
      defaultPrevented: e.defaultPrevented, targetEditable: !!el.closest('input,textarea,select,[contenteditable="true"]') })) { e.preventDefault(); back() }
  }} onMouseDown={e => {
    if (expanded && isStrategyBackIntent({ kind: 'mouse', button: e.button, defaultPrevented: e.defaultPrevented })) { e.preventDefault(); back() }
  }}>
    <Group justify="space-between"><Text fw={600} size="sm">{title ?? 'Public strategies'} · {current?.page?.total ?? '…'}</Text>
      <Button size="compact-xs" variant="default" loading={current?.loading} onClick={() => { invalidate(); void requests.refresh() }}>Refresh</Button></Group>
    {current?.error && <Alert color="red" p="xs">{current.error}</Alert>}
    <div ref={viewport} tabIndex={-1} style={{ maxHeight: '70vh', overflow: 'auto' }}>
      {!expanded && <Table striped highlightOnHover withTableBorder horizontalSpacing="xs" verticalSpacing="sm">
        <Table.Thead><Table.Tr>{(['title', ...columns, 'activity'] as SafeSort[]).map(key => <Table.Th key={key}>
          <UnstyledButton style={{ fontSize: FONT.small }} disabled={!onSort} onClick={() => onSort?.(key)}>{SAFE_SORTS[key]}{sort === key ? order === 'asc' ? ' ↑' : ' ↓' : ''}</UnstyledButton>
        </Table.Th>)}</Table.Tr></Table.Thead>
        <Table.Tbody>{current?.page?.strategies.map(r => <Table.Tr key={safeIdentityKey(r)}>
          <Table.Td><Button size="compact-xs" variant="subtle" onClick={() => { invalidate(); scroll.current = viewport.current?.scrollTop ?? 0; void requests.expand(r.id); viewport.current?.scrollTo({ top: 0 }); viewport.current?.focus() }}>{r.title || 'Untitled strategy'}</Button>
            <Text size="xs" style={{ overflowWrap: 'anywhere' }} c={confirmedStrategyAuthor(r, prefs) ? 'teal' : 'dimmed'}>{safeAuthorLabel(r.attribution)}</Text>
            <Group gap={3}>{r.tags.map(t => <Badge key={t} color={Object.hasOwn(TAG_COLORS, t) ? TAG_COLORS[t] : 'gray'} size="xs">{TAG_OPTIONS.find(option => option.value === t)?.label ?? t}</Badge>)}</Group></Table.Td>
          {rowValues(r).map((v, i) => <Table.Td key={i}><Text size="xs">{safeNumber(v, i === 2 || i === 3 || i === 4 ? 'c' : i >= 6 ? 'd' : '')}</Text></Table.Td>)}
          <Table.Td><Text size="xs">{r.updated_at ? new Date(r.updated_at).toLocaleDateString() : 'Unrecorded'}</Text></Table.Td>
        </Table.Tr>)}</Table.Tbody>
      </Table>}
      {expanded && (current?.detail ? <SafeStrategyDetail key={safeIdentityKey(current.detail)} detail={current.detail}
        onLoad={() => onLoad(current.detail!)} onContinue={() => onContinue(current.detail!)} onName={() => onName(current.detail!)} /> : !current?.error && <Loader size="sm" />)}
    </div>
    {current?.loading && <Loader size="sm" />}
    {!expanded && current?.page?.total === 0 && <Text size="sm" c="dimmed">No strategies match these filters.</Text>}
    {!expanded && current?.page?.scope === 'current' && current.page.next_cursor && <Button size="xs" variant="subtle" onClick={() => void requests.more()}>Load more</Button>}
  </Stack>
}

export function SafeStrategyBrowser({ onShare, onImport, applySetup, runAction, onLoadPersonal, message }: {
  onShare: () => void; onImport: () => void; applySetup: (s: StrategySetupCode, action: SafeStrategyAction) => Promise<void>
  runAction: (action: () => Promise<void>, fresh: boolean, current: () => boolean) => void; onLoadPersonal: (id: string) => void; message: string | null
}) {
  const [view, setView] = useState('current'), [league, setLeague] = useState(activeKnownLeagues()[0] ?? '')
  const [search, setSearch] = useState(''), [tags, setTags] = useState<string[]>([]), [group, setGroup] = useState('all')
  const [mapType, setMapType] = useState(''), [since, setSince] = useState('all'), [min, setMin] = useState('')
  const [sort, setSort] = useState<SafeSort>('activity'), [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [snapshots, setSnapshots] = useState<SafeSnapshot[]>([]), [error, setError] = useState<string | null>(null)
  const [catalogueAttempt, setCatalogueAttempt] = useState(0)
  const [candidate, setCandidate] = useState<SafeDetail | null>(null), [operation, setOperation] = useState<'replace' | 'evidence'>('evidence')
  const [source, setSource] = useState('current'), [naming, setNaming] = useState<SafeDetail | null>(null)
  const nonce = useSessionStore(s => s.sessionNonce)
  const [actions] = useState(() => new SafeStrategyActions(() => useSessionStore.getState().sessionNonce))
  useEffect(() => { void refreshSafeAuthorState().catch(() => undefined) }, [])
  useEffect(() => { setCandidate(null); setNaming(null) }, [nonce, view])
  useEffect(() => {
    if (view !== 'frozen') return
    let stop = false; setSnapshots([]); setError(null)
    void safeStrategyReader.catalogue().then(v => { if (!stop) setSnapshots(v) }).catch(e => { if (!stop) setError(String(e.message)) })
    return () => { stop = true }
  }, [view, catalogueAttempt])
  const { query, error: minError } = safeStrategyQuery({ search, league, tags, group, mapType, since, min, sort, order })
  useLayoutEffect(() => { actions.invalidate(); return actions.invalidate }, [actions, view, query])
  const changeSort = (next: SafeSort) => { setSort(next); setOrder(next === sort ? order === 'asc' ? 'desc' : 'asc' : safeSortOrder(next)) }
  const load = (d: SafeDetail) => {
    const action = actions.begin()
    runAction(() => action.run(async () => {
      const fresh = await safeStrategyReader.detail(d)
      action.assertCurrent()
      if (fresh.reusable_setup.status !== 'available') throw new Error(safeSetupUnavailableMessage(fresh.reusable_setup.reason))
      await applySetup(fresh.reusable_setup.value, action)
    }), true, action.current)
  }
  const continueRun = () => {
    if (!candidate) return
    const d = candidate, action = actions.begin(), freshSession = source === 'fresh'
    setCandidate(null)
    runAction(() => action.run(async () => {
      await refreshSafeAuthorState()
      action.assertCurrent()
      const fresh = await safeStrategyReader.detail(d)
      action.assertCurrent()
      const target = await bindSafeTarget(fresh, operation, useSessionStore.getState().authorPreferences)
      action.assertCurrent()
      if (freshSession) {
        if (fresh.reusable_setup.status !== 'available') throw new Error('The reusable setup is unavailable.')
        await applySetup(fresh.reusable_setup.value, action)
        action.assertCurrent()
        useSessionStore.getState().updateSetting('leagueName', fresh.league ?? '')
      }
      useSessionStore.getState().updateSetting('strategyTarget', target)
    }), freshSession, action.current)
  }
  const boardActions = { invalidate: actions.invalidate, onLoad: load, onContinue: (d: SafeDetail) => { actions.invalidate(); setCandidate(d); setOperation('evidence'); setSource('current') }, onName: setNaming }
  return <Card withBorder p="sm" style={{ height: '100%', overflow: 'auto' }}>
    <Stack gap="sm"><Group justify="space-between">
      <SegmentedControl value={view} onChange={setView} data={[{ value: 'current', label: 'Live' }, { value: 'frozen', label: 'Retrospectives' }]} />
      <Group><Button size="xs" variant="default" onClick={() => { actions.invalidate(); onImport() }}>Import Strategy</Button><Button size="xs" variant="default" onClick={() => { actions.invalidate(); onShare() }}>Share Strategy</Button></Group>
    </Group>
    {message && <Alert color="gray" p="xs">{message}</Alert>}
    {view === 'frozen' && error && <Alert color="red" p="xs">{error}<Button size="compact-xs" onClick={() => setCatalogueAttempt(v => v + 1)}>Retry</Button></Alert>}
    {view === 'current' ? <>
      <Group align="end" gap="xs">
        <TextInput size="xs" label="Search strategies" value={search} maxLength={120} onChange={e => setSearch(e.currentTarget.value)} />
        <Select size="xs" label="League" value={league} allowDeselect={false} onChange={v => setLeague(v ?? '')} data={[{ value: '', label: 'All leagues' }, ...KNOWN_LEAGUES.map(v => ({ value: v, label: v }))]} />
        <Select size="xs" label="Map setup" value={mapType} allowDeselect={false} onChange={v => setMapType(v ?? '')} data={[{ value: '', label: 'Any setup' }, { value: '6-mod', label: '6-mod' }, { value: '8-mod', label: '8-mod' }]} />
        <MultiSelect size="xs" label="Mechanics" value={tags} onChange={setTags} maxValues={24} data={TAG_OPTIONS.slice(1)} searchable />
        <Select size="xs" label="Party" value={group} allowDeselect={false} onChange={v => setGroup(v ?? 'all')} data={[{ value: 'all', label: 'Solo & group' }, { value: 'solo', label: 'Solo only' }, { value: 'group', label: 'Group only' }]} />
        <Select size="xs" label="Activity" value={since} allowDeselect={false} onChange={v => setSince(v ?? 'all')} data={[{ value: 'all', label: 'All time' }, { value: '1d', label: '24 hours' }, { value: '3d', label: '3 days' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }]} />
        <TextInput size="xs" label="Min div / map" value={min} error={minError} onChange={e => setMin(e.currentTarget.value)} />
        <Select size="xs" label="Sort" value={sort} allowDeselect={false} onChange={v => { if (v) { setSort(v as SafeSort); setOrder(safeSortOrder(v as SafeSort)) } }} data={Object.entries(SAFE_SORTS).map(([value, label]) => ({ value, label }))} />
        <Button size="xs" variant="default" onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}>{order === 'asc' ? '↑' : '↓'}</Button>
      </Group>
      {query !== null ? <SafeBoard path={'/web/v2/strategies?' + query} {...boardActions} sort={sort} order={order} onSort={changeSort} />
        : <Text size="sm" c="dimmed">Correct or clear the minimum to show matching strategies.</Text>}
    </> : <>
      <PersonalRetrospectives onLoadSession={onLoadPersonal} />
      {snapshots.map(s => <Stack key={s.snapshot_key} gap="sm"><Text fw={600}>{s.league ?? 'Unknown league'} · Frozen {s.cutoff_utc ? new Date(s.cutoff_utc).toLocaleDateString() : 'date unrecorded'}</Text>
        <SafeBoard title="Top score" path={`/web/v2/retrospectives/${s.snapshot_key}/strategies?limit=10&sort=score&order=desc`} {...boardActions} />
        <SafeBoard title="Top profit per map" path={`/web/v2/retrospectives/${s.snapshot_key}/strategies?limit=10&sort=profit_per_map&order=desc`} {...boardActions} />
      </Stack>)}
    </>}
    </Stack>
    <ManagePublicNames opened={!!naming} selectedStrategy={naming ? { id: naming.id, scope: naming.scope, snapshotKey: naming.snapshot_key } : undefined} onClose={() => setNaming(null)} />
    <Modal opened={!!candidate} onClose={() => setCandidate(null)} title={`Continue ${candidate?.title ?? 'strategy'}`}>
      <Stack><Text size="sm">What should the next share do?</Text><SegmentedControl value={operation} onChange={v => setOperation(v as 'replace' | 'evidence')}
        data={[{ value: 'evidence', label: 'Add another run' }, { value: 'replace', label: 'Replace strategy' }]} />
        <Text size="xs">{operation === 'evidence' ? 'Adds a compatible run with its own recorded prices.' : 'Your next share publishes a new version and starts its combined results with this run. Votes stay.'}</Text>
        <SegmentedControl value={source} onChange={setSource} data={[{ value: 'current', label: 'Use current session' }, { value: 'fresh', label: 'Start fresh session' }]} />
        <Text size="xs">{source === 'current' ? 'Keeps maps, loot and authored prices. Sharing checks compatibility again.' : 'Loads reusable settings into a fresh session with empty prices.'}</Text>
        <Button onClick={continueRun}>Continue strategy</Button></Stack>
    </Modal>
  </Card>
}
