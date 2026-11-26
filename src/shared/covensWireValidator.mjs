// Wire validation mirrors the API and bot. IDs come from the bundled game data.
import { BUNDLED_MANIFEST as manifest } from './gameData/manifest';
const rules = manifest.leagueRules.Covens;
const catalogue = {
  tree: rules.atlasTreeVersion, slots: rules.threadSlots, cap: rules.threadCap,
  threads: manifest.threads.map(item => item.id), embers: manifest.embers.map(item => item.id),
  orbs: manifest.deliriumOrbs.filter(item => item.status === 'active').map(item => item.id),
  choices: Object.fromEntries(Object.entries(manifest.atlasTrees[rules.atlasTreeVersion].choices)
    .map(([node, entry]) => [node, entry.options.map(option => Number(option.id))])),
};
const families = ['mirage', 'beyond', 'sentinel', 'wildwood', 'delirium'];
const rewards = ['armour','blight items','currency','divination cards','essences','fragments','gems','harbinger','incubators','jewellery','labyrinth items','map items','threads','unique items','weapons','fossils','scarabs'];
const int = (v, max) => Number.isSafeInteger(v) && v >= 0 && v <= max;
const shape = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const unique = (rows, get) => new Set(rows.map(get)).size === rows.length;
const pair = v => Array.isArray(v) && v.length === 2;
function price(v) {
  return v === null || (shape(v,['unit','amount']) && ['chaos','divine'].includes(v.unit)
    && Number.isFinite(v.amount) && v.amount >= 0 && v.amount <= 1e9);
}
function observed(v,maps) {
  return v === null || (shape(v,['sum','count']) && int(v.count,maps) && v.count > 0
    && int(v.sum,100000 * v.count));
}
function observations(v,maps) {
  if (v === null) return true;
  if (!shape(v,['resolution','levels','rewards']) || !['exact','bands'].includes(v.resolution)
    || !Array.isArray(v.levels) || v.levels.length < 1 || v.levels.length > (v.resolution === 'exact' ? 101 : 11)
    || !v.levels.every(p => pair(p) && int(p[0],100) && (v.resolution === 'exact' || p[0] % 10 === 0)
      && int(p[1],maps) && p[1] > 0) || !unique(v.levels,p => p[0])) return false;
  const samples = v.levels.reduce((n,p) => n + p[1],0);
  // Bands are recorded by upper endpoint: 0, 1–10, 11–20, ... 91–100.
  return samples <= maps && Array.isArray(v.rewards) && v.rewards.length <= rewards.length
    && v.rewards.every(p => pair(p) && rewards.includes(p[0]) && int(p[1],samples) && p[1]>0)
    && unique(v.rewards,p => p[0]) && v.rewards.reduce((n,p) => n+p[1],0) <= samples;
}

function validCovens(v,maps) {
  if (!int(maps,100000) || !shape(v,['version','atlas_drops','more_threads','threads','ember','atlas','orbs','delirium','encounters'])
    || v.version !== 1 || !observed(v.atlas_drops,maps) || !observed(v.more_threads,maps)) return false;
  if (v.threads !== null && (!Array.isArray(v.threads) || v.threads.length > catalogue.slots
    || !v.threads.every(r => shape(r,['slot','id','paid','granted','paused','price_each'])
      && int(r.slot,catalogue.slots) && r.slot>0 && catalogue.threads.includes(r.id)
      && int(r.paid,catalogue.cap) && int(r.granted,catalogue.cap)
      && typeof r.paused === 'boolean' && price(r.price_each)) || !unique(v.threads,r => r.slot))) return false;
  if (v.ember !== null && (!shape(v.ember,['id','price_each']) || !catalogue.embers.includes(v.ember.id) || !price(v.ember.price_each))) return false;
  if (v.atlas !== null && (!shape(v.atlas,['version','choices']) || v.atlas.version !== catalogue.tree
    || !Array.isArray(v.atlas.choices) || v.atlas.choices.length > Object.keys(catalogue.choices).length
    || !v.atlas.choices.every(r => shape(r,['node','option']) && int(r.node,65535) && Object.hasOwn(catalogue.choices,r.node)
      && (r.option === null || catalogue.choices[r.node].includes(r.option))) || !unique(v.atlas.choices,r => r.node))) return false;
  if (v.orbs !== null && (!Array.isArray(v.orbs) || v.orbs.length > catalogue.orbs.length
    || !v.orbs.every(r => shape(r,['id','used','price_each']) && catalogue.orbs.includes(r.id) && int(r.used,1e7)
      && price(r.price_each)) || !unique(v.orbs,r => r.id))) return false;
  if (!observations(v.delirium,maps)) return false;
  const c = v.encounters;
  return c === null || (shape(c,['readable','unknown','confirmed']) && int(c.readable,maps) && int(c.unknown,maps)
    && c.readable+c.unknown === maps && shape(c.confirmed,families) && families.every(f => int(c.confirmed[f],c.readable)));
}

export { validCovens };
