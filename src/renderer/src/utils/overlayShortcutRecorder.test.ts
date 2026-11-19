import { describe, expect, it } from 'vitest';
import { normalizeOverlayPreferences } from '../../../shared/overlay';
import { parseOverlayShortcutEvent, sameOverlayShortcut } from './overlayShortcutRecorder';

type Key = Parameters<typeof parseOverlayShortcutEvent>[0];
function key(key: string, options: Partial<Key> = {}): Key {
  return { key, code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
    repeat: false, isComposing: false, getModifierState: () => false, ...options };
}

describe('overlay shortcut recording', () => {
  it('only emits a preference value when one non-modifier completes the chord', () => {
    const events = [
      key('Control', { ctrlKey: true }), key('Alt', { ctrlKey: true, altKey: true }),
      key('Shift', { ctrlKey: true, altKey: true, shiftKey: true }),
      key('F9', { ctrlKey: true, altKey: true, shiftKey: true }),
      key('F9', { ctrlKey: true, altKey: true, shiftKey: true, repeat: true }),
    ];
    expect(events.map(event => parseOverlayShortcutEvent(event, false))).toEqual([
      { kind: 'modifier' }, { kind: 'modifier' }, { kind: 'modifier' },
      { kind: 'accelerator', accelerator: 'Control+Alt+Shift+F9' }, { kind: 'ignored' },
    ]);
    expect(parseOverlayShortcutEvent(key('F10', { ctrlKey: true, altKey: true, shiftKey: true }), false))
      .toEqual({ kind: 'accelerator', accelerator: 'Control+Alt+Shift+F10' });
  });

  it('uses the modifier flags at the time of the main key and maps Meta by platform', () => {
    const input = key('t', { metaKey: true, shiftKey: true });
    expect(parseOverlayShortcutEvent(input, true)).toEqual({ kind: 'accelerator', accelerator: 'Shift+Command+T' });
    expect(parseOverlayShortcutEvent(input, false)).toEqual({ kind: 'accelerator', accelerator: 'Shift+Super+T' });
    expect(parseOverlayShortcutEvent(key('Meta', { metaKey: true }), true)).toEqual({ kind: 'modifier' });
  });

  it('uses the logical letter on German QWERTZ and converts a shifted number row key', () => {
    expect(parseOverlayShortcutEvent(key('z', { code: 'KeyY', ctrlKey: true }), false))
      .toEqual({ kind: 'accelerator', accelerator: 'Control+Z' });
    expect(parseOverlayShortcutEvent(key('Y', { code: 'KeyZ', shiftKey: true }), false))
      .toEqual({ kind: 'accelerator', accelerator: 'Shift+Y' });
    expect(parseOverlayShortcutEvent(key('§', { code: 'Digit3', shiftKey: true }), false))
      .toEqual({ kind: 'accelerator', accelerator: 'Shift+3' });
  });

  it('captures unshifted punctuation using the logical character and Electron’s Plus spelling', () => {
    for (const [input, code, accelerator] of [
      [',', 'Comma', 'Control+,'], ['.', 'Period', 'Control+.'], [';', 'Semicolon', 'Control+;'],
      ['+', 'BracketRight', 'Control+Plus'], ['-', 'Slash', 'Control+-'],
    ]) {
      expect(parseOverlayShortcutEvent(key(input, { code, ctrlKey: true }), false))
        .toEqual({ kind: 'accelerator', accelerator });
    }
  });

  it('refuses shifted punctuation when its unshifted key cannot be known from the event', () => {
    // Shift+Comma yields ; on German layouts and < on US layouts.
    for (const [input, code] of [[';', 'Comma'], ['<', 'Comma'], ['?', 'Minus'], ['+', 'Equal']]) {
      expect(parseOverlayShortcutEvent(key(input, { code, ctrlKey: true, shiftKey: true }), false))
        .toEqual({ kind: 'unsupported' });
    }
    expect(sameOverlayShortcut('ctrl+,', 'Control+,', false)).toBe(true);
    expect(sameOverlayShortcut('ctrl+.', 'Control+,', false)).toBe(false);
  });

  it('does not turn a desktop AltGr character into a Control+Alt shortcut', () => {
    const level3 = { ctrlKey: true, altKey: true, getModifierState: (name: string) => name === 'AltGraph' };
    expect(parseOverlayShortcutEvent(key('AltGraph', level3), false)).toEqual({ kind: 'modifier' });
    expect(parseOverlayShortcutEvent(key('@', { code: 'KeyQ', ...level3 }), false)).toEqual({ kind: 'unsupported' });
  });

  it('does not commit a repeat or IME event and refuses unknown or nonportable key names', () => {
    for (const event of [key('F9', { repeat: true }), key('a', { isComposing: true })])
      expect(parseOverlayShortcutEvent(event, false)).toEqual({ kind: 'ignored' });
    for (const value of ['ä', 'Dead', 'Process', 'Unidentified', 'Mouse4', 'F0', 'F25', 'A+B', 'toString'])
      expect(parseOverlayShortcutEvent(key(value), false)).toEqual({ kind: 'unsupported' });
  });

  it('lets Tab and Shift+Tab move focus, lets Escape cancel, and preserves explicit modified keys', () => {
    expect(parseOverlayShortcutEvent(key('Escape'), false)).toEqual({ kind: 'cancel' });
    expect(parseOverlayShortcutEvent(key('Tab'), false)).toEqual({ kind: 'tab' });
    expect(parseOverlayShortcutEvent(key('Tab', { shiftKey: true }), false)).toEqual({ kind: 'tab' });
    expect(parseOverlayShortcutEvent(key('Escape', { shiftKey: true }), false))
      .toEqual({ kind: 'accelerator', accelerator: 'Shift+Escape' });
    expect(parseOverlayShortcutEvent(key('Tab', { ctrlKey: true }), false))
      .toEqual({ kind: 'accelerator', accelerator: 'Control+Tab' });
  });

  it.each([
    ['F1', 'F1'], ['F24', 'F24'], ['0', '0'], [' ', 'Space'], ['+', 'Plus'],
    ['ArrowLeft', 'Left'], ['ArrowRight', 'Right'], ['ArrowUp', 'Up'], ['ArrowDown', 'Down'],
    ['PageDown', 'PageDown'], ['Home', 'Home'], ['Enter', 'Enter'], ['Delete', 'Delete'],
    ['Backspace', 'Backspace'], ['AudioVolumeMute', 'VolumeMute'], ['MediaTrackNext', 'MediaNextTrack'],
  ])('records %j as %s without treating the key as a clear request', (input, accelerator) => {
    expect(parseOverlayShortcutEvent(key(input), false)).toEqual({ kind: 'accelerator', accelerator });
  });

  it('distinguishes the number pad, including a decimal comma, from the number row and NumLock-off navigation', () => {
    for (const [input, code, accelerator] of [
      ['1', 'Digit1', '1'], ['1', 'Numpad1', 'num1'], [',', 'NumpadDecimal', 'numdec'],
      ['+', 'NumpadAdd', 'numadd'], ['End', 'Numpad1', 'End'], ['Delete', 'NumpadDecimal', 'Delete'],
    ]) {
      expect(parseOverlayShortcutEvent(key(input, { code }), false)).toEqual({ kind: 'accelerator', accelerator });
    }
  });
});

describe('comparison with existing overlay shortcuts', () => {
  it('compares actual saved text without rewriting it or changing CmdOrCtrl portability', () => {
    const preferences = normalizeOverlayPreferences({
      timerShortcut: 'CommandOrControl+Shift+T', counterShortcuts: { 'stat:starfallCraters': 'Ctrl+1' },
    });
    expect(sameOverlayShortcut(preferences.timerShortcut, 'Shift+CONTROL+t', false)).toBe(true);
    expect(sameOverlayShortcut(preferences.timerShortcut, 'control+Shift+t', true)).toBe(false);
    expect(sameOverlayShortcut(preferences.timerShortcut, 'shift+cmd+T', true)).toBe(true);
    expect(sameOverlayShortcut(preferences.counterShortcuts['stat:starfallCraters'], 'Control+1', false)).toBe(true);
    expect(preferences.timerShortcut).toBe('CommandOrControl+Shift+T');
    expect(preferences.counterShortcuts['stat:starfallCraters']).toBe('Ctrl+1');
  });

  it('accepts case, modifier order and equivalent Enter/Escape and Mac modifier spellings', () => {
    expect(sameOverlayShortcut(' Alt + Ctrl + Return ', 'control+alt+enter', false)).toBe(true);
    expect(sameOverlayShortcut('CmdOrCtrl+Esc', 'Control+Escape', false)).toBe(true);
    expect(sameOverlayShortcut('Command+Option+j', 'Meta+Alt+J', true)).toBe(true);
    expect(sameOverlayShortcut('Super+F9', 'Meta+F9', false)).toBe(true);
    expect(sameOverlayShortcut('CmdOrCtrl+t', 'Super+t', false)).toBe(false);
  });

  it('distinguishes different keys, missing modifiers, and empty or incomplete bindings', () => {
    for (const text of ['', '  ', 'Control', 'ctrl+', '+F9', 'Alt+F9+F10', 'Control+Alt++F9'])
      expect(sameOverlayShortcut(text, text, false)).toBe(false);
    expect(sameOverlayShortcut('F9', 'F10', false)).toBe(false);
    expect(sameOverlayShortcut('Ctrl+Shift+t', 'ctrl+t', false)).toBe(false);
    expect(sameOverlayShortcut('Alt+num1', 'Alt+1', false)).toBe(false);
  });
});
