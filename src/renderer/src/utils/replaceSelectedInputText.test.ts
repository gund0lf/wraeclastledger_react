import { describe, expect, it, vi } from 'vitest';
import type { ClipboardEvent, CompositionEvent, FocusEvent, KeyboardEvent, MouseEvent } from 'react';
import { replaceSelectedInputText } from './replaceSelectedInputText';

const inputWithValue = (value: string) => {
  const select = vi.fn();
  return { input: { value, select } as unknown as HTMLInputElement, select };
};
const keyEvent = (input: HTMLInputElement, key: string, overrides = {}) => ({
  currentTarget: input, key, ctrlKey: false, metaKey: false, altKey: false,
  nativeEvent: { isComposing: false }, ...overrides,
} as KeyboardEvent<HTMLInputElement>);

describe('replace selected custom-loot text', () => {
  it('selects the existing dropdown label on mouse focus, click, paste and IME start', () => {
    const { input, select } = inputWithValue('Coral Reef Chart');
    const handlers = replaceSelectedInputText('Coral Reef Chart');
    handlers.onFocus?.({ currentTarget: input } as FocusEvent<HTMLInputElement>);
    handlers.onClick?.({ currentTarget: input } as MouseEvent<HTMLInputElement>);
    handlers.onPaste?.({ currentTarget: input } as ClipboardEvent<HTMLInputElement>);
    handlers.onCompositionStart?.({ currentTarget: input } as CompositionEvent<HTMLInputElement>);
    expect(select).toHaveBeenCalledTimes(4);
  });

  it('also replaces a selected label when typing without leaving the focused picker', () => {
    const { input, select } = inputWithValue('Charts (type unknown)');
    replaceSelectedInputText(input.value).onKeyDown?.(keyEvent(input, 'S'));
    expect(select).toHaveBeenCalledOnce();
  });

  it('does not repeatedly select an in-progress search', () => {
    const { input, select } = inputWithValue('Sandy');
    const handlers = replaceSelectedInputText('Coral Reef Chart');
    handlers.onKeyDown?.(keyEvent(input, ' '));
    handlers.onClick?.({ currentTarget: input } as MouseEvent<HTMLInputElement>);
    handlers.onPaste?.({ currentTarget: input } as ClipboardEvent<HTMLInputElement>);
    expect(select).not.toHaveBeenCalled();
  });

  it.each(['Tab', 'ArrowLeft', 'ArrowDown', 'Enter', 'Escape', 'Backspace', 'Delete'])(
    'leaves %s navigation and editing to the input', (key) => {
      const { input, select } = inputWithValue('Coral Reef Chart');
      replaceSelectedInputText(input.value).onKeyDown?.(keyEvent(input, key));
      expect(select).not.toHaveBeenCalled();
    },
  );

  it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { nativeEvent: { isComposing: true } }])(
    'does not interfere with shortcuts or an active composition (%j)', (modifier) => {
      const { input, select } = inputWithValue('Coral Reef Chart');
      replaceSelectedInputText(input.value).onKeyDown?.(keyEvent(input, 'a', modifier));
      expect(select).not.toHaveBeenCalled();
    },
  );

  it('replaces an initial zero for typing or paste but leaves authored nonzero values alone', () => {
    const { input, select } = inputWithValue('0');
    const handlers = replaceSelectedInputText('0');
    handlers.onKeyDown?.(keyEvent(input, '5'));
    handlers.onPaste?.({ currentTarget: input } as ClipboardEvent<HTMLInputElement>);
    expect(select).toHaveBeenCalledTimes(2);
    for (const value of ['12', '0.4d', '.03d', '100c', '', '0.']) {
      input.value = value;
      handlers.onKeyDown?.(keyEvent(input, '5'));
      handlers.onPaste?.({ currentTarget: input } as ClipboardEvent<HTMLInputElement>);
    }
    expect(select).toHaveBeenCalledTimes(2);
  });
});
