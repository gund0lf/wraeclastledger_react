import { app, shell, BrowserWindow, ipcMain, clipboard } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { autoUpdater } from 'electron-updater'

let clipboardInterval: NodeJS.Timeout | null = null;
let lastClipboardText = '';

function setupAutoUpdater(mainWindow: BrowserWindow): void {
  if (is.dev) return;
  autoUpdater.autoDownload         = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available',     (info) => mainWindow.webContents.send('update-available', info.version));
  autoUpdater.on('update-not-available', ()     => mainWindow.webContents.send('update-not-available'));
  autoUpdater.on('update-downloaded',    ()     => mainWindow.webContents.send('update-downloaded'));
  autoUpdater.on('error', (err) => {
    console.error('[Updater]', err?.message ?? err);
    mainWindow.webContents.send('update-error', err?.message ?? 'Unknown error');
  });
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 2 * 60 * 60 * 1000);
}

ipcMain.on('install-update', () => autoUpdater.quitAndInstall(false, true));
ipcMain.on('check-for-updates', () => {
  if (is.dev) return;
  autoUpdater.checkForUpdates().catch(() => {});
});

// ── PoE Trade stat ID cache ───────────────────────────────────────────────────
const STATS_CACHE = new Map<string, string>();
let statsFetchPromise: Promise<void> | null = null;

const PSEUDO_IDS: Record<string, string> = {
  currency: 'pseudo.pseudo_map_more_currency_drops',
  scarabs:  'pseudo.pseudo_map_more_scarab_drops',
  maps:     'pseudo.pseudo_map_more_map_drops',
};

const STAT_LOOKUPS: Record<string, string> = {
  originator:      "Originator's Memories",
  empowered:       'Empowered Mirage which covers the entire Map',
  delirious_pct:   'enchant:Players in Area are #% Delirious',
  deli_currency:   'enchant:Delirium Reward Type: Currency',
  deli_scarabs:    'enchant:Delirium Reward Type: Scarabs',
  deli_fragments:  'enchant:Delirium Reward Type: Fragments',
  deli_divcards:   'enchant:Delirium Reward Type: Divination Cards',
  deli_maps:       'enchant:Delirium Reward Type: Map Items',
  deli_essences:   'enchant:Delirium Reward Type: Essences',
  deli_unique:     'enchant:Delirium Reward Type: Unique Items',
  deli_expedition: 'enchant:Delirium Reward Type: Expedition Items',
  deli_breach:     'enchant:Delirium Reward Type: Breach Items',
  deli_delirium:   'enchant:Delirium Reward Type: Delirium',
  deli_blight:     'enchant:Delirium Reward Type: Blight Items',
  deli_abyss:      'enchant:Delirium Reward Type: Abyss Items',
  deli_gems:       'enchant:Delirium Reward Type: Gems',
  deli_fossils:    'enchant:Delirium Reward Type: Fossils',
  deli_armour:     'enchant:Delirium Reward Type: Armour',
  deli_weapons:    'enchant:Delirium Reward Type: Weapons',
  deli_jewellery:  'enchant:Delirium Reward Type: Jewellery',
  deli_incubators: 'enchant:Delirium Reward Type: Incubators',
  deli_labyrinth:  'enchant:Delirium Reward Type: Labyrinth Items',
  deli_catalysts:  'enchant:Delirium Reward Type: Catalysts',
  deli_talismans:  'enchant:Delirium Reward Type: Talismans',
};

// ── Brick mod definitions ─────────────────────────────────────────────────────
// regexTerm: short substring used in the in-game stash highlight regex
// needle:    text to match against the PoE stats API (explicit group)
interface BrickModDef {
  label:     string;
  needle:    string;
  regexTerm: string; // short unique substring for in-game stash regex (case-insensitive match)
  category:  'regular' | 'nightmare';
}

const BRICK_MOD_DEFS: BrickModDef[] = [
  // ── Regular ──
  { label: 'Reflect Physical Damage',             needle: 'Monsters reflect #% of Physical Damage',                          regexTerm: 's ref',    category: 'regular' },
  { label: 'Reflect Elemental Damage',            needle: 'Monsters reflect #% of Elemental Damage',                         regexTerm: 'fl el',    category: 'regular' },
  { label: 'Reduced Non-Curse Aura Effect',       needle: 'reduced effect of Non-Curse Auras from Skills',                   regexTerm: 'non-c',   category: 'regular' },
  { label: 'Reduced Max Resistances',             needle: '#% to all maximum Resistances',                                   regexTerm: 'o al',    category: 'regular' },
  { label: 'Cannot Regenerate Life/Mana/ES',      needle: 'cannot Regenerate Life, Mana',                                   regexTerm: 'reg',     category: 'regular' },
  { label: 'Less Recovery Rate',                  needle: 'less Recovery Rate of Life and Energy Shield',                    regexTerm: 'covery',  category: 'regular' },
  { label: 'Cannot Be Leeched From',              needle: 'cannot be Leeched from',                                         regexTerm: 'eche',    category: 'regular' },
  { label: 'High Crit Chance + Multiplier',       needle: 'Monster Critical Strike Multiplier',                              regexTerm: 'rit mu',  category: 'regular' },
  { label: 'Extra Chaos Damage + Withered',       needle: 'Physical Damage as Extra Chaos Damage',                          regexTerm: 'withe',   category: 'regular' },
  { label: 'Extra Fire Damage',                   needle: 'extra Physical Damage as Fire',                                   regexTerm: 'fire',    category: 'regular' },
  { label: 'Extra Cold Damage',                   needle: 'extra Physical Damage as Cold',                                   regexTerm: 'as col',  category: 'regular' },
  { label: 'Extra Lightning Damage',              needle: 'extra Physical Damage as Lightning',                              regexTerm: 'ghtnin',  category: 'regular' },
  { label: 'Monsters Fire Extra Projectiles',     needle: 'Monsters fire # additional Projectiles',                         regexTerm: 'onal pr', category: 'regular' },
  { label: 'Boss Damage + Attack Speed',          needle: 'Unique Boss deals #% increased Damage',                          regexTerm: 'oss de',  category: 'regular' },
  { label: 'Monster Speed (Move/Attack/Cast)',    needle: 'increased Monster Movement Speed',                                regexTerm: 'ster mo', category: 'regular' },
  { label: 'Boss More Life + AoE',                needle: 'Unique Boss has #% increased Life',                              regexTerm: 'oss ha',  category: 'regular' },
  { label: 'Monsters Increased AoE',              needle: 'Monsters have #% increased Area of Effect',                      regexTerm: 'rea of e',category: 'regular' },
  { label: 'Avoid Poison/Impale/Bleed',           needle: 'chance to avoid Poison, Impale, and Bleeding',                   regexTerm: 'mpale',   category: 'regular' },
  { label: 'Monsters Poison on Hit',              needle: 'Monsters Poison on Hit',                                         regexTerm: 'n on hi', category: 'regular' },
  { label: 'Skills Chain Additional Times',       needle: 'Chain # additional times',                                       regexTerm: 'hain 2',  category: 'regular' },
  { label: 'Increased Monster Damage',            needle: 'increased Monster Damage',                                       regexTerm: 'ster da', category: 'regular' },
  { label: 'Suppress Spell Dmg Prevented + Acc',  needle: 'amount of Suppressed Spell Damage Prevented',                    regexTerm: 'ppresse', category: 'regular' },
  { label: 'Less Curse Effect',                   needle: 'less effect of Curses on Monsters',                              regexTerm: 'ess cur', category: 'regular' },
  { label: 'Cursed with Enfeeble',                needle: 'Cursed with Enfeeble',                                           regexTerm: 'feebl',   category: 'regular' },
  { label: 'Cursed with Vulnerability',           needle: 'Cursed with Vulnerability',                                      regexTerm: 'ulnera',  category: 'regular' },
  { label: 'Cursed with Temporal Chains',         needle: 'Cursed with Temporal Chains',                                    regexTerm: 'empor',   category: 'regular' },
  { label: 'Cursed with Elemental Weakness',      needle: 'Cursed with Elemental Weakness',                                 regexTerm: 'al wea',  category: 'regular' },
  { label: 'Consecrated Ground',                  needle: 'patches of Consecrated Ground',                                  regexTerm: 'onsecr',  category: 'regular' },
  { label: 'Desecrated Ground',                   needle: 'patches of desecrated ground',                                   regexTerm: 'esecr',   category: 'regular' },
  { label: 'Shocked Ground',                      needle: 'patches of Shocked Ground',                                      regexTerm: 'hocked g',category: 'regular' },
  { label: 'Chilled Ground',                      needle: 'patches of Chilled Ground',                                      regexTerm: 'hilled g',category: 'regular' },
  { label: 'Burning Ground',                      needle: 'patches of Burning Ground',                                      regexTerm: 'urning g',category: 'regular' },
  { label: 'Reduced Block + Less Armour',         needle: 'reduced Chance to Block',                                        regexTerm: 'nce to b',category: 'regular' },
  { label: 'Suppress Spell Damage Chance',        needle: 'chance to Suppress Spell Damage',                                regexTerm: 'ppress s',category: 'regular' },
  { label: 'Reduced Crit Damage Taken',           needle: 'reduced Extra Damage from Critical Strikes',                     regexTerm: 'uced ext',category: 'regular' },
  { label: 'Extra Energy Shield from Life',       needle: 'Maximum Life as Extra Maximum Energy Shield',                    regexTerm: 'ife as e',category: 'regular' },
  { label: 'Reduced Flask Charges',               needle: 'reduced Flask Charges',                                          regexTerm: 'sk char', category: 'regular' },
  { label: 'Avoid Elemental Ailments',            needle: 'chance to Avoid Elemental Ailments',                             regexTerm: 'oid ele', category: 'regular' },
  { label: 'Physical Damage Reduction',           needle: 'Monster Physical Damage Reduction',                              regexTerm: 'hys dam', category: 'regular' },
  { label: 'Cannot Inflict Exposure',             needle: 'Players cannot inflict Exposure',                                regexTerm: 'posure',  category: 'regular' },
  { label: 'Monsters Hexproof',                   needle: 'Monsters are Hexproof',                                          regexTerm: 'xpro',    category: 'regular' },
  { label: 'Chaos + Elemental Resistances',       needle: 'Monster Chaos Resistance',                                       regexTerm: 'haos re', category: 'regular' },
  { label: 'More Monster Life',                   needle: 'more Monster Life',                                              regexTerm: 're mon',  category: 'regular' },
  { label: 'Cannot Be Stunned',                   needle: 'Monsters cannot be Stunned',                                     regexTerm: 'tunn',    category: 'regular' },
  { label: 'All Damage Ignites',                  needle: 'All Monster Damage from Hits always Ignites',                   regexTerm: 'lways i', category: 'regular' },
  { label: 'Impale on Hit',                       needle: 'chance to Impale on Hit',                                        regexTerm: 'pale on', category: 'regular' },
  { label: 'Ignite/Freeze/Shock Chance',          needle: 'chance to Ignite, Freeze and Shock on Hit',                     regexTerm: 'hock on', category: 'regular' },
  { label: 'Buffs on Players Expire Faster',      needle: 'Buffs on Players expire',                                       regexTerm: 'uffs on', category: 'regular' },
  { label: 'Less Cooldown Recovery',              needle: 'less Cooldown Recovery Rate',                                    regexTerm: 'ooldown', category: 'regular' },
  { label: 'Unique Bosses Possessed',             needle: 'Unique Bosses are Possessed',                                    regexTerm: 'ossesse',  category: 'regular' },
  { label: 'Two Unique Bosses',                   needle: 'Area contains two Unique Bosses',                                regexTerm: 'o uniqu', category: 'regular' },
  { label: 'Cannot Be Taunted/Slowed',            needle: 'Monsters cannot be Taunted',                                     regexTerm: 'aunted',  category: 'regular' },
  { label: 'Players Less Accuracy',               needle: "Players have #% less Accuracy Rating",                           regexTerm: 'ss acc',  category: 'regular' },
  { label: 'Monsters Steal Charges',              needle: 'steal Power, Frenzy and Endurance charges',                      regexTerm: 'teal p',  category: 'regular' },
  { label: 'Monsters Gain Frenzy Charges',        needle: 'Monsters gain a Frenzy Charge on Hit',                          regexTerm: 'renz',    category: 'regular' },
  { label: 'Monsters Gain Endurance Charges',     needle: 'Monsters gain an Endurance Charge on Hit',                      regexTerm: 'ndur',    category: 'regular' },
  { label: 'Monsters Gain Power Charges',         needle: 'Monsters gain a Power Charge on Hit',                           regexTerm: 'ower c',  category: 'regular' },
  { label: 'Players Less Area of Effect',         needle: 'Players have #% less Area of Effect',                           regexTerm: 'ss are',  category: 'regular' },
  { label: 'Monsters Maim on Hit',                needle: 'Monsters Maim on Hit',                                          regexTerm: 'aim on',  category: 'regular' },
  { label: 'Monsters Hinder on Hit',              needle: 'Monsters Hinder on Hit',                                        regexTerm: 'inder',   category: 'regular' },
  { label: 'Monsters Blind on Hit',               needle: 'Monsters Blind on Hit',                                         regexTerm: 'lind o',  category: 'regular' },
  { label: 'Area Contains Many Totems',           needle: 'Area contains many Totems',                                     regexTerm: 'otems',   category: 'regular' },
  { label: 'Increased Rare Monsters',             needle: 'increased number of Rare Monsters',                              regexTerm: 'rare mo', category: 'regular' },
  { label: 'Increased Magic Monsters',            needle: 'increased Magic Monsters',                                      regexTerm: 'agic mo', category: 'regular' },

  // ── Nightmare ──
  { label: 'Synthesis Boss',                      needle: 'accompanied by a Synthesis Boss',                               regexTerm: 'synth',   category: 'nightmare' },
  { label: '-20% Max Resistances',                needle: 'Players have -20% to all maximum Resistances',                  regexTerm: '20% to',  category: 'nightmare' },
  { label: '+50% Monster Block Chance',           needle: 'Chance to Block Attack Damage',                                 regexTerm: '50% ch',  category: 'nightmare' },
  { label: 'Rare Monsters Shaper-Touched',        needle: 'Shaper-Touched',                                               regexTerm: 'haper',   category: 'nightmare' },
  { label: 'Rare Monsters +1 Modifier',           needle: 'additional Modifier',                                          regexTerm: 'ditio',   category: 'nightmare' },
  { label: 'Unstable Tentacle Fiends',            needle: 'Unstable Tentacle Fiends',                                     regexTerm: 'nsta',    category: 'nightmare' },
  { label: 'Frenzy Charge + Max Frenzy',          needle: 'Maximum Frenzy Charges',                                       regexTerm: 'max fr',  category: 'nightmare' },
  { label: 'Reflect 20% Physical + Elemental',    needle: 'Monsters reflect 20% of Physical Damage',                      regexTerm: 't 20%',   category: 'nightmare' },
  { label: 'Penetrates Elemental Resistances',    needle: 'Penetrates 15% Elemental Resistances',                         regexTerm: 'enetr',   category: 'nightmare' },
  { label: 'Skills Chain + Terrain Chain',        needle: 'Projectiles can Chain when colliding',                         regexTerm: 'errain',  category: 'nightmare' },
  { label: 'Grasping Vines on Hit',               needle: 'Grasping Vines on Hit',                                        regexTerm: 'raspi',   category: 'nightmare' },
  { label: 'Drowning Orbs',                       needle: 'Drowning Orbs',                                                regexTerm: 'rown',    category: 'nightmare' },
  { label: 'Random Elemental Damage',             needle: 'Extra Damage of a random Element',                             regexTerm: 'andom',   category: 'nightmare' },
  { label: 'Massive All Resistances',             needle: '+50% Monster Physical Damage Reduction',                        regexTerm: '50% mo',  category: 'nightmare' },
  { label: 'All Damage Can Ignite/Freeze/Shock',  needle: 'All Monster Damage can Ignite, Freeze and Shock',              regexTerm: 'll dam',  category: 'nightmare' },
  { label: 'Less Flask Effect',                   needle: 'less effect of Flasks applied',                                regexTerm: 'sk ef',   category: 'nightmare' },
  { label: 'Endurance Charges + Max Endurance',   needle: 'Maximum Endurance Charges',                                    regexTerm: 'ax end',  category: 'nightmare' },
  { label: 'Shrine Buff on Unique Monsters',      needle: 'random Shrine Buff',                                           regexTerm: 'hrine',   category: 'nightmare' },
  { label: 'Searing Exarch Runes',                needle: 'Runes of the Searing Exarch',                                  regexTerm: 'xarch',   category: 'nightmare' },
  { label: 'Rare Monsters Temporarily Revive',    needle: 'Temporarily Revive on death',                                  regexTerm: 'evive',   category: 'nightmare' },
  { label: 'Poison + Duration + All Can Poison',  needle: 'increased Poison Duration',                                    regexTerm: 'oisona',  category: 'nightmare' },
  { label: 'Bloodstained Sawblades',              needle: 'Bloodstained Sawblades',                                       regexTerm: 'blade',   category: 'nightmare' },
  { label: 'Debuffs Expire Faster',               needle: 'Debuffs on Monsters expire',                                   regexTerm: 'ebuff',   category: 'nightmare' },
  { label: 'Reduced Leech Recovery',              needle: 'reduced Maximum total Life, Mana and Energy Shield Recovery per second from Leech', regexTerm: 'each re', category: 'nightmare' },
  { label: 'Rare Monsters Fracture on Death',     needle: 'Fracture on death',                                            regexTerm: 'ractur',  category: 'nightmare' },
  { label: 'Flask Triggers Meteor',               needle: 'targeted by a Meteor',                                         regexTerm: 'eteor',   category: 'nightmare' },
  { label: 'Players Less Defences',               needle: "Players have #% less Defences",                                regexTerm: 'ess def', category: 'nightmare' },
  { label: 'Extra Projectiles + Massive AoE',     needle: '100% increased Area of Effect',                               regexTerm: '100%',    category: 'nightmare' },
  { label: 'Power Charges + Max Power',           needle: 'Maximum Power Charges',                                        regexTerm: 'ax pow',  category: 'nightmare' },
  { label: 'Labyrinth Hazards',                   needle: 'Labyrinth Hazards',                                            regexTerm: 'abyri',   category: 'nightmare' },
  { label: 'Rare Monsters Volatile Cores',        needle: 'Volatile Cores',                                               regexTerm: 'vola',    category: 'nightmare' },
  { label: 'The Maven Interferes',                needle: 'The Maven interferes',                                         regexTerm: 'aven',    category: 'nightmare' },
  { label: 'Auras Affect Enemies',                needle: 'Auras from Player Skills which affect Allies also affect Enemies', regexTerm: 'ect en', category: 'nightmare' },
  { label: 'Moving Marked Ground',                needle: 'patches of moving Marked Ground',                              regexTerm: 'arked g', category: 'nightmare' },
];

// Resolved brick mod cache: label → statId
const BRICK_MOD_CACHE = new Map<string, string>();

async function ensureStatsLoaded(): Promise<void> {
  if (STATS_CACHE.size > 0) return;
  if (statsFetchPromise) return statsFetchPromise;
  statsFetchPromise = (async () => {
    try {
      const res = await fetch('https://www.pathofexile.com/api/trade/data/stats', {
        headers: { 'User-Agent': 'WraeclastLedger/1.0 (github.com/gund0lf/wraeclastledger_react)' },
      });
      if (!res.ok) return;
      const data = await res.json() as { result: { id: string; entries: { id: string; text: string }[] }[] };
      for (const group of data.result) {
        if (group.id.includes('2')) continue;
        for (const entry of group.entries) {
          for (const [key, rawNeedle] of Object.entries(STAT_LOOKUPS)) {
            if (STATS_CACHE.has(key)) continue;
            const enchantOnly = rawNeedle.startsWith('enchant:');
            const needle = enchantOnly ? rawNeedle.slice(8) : rawNeedle;
            if (enchantOnly && group.id !== 'enchant') continue;
            if (entry.text.includes(needle)) STATS_CACHE.set(key, entry.id);
          }
          if (group.id === 'explicit') {
            for (const def of BRICK_MOD_DEFS) {
              if (BRICK_MOD_CACHE.has(def.label)) continue;
              if (entry.text.includes(def.needle)) {
                BRICK_MOD_CACHE.set(def.label, entry.id);
              }
            }
          }
        }
      }
    } catch { /* silently fail */ }
  })();
  return statsFetchPromise;
}

// Returns the full resolved brick mod list (deduped by statId, includes regexTerm)
ipcMain.handle('trade:get-brick-mods', async () => {
  await ensureStatsLoaded();
  const seen = new Set<string>();
  return BRICK_MOD_DEFS
    .filter((def) => {
      const statId = BRICK_MOD_CACHE.get(def.label);
      if (!statId || seen.has(statId)) return false;
      seen.add(statId);
      return true;
    })
    .map((def) => ({
      label:     def.label,
      statId:    BRICK_MOD_CACHE.get(def.label)!,
      regexTerm: def.regexTerm,
      category:  def.category,
    }));
});

// ── Trade params ──────────────────────────────────────────────────────────────
interface TradeParams {
  league:          string;
  minIIQ:          number;
  minPack:         number;
  minIIR:          number;
  minCurrency:     number;
  minScarabs:      number;
  minMaps:         number;
  mapType:         'any' | 'regular' | '8mod' | 'nightmare' | 'originator';
  empowered:       boolean;
  minDelirious:    number;
  deliRewardTypes: string[];
  brickExclusions: string[];
}

ipcMain.handle('trade:search-maps', async (_event, params: TradeParams) => {
  await ensureStatsLoaded();

  const { league, minIIQ, minPack, minIIR, minCurrency, minScarabs, minMaps,
          mapType, empowered, minDelirious, deliRewardTypes, brickExclusions } = params;

  let corruptedOption: string | null = null;
  if (mapType === '8mod')    corruptedOption = 'true';
  if (mapType === 'regular') corruptedOption = 'false';

  const mapFilters: Record<string, { min?: number }> = {};
  if (minIIQ  > 0) mapFilters['map_iiq']     = { min: minIIQ };
  if (minPack > 0) mapFilters['map_packsize'] = { min: minPack };
  if (minIIR  > 0) mapFilters['map_iir']      = { min: minIIR };

  const statsArray: unknown[] = [];

  const pseudoFilters: { id: string; value: { min: number } }[] = [];
  if (minCurrency > 0) pseudoFilters.push({ id: PSEUDO_IDS.currency, value: { min: minCurrency } });
  if (minScarabs  > 0) pseudoFilters.push({ id: PSEUDO_IDS.scarabs,  value: { min: minScarabs  } });
  if (minMaps     > 0) pseudoFilters.push({ id: PSEUDO_IDS.maps,     value: { min: minMaps     } });
  if (pseudoFilters.length > 0) statsArray.push({ type: 'and', filters: pseudoFilters });

  if (mapType === 'originator' && STATS_CACHE.has('originator'))
    statsArray.push({ type: 'and', filters: [{ id: STATS_CACHE.get('originator')! }] });

  if (empowered && STATS_CACHE.has('empowered'))
    statsArray.push({ type: 'and', filters: [{ id: STATS_CACHE.get('empowered')! }] });

  if ((mapType === 'nightmare' || mapType === '8mod') && STATS_CACHE.has('originator'))
    statsArray.push({ type: 'not', filters: [{ id: STATS_CACHE.get('originator')! }] });

  if (minDelirious > 0 && STATS_CACHE.has('delirious_pct'))
    statsArray.push({ type: 'and', filters: [{ id: STATS_CACHE.get('delirious_pct')!, value: { min: minDelirious } }] });

  if (deliRewardTypes.length > 0) {
    const resolvedIds = deliRewardTypes
      .map((key) => STATS_CACHE.get(key))
      .filter((id): id is string => !!id)
      .map((id) => ({ id }));
    if (resolvedIds.length > 0) statsArray.push({ type: 'if', filters: resolvedIds });
  }

  if (brickExclusions.length > 0)
    statsArray.push({ type: 'not', filters: brickExclusions.map((id) => ({ id })) });

  const query = {
    query: {
      status: { option: 'any' },
      filters: {
        type_filters: {
          filters: { category: { option: 'map' }, rarity: { option: 'nonunique' } },
        },
        map_filters: { filters: mapFilters },
        ...(corruptedOption ? { misc_filters: { filters: { corrupted: { option: corruptedOption } } } } : {}),
      },
      stats: statsArray,
    },
    sort: { price: 'asc' },
  };

  try {
    const res = await fetch(
      `https://www.pathofexile.com/api/trade/search/${encodeURIComponent(league)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'WraeclastLedger/1.0 (github.com/gund0lf/wraeclastledger_react)' },
        body: JSON.stringify(query),
      }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Trade API ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = await res.json() as { id?: string };
    if (!data.id) throw new Error('No search ID in response');
    return { url: `https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}/${data.id}`, error: null };
  } catch (err: any) {
    return { url: null, error: err.message ?? 'Unknown error' };
  }
});

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    title: 'WraeclastLedger',
    show: false, autoHideMenuBar: true,
    icon,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, webviewTag: true }
  });

  mainWindow.on('ready-to-show', () => mainWindow.show());
  mainWindow.on('page-title-updated', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler((details) => { shell.openExternal(details.url); return { action: 'deny' }; });

  clipboardInterval = setInterval(() => {
    if (mainWindow.isDestroyed()) return;
    const text = clipboard.readText();
    if (text !== lastClipboardText) {
      lastClipboardText = text;
      mainWindow.webContents.send('on-clipboard-capture', text);
    }
  }, 200);

  mainWindow.on('closed', () => { if (clipboardInterval) { clearInterval(clipboardInterval); clipboardInterval = null; } });

  ensureStatsLoaded().catch(() => {});

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'));

  setupAutoUpdater(mainWindow);
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.wraeclastledger.app');
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window));
  createWindow();
  ipcMain.on('ping', () => console.log('pong'));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
