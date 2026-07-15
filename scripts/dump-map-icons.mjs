#!/usr/bin/env node
/**
 * dump-map-icons.mjs — verification tool for the icon-resolver map audit
 * (session 17; BACKLOG "Icon resolver wrong-match audit").
 *
 * PURPOSE: the renderer icon cache keys stash-family lines by bare name
 * (`l.name || l.baseType`), but poe.ninja is suspected to serve Map lines
 * one-per-tier under the same baseType, and BlightedMap/UniqueMap lines may
 * reuse base names — making the cache last-write-wins across tiers AND types
 * (observed live: T16 → blighted icon, conqueror maps → Vaal Temple icon,
 * T14/T12 → white low-tier icons). This script DUMPS the actual response
 * shapes so the fix can key on verified fields instead of guesses
 * (the check-gamedata.mjs playbook: verify shapes, never assume).
 *
 * RUN: node scripts/dump-map-icons.mjs        (from the project root)
 *      Manually only — NOT part of the vitest gate (network).
 *
 * PRINTS, per league (Ancestors, Mirage) per type (Map, BlightedMap, UniqueMap):
 *   - line count + the UNION of field names present on lines[]
 *   - how many lines have name null/empty vs set (the `name || baseType` split)
 *   - up to 6 sample lines (name / baseType / mapTier / variant / icon tail)
 *   - duplicate-key stats: names that map to >1 distinct icon within the type
 * Then a CROSS-TYPE collision report per league: keys (after the renderer's
 * `name || baseType` rule) that appear in more than one of the three types —
 * these are exactly the entries where the current cache picks arbitrarily.
 *
 * Read-only, flag-only: changes nothing anywhere.
 */

const LEAGUES = ['Ancestors', 'Mirage'];
const TYPES = ['Map', 'BlightedMap', 'UniqueMap'];
const BASE = 'https://poe.ninja/poe1/api/economy/stash/current/item/overview';

const iconTail = (u) => (typeof u === 'string' ? u.split('/').slice(-2).join('/') : String(u));

function decodeIconDescriptor(url) {
  const encoded = typeof url === 'string' ? /\/gen\/image\/([^/]+)\//.exec(url)?.[1] : null;
  if (!encoded) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return Array.isArray(payload) && payload[2] && typeof payload[2] === 'object'
      ? payload[2]
      : null;
  } catch {
    return null;
  }
}

async function fetchType(league, type) {
  const url = `${BASE}?league=${encodeURIComponent(league)}&type=${encodeURIComponent(type)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${type}@${league}: HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.lines) ? data.lines : [];
}

function report(league, type, lines) {
  console.log(`\n=== ${league} / ${type} — ${lines.length} lines ===`);
  if (lines.length === 0) { console.log('  (empty)'); return new Map(); }

  // Field union
  const fields = new Set();
  for (const l of lines) for (const k of Object.keys(l)) fields.add(k);
  console.log(`  fields: ${[...fields].sort().join(', ')}`);

  // name vs baseType split (the renderer's `name || baseType` rule)
  const nameNull = lines.filter((l) => !l.name).length;
  console.log(`  name set: ${lines.length - nameNull} / name null-or-empty (falls to baseType): ${nameNull}`);

  // Samples
  console.log('  samples:');
  for (const l of lines.slice(0, 6)) {
    console.log(
      `    name=${JSON.stringify(l.name ?? null)} baseType=${JSON.stringify(l.baseType ?? null)}` +
      ` mapTier=${l.mapTier ?? '-'} variant=${JSON.stringify(l.variant ?? null)}` +
      ` icon=…${iconTail(l.icon)} descriptor=${JSON.stringify(decodeIconDescriptor(l.icon))}`
    );
  }

  // Duplicate keys WITHIN the type: same resolver key, >1 distinct icon
  const byKey = new Map(); // key -> Set(iconTail)
  for (const l of lines) {
    const key = l.name || l.baseType;
    if (!key || !l.icon) continue;
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key).add(iconTail(l.icon));
  }
  const dupes = [...byKey.entries()].filter(([, icons]) => icons.size > 1);
  console.log(`  in-type duplicate keys (same key, multiple icons): ${dupes.length}`);
  for (const [key, icons] of dupes.slice(0, 8)) {
    console.log(`    "${key}" -> ${icons.size} icons: ${[...icons].join(' | ')}`);
  }
  if (dupes.length > 8) console.log(`    … and ${dupes.length - 8} more`);

  return byKey;
}

let hadFindings = false;
for (const league of LEAGUES) {
  const perType = new Map(); // type -> Map(key -> Set(iconTail))
  for (const type of TYPES) {
    try {
      perType.set(type, report(league, type, await fetchType(league, type)));
    } catch (err) {
      hadFindings = true;
      console.error(`\n=== ${league} / ${type} — FETCH FAILED: ${err.message} ===`);
      perType.set(type, new Map());
    }
  }

  // Cross-type key collisions: the arbitrary-overwrite cases
  const owners = new Map(); // key -> [type, ...]
  for (const [type, byKey] of perType) {
    for (const key of byKey.keys()) {
      if (!owners.has(key)) owners.set(key, []);
      owners.get(key).push(type);
    }
  }
  const collisions = [...owners.entries()].filter(([, types]) => types.length > 1);
  console.log(`\n--- ${league}: CROSS-TYPE key collisions (arbitrary last-write-wins today): ${collisions.length} ---`);
  for (const [key, types] of collisions.slice(0, 15)) {
    console.log(`  "${key}" appears in: ${types.join(' + ')}`);
  }
  if (collisions.length > 15) console.log(`  … and ${collisions.length - 15} more`);
  if (collisions.length > 0) hadFindings = true;

  // In-type dupes also count as findings
  for (const byKey of perType.values()) {
    if ([...byKey.values()].some((icons) => icons.size > 1)) hadFindings = true;
  }
}

console.log(`\nRun date: ${new Date().toISOString().slice(0, 10)}`);
console.log(hadFindings
  ? 'FINDINGS PRESENT — paste this output back into the session for the resolver fix design.'
  : 'No duplicate/collision findings — the map misresolutions come from somewhere else; paste anyway.');
process.exit(0); // informational dump — exit code carries no meaning here
