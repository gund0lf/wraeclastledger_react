/**
 * CHANGELOG — WraeclastLedger
 * Add new entries at the TOP. The "What's New" banner shows entries ≥ current version.
 */
export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.39',
    date: '2026-04-21',
    changes: [
      'Strategy Browser: column layout overhauled — uniform gap spacing between all columns, consistent alignment across header and rows',
      'Strategy Browser: added Cost/map column showing per-map investment cost',
      'Strategy Browser: renamed Invest → Total Invest, Profit → Total Profit',
      'Strategy Browser: Author / Strategy header shortened to Author',
      'Strategy Browser: number formatting strips trailing .0 from k-values (107.0kc → 107kc, 3.6kc stays 3.6kc)',
      'Strategy Browser: Tags column widened to 140px with uniform 6px column gap for better 3-tag display',
      'Strategy Browser: tag abbreviations limited to genuinely compound names only (emp+orig, deli, astrolabe variants, boss, mirage) — all others kept as full names',
      'Strategy Browser: removed Harbinger and Metamorph from tag options (no longer in the game)',
      'Strategy Browser: Profit/map falls back to net_profit ÷ divine_price ÷ map_count when server stored null',
      'Strategy Browser: Discord export renamed Profit/map back to Div / Map to match server bot parser',
      'App: panel layout now persists across restarts — panels remember their position, size and which are open',
      'App: Reset layout to default option added to the + Add Panel menu',
    ],
  },
  {
    version: '1.0.38',
    date: '2026-04-20',
    changes: [
      'App: panel layout now persists across restarts — resize, reorder, and close panels and your layout is remembered',
      'App: “Reset layout to default” option added to the + Add Panel menu',
      'Strategy Browser: Profit/map now falls back to computing from net_profit ÷ divine_price ÷ map_count when the server stored it as null (fixes Traceur’s missing —)',
      'Strategy Browser: Tags column widened from 78px to 105px to comfortably show 3 tags',
      'Strategy Browser: Mod column has left padding so it no longer runs directly against the tags',
    ],
  },
  {
    version: '1.0.37',
    date: '2026-04-20',
    changes: [
      'Strategy Browser: 8-mod detection fixed — now uses the strategy\'s map_type field (6-mod/8-mod) instead of the content tag',
      'Strategy Browser: restored missing fallback for strategies without raw_export but with a stored run_regex',
      'Regex: paste preview field is now cleared automatically when switching sessions or loading a strategy',
      'Regex: reset button removed — the mod picker dropdown X button serves the same purpose',
      'Regex: Set Default button enlarged and renamed to “Set Default Preset” for clarity',
      'Regex: “Their exclusions” button renamed to “Show their exclusions ↑”',
    ],
  },
  {
    version: '1.0.33',
    date: '2026-04-19',
    changes: [
      'Trade: Instant Buyout fixed — status: available is the correct API value (confirmed via PoB URL inspection; online = In Person Online, available = Instant Buyout)',
      'Trade: Brick exclusion mod list now includes all monster-type mods (Inhabited by X, Increased Variety) and missing nightmare combined mods',
      'Regex: clearing the brick mod multiselect (X button) now clears ALL exclusions including custom terms',
      'Regex: paste preview shows full mod names instead of short terms — purple for nightmare, yellow for regular',
      'Strategy Browser: Load Build now populates a “Loaded from strategy” blue box in Regex with their averages and regex (with your exclusions applied)',
      'Strategy Browser: “Show their exclusions” button pastes the author’s original regex into the preview field so you can see what they were excluding',
      'Strategy Browser: Trade modal now pre-fills IIQ/IIR/Pack/Currency from the loaded strategy when no maps are parsed',
    ],
  },
  {
    version: '1.0.32',
    date: '2026-04-19',
    changes: [
      'Regex: new sessions start with no exclusions and no hardcoded fallback — generated regex is clean by default',
      'Regex: removed manual text entry field — replaced with regex paste preview that extracts exclusion terms and shows matched mods',
      'Regex: pasted regex terms matched to brick mod list with tooltips; Apply button adds them to exclusions',
      'Regex: brick exclusion ? tooltip reworded and fake mod examples removed',
      'Regex: nightmare mods coloured purple in both the brick exclusion picker and trade modal',
      'Strategy Browser: Load Build now saves the strategy run/slam regex as saved sets with your exclusions applied',
      'Trade: Instant Buyout fixed — status: online in the API query now correctly opens with Instant Buyout on the trade site',
      'Trade: Min Tier filter added (default 16) to exclude sub-T16 maps from results',
      'Trade: Corrupted override added — explicitly set Yes/No/Any independent of map type',
      'Trade: 0% delirium option added — requires the delirium enchant to be present at >=0%',
      'Trade: button label updated to show Instant Buyout is active',
    ],
  },
  {
    version: '1.0.31',
    date: '2026-04-19',
    changes: [
      // Regex — Brick Exclusion overhaul
      'Regex: Brick Exclusions now has a searchable mod picker (same full list as the Trade modal) — selecting a mod adds its short regex term to the chip list',
      'Regex: picking mods from the list and the chip list are fully bidirectional — deselecting a mod removes its term, removing a chip deselects the mod',
      'Regex: brick exclusion dropdown uses the same grouped data (Regular / Nightmare) as the Trade modal, computed once and shared',
      'Regex: Open Trade button is now always visible, not hidden when no maps are parsed',
      'Regex: new sessions start with empty brick exclusions — no pre-selected mods on a fresh session',
      'Regex: reset button clears all exclusions instead of restoring old hardcoded defaults',
      // Trade modal — brick exclusion sync
      'Trade: opening the trade modal auto-selects mods whose regexTerm is already in your brick exclusions',
      'Trade: → Sync to Regex Exclusions button pushes selected trade exclusions back as regex chip terms',
      'Trade: brick exclusion dropdown deduped by stat ID — no more Mantine duplicate options crash',
      // Map Analyzer tooltip
      'Map Analyzer: hover tooltip text colour fixed — explicit colour override prevents near-black text on dark background',
      // PoE Trade— mod list
      'Trade: brick mod definitions now include regexTerm for each of ~95 regular and nightmare map mods',
      'Trade: 8-mod map type now also excludes Originator maps (NOT originator implicit applied)',
    ],
  },
  {
    version: '1.0.30',
    date: '2026-04-19',
    changes: [
      // Map Analyzer
      'Map Analyzer: regular T16 maps now analysed with their own mod pool — separate from Originator/Uber mods',
      'Map Analyzer: grid auto-dispatches to correct analyser per map (isOriginator flag); Originator vs Regular T16 badge on tooltip + detail bar',
      'Map Analyzer: quality thresholds updated — Excellent = 4+ S/A mods (6 possible total, up from 3)',
      'Map Analyzer: multi-tab support — Tab 1/Tab 2 buttons appear when maps exceed the layout slot count',
      'Map Analyzer: Map Device layout auto-disabled when >20 maps are parsed',
      'Map Analyzer: chisel logic corrected — both Avarice and Proliferation bonuses are flat additive after the atlas multiplier, not multiplicative',
      // PoE Trade integration
      'Regex: "Open Trade" button opens a full search modal — map type (Regular/8-mod/Nightmare/Originator), Empowered Mirage toggle, Min IIQ/IIR/Pack, pseudo currency/scarabs/maps, delirium %, reward type multiselect',
      'Trade: delirium reward type uses OR logic (IF group) — map needs ANY of the selected types, not all',
      'Trade: delirium % filter correctly uses the enchant stat, not the explicit duplicate',
      'Trade: Originator implicit and Empowered enchant stat IDs fetched from PoE stats API at startup and cached; PoE2 groups skipped to avoid duplicates',
      'Trade: Nightmare type search uses NOT originator implicit + pseudo currency/scarabs/maps min to identify uber-mod maps',
      'Trade: modal auto-detects map type and empowered flag from your current parsed session',
      'Trade: pseudo stat IDs corrected to _currency_drops, _scarab_drops, _map_drops',
      'Regex: poe.re button removed — Open Trade replaces it',
    ],
  },
  {
    version: '1.0.27',
    date: '2026-04-18',
    changes: [
      'Regex: removed Sinistral/Dextral sections — 250-char limit makes them impractical',
      'Regex: poe.re button fixed (was 404), renamed to "Open poe.re", moved next to Save Run/Save Slam',
      'Map Analyzer: removed Sinistral/Dextral recommendation system and Paste tab',
      'Map Analyzer: grid now colors maps by quality tier (Excellent/Good/Decent/Standard based on S+A mod count)',
      'Map Analyzer: chisel recommendation (Avarice/Proliferation) shown as dot on each map cell and in detail bar',
      'Map Analyzer: summary badges now show quality tier counts and chisel counts',
    ],
  },
  {
    version: '1.0.26',
    date: '2026-04-18',
    changes: [
      'Fix: Excluded drops and Gem leveling lines restored to Discord export (were incorrectly removed in v1.0.25)',
      'Strategy Browser: Excluded drops now shown in expanded strategy card (parsed from raw export)',
      'Strategy Browser: Gem leveling now shown in expanded strategy card with buy/sell/net breakdown',
      'Import modal: Excluded drops and Gem leveling now shown when analysing a pasted export',
    ],
  },
  {
    version: '1.0.25',
    date: '2026-04-18',
    changes: [
      'Dashboard: Investment and Loot gain rows now show divine equivalent in grey (e.g. 158876c (491.88d))',
      'Atlas Calc: Atlas Bonus removed from the multiplier — it only affects Quantity, not all stats. Now shown as a separate note below the multiplier',
      'Dashboard: Quantity projection correctly adds the flat +25 IIQ from Atlas Bonus on top of the multiplier',
      'Strategy Browser: Invest and Profit columns now show divine sub-text in row and expanded card',
      'Strategy Browser: Div/map column renamed to Profit/map — the value is net profit in divines per map',
      'Discord export: removed Excluded drops and Gem leveling lines — app-internal info not relevant for strategy sharing',
      'Discord export: Build Type label renamed to Tags',
      'Discord export: Div / Map renamed to Profit/map',
      'Load Build: now correctly loads deli orb price, astrolabe count and price from raw export',
    ],
  },
  {
    version: '1.0.24',
    date: '2026-04-18',
    changes: [
      'Hotfix: bump store to v14 so mirageBonus → atlasBonus migration runs on existing sessions — Atlas Bonus now correctly preserved on update',
    ],
  },
  {
    version: '1.0.23',
    date: '2026-04-18',
    changes: [
      'Fix: Discord export now correctly accounts for baseline deduction and gem buy offset — Total Return and Net Profit now match the dashboard exactly',
      'Fix: Atlas Tree auto-apply no longer leaves the node stats overlay or pathofpathing stats panel open',
      'Renamed: "Mirage League" bonus is now labelled "Atlas Bonus" in Atlas Calc (field renamed atlasBonus)',
      'Strategy Browser: server URL field removed — server is now always the live endpoint',
    ],
  },
  {
    version: '1.0.22',
    date: '2026-04-17',
    changes: [
      'Strategy Browser: delirium orbs and astrolabe shown as headers in expanded strategy view',
      'Strategy Browser: Load Build Settings now also loads delirium orb type/qty and astrolabe type',
      'Strategy Browser: Import modal now shows deli orbs and astrolabe badges when present',
      'Share: astrolabe tag auto-added to build type tags when astrolabe is configured in Advanced Costs',
      'Investment: scarab cost field widened (was getting squished)',
      'Atlas Tree: auto-reads stats and applies to Atlas Calc after URL is imported or loaded from a build',
    ],
  },
  {
    version: '1.0.21',
    date: '2026-04-17',
    changes: [
      '8-mod auto-detect: now requires maps to be corrupted — Cartography Scarab of Risk no longer incorrectly flips sessions to 8-mod',
      'Discord export: delirium orbs now included (type, count, % delirious, cost/map)',
      'Discord export: slam regex omitted for 8-mod maps (corrupted maps cannot be exalted)',
      'Discord export: tag abbreviations in strategy list (emp+orig, a:enshr, etc.) — full name still shown on hover',
      'Dashboard: gem buy-back accounting — when gem name is configured and gems are excluded from loot CSV, buy cost is added back so gem activity is neutral to map profit',
      'Server (bot): incomplete exports now rejected — DM sent listing missing fields; message deleted from channel',
      'Server (bot): astrolabe tags auto-assigned from astrolabe type name in export',
      'Server (bot): delirium orbs parsed from export',
    ],
  },
  {
    version: '1.0.20',
    date: '2026-04-15',
    changes: [
      'Build fix: escaped quotes in Gem Leveling description',
      'Map subtype detection: sessions loaded from storage now re-detect Empowered Mirage / Originator from rawText — fixes wrong \'regular\' tag on old sessions',
      'Share: subtype tag detection uses rawText fallback for all maps, not just stored flags',
      'Discord export: slam regex suppressed for 8-mod maps (corrupted, can\'t exalt)',
      'Discord export: astrolabe line added when astrolabe is configured',
      'Share modal: teal alert when an astrolabe is set — prompts user to verify count before sharing',
      'Strategy Browser: astrolabe tags added (generic + per-type)',
      'Regex panel: 8-mod / Nightmare maps suppress slam with a note; poe.re button copies run regex and opens poe.re/maps',
      'Dashboard: baseline import tip explaining the investment double-dip risk',
    ],
  },
  {
    version: '1.0.19',
    date: '2026-04-15',
    changes: [
      'Gem Leveling: now tracks buy price + sell price separately — shows net gem P&L',
      'Gem Leveling: add gem name to auto-exclude matching items when a loot CSV is imported',
      'Gem Leveling: buy/sell/net breakdown shown in the Gem Leveling section of Advanced Costs',
      'Gem Leveling: export shows buy total, sell total, and net P&L as a separate note',
      'Gem badge now shows net P&L in green/red (positive/negative) instead of a flat total',
    ],
  },
  {
    version: '1.0.18',
    date: '2026-04-15',
    changes: [
      'Notes: now per-session — saved and loaded with each session, cleared on new session',
      'Gem leveling: removed from investment cost — it is side income, not a map expense',
      'Gem leveling: now shown as a separate violet “Side income” badge below investment costs',
      'Eater/Exarch tags: removed from scarab auto-detection (they are atlas tree nodes, not scarabs)',
      'Eater/Exarch: still correctly auto-detected from atlas tree node stats when you Read Stats',
    ],
  },
  {
    version: '1.0.17',
    date: '2026-04-15',
    changes: [
      'Regex: Brick Exclusions editor in Regex panel — add/remove terms, live preview, reset to defaults',
      'Regex: generated run/slam regex now uses your saved exclusion list',
    ],
  },
  {
    version: '1.0.16',
    date: '2026-04-14',
    changes: [
      'Notes tab restored: global scratchpad that persists across sessions (never cleared)',
      'Investment: Gem Leveling section in Advanced Costs — tracked separately from profit',
      'Export: excluded drops listed in the Discord export with names and values',
      'Export: gem leveling shown as optional income note when filled',
      'Share modal: warning when investment costs are 0',
      'Strategy Browser: map count column no longer shows \"m\" suffix',
      'Strategy Browser: Eater of Worlds + Searing Exarch tags added',
      'Atlas Tree: Eater/Exarch auto-detected from tree node group titles',
      'Atlas Calc: wizard now skips to done when a real tree URL is loaded (fixes Load Build Settings annoyance)',
      'Regex: exclusion list is now configurable per session (\"regexExclusions\" in settings)',
    ],
  },
  {
    version: '1.0.15',
    date: '2026-04-14',
    changes: [
      'Dashboard: multiplier now includes Mirage League +25% flat IIQ — was showing 0.25× less than Atlas Calc',
      'Strategy Browser: column headers now perfectly aligned with data rows',
      'Strategy Browser: Tags column wider (96px, 3 chips visible), better use of available space',
      'Strategy Browser: map-type tags (regular, originator, empowered etc.) now show tooltip on hover',
      'Sessions: Import on left, Share on right',
      'Atlas Tree: Apply to Calc button moved to toolbar (visible after Read Stats)',
      'App: version number shown in title bar next to WRAECLASTLEDGER',
    ],
  },
  {
    version: '1.0.14',
    date: '2026-04-14',
    changes: [
      'Strategy Browser: session notes field in Share modal — shown in the browser and import modal',
      'Atlas Tree: import URL button (📎) — paste any pathofpathing.com URL to load that tree',
      'Atlas Tree: “Apply to Calc” button in stats overlay auto-fills small nodes, Mounting Modifiers, fragments',
      'Sessions: panel now scrolls the entire card when history is long',
    ],
  },
  {
    version: '1.0.13',
    date: '2026-04-14',
    changes: [
      'Notes tab: per-session freeform notes saved with each session (Map Log tabset)',
      'Investment: clearer descriptions on Rolling Costs and Split Session sections',
      'Sessions: notes saved/loaded alongside maps and loot when using Save/Update/Load',
    ],
  },
  {
    version: '1.0.12',
    date: '2026-04-14',
    changes: [
      'Sessions: history list now properly scrolls when there are many sessions',
      'Sessions: Share and Import buttons added directly to the Sessions panel',
      'Investment: reset button (×) clears all costs while keeping divine price',
      'Atlas Calc: improved tooltip hints on Mounting Modifiers and Multiplying Modifiers',
    ],
  },
  {
    version: '1.0.11',
    date: '2026-04-14',
    changes: [
      'Sessions: Save as New no longer requires maps to be parsed',
      'Strategy Browser: Author column now shows strategy name (if set); tag column shows multi-tag chips with overflow tooltip',
      'Strategy Browser: Invest column now uses consistent fc() formatting matching Profit (e.g. 6.7kc)',
      'Strategy Browser: Date column hidden by default — click the ··· header to toggle it back on',
      'Strategy Browser: map subtype tags added (regular, originator, empowered, empowered-originator, nightmare, mixed)',
      'Strategy Browser: Share modal auto-detects map subtype from parsed maps + merges atlas tree tags',
      'Atlas Tree: reading stats now infers strategy tags from allocated node group titles (Delirium, Beyond etc.)',
    ],
  },
  {
    version: '1.0.10',
    date: '2026-04-14',
    changes: [
      'Map parser: Strategy Browser now appears as a default tab next to Map Log — no more manual adding',
      'Map parser: fixed mod count for corrupted and Nightmare maps — 8-mod detection now correct',
      'Map parser: detects Originator maps, Empowered Mirage maps, Nightmare maps, and corrupted maps',
      'Map parser: strips PoE color tags (<tag>{content}) before parsing — corrupted map mods now parse correctly',
      'Map parser: all four detection fields stored per map for future statistics use',
    ],
  },
  {
    version: '1.0.9',
    date: '2026-04-14',
    changes: [
      'Strategy Browser: multi-select type tag filter — filter by Delirium + Beyond + Legion simultaneously',
      'Strategy Browser: league filter — show only Mirage / Dawn of the Hunt / etc. strategies',
      'Discord export: league name included automatically (auto-detected from poe.ninja on startup)',
      'Atlas Calc: map type auto-detected from parsed maps — switches 6-mod ↔ 8-mod when ≥4 maps confirm it',
    ],
  },
  {
    version: '1.0.8',
    date: '2026-04-14',
    changes: [
      'Atlas Tree: Read Stats now captures ALL node groups (Beyond, Delirium, Shrines etc.) — fixed lazy-render issue',
      'Atlas Calc: Mirage League +25% flat IIQ bonus toggle — on by default, turns off next league',
      'Strategy Browser: time period filter — All time / Last 24h / 3 days / 7 days',
      'Strategy Browser: Boss Rush and Mirage Rush added as strategy type tags',
      'Strategy Browser: multiplier export now includes Mirage League bonus when active',
    ],
  },
  {
    version: '1.0.7',
    date: '2026-04-14',
    changes: [
      'Strategy Browser: Discord export and import moved here — the natural home for community sharing',
      'Strategy Browser: "Share My Session" button — export preview with tag selector, one-click copy',
      'Strategy Browser: "Import" button — analyse any export at your current divine price',
      'Map Log: simplified back to pure map tracking — no export clutter',
      'Sessions panel: simplified — session management only, no import modal',
      'poe.ninja: removed dead getindexstate endpoint call — no more 404 console noise',
      'DevTools no longer open automatically in production builds',
    ],
  },
  {
    version: '1.0.6',
    date: '2026-04-14',
    changes: [
      // Strategy Browser
      'Strategy Browser: community strategy feed — browse builds posted by your group',
      'Strategy Browser: filter by build type (Delirium, Legion, Breach, etc.), min div/map, and sort',
      'Strategy Browser: "Load Build Settings" imports scarabs, chisel, and atlas tree in one click',
      'Strategy Browser: "View in Discord" button links directly to the source message for voting',
      'Strategy Browser: strategy scores via 👍/👎 Discord reactions — sort by Top Rated',
      'Strategy Browser: regex displayed with one-click copy buttons',

      // Discord export
      'Discord export: optional Build Type tag selector — overrides auto-detection from scarabs',
      'Discord export: tag appears in Strategy Browser and is filterable',

      // Atlas Tree
      'Atlas Tree: reloads automatically when "Load Build Settings" is used',
      'Atlas Tree: correctly persists per-session — load/new session always shows the right tree',

      // App polish
      'Map Analyzer: stash grid and legend centered',
      'Dashboard: stat box labels embedded in box, projected values larger',
      'Dashboard: loot list uses smart load-more (25 at a time)',
      'Dashboard: clearing loot now asks for confirmation',
      'Investment: cost badges centered, divine price box properly aligned',
      'Investment: Advanced Costs sections start collapsed',

      // Data fixes
      'Scarab list: fully corrected against wiki — fixed typos, added 11 missing entries',
      'Atlas Calc: "Uncharted Realms" corrected to "Multiplying Modifiers"',
      'Content Security Policy: HTTP strategy servers now work alongside HTTPS',
    ],
  },
  {
    version: '1.0.4',
    date: '2026-04-14',
    changes: [
      'Atlas Tree: tree persists per-session and resets on new session',
      'Dashboard: stat boxes redesigned — labels inside, larger projected values',
      'Dashboard: loot smart load-more, clear confirmation, loot fills remaining space',
      'Investment: cost badges centered, divine price box aligned',
      'Investment: Advanced Costs sections start collapsed',
      'Map Analyzer: layout dropdown (Map Tab / Regular / Quad / Map Device)',
      'Map Analyzer: stash grid centered',
      'Atlas Calc: wizard resets correctly on session change, pill edit goes back to single question',
      'Scarab list: corrected against wiki, 11 missing entries added',
      'Atlas Calc: "Uncharted Realms" → "Multiplying Modifiers"',
      'Auto-updater: public repo, background checks working',
    ],
  },
  {
    version: '1.0.1',
    date: '2026-04-13',
    changes: [
      'Merged Statistics + Loot into a single Dashboard panel with collapsible sections',
      'Advanced Costs modal: scrollable, all sections always accessible',
      'Investment: divine price and rolling cost in a boxed layout',
      'Investment: collapsible cost sections, active costs shown as clickable badges',
      'Atlas Calc: step-by-step wizard for first-time setup; compact pill view after',
      'Atlas Tree: URL saves on every navigation, included in Discord export',
      'Discord export: readable markdown format, imports from both raw and rendered',
      'Scarab clear (×) button inside the autocomplete field — no layout shift',
      'Split session: price-per-split field, auto-counts from parsed maps',
      'Chisel: Cartographer added, bonus correctly shows +10% Quantity',
      'App title renamed to WraeclastLedger throughout',
      'Installer now prompts for installation directory',
      'Check for Updates button in toolbar',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-04-11',
    changes: [
      'Initial release',
      'Map Log with live clipboard capture (Ctrl+C in-game)',
      'Atlas Calc: multiplier from fragments, nodes, and mounting bonuses',
      'Investment panel: scarabs, chisel, delirium orbs, astrolabes, split session',
      'Statistics: base → projected with chisel and quality awareness',
      'Loot tracker: baseline / return CSV diff view with category breakdown',
      'Regex generator with trimmed mean (run / slam filters)',
      'Map Analyzer: stash grid + paste analyzer for T16.5 Originator maps',
      'Atlas Tree viewer via pathofpathing.com',
      'Session save, load, rename, delete',
      'Discord export and import (markdown format)',
      'Auto-update via GitHub Releases',
    ],
  },
];
