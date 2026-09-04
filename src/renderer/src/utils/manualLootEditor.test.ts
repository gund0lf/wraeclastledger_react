import { describe, expect, it } from 'vitest';
import type { ManualLootItem } from '../types';
import {
  createManualLootDraft, createManualLootEditor, manualLootEditorReducer as reduce,
  type ManualLootMode,
} from './manualLootEditor';
import { manualLootTotalFromEntry, parseManualLootValueInput } from './manualLootValue';
import { fcSep } from './parseDiscordExport';

const row: ManualLootItem = {
  id: 'existing-row', name: 'Coral Reef Chart', category: 'League',
  quantity: 3, total: 100, note: 'Existing note',
  identity: { kind: 'chart', chart: 'Coral Reef Chart' },
};

describe('custom loot editor continuity', () => {
  it('retains old influence and strands when editing, but carries neither to the next item', () => {
    const identity = {
      kind: 'quality-base' as const, equipmentGroup: 'weapon' as const,
      base: 'Kinetic Wand', quality: 27, influence: 'Elder' as const, memoryStrands: 40,
    };
    let state = reduce(createManualLootEditor(), { type: 'mode', mode: 'quality-base' });
    state = reduce(state, { type: 'edit', item: { ...row, identity }, divinePrice: 217 });
    expect(state.draft.identity).toEqual(identity);
    expect(state.draft.identity).not.toBe(identity);
    state = reduce(state, { type: 'new-addition' });
    expect(state.draft.identity).toEqual({ kind: 'quality-base', equipmentGroup: 'armour', base: '', quality: 20 });
  });

  it.each<ManualLootMode>(['free', 'quality-base', 'chart', 'syndicate-reward'])(
    'keeps %s and Per item for the next addition without carrying item data', (mode) => {
      let state = reduce(createManualLootEditor(), { type: 'mode', mode });
      state = reduce(state, { type: 'value-mode', mode: 'perItem', text: '' });
      state = reduce(state, {
        type: 'draft', update: (draft) => ({ ...draft, name: 'Old item', quantity: 5, total: 434, note: 'Old note' }),
      });
      state = reduce(state, { type: 'value-text', text: '.4d' });
      state = reduce(state, { type: 'new-addition' });
      expect(state.draft).toEqual(createManualLootDraft(mode));
      expect(state).toMatchObject({ editingId: null, valueMode: 'perItem', valueText: '', addMode: mode });
      // Close/reopen uses the same transition and keeps choices, not the draft.
      expect(reduce(state, { type: 'new-addition' })).toEqual(state);
    },
  );

  it('clears the exact Chart after save while staying in the Chart panel', () => {
    let state = reduce(createManualLootEditor(), { type: 'mode', mode: 'chart' });
    state = reduce(state, { type: 'draft', update: () => ({ ...row }) });
    state = reduce(state, { type: 'new-addition' });
    expect(state.draft.identity).toEqual({ kind: 'chart', chart: null });
  });

  it('edits the exact saved total without dividing and rounding on open', () => {
    let state = reduce(createManualLootEditor(), { type: 'value-mode', mode: 'perItem', text: '' });
    state = reduce(state, { type: 'edit', item: row, divinePrice: 217 });
    expect(state).toMatchObject({ editingId: row.id, valueMode: 'total', valueText: '100' });
    expect(state.draft.identity).toEqual(row.identity);
    expect(state.draft.identity).not.toBe(row.identity);
    const parsed = parseManualLootValueInput(state.valueText, 217);
    expect(parsed.ok && manualLootTotalFromEntry(parsed.chaos, state.draft.quantity, state.valueMode)).toBe(100);
  });

  it('save/cancel/remove of an edited row returns to the original Add preferences', () => {
    let state = reduce(createManualLootEditor(), { type: 'mode', mode: 'quality-base' });
    state = reduce(state, { type: 'value-mode', mode: 'perItem', text: '' });
    state = reduce(state, { type: 'edit', item: row, divinePrice: 217 });
    state = reduce(state, { type: 'mode', mode: 'syndicate-reward' });
    state = reduce(state, { type: 'value-mode', mode: 'total', text: '100' });
    state = reduce(state, { type: 'new-addition' });
    expect(state.draft).toEqual(createManualLootDraft('quality-base'));
    expect(state).toMatchObject({ editingId: null, valueMode: 'perItem', valueText: '' });
    expect(row.total).toBe(100);
    expect(row.identity).toEqual({ kind: 'chart', chart: 'Coral Reef Chart' });
  });

  it('resets the draft and choices at a session boundary', () => {
    let state = reduce(createManualLootEditor(), { type: 'mode', mode: 'chart' });
    state = reduce(state, { type: 'value-mode', mode: 'perItem', text: '.4d' });
    state = reduce(state, { type: 'edit', item: row, divinePrice: 217 });
    expect(reduce(state, { type: 'reset-session' })).toEqual(createManualLootEditor());
  });

  it('switching kind clears identity but retains the amount and note being entered', () => {
    let state = reduce(createManualLootEditor(), {
      type: 'draft', update: (draft) => ({ ...draft, name: 'Item', quantity: 5, total: 434, note: 'Reason' }),
    });
    state = reduce(state, { type: 'mode', mode: 'chart' });
    expect(state.draft).toMatchObject({ name: 'Charts', quantity: 5, total: 434, note: 'Reason', category: 'League' });
    expect(reduce(state, { type: 'mode', mode: 'chart' })).toBe(state);
  });

  it('continues to store canonical Chaos after retaining Per item mode', () => {
    let state = reduce(createManualLootEditor(), { type: 'value-mode', mode: 'perItem', text: '' });
    state = reduce(state, { type: 'new-addition' });
    state = reduce(state, { type: 'value-text', text: '.4d' });
    state = reduce(state, { type: 'draft', update: (draft) => ({ ...draft, quantity: 5 }) });
    const parsed = parseManualLootValueInput(state.valueText, 217);
    expect(parsed.ok && manualLootTotalFromEntry(parsed.chaos, state.draft.quantity, state.valueMode)).toBe(434);
  });

  it.each([[0, '0c'], [12.3, '12.3c'], [1234.5, '1,234.5c']] as const)(
    'formats the saved total %s with exactly one Chaos suffix', (amount, expected) => {
      expect(fcSep(amount, false, 1)).toBe(expected);
    },
  );
});
