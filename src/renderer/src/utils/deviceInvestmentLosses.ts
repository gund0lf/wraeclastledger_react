import type { LootItem, SessionSettings } from '../types';
import { deviceInvestment } from './profit';
import { deliOrbItemName } from './itemIcons';

// A WealthyExile snapshot can contain the same item in several tracked tabs.
function snapshotTotals(items: readonly LootItem[], name: string) {
  let quantity = 0;
  let value = 0;
  for (const item of items) {
    if (item.name !== name) continue;
    const count = Number(item.quantity);
    if (item.excluded || !Number.isSafeInteger(count) || count < 0) return null;
    quantity += count;
    value += item.total;
  }
  return { quantity, value };
}

export function deviceInvestmentLosses(
  settings: SessionSettings, mapCount: number, baseline: readonly LootItem[], current: readonly LootItem[],
): { name: string; value: number }[] {
  if (!baseline.length || !current.length) return [];
  const { activeSlots, emberCost, saveChance } = deviceInvestment(settings);
  const paidPerMap = new Map<string, number>();
  for (const slot of activeSlots) {
    if (slot?.name && slot.price > 0 && slot.count > 0 && saveChance < 100) {
      paidPerMap.set(slot.name, (paidPerMap.get(slot.name) ?? 0) + slot.count);
    }
  }
  if (settings.ember && emberCost > 0) paidPerMap.set(settings.ember.name, 1);
  const paid = new Map(Array.from(paidPerMap, ([name, count]) => [name, count * mapCount]));
  for (const row of settings.deliriumOrbSpend ?? []) {
    const name = deliOrbItemName(row.type);
    if (name && row.count > 0 && (row.priceEach ?? 0) > 0) paid.set(name, row.count);
  }

  const matches: { name: string; value: number }[] = [];
  for (const [name, count] of paid) {
    const before = snapshotTotals(baseline, name);
    const after = snapshotTotals(current, name);
    if (!before || !after || before.quantity <= after.quantity) continue;
    // Remove only the stash loss attributable to configured consumption. A
    // change in price for the remaining stack is a separate gain or loss.
    const consumed = Math.min(before.quantity - after.quantity, count);
    const value = Math.min(before.value - after.value, consumed * before.value / before.quantity);
    if (value >= 0.01) matches.push({ name, value });
  }
  return matches;
}
