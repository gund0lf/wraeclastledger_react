import { ActionIcon, Alert, Badge, Button, Card, Divider, Group, Loader, Modal, MultiSelect, Paper, Radio, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { IconBrandDiscord, IconRefresh, IconShare2 } from '@tabler/icons-react'
import { SAFE_SORTS, safeSortOrder, safeIdentityKey, type SafeDetail, type SafeSnapshot, type SafeSort } from '../../../shared/safeStrategy'
import type { StrategySetupCode } from '../../../shared/strategySetupCode'
import { SafeBrowserRequests, safeStrategyReader } from '../utils/safeStrategyReader'
import { safeStrategyQuery } from '../utils/safeStrategyQuery'
import { bindSafeTarget, confirmedStrategyAuthor, refreshSafeAuthorState } from '../utils/safeStrategyTarget'
import { useSessionStore } from '../store/useSessionStore'
import { TAG_OPTIONS, BROWSER_MIN_CONTENT_WIDTH, BROWSER_MAXIMIZED_MIN_CONTENT_WIDTH, BROWSER_SETUP_COLLAPSED_MIN_CONTENT_WIDTH, BROWSER_MAXIMIZED_SETUP_COLLAPSED_MIN_CONTENT_WIDTH } from '../utils/strategyConstants'
import { activeKnownLeagues, KNOWN_LEAGUES } from '../utils/league'
import { ManagePublicNames } from './ManagePublicNames'
import { PersonalRetrospectives } from './PersonalRetrospectives'
import { SafeStrategyDetail } from './SafeStrategyDetail'
import { isStrategyBackIntent } from '../utils/strategyBackNavigation'

import { safeSetupUnavailableMessage, safeDate } from '../utils/safeStrategyPresentation'
import { COLOR, FONT } from '../utils/uiTokens'
import { usePanelMaximized, useSetupSidebarCollapsed } from '../layout/panelLayoutContext'
import { SafeStrategyHeaders, SafeStrategyRow } from './SafeStrategyRow'
import { SectionLabel } from './ui/SectionLabel'
import './SafeStrategyBrowser.css'
import { SafeStrategyActions, type SafeStrategyAction } from '../utils/safeStrategyActions'
type BoardToolbar = (total: number | null, loading: boolean, refresh?: () => void) => ReactNode

function SafeBoard({ path, title, onLoad, onContinue, onName, sort, order, onSort, invalidate, toolbar, filters }: {
  path: string; title?: string; onLoad: (d: SafeDetail) => void; onContinue: (d: SafeDetail) => void; onName: (d: SafeDetail) => void
  sort?: SafeSort; order?: 'asc' | 'desc'; onSort?: (s: SafeSort) => void
  invalidate: () => void; toolbar?: BoardToolbar; filters?: ReactNode
}) {
  const [requests] = useState(() => new SafeBrowserRequests())
  const state = useSyncExternalStore(requests.subscribe, requests.getSnapshot)
  const prefs = useSessionStore(s => s.authorPreferences)
  const viewport = useRef<HTMLDivElement>(null), scroll = useRef(0)
  const maximized = usePanelMaximized('strategy-browser'), activity = useSetupSidebarCollapsed()
  const minWidth = activity ? maximized ? BROWSER_MAXIMIZED_SETUP_COLLAPSED_MIN_CONTENT_WIDTH : BROWSER_SETUP_COLLAPSED_MIN_CONTENT_WIDTH
    : maximized ? BROWSER_MAXIMIZED_MIN_CONTENT_WIDTH : BROWSER_MIN_CONTENT_WIDTH
  useLayoutEffect(() => { requests.activate(path); return () => requests.deactivate() }, [requests, path])
  const current = state.path === path ? state : null
  const expanded = current?.expanded
  const back = () => { invalidate(); void requests.expand(null); requestAnimationFrame(() => { viewport.current?.scrollTo({ top: scroll.current }); viewport.current?.focus({ preventScroll: true }) }) }
  const refresh = () => { invalidate(); void requests.refresh() }
  return <div className="safe-strategy-board" onKeyDown={e => {
    const el = e.target as HTMLElement
    if (expanded && isStrategyBackIntent({ kind: 'keyboard', key: e.key, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey,
      defaultPrevented: e.defaultPrevented, targetEditable: !!el.closest('input,textarea,select,[contenteditable="true"]') })) { e.preventDefault(); back() }
  }} onMouseDown={e => {
    if (expanded && isStrategyBackIntent({ kind: 'mouse', button: e.button, defaultPrevented: e.defaultPrevented })) { e.preventDefault(); back() }
  }}>
    {toolbar ? toolbar(current?.page?.total ?? null, !!current?.loading, refresh) :
      <Group justify="space-between"><Text fw={600} size="sm">{title} · {current?.page?.total ?? '…'}</Text>
        <ActionIcon size="md" variant="default" aria-label="Refresh strategies" loading={current?.loading} onClick={refresh}><IconRefresh size={14} /></ActionIcon></Group>}
    {filters}
    {current?.error && <Alert color="red" p="xs">{current.error}</Alert>}
    <div ref={viewport} tabIndex={-1} className="safe-strategy-viewport">
      {!expanded && <div style={{ minWidth, position: 'sticky', top: 0, zIndex: 2 }}><SafeStrategyHeaders maximized={maximized} activity={activity} sort={sort} order={order} onSort={onSort} /></div>}
      <Stack gap={9} style={{ minWidth: expanded ? 0 : minWidth }}>{current?.page?.strategies.filter(r => !expanded || r.id === expanded).map(r => {
        const own = confirmedStrategyAuthor(r, prefs)
        return <div key={safeIdentityKey(r)} data-strategy-card={r.id} style={{
          background: 'var(--mantine-color-dark-6)', border: `1px solid ${own ? COLOR.surfaceInfoBorder : COLOR.border}`,
          borderRadius: 8, overflow: 'hidden', position: 'relative', boxShadow: expanded ? `0 5px 16px ${COLOR.bgDeep}` : undefined,
        }}>
          {own && <div aria-hidden style={{ position: 'absolute', inset: '0 auto 0 0', width: 3, background: COLOR.info }} />}
          <div style={{ overflowX: 'auto' }}><div style={{ minWidth }}><SafeStrategyRow row={r} own={!!own} expanded={expanded === r.id} maximized={maximized} activity={activity}
            onToggle={() => {
              if (expanded) { back(); return }
              invalidate(); scroll.current = viewport.current?.scrollTop ?? 0
              void requests.expand(r.id); viewport.current?.scrollTo({ top: 0 }); viewport.current?.focus()
            }} /></div></div>
          {expanded === r.id && (current?.detail ? <SafeStrategyDetail key={safeIdentityKey(current.detail)} detail={current.detail}
            onLoad={() => onLoad(current.detail!)} onContinue={() => onContinue(current.detail!)} onName={() => onName(current.detail!)} />
            : !current?.error && <Loader m="sm" size="sm" />)}
        </div>
      })}</Stack>
      {current?.loading && <Loader m="sm" size="sm" />}
      {!expanded && current?.page?.total === 0 && <Text m="sm" size="sm" c="dimmed">No strategies match these filters.</Text>}
      {!expanded && current?.page?.scope === 'current' && current.page.next_cursor && <Button mt="xs" size="xs" variant="subtle" onClick={() => void requests.more()}>Load more</Button>}
    </div>
    <Text ta="center" c="dimmed" size="xs">Vote with the thumbs reactions in Discord · Share submits your session · Load Build starts a fresh session</Text>
  </div>
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
  useEffect(() => { void window.api.authorHandoff({ action: 'share-refresh' }).catch(() => undefined) }, [])
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
  const toolbar: BoardToolbar = (total, loading, refresh) => <Group justify="space-between" py={2}>
    <Group gap="xs" wrap="nowrap"><SegmentedControl size="xs" value={view} onChange={setView}
      data={[{ value: 'current', label: 'Live' }, { value: 'frozen', label: 'Retrospectives' }]} />
      {view === 'current' && <Badge color="gray" variant="outline" size="sm">{total ?? '…'} strategies</Badge>}
    </Group>
    <Group gap="xs" wrap="nowrap">
      <Button size="xs" variant="default" leftSection={<IconBrandDiscord size={12} />} onClick={() => { actions.invalidate(); onImport() }}>Import Strategy</Button>
      <Button size="xs" variant="default" leftSection={<IconShare2 size={12} />} onClick={() => { actions.invalidate(); onShare() }}>Share Strategy</Button>
      {view === 'current' && <ActionIcon size="md" variant="default" aria-label="Refresh strategies" loading={loading} disabled={!refresh} onClick={refresh}><IconRefresh size={14} /></ActionIcon>}
    </Group>
  </Group>
  const filters = <Paper withBorder radius="md" p="sm">
    <div className="safe-strategy-filter-columns">
      <Stack gap={4}><SectionLabel>Filters</SectionLabel><div className="safe-strategy-filter-controls">
        <MultiSelect size="xs" aria-label="Mechanics" placeholder="Any type" clearable style={{ flex: 1 }}
          value={tags} onChange={setTags} maxValues={24} data={TAG_OPTIONS.slice(1)} searchable maxDropdownHeight={200} />
        <Select size="xs" aria-label="League" style={{ width: 110 }} value={league} allowDeselect={false}
          onChange={v => setLeague(v ?? '')} data={[{ value: '', label: 'All leagues' }, ...KNOWN_LEAGUES.map(v => ({ value: v, label: v }))]} />
        <TextInput size="xs" aria-label="Min div / map" placeholder="Min d/map" style={{ width: 85 }} value={min} error={minError} onChange={e => setMin(e.currentTarget.value)} />
        <Select size="xs" aria-label="Activity" style={{ width: 100 }} value={since} allowDeselect={false} onChange={v => setSince(v ?? 'all')}
          data={[{ value: 'all', label: 'All time' }, { value: '1d', label: 'Last 24h' }, { value: '3d', label: 'Last 3 days' }, { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }]} />
      </div></Stack>
      <Stack gap={4}><SectionLabel>Sort and visibility</SectionLabel><div className="safe-strategy-filter-controls">
        <Select size="xs" aria-label="Sort" style={{ flex: 1 }} value={sort} allowDeselect={false}
          onChange={v => { if (v) { setSort(v as SafeSort); setOrder(safeSortOrder(v as SafeSort)) } }}
          data={Object.entries(SAFE_SORTS).map(([value, label]) => ({ value, label }))} />
        <Button size="xs" variant="default" aria-label="Reverse sort direction" onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}>{order === 'asc' ? '↑' : '↓'}</Button>
        <Button size="xs" variant={group === 'solo' ? 'light' : 'default'} onClick={() => setGroup(group === 'solo' ? 'all' : 'solo')}>
          {group === 'solo' ? 'Show group' : 'Hide group'}
        </Button>
      </div></Stack>
    </div>
    <details className="safe-strategy-extra-filters">
      <summary style={{ fontSize: FONT.small }}>More filters{search || mapType || group === 'group' ? ' · active' : ''}</summary>
      <Group gap="xs" align="end">
        <TextInput size="xs" label="Search strategies" value={search} maxLength={120} onChange={e => setSearch(e.currentTarget.value)} />
        <Select size="xs" label="Map setup" value={mapType} allowDeselect={false} onChange={v => setMapType(v ?? '')}
          data={[{ value: '', label: 'Any setup' }, { value: '6-mod', label: '6-mod' }, { value: '8-mod', label: '8-mod' }]} />
        <Select size="xs" label="Party" value={group} allowDeselect={false} onChange={v => setGroup(v ?? 'all')}
          data={[{ value: 'all', label: 'Solo & group' }, { value: 'solo', label: 'Solo only' }, { value: 'group', label: 'Group only' }]} />
      </Group>
    </details>
  </Paper>
  return <Card withBorder p="sm" radius="md" className="safe-strategy-browser">
    {message && <Alert color="gray" p="xs" mb="xs">{message}</Alert>}
    {view === 'current' ? query !== null
      ? <SafeBoard path={'/web/v2/strategies?' + query} {...boardActions} sort={sort} order={order} onSort={changeSort} toolbar={toolbar} filters={filters} />
      : <Stack>{toolbar(null, false)}{filters}<Text size="sm" c="dimmed">Correct or clear the minimum to show matching strategies.</Text></Stack>
      : <div className="safe-strategy-retrospectives">
        {toolbar(null, false)}
        {error && <Alert color="red" p="xs">{error}<Button size="compact-xs" onClick={() => setCatalogueAttempt(v => v + 1)}>Retry</Button></Alert>}
        <PersonalRetrospectives onLoadSession={onLoadPersonal} />
        {snapshots.map(s => <Stack key={s.snapshot_key} gap="sm"><Text fw={600}>{s.league ?? 'Unknown league'} · Frozen {safeDate(s.cutoff_utc)}</Text>
          <SafeBoard title="Top score" path={`/web/v2/retrospectives/${s.snapshot_key}/strategies?limit=10&sort=score&order=desc`} {...boardActions} />
          <SafeBoard title="Top profit per map" path={`/web/v2/retrospectives/${s.snapshot_key}/strategies?limit=10&sort=profit_per_map&order=desc`} {...boardActions} />
        </Stack>)}
      </div>}
    <ManagePublicNames opened={!!naming} selectedStrategy={naming ? { id: naming.id, scope: naming.scope, snapshotKey: naming.snapshot_key } : undefined} onClose={() => setNaming(null)} />
    <Modal opened={!!candidate} onClose={() => setCandidate(null)} title={`Continue ${candidate?.title ?? 'strategy'}`} size="md" centered>
      <Stack gap="md">
        <Stack gap={6}>
          <SectionLabel style={{ color: COLOR.textFaint }}>Your next share</SectionLabel>
          <Radio.Group value={operation} onChange={v => setOperation(v as 'replace' | 'evidence')} aria-label="Your next share">
            <Group grow wrap="nowrap" align="stretch">
              {([
                { value: 'evidence', label: 'Add a run', description: 'This session joins the existing runs. Results are pooled.' },
                { value: 'replace', label: 'Replace runs', description: 'This session replaces the current runs. Votes are kept.' },
              ] as const).map(option => <Radio.Card key={option.value} value={option.value} aria-label={option.label} p="sm" radius="md"
                style={{ minWidth: 0, borderColor: operation === option.value ? COLOR.info : COLOR.borderSoft,
                  background: operation === option.value ? COLOR.surfaceInfoBg : COLOR.bgInset }}>
                <Stack gap={6}><Text size="sm" fw={600}>{option.label}</Text><Text size="sm" c="dimmed">{option.description}</Text></Stack>
              </Radio.Card>)}
            </Group>
          </Radio.Group>
        </Stack>
        <Stack gap={6}>
          <SectionLabel style={{ color: COLOR.textFaint }}>Using</SectionLabel>
          <SegmentedControl value={source} onChange={setSource} aria-label="Session to use" styles={{ root: { background: COLOR.bgInset } }}
            data={[{ value: 'current', label: 'This session' }, { value: 'fresh', label: 'A fresh session' }]} />
          <Text size="xs" c="dimmed">{source === 'current' ? 'Keeps your maps, loot and prices.' : 'Loads reusable settings into a fresh session with empty prices.'}</Text>
        </Stack>
        <Divider />
        <Stack gap={6}>
          <Button variant="filled" onClick={continueRun}>Continue</Button>
          <Button variant="subtle" color="gray" c={COLOR.textDim} onClick={() => setCandidate(null)}>Cancel</Button>
        </Stack>
      </Stack>
    </Modal>
  </Card>
}
