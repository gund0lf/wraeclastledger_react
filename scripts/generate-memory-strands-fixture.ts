/** Prints synthetic cross-repository wire fixtures; never reads a user session.
 * Run: node scripts/run-vite-script.mjs scripts/generate-memory-strands-fixture.ts
 */
import { buildLootSummary, encodeLootSummary } from '../src/renderer/src/utils/lootSummary';
import { manualLootIdentityName, type QualityBaseLootIdentity } from '../src/shared/manualLoot';
import { parseDiscordExport } from '../src/renderer/src/utils/parseDiscordExport';
import { buildDiscordSharePayload, encodeDiscordShareWire } from '../src/renderer/src/utils/discordShareWire';
import { encodeDiscordShareBrotli } from '../src/main/discordShareCompression';

const fixtures = [undefined, 0, 40, 100].map((memoryStrands) => {
  const identity: QualityBaseLootIdentity = {
    kind: 'quality-base', equipmentGroup: 'weapon', base: 'Kinetic Wand', quality: 27,
    ...(memoryStrands === 100 ? { influence: 'Elder' as const } : {}),
    ...(memoryStrands !== undefined ? { memoryStrands } : {}),
  };
  const summary = buildLootSummary({
    baselineItems: [], baselineTotal: 0,
    lootItems: [{ id: 'csv', name: 'Chaos Orb', quantity: '100', price: '1', total: 100,
      category: 'Currency', tab: 'currency', excluded: false }],
    manualLootItems: [{ id: 'base', name: manualLootIdentityName(identity), quantity: 1,
      total: 120, category: 'Other', note: '', identity }],
    gemCorrection: 0, investmentCorrection: 0, reportedReturn: 220,
  })!;
  const lootToken = encodeLootSummary(summary);
  const source = parseDiscordExport([
    '[WraeclastLedger Session]',
    'Maps: 10 | Type: 6-mod | Multiplier: 1.00x',
    'Chisel: None',
    'Avg Quant: 80% | Avg Rarity: 60% | Avg Pack: 40%',
    'Per Map Cost: 10c | Total Invest: 100c',
    'Total Return: 220c | Net Profit: +120c',
    'Div / Map: 0.06d | Divine Price: 200c',
    'League: Allflame',
    'Strategy: Synthetic Memory Strands fixture',
    `Loot Evidence: ${lootToken}`,
  ].join('\n'));
  if (!source || source.lootSummaryInvalid) throw new Error('Invalid synthetic fixture');
  return {
    memoryStrands: memoryStrands ?? null,
    summary,
    lootToken,
    wl2: encodeDiscordShareWire(source),
    wl3: encodeDiscordShareBrotli(buildDiscordSharePayload(source)),
  };
});
console.log(JSON.stringify(fixtures, null, 2));
