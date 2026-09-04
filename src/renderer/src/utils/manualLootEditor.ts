import type { LootCategory, ManualLootItem } from '../types';
import type { ManualLootIdentity } from '../../../shared/manualLoot';
import { formatManualLootValueInput, type ManualLootValueMode } from './manualLootValue';

export type ManualLootMode = 'free' | ManualLootIdentity['kind'];

export interface ManualLootDraft {
  name: string;
  quantity: number;
  total: number;
  category: LootCategory;
  note: string;
  identity?: ManualLootIdentity;
}

export function createManualLootDraft(mode: ManualLootMode = 'free'): ManualLootDraft {
  const empty: ManualLootDraft = { name: '', quantity: 1, total: 0, category: 'Other', note: '' };
  switch (mode) {
    case 'quality-base':
      return { ...empty, identity: { kind: mode, equipmentGroup: 'armour', base: '', quality: 20 } };
    case 'chart':
      return { ...empty, name: 'Charts', category: 'League', identity: { kind: mode, chart: null } };
    case 'syndicate-reward':
      return {
        ...empty, category: 'League',
        identity: { kind: mode, member: '', reward: '', equipmentGroup: 'armour' },
      };
    default:
      return empty;
  }
}

export interface ManualLootEditorState {
  draft: ManualLootDraft;
  editingId: string | null;
  valueMode: ManualLootValueMode;
  valueText: string;
  addMode: ManualLootMode;
  addValueMode: ManualLootValueMode;
}

export function createManualLootEditor(): ManualLootEditorState {
  return {
    draft: createManualLootDraft(), editingId: null, valueMode: 'total', valueText: '',
    addMode: 'free', addValueMode: 'total',
  };
}

export type ManualLootEditorAction =
  | { type: 'reset-session' }
  | { type: 'new-addition' }
  | { type: 'edit'; item: ManualLootItem; divinePrice: number | null }
  | { type: 'mode'; mode: ManualLootMode }
  | { type: 'value-mode'; mode: ManualLootValueMode; text: string }
  | { type: 'value-text'; text: string }
  | { type: 'draft'; update: (draft: ManualLootDraft) => ManualLootDraft };

/** Ephemeral editor choices only: never persisted to the session or share wire.
 * Save, cancel, remove-edited-row and reopen all return to the same Add choices,
 * without reusing an old item's identity or monetary fields. */
export function manualLootEditorReducer(
  state: ManualLootEditorState,
  action: ManualLootEditorAction,
): ManualLootEditorState {
  switch (action.type) {
    case 'reset-session':
      return createManualLootEditor();
    case 'new-addition':
      return {
        ...state, draft: createManualLootDraft(state.addMode), editingId: null,
        valueMode: state.addValueMode, valueText: '',
      };
    case 'edit':
      return {
        ...state,
        editingId: action.item.id,
        draft: { ...action.item, identity: action.item.identity ? { ...action.item.identity } : undefined },
        // Existing rows store an exact total, not a remembered input mode.
        // Open that total unchanged; do not divide/round it merely on Edit.
        valueMode: 'total',
        valueText: formatManualLootValueInput(
          action.item.total, action.item.quantity, 'total', 'chaos', action.divinePrice,
        ),
      };
    case 'mode': {
      if ((state.draft.identity?.kind ?? 'free') === action.mode) return state;
      const fresh = createManualLootDraft(action.mode);
      return {
        ...state,
        addMode: state.editingId ? state.addMode : action.mode,
        draft: {
          ...state.draft, name: fresh.name, category: fresh.category, identity: fresh.identity,
        },
      };
    }
    case 'value-mode':
      return {
        ...state, valueMode: action.mode, valueText: action.text,
        addValueMode: state.editingId ? state.addValueMode : action.mode,
      };
    case 'value-text':
      return { ...state, valueText: action.text };
    case 'draft':
      return { ...state, draft: action.update(state.draft) };
  }
}
