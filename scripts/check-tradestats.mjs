#!/usr/bin/env node
/**
 * Verify every brick exclusion against the live PoE Trade stat vocabulary.
 *
 * This is deliberately a network/manual rollover check, not part of the
 * offline test gate. Exact text is the primary identity; statId is used only
 * where GGG publishes byte-identical active and obsolete entries.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'src', 'shared', 'brickMods.ts');
const SPECIAL_MAP_SOURCE = join(ROOT, 'src', 'shared', 'tradeMapFilters.ts');
const TRADE_STATS_URL = 'https://www.pathofexile.com/api/trade/data/stats';
const EXPECTED_SHARED_BRICK_SETS = new Set([
  'reduced_max_resistances|uber_20_max_resistances',
  'monsters_fire_extra_projectiles|uber_extra_projectiles_massive_aoe',
  'cursed_with_vulnerability|uber_triple_curse_vuln_temporal_elem',
  'physical_damage_reduction|uber_massive_all_resistances',
].map((ids) => ids.split('|').sort().join('|')));

const fail = (message) => {
  throw new Error(message);
};

function property(object, name, sourceFile) {
  return object.properties.find((candidate) =>
    ts.isPropertyAssignment(candidate) &&
    candidate.name.getText(sourceFile).replace(/^['"]|['"]$/g, '') === name,
  )?.initializer;
}

function stringValue(node, description) {
  if (!node || !ts.isStringLiteralLike(node)) fail(`${description} must be a string literal`);
  return node.text;
}

async function readPatternTable() {
  const source = await readFile(SOURCE, 'utf8');
  const sourceFile = ts.createSourceFile(SOURCE, source, ts.ScriptTarget.Latest, true);
  let definitions = null;

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === 'BRICK_MOD_DEFS' &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      definitions = node.initializer.elements.map((element, definitionIndex) => {
        if (!ts.isObjectLiteralExpression(element)) {
          fail(`BRICK_MOD_DEFS[${definitionIndex}] must be an object literal`);
        }
        const id = stringValue(property(element, 'id', sourceFile), `definition ${definitionIndex} id`);
        const label = stringValue(property(element, 'label', sourceFile), `${id} label`);
        const patternsNode = property(element, 'tradePatterns', sourceFile);
        if (!patternsNode || !ts.isArrayLiteralExpression(patternsNode)) {
          fail(`${id}.tradePatterns must be an array literal`);
        }
        const tradePatterns = patternsNode.elements.map((patternNode, patternIndex) => {
          if (!ts.isObjectLiteralExpression(patternNode)) {
            fail(`${id}.tradePatterns[${patternIndex}] must be an object literal`);
          }
          const text = stringValue(
            property(patternNode, 'text', sourceFile),
            `${id}.tradePatterns[${patternIndex}].text`,
          );
          const statIdNode = property(patternNode, 'statId', sourceFile);
          const statId = statIdNode
            ? stringValue(statIdNode, `${id}.tradePatterns[${patternIndex}].statId`)
            : undefined;
          return { text, ...(statId ? { statId } : {}) };
        });
        return { id, label, tradePatterns };
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  if (!definitions) fail('Could not find the BRICK_MOD_DEFS array');
  return definitions;
}

async function readSpecialMapStatTable() {
  const source = await readFile(SPECIAL_MAP_SOURCE, 'utf8');
  const sourceFile = ts.createSourceFile(SPECIAL_MAP_SOURCE, source, ts.ScriptTarget.Latest, true);
  let definitions = null;

  function visit(node) {
    const initializer = ts.isVariableDeclaration(node) && node.initializer &&
      ts.isAsExpression(node.initializer)
      ? node.initializer.expression
      : ts.isVariableDeclaration(node) ? node.initializer : undefined;
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(sourceFile) === 'SPECIAL_MAP_STAT_TEXT' &&
      initializer &&
      ts.isObjectLiteralExpression(initializer)
    ) {
      definitions = initializer.properties.map((candidate, index) => {
        if (!ts.isPropertyAssignment(candidate)) {
          fail(`SPECIAL_MAP_STAT_TEXT[${index}] must be a property assignment`);
        }
        const key = candidate.name.getText(sourceFile).replace(/^['"]|['"]$/g, '');
        const text = stringValue(candidate.initializer, `SPECIAL_MAP_STAT_TEXT.${key}`);
        return { key, text };
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  if (!definitions) fail('Could not find the SPECIAL_MAP_STAT_TEXT object');
  return definitions;
}

const normalize = (text) =>
  text.replace(/\[[^|\]]+\|([^\]]+)\]/g, '$1').toLocaleLowerCase('en-US');

function resolvePatterns(definitions, entries) {
  const normalizedEntries = entries.map((entry) => ({ ...entry, normalized: normalize(entry.text) }));
  const resolved = [];
  const unavailable = [];

  for (const definition of definitions) {
    const ids = new Set();
    let exact = true;
    for (const pattern of definition.tradePatterns) {
      const matches = normalizedEntries.filter((entry) =>
        entry.normalized === normalize(pattern.text) &&
        (!pattern.statId || entry.id === pattern.statId),
      );
      if (matches.length !== 1) exact = false;
      for (const match of matches) ids.add(match.id);
    }
    if (!exact || ids.size !== definition.tradePatterns.length) {
      unavailable.push({
        ...definition,
        expectedCount: definition.tradePatterns.length,
        actualCount: ids.size,
      });
    } else {
      resolved.push({ ...definition, statIds: [...ids] });
    }
  }
  return { resolved, unavailable };
}

const definitions = await readPatternTable();
const specialMapDefinitions = await readSpecialMapStatTable();
if (definitions.length !== 113) {
  fail(`Expected 113 brick definitions, found ${definitions.length}`);
}

const response = await fetch(TRADE_STATS_URL, {
  headers: { 'User-Agent': 'WraeclastLedger-trade-stat-audit/1.0' },
});
if (!response.ok) fail(`Trade stats request failed: HTTP ${response.status}`);
const payload = await response.json();
const entries = payload.result?.find((group) => group.id === 'explicit')?.entries;
if (!Array.isArray(entries) || entries.length === 0) fail('Trade stats response has no explicit entries');
const allEntries = payload.result
  ?.filter((group) => !group.id.includes('2'))
  .flatMap((group) => group.entries ?? []);
if (!Array.isArray(allEntries) || allEntries.length === 0) fail('Trade stats response has no entries');

const { resolved, unavailable } = resolvePatterns(definitions, entries);
const ownersByStatId = new Map();
for (const definition of resolved) {
  for (const statId of definition.statIds) {
    const owners = ownersByStatId.get(statId) ?? [];
    owners.push({ id: definition.id, label: definition.label });
    ownersByStatId.set(statId, owners);
  }
}
const shared = [...ownersByStatId]
  .filter(([, owners]) => owners.length > 1)
  .map(([statId, owners]) => ({ statId, owners }));
const actualSharedBrickSets = new Set(
  shared.map(({ owners }) => owners.map(({ id }) => id).sort().join('|')),
);
const unexpectedShared = [...actualSharedBrickSets]
  .filter((ids) => !EXPECTED_SHARED_BRICK_SETS.has(ids));
const missingShared = [...EXPECTED_SHARED_BRICK_SETS]
  .filter((ids) => !actualSharedBrickSets.has(ids));

console.log(`Resolved ${resolved.length}/${definitions.length} brick exclusions against ${entries.length} explicit Trade stats.`);
if (shared.length > 0) {
  console.log(`Shared Trade IDs (${shared.length}) — pinned intentional regular/Nightmare aliases:`);
  for (const { statId, owners } of shared) {
    console.log(`  ${statId}: ${owners.map((owner) => `${owner.label} [${owner.id}]`).join(' | ')}`);
  }
}
if (unexpectedShared.length > 0 || missingShared.length > 0) {
  console.error('Shared-ID classification drifted and needs explicit adjudication.');
  for (const ids of unexpectedShared) console.error(`  unexpected: ${ids}`);
  for (const ids of missingShared) console.error(`  missing: ${ids}`);
  process.exitCode = 1;
}
if (unavailable.length > 0) {
  console.error(`Unavailable or ambiguous brick exclusions (${unavailable.length}):`);
  for (const definition of unavailable) {
    console.error(
      `  ${definition.label} [${definition.id}]: expected ${definition.expectedCount}, found ${definition.actualCount}`,
    );
  }
  process.exitCode = 1;
}

const unavailableSpecialMapStats = [];
const resolvedSpecialMapStats = [];
for (const definition of specialMapDefinitions) {
  const matches = allEntries.filter((entry) => normalize(entry.text) === normalize(definition.text));
  if (matches.length !== 1) {
    unavailableSpecialMapStats.push({ ...definition, actualCount: matches.length });
  } else {
    resolvedSpecialMapStats.push({ ...definition, statId: matches[0].id });
  }
}
console.log(
  `Resolved ${resolvedSpecialMapStats.length}/${specialMapDefinitions.length} special-map stats.`,
);
for (const definition of resolvedSpecialMapStats) {
  console.log(`  ${definition.statId}: ${definition.text}`);
}
if (unavailableSpecialMapStats.length > 0) {
  console.error(`Unavailable or ambiguous special-map stats (${unavailableSpecialMapStats.length}):`);
  for (const definition of unavailableSpecialMapStats) {
    console.error(`  ${definition.key}: expected 1, found ${definition.actualCount}`);
  }
  process.exitCode = 1;
}
