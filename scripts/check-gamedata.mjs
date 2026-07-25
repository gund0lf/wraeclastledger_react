#!/usr/bin/env node
/**
 * check-gamedata.mjs — game-data manifest vs. poewiki (Cargo) diff.
 *
 * WHAT THIS IS: a manually-run smoke detector (NOT part of the vitest gate — it
 * hits the network; the test suite stays network-free). It diffs the entity
 * NAMES bundled in src/shared/gameData/manifest.ts against poewiki's structured
 * Cargo `items` table and prints a FLAG-ONLY, COLOUR-CODED report:
 *   - manifest-only names  → candidates for status 'removed' (LOOK, don't act)
 *   - source-only names    → things the wiki lists that we're missing
 *   - drop-disabled notes  → present/known but drop-disabled (NOT removals)
 *
 * IT NEVER AUTO-APPLIES ANYTHING. GGG's in-game filter item lists remain the
 * only authority for manifest changes (LEAGUE_ROLLOVER_PLAN §0). This script
 * only surfaces candidates; you adjudicate and hand findings to a session.
 *
 * DATA SOURCE: poewiki's MediaWiki **Cargo** `items` table (the sortable
 * item-tables are built from it). Queried directly (action=cargoquery).
 *
 * SCHEMA NOTES (verified live 2026-07-08):
 *  - Query side uses UNDERSCORE fields: name, class_id, drop_enabled,
 *    removal_version. Returned JSON keys use SPACES ("removal version").
 *  - No "Scarab" class exists — scarabs are class_id "MapFragment". Both
 *    "MapFragment" and "StackableCurrency" are huge buckets, so each type also
 *    filters by a name LIKE pattern.
 *  - DROP-DISABLED SIGNAL: the wiki's List_of_drop-disabled_items keys on
 *    `removal_version` (a version string once an item leaves the drop pool);
 *    `drop_enabled` did NOT reliably reflect this in testing (returned enabled
 *    for known drop-disabled orbs like Primal). So we treat a NON-EMPTY
 *    removal_version as the drop-disabled signal, with drop_enabled=false as a
 *    secondary. Drop-disabled ≠ removed from our manifest: these stay pickable
 *    (still tradeable/usable), so they're an ANNOTATION, never a removal flag,
 *    and they're EXCLUDED from the "source-only additions" bucket so they don't
 *    masquerade as new items.
 *
 * IMPORTANT — the wiki lags GGG after patches/hotfixes. A diff right after a
 * patch may be wiki lag, NOT our error. This prints the run DATE + RAW COUNTS
 * and draws NO conclusions. A non-empty diff means "look here", never "wrong".
 *
 * FAIL-LOUD: unexpected shape or zero rows → SOURCE FAILED + non-zero exit. No
 * fallback — a fallback that yields noise is worse than a clear failure.
 *
 * EXIT CODES: 0 = every enabled source verified AND no diffs. 1 = any diff OR
 * any failure (both mean "a human needs to look").
 *
 * RUN: node scripts/check-gamedata.mjs             (colour if TTY supports it)
 *      node scripts/check-gamedata.mjs --no-color  (plain)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Introspection URLs (browser) if a source breaks after a wiki change:
 *   fields:  https://www.poewiki.net/w/api.php?action=cargofields&table=items&format=json
 *   classes: https://www.poewiki.net/w/api.php?action=cargoquery&format=json&tables=items&fields=class_id&group_by=class_id&limit=500
 *   sample:  https://www.poewiki.net/w/api.php?action=cargoquery&format=json&tables=items&fields=name,class_id,drop_enabled,removal_version&where=name%20LIKE%20%22%25Delirium%20Orb%25%22&limit=30
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cargoStringLiteral, decodeCargoText } from './cargo-query.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, '..', 'src', 'shared', 'gameData', 'manifest.ts');

const WIKI_API = 'https://www.poewiki.net/w/api.php';
const CARGO_TABLE = 'items';

// Cargo field names. TWO FORMS, and mixing them up is the classic trap here:
//  - QUERY side (fields=/where=) uses UNDERSCORES: name, class_id, drop_enabled
//  - RETURNED JSON `title` keys use SPACES: "class id", "drop enabled",
//    "removal version". Reading t['drop_enabled'] silently yields undefined.
// Verified live 2026-07-08 (a %Delirium Orb% sample showed the spaced keys).
const FIELD = {           // query form (underscore)
  name: 'name',
  class: 'class_id',
  dropEnabled: 'drop_enabled',
  removalVersion: 'removal_version',
};
const READ = {            // returned-JSON form (space)
  name: 'name',
  dropEnabled: 'drop enabled',
  removalVersion: 'removal version',
};

/**
 * Per-entity-type source config.
 *  enabled     — flip false to skip a type.
 *  cargoClass  — items.class_id value (verified 2026-07-08).
 *  nameLike    — SQL LIKE on `name` to carve this type out of a shared bucket.
 *  stripSuffix — trimmed from the END of SOURCE names before compare.
 *  stripPrefix — trimmed from the START of SOURCE names before compare.
 *                (chisels: wiki "Maven's Chisel of Avarice" → "Avarice".)
 *  note        — report header line.
 */
const SOURCES = {
  scarabs: {
    enabled: true,
    cargoClass: 'MapFragment',
    nameLike: '%Scarab%',
    stripSuffix: null,
    stripPrefix: null,
    note: 'class MapFragment + name LIKE %Scarab%',
  },
  deliriumOrbs: {
    enabled: true,
    cargoClass: 'StackableCurrency',
    nameLike: '%Delirium Orb%',
    stripSuffix: ' Delirium Orb', // wiki "Abyssal Delirium Orb" → "Abyssal"
    stripPrefix: null,
    note: 'class StackableCurrency + name LIKE %Delirium Orb%; suffix + possessive normalised',
  },
  astrolabes: {
    enabled: true,
    cargoClass: 'StackableCurrency', // verified 2026-07-08: NOT AtlasRegionUpgradeItem
    nameLike: '%Astrolabe%',         // class filter drops the non-currency namesakes
                                     // (Luminous=QuestItem, Maven's=HideoutDoodad,
                                     //  Venarius'=Amulet) automatically
    stripSuffix: null,
    stripPrefix: null,
    note: 'class StackableCurrency + name LIKE %Astrolabe% (excludes quest/doodad/amulet namesakes)',
  },
  chisels: {
    enabled: true,
    cargoClass: 'StackableCurrency',
    nameLike: '%Chisel%',
    stripSuffix: null,
    stripPrefix: "Maven's Chisel of ", // wiki "Maven's Chisel of Avarice" → "Avarice"
    note: "class StackableCurrency + name LIKE %Chisel%; \"Maven's Chisel of \" prefix stripped. Legacy \"Cartographer's Chisel\" won't match affix short-name 'Cartographer' — expected.",
  },
};

// ── Colour (ANSI, TTY-gated) ─────────────────────────────────────────────────
const noColor = process.argv.includes('--no-color') || !process.stdout.isTTY;
const C = noColor
  ? { red: (s) => s, green: (s) => s, yellow: (s) => s, dim: (s) => s, bold: (s) => s }
  : {
      red:    (s) => `\x1b[31m${s}\x1b[0m`,
      green:  (s) => `\x1b[32m${s}\x1b[0m`,
      yellow: (s) => `\x1b[33m${s}\x1b[0m`,
      dim:    (s) => `\x1b[2m${s}\x1b[0m`,
      bold:   (s) => `\x1b[1m${s}\x1b[0m`,
    };

// ── Manifest extraction (text-based; no TS import, no build step) ─────────────

function sliceArrayBlock(src, key) {
  const startRe = new RegExp(`${key}\\s*:\\s*\\[`);
  const m = startRe.exec(src);
  if (!m) return null;
  const from = m.index + m[0].length;
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '[') depth++;
    else if (c === ']') {
      if (depth === 0) return src.slice(from, i);
      depth--;
    }
  }
  return null;
}

function extractNames(block) {
  const names = [];
  const re = /\bname:\s*(["'])((?:\\.|(?!\1).)*)\1/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    names.push(m[2].replace(/\\(['"\\])/g, '$1'));
  }
  return names;
}

async function loadManifestNames() {
  const src = await readFile(MANIFEST_PATH, 'utf-8');
  const out = {};
  for (const key of Object.keys(SOURCES)) {
    const block = sliceArrayBlock(src, key);
    if (block === null) {
      out[key] = { ok: false, names: [], error: `could not locate "${key}: [ ... ]" block in manifest.ts` };
      continue;
    }
    const names = extractNames(block);
    out[key] = names.length > 0
      ? { ok: true, names }
      : { ok: false, names: [], error: `"${key}" block parsed to 0 names (manifest shape changed?)` };
  }
  return out;
}

// ── Cargo fetch ──────────────────────────────────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WraeclastLedger-gamedata-check/1.0 (github.com/gund0lf/wraeclastledger_react)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Query `items` for one class (+ optional name LIKE), paging until exhausted.
 * Returns [{ name, dropDisabled }]. Throws (loud) on API error / bad shape / 0.
 */
async function fetchCargoRows(cfg) {
  const fields = `${FIELD.name},${FIELD.dropEnabled},${FIELD.removalVersion}`;
  let where = `${FIELD.class}=${cargoStringLiteral(cfg.cargoClass)}`;
  if (cfg.nameLike) where += ` AND ${FIELD.name} LIKE ${cargoStringLiteral(cfg.nameLike)}`;

  const pageSize = 500;
  const rows = [];

  for (let offset = 0; ; offset += pageSize) {
    const url = `${WIKI_API}?action=cargoquery&format=json` +
                `&tables=${encodeURIComponent(CARGO_TABLE)}` +
                `&fields=${encodeURIComponent(fields)}` +
                `&where=${encodeURIComponent(where)}` +
                `&order_by=${encodeURIComponent(FIELD.name)}` +
                `&limit=${pageSize}&offset=${offset}`;
    const data = await fetchJson(url);

    if (data?.error) {
      throw new Error(`Cargo API error: ${data.error.info ?? data.error.code ?? 'unknown'} (where: ${where})`);
    }
    const batch = data?.cargoquery;
    if (!Array.isArray(batch)) {
      throw new Error(`cargoquery returned no array (where: ${where}) — shape changed?`);
    }
    for (const r of batch) {
      const t = r?.title ?? {};
      const rawName = t[READ.name];
      if (typeof rawName !== 'string' || rawName.length === 0) continue;
      const name = decodeCargoText(rawName);
      // Drop-disabled signal: non-empty removal_version is primary (that's what
      // the wiki's drop-disabled list keys on); drop_enabled=false secondary.
      // NOTE the spaced READ keys — the query used underscores, the JSON doesn't.
      const removal = String(t[READ.removalVersion] ?? '').trim();
      const de = String(t[READ.dropEnabled] ?? '').trim().toLowerCase();
      const dropDisabled = removal.length > 0 || de === '0' || de === 'no' || de === 'false';
      rows.push({ name, dropDisabled });
    }
    if (batch.length < pageSize) break;
  }

  if (rows.length === 0) {
    throw new Error(`0 rows (where: ${where}) — wrong class string or name pattern?`);
  }
  const seen = new Map();
  for (const r of rows) if (!seen.has(r.name)) seen.set(r.name, r);
  return [...seen.values()];
}

// ── Diff ─────────────────────────────────────────────────────────────────────

function normalize(s) {
  // Compare key: lowercase, drop possessive 's, strip apostrophes + collapse ws.
  return s
    .toLowerCase()
    .replace(/[\u2019']s\b/g, '')   // "diviner's" → "diviner"
    .replace(/[\u2019']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyStrips(name, cfg) {
  let s = name;
  if (cfg.stripPrefix && s.startsWith(cfg.stripPrefix)) s = s.slice(cfg.stripPrefix.length).trim();
  if (cfg.stripSuffix && s.endsWith(cfg.stripSuffix)) s = s.slice(0, -cfg.stripSuffix.length).trim();
  return s;
}

function diff(manifestNames, sourceRows, cfg) {
  const rows = sourceRows.map((r) => ({ name: applyStrips(r.name, cfg), dropDisabled: r.dropDisabled }));

  const srcByKey = new Map(rows.map((r) => [normalize(r.name), r]));
  const manByKey = new Map(manifestNames.map((n) => [normalize(n), n]));

  const manifestOnly = [];
  const dropDisabledPresent = []; // in manifest AND wiki-flagged drop-disabled
  for (const [k, disp] of manByKey) {
    const hit = srcByKey.get(k);
    if (!hit) manifestOnly.push(disp);
    else if (hit.dropDisabled) dropDisabledPresent.push(disp);
  }

  // Source-only: on wiki, not in manifest. Split drop-disabled out so they don't
  // masquerade as "new items" — they're removed-from-drop, not additions.
  const sourceOnlyLive = [];
  const sourceOnlyDisabled = [];
  for (const [k, r] of srcByKey) {
    if (manByKey.has(k)) continue;
    (r.dropDisabled ? sourceOnlyDisabled : sourceOnlyLive).push(r.name);
  }

  return {
    manifestOnly: manifestOnly.sort(),
    sourceOnlyLive: sourceOnlyLive.sort(),
    sourceOnlyDisabled: sourceOnlyDisabled.sort(),
    dropDisabledPresent: dropDisabledPresent.sort(),
    sourceCount: rows.length,
    dropDisabledTotal: rows.filter((r) => r.dropDisabled).length,
  };
}

function hr() { return '─'.repeat(72); }

async function main() {
  const started = new Date();
  console.log(hr());
  console.log('  ' + C.bold('WraeclastLedger — game-data manifest vs. poewiki (Cargo) diff'));
  console.log(`  Run: ${started.toISOString()}`);
  console.log(`  Manifest: ${MANIFEST_PATH}`);
  console.log('  ' + C.dim('FLAG-ONLY. No conclusions. Wiki lags patches — read dates, not verdicts.'));
  console.log('  Legend: ' + C.red('manifest-only (removal candidate)') + '  ' +
              C.green('source-only (possible addition)') + '  ' +
              C.yellow('drop-disabled (keep, ignore)'));
  console.log(hr());

  const manifest = await loadManifestNames();
  let anyDiff = false;
  let anyFail = false;

  for (const [key, cfg] of Object.entries(SOURCES)) {
    console.log('');
    console.log(C.bold(`▶ ${key}`) + (cfg.note ? C.dim(`  — ${cfg.note}`) : ''));

    if (!cfg.enabled) { console.log('  ' + C.dim('(skipped — disabled in CONFIG)')); continue; }

    const man = manifest[key];
    if (!man.ok) {
      anyFail = true;
      console.log('  ' + C.red(`SOURCE FAILED (manifest side): ${man.error}`));
      continue;
    }

    let rows;
    try {
      rows = await fetchCargoRows(cfg);
    } catch (err) {
      anyFail = true;
      console.log('  ' + C.red(`SOURCE FAILED (Cargo): ${err.message}`));
      console.log('  ' + C.dim(`  → fix cargoClass / nameLike / FIELD names in CONFIG for "${key}".`));
      continue;
    }

    const d = diff(man.names, rows, cfg);
    console.log('  ' + C.dim(`via cargo:${CARGO_TABLE} class_id="${cfg.cargoClass}"` +
                (cfg.nameLike ? ` name LIKE "${cfg.nameLike}"` : '')));
    console.log(`  counts: manifest=${man.names.length}  source=${d.sourceCount}  ` +
                C.yellow(`drop-disabled-in-source=${d.dropDisabledTotal}`));

    if (d.dropDisabledPresent.length) {
      console.log('  ' + C.yellow(`── present + DROP-DISABLED on wiki (${d.dropDisabledPresent.length}) — keep pickable, NOT removals:`));
      for (const n of d.dropDisabledPresent) console.log('       ' + C.yellow(n));
    }
    if (d.sourceOnlyDisabled.length) {
      console.log('  ' + C.yellow(`── on wiki but DROP-DISABLED & not in manifest (${d.sourceOnlyDisabled.length}) — removed-from-drop, NOT additions:`));
      for (const n of d.sourceOnlyDisabled) console.log('       ' + C.yellow(n));
    }

    if (d.manifestOnly.length === 0 && d.sourceOnlyLive.length === 0) {
      console.log('  ' + C.green('✓ no live-name differences'));
      continue;
    }
    anyDiff = true;

    if (d.manifestOnly.length) {
      console.log('  ' + C.red(`── in MANIFEST but not in source (${d.manifestOnly.length}) — removal candidates (adjudicate vs GGG filter):`));
      for (const n of d.manifestOnly) console.log('       ' + C.red(n));
    }
    if (d.sourceOnlyLive.length) {
      console.log('  ' + C.green(`── in SOURCE (droppable) but not in manifest (${d.sourceOnlyLive.length}) — possible additions:`));
      for (const n of d.sourceOnlyLive) console.log('       ' + C.green(n));
    }
  }

  console.log('');
  console.log(hr());
  if (anyFail) {
    console.log('  ' + C.red('RESULT: one or more sources FAILED — output is incomplete. Fix CONFIG and re-run.'));
  } else if (anyDiff) {
    console.log('  ' + C.bold('RESULT: name differences found. CANDIDATES to look at, not confirmed errors.'));
    console.log('  ' + C.dim("Adjudicate against GGG's in-game 3.29 filter list (the only authority)."));
  } else {
    console.log('  ' + C.green('RESULT: all sources verified, no name differences.'));
  }
  console.log(hr());

  process.exit(anyFail || anyDiff ? 1 : 0);
}

main().catch((err) => {
  console.error(C.red('FATAL:'), err?.stack ?? err);
  process.exit(1);
});
