/**
 * strategyConstants.ts
 *
 * Shared types and constants for the Strategy Browser.
 * No React dependencies — safe to import from any component or util.
 */

// ─── Server types ─────────────────────────────────────────────────────────────

export interface Strategy {
  id: string;
  discord_username: string;
  discord_avatar_url?: string;
  discord_jump_url?: string | null;
  map_type?: string | null;
  map_count?: number | null;
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
  is_group_play?: boolean | null;
  posted_at: string;
  raw_export?: string | null;
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
