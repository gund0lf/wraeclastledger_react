import type { InputHTMLAttributes } from 'react';

/** Select only the committed label/default, not an in-progress search or a
 * nonzero price. The browser then handles typing, paste and IME normally.
 * Key handling also covers typing immediately after choosing a dropdown row,
 * when the input already has focus and no new focus/click event is emitted. */
export function replaceSelectedInputText(
  selectedText: string,
): Pick<InputHTMLAttributes<HTMLInputElement>,
  'onFocus' | 'onClick' | 'onKeyDown' | 'onPaste' | 'onCompositionStart'> {
  const select = (input: HTMLInputElement): void => {
    if (selectedText && input.value === selectedText) input.select();
  };
  return {
    onFocus: (event) => select(event.currentTarget),
    onClick: (event) => select(event.currentTarget),
    onPaste: (event) => select(event.currentTarget),
    onCompositionStart: (event) => select(event.currentTarget),
    onKeyDown: (event) => {
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
        && !event.nativeEvent.isComposing) {
        select(event.currentTarget);
      }
    },
  };
}
