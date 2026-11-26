import { BUNDLED_MANIFEST } from './gameData/manifest';

export interface CovensImport {
  version: 1;
  threads: { slot: number; id: string; paid: number; granted: number; paused: boolean }[] | null;
  ember: string | null;
  atlas: { version: string; choices: { node: number; option: number | null }[] } | null;
}

function shape(value: unknown, keys: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
}
const count = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;

export function validCovensImport(value: unknown, league: string, tree: string | null): value is CovensImport {
  const rules = BUNDLED_MANIFEST.leagueRules?.[league];
  if (!rules?.threadSlots || !shape(value,['version','threads','ember','atlas']) || value.version !== 1) return false;
  const { threads, ember, atlas } = value;
  if (ember !== null && !BUNDLED_MANIFEST.embers?.some(e => e.id === ember)) return false;
  if (threads !== null && (!Array.isArray(threads) || threads.length > rules.threadSlots
    || !threads.every(t => shape(t,['slot','id','paid','granted','paused']) && count(t.slot,rules.threadSlots) && t.slot > 0
      && BUNDLED_MANIFEST.threads?.some(e => e.id === t.id) && typeof t.paused === 'boolean'
      && count(t.paid,rules.threadCap) && count(t.granted,rules.threadCap))
    || new Set(threads.map(t => t.slot)).size !== threads.length)) return false;
  if (atlas === null) return true;
  if (!shape(atlas,['version','choices']) || typeof atlas.version !== 'string' || atlas.version !== rules.atlasTreeVersion
    || (tree && new URL(tree).searchParams.get('v') !== atlas.version)) return false;
  const options = BUNDLED_MANIFEST.atlasTrees?.[atlas.version]?.choices;
  return !!options && Array.isArray(atlas.choices) && atlas.choices.length <= Object.keys(options).length
    && atlas.choices.every(c => shape(c,['node','option']) && count(c.node,65535) && Object.hasOwn(options,c.node)
      && (c.option === null || (count(c.option,65535) && options[c.node].options.some(o => o.id === String(c.option)))))
    && new Set(atlas.choices.map(c => c.node)).size === atlas.choices.length;
}

export function reusableCovens(fields: import('./covensWireValidator.mjs').CovensWire): CovensImport {
  return { version: 1, atlas: fields.atlas, ember: fields.ember?.id ?? null,
    threads: fields.threads?.map(({slot,id,paid,granted,paused}) => ({slot,id,paid,granted,paused})) ?? null };
}

export function covensSetupIdentity(setup: CovensImport) {
  return { atlas: setup.atlas && {version: setup.atlas.version, choices: [...setup.atlas.choices].sort((a,b) => a.node-b.node)},
    threads: setup.threads && setup.threads.filter(row => !row.paused).map(({slot,id,paid,granted}) =>
      ({slot,id,paid,granted})).sort((a,b) => a.slot-b.slot), ember: setup.ember };
}
