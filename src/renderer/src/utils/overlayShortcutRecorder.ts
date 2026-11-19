type ShortcutKeyEvent = Pick<KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'repeat' | 'isComposing' | 'getModifierState'>;

type ShortcutCapture =
  | { kind: 'modifier' | 'ignored' | 'cancel' | 'tab' | 'unsupported' }
  | { kind: 'accelerator'; accelerator: string };

const modifiers = new Set(['Control', 'Alt', 'Shift', 'Meta', 'OS', 'AltGraph']);
const namedKeys = new Map<string, string>([
  [' ', 'Space'], ['Escape', 'Escape'], ['Tab', 'Tab'], ['Enter', 'Enter'],
  ['Backspace', 'Backspace'], ['Delete', 'Delete'], ['Insert', 'Insert'],
  ['Home', 'Home'], ['End', 'End'], ['PageUp', 'PageUp'], ['PageDown', 'PageDown'],
  ['ArrowUp', 'Up'], ['ArrowDown', 'Down'], ['ArrowLeft', 'Left'], ['ArrowRight', 'Right'],
  ['PrintScreen', 'PrintScreen'], ['CapsLock', 'Capslock'], ['ScrollLock', 'Scrolllock'], ['NumLock', 'Numlock'],
  ['AudioVolumeUp', 'VolumeUp'], ['AudioVolumeDown', 'VolumeDown'], ['AudioVolumeMute', 'VolumeMute'],
  ['MediaTrackNext', 'MediaNextTrack'], ['MediaTrackPrevious', 'MediaPreviousTrack'],
  ['MediaPlayPause', 'MediaPlayPause'], ['MediaStop', 'MediaStop'],
]);
const keypadOperators = new Map([
  ['NumpadAdd', 'numadd'], ['NumpadSubtract', 'numsub'], ['NumpadMultiply', 'nummult'],
  ['NumpadDivide', 'numdiv'], ['NumpadDecimal', 'numdec'],
]);

function acceleratorKey(event: ShortcutKeyEvent): string | undefined {
  const { key, code } = event;
  if (key.length === 1 && code.startsWith('Numpad')) {
    if (/^[0-9]$/.test(key)) return 'num' + key;
    const operator = keypadOperators.get(code);
    if (operator) return operator;
  }
  if (/^[a-z0-9]$/i.test(key)) return key.toUpperCase();
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key)) return key;
  // A shifted number-row key can report a symbol, e.g. § for Shift+3 on QWERTZ.
  if (event.shiftKey && key.length === 1 && /^Digit[0-9]$/.test(code)) return code.slice(-1);
  // Shift+punctuation outside the number row does not identify the unshifted
  // key across layouts. An unshifted ASCII punctuation key can be used as-is.
  if (!event.shiftKey && /^[\x21-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E]$/.test(key))
    return key === '+' ? 'Plus' : key;
  return namedKeys.get(key);
}

export function parseOverlayShortcutEvent(event: ShortcutKeyEvent, isMac: boolean): ShortcutCapture {
  if (event.repeat || event.isComposing) return { kind: 'ignored' };
  if (modifiers.has(event.key)) return { kind: 'modifier' };
  if (event.getModifierState('AltGraph')) return { kind: 'unsupported' };
  const hasCommandModifier = event.ctrlKey || event.altKey || event.metaKey;
  if (event.key === 'Tab' && !hasCommandModifier) return { kind: 'tab' };
  if (event.key === 'Escape' && !hasCommandModifier && !event.shiftKey) return { kind: 'cancel' };

  const key = acceleratorKey(event);
  if (!key) return { kind: 'unsupported' };
  const chord: string[] = [];
  if (event.ctrlKey) chord.push('Control');
  if (event.altKey) chord.push('Alt');
  if (event.shiftKey) chord.push('Shift');
  if (event.metaKey) chord.push(isMac ? 'Command' : 'Super');
  return { kind: 'accelerator', accelerator: [...chord, key].join('+') };
}

const modifierAliases = new Map([
  ['ctrl', 'control'], ['control', 'control'], ['alt', 'alt'], ['option', 'alt'], ['shift', 'shift'],
  ['cmd', 'command'], ['command', 'command'], ['super', 'super'], ['meta', 'super'], ['altgr', 'altgr'],
]);

// Compare legacy text without changing the spelling or portability of a saved preference.
function comparableShortcut(value: string, isMac: boolean): string | null {
  const held = new Set<string>();
  let key: string | undefined;
  for (const segment of value.split('+')) {
    const token = segment.trim().toLowerCase();
    if (!token) return null;
    let modifier = modifierAliases.get(token);
    if (token === 'commandorcontrol' || token === 'cmdorctrl') modifier = isMac ? 'command' : 'control';
    if (modifier) {
      held.add(isMac && modifier === 'super' ? 'command' : modifier);
    } else {
      if (key) return null;
      key = token === 'return' ? 'enter' : token === 'esc' ? 'escape' : token;
    }
  }
  return key ? [...Array.from(held).sort(), key].join('+') : null;
}

export function sameOverlayShortcut(left: string, right: string, isMac: boolean): boolean {
  const first = comparableShortcut(left, isMac);
  return first !== null && first === comparableShortcut(right, isMac);
}
