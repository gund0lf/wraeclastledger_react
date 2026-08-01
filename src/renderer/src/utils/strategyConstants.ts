/**
 * strategyConstants.ts
 *
 * Shared types and constants for the Strategy Browser.
 * No React dependencies — safe to import from any component or util.
 */

// ─── Strategy server base URL ─────────────────────────────────────────────────
// Single home for the API base (Browser fetches + game-data manifest fetch).
// Dev override for local end-to-end testing against the docker-compose stack
// (e.g. `set VITE_STRATEGY_API_URL=http://localhost:3000` before `npm run dev`).
// Never set in production builds — the default stays the live API.

const DEFAULT_API_URL = 'https://wledger.richardpruett.com';
export const STRATEGY_API_URL: string =
  (import.meta.env.VITE_STRATEGY_API_URL as string | undefined) || DEFAULT_API_URL;

// ─── Server types ─────────────────────────────────────────────────────────────

export interface Strategy {
  id: string;
  discord_username: string;
  discord_jump_url?: string | null;
  map_type?: string | null;
  map_count?: number | null;
  observed_mod_average?: number | null;
  observed_mod_sample_size?: number | null;
  multiplier?: number | null;
  avg_quant?: number | null;
  avg_rarity?: number | null;
  avg_pack?: number | null;
  avg_currency?: number | null;
  per_map_cost?: number | null;
  total_invest?: number | null;
  net_profit?: number | null;
  div_per_map?: number | null;
  divine_price?: number | null;
  chisel?: string | null;
  scarabs?: { name: string; cost: number }[] | null;
  atlas_tree_url?: string | null;
  run_regex?: string | null;
  slam_regex?: string | null;
  type_tag?: string | null;
  strategy_name?: string | null;
  strategy_notes?: string | null;
  score?: number | null;
  league?: string | null;
  is_group_play?: boolean | null;
  // Optional author-declared metadata (server migration 008 / shared-metadata
  // batch 2026-07). All nullable — absence = no claim, never penalised.
  session_minutes?: number | null;
  group_size?: number | null;
  atlas_points?: number | null;
  atlas_points_max?: number | null;
  posted_at: string;
  raw_export?: string | null;
  // Strategy versioning (server migration 011): revision counter starts at 1;
  // updated_at is null until the first update. Both public + safe.
  current_revision?: number | null;
  updated_at?: string | null;
  // Evidence-pooling fields are additive and optional until the coordinated
  // server slice is deployed. Cards remain fully usable against the legacy
  // response shape; when present these drive the audit-friendly pool summary.
  evidence_run_count?: number | null;
  evidence_map_count?: number | null;
  evidence_generation?: number | null;
  setup_fingerprint?: string | null;
  game_data_revision?: number | null;
  game_data_patch_version?: string | null;
}

export interface ApiResponse {
  total: number;
  limit: number;
  offset: number;
  strategies: Strategy[];
}

// ─── Tag options ──────────────────────────────────────────────────────────────

export const TAG_OPTIONS = [
  { value: '',                    label: '— No tag (auto-detect) —' },
  { value: 'regular',             label: 'Regular' },
  { value: 'originator',          label: 'Originator' },
  { value: 'empowered',           label: 'Empowered' },
  { value: 'empowered-originator',label: 'Empowered + Originator' },
  { value: 'nightmare',           label: 'Nightmare' },
  { value: 'mixed',               label: 'Mixed (map types)' },
  { value: 'delirium',    label: 'Delirium' },
  { value: 'legion',      label: 'Legion' },
  { value: 'breach',      label: 'Breach' },
  { value: 'harvest',     label: 'Harvest' },
  { value: 'expedition',  label: 'Expedition' },
  { value: 'ritual',      label: 'Ritual' },
  { value: 'abyss',       label: 'Abyss' },
  { value: 'blight',      label: 'Blight' },
  { value: 'beyond',      label: 'Beyond' },
  { value: 'incursion',   label: 'Incursion' },
  { value: 'betrayal',    label: 'Betrayal' },
  { value: 'essence',     label: 'Essence' },
  { value: 'divination',  label: 'Divination' },
  { value: 'ultimatum',   label: 'Ultimatum' },
  { value: 'kalguur',     label: 'Kalguur' },
  { value: 'heist',       label: 'Heist' },
  { value: 'ambush',      label: 'Ambush' },
  { value: 'cartography', label: 'Cartography' },
  { value: 'mercenaries', label: 'Mercenaries' },
  { value: 'trarthus',    label: 'Trarthus' },
  { value: 'boss-rush',   label: 'Boss Rush' },
  { value: 'mirage-rush', label: 'Mirage Rush' },
  { value: 'eater',       label: 'Eater of Worlds' },
  { value: 'exarch',      label: 'Searing Exarch' },
  { value: 'astrolabe',           label: 'Astrolabe (any)' },
  { value: 'astrolabe-templar',   label: 'Astrolabe: Templar (Originator)' },
  { value: 'astrolabe-enshrouded',label: 'Astrolabe: Enshrouded (Delirium Mirror)' },
  { value: 'astrolabe-timeless',  label: 'Astrolabe: Timeless (Legion)' },
  { value: 'astrolabe-grasping',  label: 'Astrolabe: Grasping (Breach)' },
  { value: 'astrolabe-nameless',  label: 'Astrolabe: Nameless (Ritual)' },
  { value: 'astrolabe-runic',     label: 'Astrolabe: Runic (Expedition)' },
  { value: 'astrolabe-fruiting',  label: 'Astrolabe: Fruiting (Harvest)' },
  { value: 'astrolabe-fungal',    label: 'Astrolabe: Fungal (Blight)' },
  { value: 'astrolabe-chaotic',   label: 'Astrolabe: Chaotic (Ultimatum)' },
  { value: 'astrolabe-lightless', label: 'Astrolabe: Lightless (Abyss)' },
];

export const ALL_TYPE_TAGS = TAG_OPTIONS.slice(1).map((t) => t.value);

export const TAG_COLORS: Record<string, string> = {
  regular: 'gray', originator: 'orange', empowered: 'violet',
  'empowered-originator': 'grape', nightmare: 'red', mixed: 'dark',
  delirium: 'grape', legion: 'yellow', breach: 'violet', harvest: 'green',
  expedition: 'orange', ritual: 'red', abyss: 'dark', blight: 'lime',
  beyond: 'pink', incursion: 'cyan', betrayal: 'indigo', essence: 'teal',
  divination: 'blue', harbinger: 'gray', titanic: 'orange', torment: 'dark',
  ultimatum: 'red', kalguur: 'yellow', heist: 'dark', metamorph: 'grape',
  ambush: 'cyan', cartography: 'gray', 'boss-rush': 'red', 'mirage-rush': 'violet',
  mercenaries: 'orange', trarthus: 'teal',
  eater: 'blue', exarch: 'red',
  'astrolabe': 'teal', 'astrolabe-templar': 'teal', 'astrolabe-enshrouded': 'grape',
  'astrolabe-timeless': 'yellow', 'astrolabe-grasping': 'violet', 'astrolabe-nameless': 'red',
  'astrolabe-runic': 'orange', 'astrolabe-fruiting': 'green', 'astrolabe-fungal': 'lime',
  'astrolabe-chaotic': 'pink', 'astrolabe-lightless': 'dark',
};

// ─── Map-type tags ────────────────────────────────────────────────────────────

export const MAP_TYPE_TAGS = new Set([
  'regular', 'originator', 'empowered', 'empowered-originator', 'nightmare', 'mixed',
]);

export const MAP_TYPE_LABELS: Record<string, string> = {
  regular:               'Regular T16 maps (no enchant, no implicit)',
  originator:            "Originator's Memories implicit (+1 Tier beyond T16)",
  empowered:             'Empowered Mirage enchant (covers entire map)',
  'empowered-originator':'Empowered Mirage enchant + Originator\'s Memories',
  nightmare:             'Nightmare Maps (8-mod, Chaos-only modification)',
  mixed:                 'Mixed batch of different map types',
};

// ─── Display abbreviations ────────────────────────────────────────────────────

export const TAG_SHORT: Record<string, string> = {
  'empowered-originator': 'emp+orig',
  'empowered':            'emp',
  'boss-rush':            'boss',
  'mirage-rush':          'mirage',
  'delirium':             'deli',
  'astrolabe':            'astro',
  'astrolabe-templar':    'a:templ',
  'astrolabe-enshrouded': 'a:enshr',
  'astrolabe-timeless':   'a:time',
  'astrolabe-grasping':   'a:grasp',
  'astrolabe-nameless':   'a:name',
  'astrolabe-runic':      'a:runic',
  'astrolabe-fruiting':   'a:fruit',
  'astrolabe-fungal':     'a:fung',
  'astrolabe-chaotic':    'a:chaos',
  'astrolabe-lightless':  'a:light',
};

// ─── Strategy Browser sorting ─────────────────────────────────────────────────
// Mirrors the server's SORT_EXPR allow-list (api/server.js). Each key's default
// direction matches the server default so the header arrow is truthful before
// the user ever sends an explicit ?order=. div_per_hour is NEVER the default
// sort (locked decision — self-reported time must not outrank div/map) and is
// computed server-side from author-declared session_minutes, NULLS LAST.

export type SortKey =
  | 'posted_at' | 'div_per_map' | 'net_profit' | 'score'
  | 'least_invest' | 'cost_per_map' | 'div_per_hour';
export type SortOrder = 'asc' | 'desc';

export const SORT_DEFAULT_DIR: Record<SortKey, SortOrder> = {
  posted_at:    'desc',
  div_per_map:  'desc',
  net_profit:   'desc',
  score:        'desc',
  least_invest: 'asc',
  cost_per_map: 'asc',
  div_per_hour: 'desc',
};

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'posted_at',    label: 'Newest' },
  { value: 'div_per_map',  label: 'Best d/map' },
  { value: 'div_per_hour', label: 'Best d/hour' },
  { value: 'net_profit',   label: 'Most profit' },
  { value: 'cost_per_map', label: 'Cheapest /map' },
  { value: 'least_invest', label: 'Least invest' },
  { value: 'score',        label: 'Top rated' },
];

// ─── Strategy Browser row layout ─────────────────────────────
// Single source of truth for the column widths shared by the header row
// (StrategyBrowserModule) and every data row (StrategyCard). Both render the
// same CSS grid, so cards cannot drift when their content differs. GAP and PAD_X
// are the grid's column gap and horizontal padding, which must match on both sides.

export const BROWSER_COLS = {
  chevron: 22,
  author:  88,
  tags:    140,
  mod:     44,
  maps:    32,
  cost:    66,
  invest:  110,
  profit:  114,
  score:   36,
  dph:     46,
  dpm:     74,   // Profit/map — fixed compact rightmost value column (was flex)
} as const;

export const BROWSER_ROW_GAP = 6;
export const BROWSER_ROW_PAD_X = 10;
/** Full collapsed-row grid plus gaps/padding. Below this, preserve the table and
 * expose horizontal scrolling instead of silently clipping metric columns. */
export const BROWSER_MIN_CONTENT_WIDTH = 860;

// Header and collapsed cards share this exact grid. The former paired flex
// layouts drifted whenever content or border geometry differed between them.
export const BROWSER_GRID_TEMPLATE =
  `${BROWSER_COLS.chevron}px ${BROWSER_COLS.author}px minmax(${BROWSER_COLS.tags}px, 1fr) ` +
  `${BROWSER_COLS.mod}px ${BROWSER_COLS.maps}px ${BROWSER_COLS.cost}px ` +
  `${BROWSER_COLS.invest}px ${BROWSER_COLS.profit}px ${BROWSER_COLS.score}px ` +
  `${BROWSER_COLS.dph}px ${BROWSER_COLS.dpm}px`;
