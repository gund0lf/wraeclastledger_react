import { describe, expect, it, vi } from 'vitest'
import { assertOverlayRecorderOwner, OverlayShortcuts } from '../../../main/overlayShortcuts'
import { DEFAULT_OVERLAY_PREFERENCES, type OverlayPreferences } from '../../../shared/overlay'

const first = '00000000-0000-4000-8000-000000000001'
const second = '00000000-0000-4000-8000-000000000002'
const empty = { timer: null, counters: {} }
const preferences = (timerShortcut = 'F8', counterShortcut = 'F9'): OverlayPreferences => ({
  ...DEFAULT_OVERLAY_PREFERENCES, timerShortcut, counterIds: ['maps'], counterShortcuts: { maps: counterShortcut },
})

function fixture() {
  const callbacks = new Map<string, () => void>()
  const driver = {
    register: vi.fn((key: string, callback: () => void) => {
      if (callbacks.has(key)) return false
      callbacks.set(key, callback)
      return true
    }),
    unregister: vi.fn((key: string) => { callbacks.delete(key) }),
    isRegistered: vi.fn((key: string) => callbacks.has(key)),
  }
  const send = vi.fn()
  return { callbacks, driver, send, shortcuts: new OverlayShortcuts(driver, send) }
}

describe('main process overlay shortcut recording', () => {
  it('reports actual registrations and dispatches the timer and selected counter', () => {
    const { callbacks, send, shortcuts } = fixture()
    expect(shortcuts.sync(preferences())).toEqual({
      timer: { accelerator: 'F8', registered: true, error: null },
      counters: { maps: { accelerator: 'F9', registered: true, error: null } },
    })
    callbacks.get('F8')!()
    callbacks.get('F9')!()
    expect(send.mock.calls).toEqual([[{ type: 'timer-toggle' }], [{ type: 'counter-delta', counterId: 'maps', delta: 1 }]])
  })

  it('verifies every owned key was released before acknowledging and leaves other registrations alone', () => {
    const { callbacks, driver, shortcuts } = fixture()
    const independent = vi.fn()
    callbacks.set('F5', independent)
    shortcuts.sync(preferences())
    expect(shortcuts.setRecording(first, true, preferences())).toEqual(empty)
    expect(driver.isRegistered.mock.calls).toEqual([['F9'], ['F8']])
    expect([...callbacks.entries()]).toEqual([['F5', independent]])
  })

  it('keeps all old callbacks inert during recording and through interleaved preference changes', () => {
    const { callbacks, send, shortcuts } = fixture()
    shortcuts.sync(preferences())
    const oldTimer = callbacks.get('F8')!
    const oldCounter = callbacks.get('F9')!
    shortcuts.setRecording(first, true, preferences())
    expect(shortcuts.sync(preferences('F8', 'F10'))).toEqual(empty)
    expect(callbacks.size).toBe(0)
    oldTimer()
    oldCounter()
    const restored = shortcuts.setRecording(first, false, preferences('F8', 'F10'))
    expect(restored.timer?.accelerator).toBe('F8')
    expect(restored.counters.maps.accelerator).toBe('F10')
    expect(callbacks.has('F9')).toBe(false)
    oldTimer()
    oldCounter()
    expect(send).not.toHaveBeenCalled()
    callbacks.get('F8')!()
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'timer-toggle' })
  })

  it('rejects competing starts, tolerates duplicate starts, and ignores stale ends from an earlier field', () => {
    const { callbacks, driver, shortcuts } = fixture()
    shortcuts.sync(preferences())
    shortcuts.setRecording(first, true, preferences())
    expect(shortcuts.setRecording(first, true, preferences())).toEqual(empty)
    expect(() => shortcuts.setRecording(second, true, preferences())).toThrow('Another shortcut')
    shortcuts.setRecording(first, false, preferences())
    shortcuts.setRecording(second, true, preferences())
    expect(shortcuts.setRecording(first, false, preferences())).toEqual(empty)
    expect(callbacks.size).toBe(0)
    const final = shortcuts.setRecording(second, false, preferences())
    driver.register.mockClear()
    expect(shortcuts.setRecording(second, false, preferences())).toBe(final)
    expect(driver.register).not.toHaveBeenCalled()
  })

  it('restores the latest preferences on cancellation or blur and returns that same result to a late end', () => {
    const { driver, shortcuts } = fixture()
    shortcuts.sync(preferences())
    shortcuts.setRecording(first, true, preferences())
    const latest = preferences('F4', 'F6')
    const restored = shortcuts.finishRecording(latest)
    expect(restored.timer?.accelerator).toBe('F4')
    expect(restored.counters.maps.accelerator).toBe('F6')
    driver.register.mockClear()
    expect(shortcuts.setRecording(first, false, latest)).toBe(restored)
    expect(shortcuts.finishRecording(latest)).toBe(restored)
    expect(driver.register).not.toHaveBeenCalled()
  })

  it('discards the recorder on renderer loss and re-arms only when the next renderer syncs', () => {
    const { callbacks, send, shortcuts } = fixture()
    shortcuts.sync(preferences())
    const oldTimer = callbacks.get('F8')!
    shortcuts.setRecording(first, true, preferences())
    shortcuts.stop()
    expect(shortcuts.setRecording(first, false, preferences())).toEqual(empty)
    expect(callbacks.size).toBe(0)
    shortcuts.sync(preferences())
    oldTimer()
    expect(send).not.toHaveBeenCalled()
    shortcuts.stop()
    shortcuts.stop()
    expect(callbacks.size).toBe(0)
  })

  it('refuses a begin if native verification still sees an accelerator, and recovers the previous bindings', () => {
    const { callbacks, driver, shortcuts } = fixture()
    shortcuts.sync(preferences())
    driver.unregister.mockImplementationOnce(() => {})
    expect(() => shortcuts.setRecording(first, true, preferences())).toThrow('Could not pause')
    expect([...callbacks.keys()].sort()).toEqual(['F8', 'F9'])
    expect(shortcuts.setRecording(second, true, preferences())).toEqual(empty)
  })

  it('returns registration conflicts as unavailable and retains native register errors', () => {
    const { callbacks, driver, shortcuts } = fixture()
    const other = vi.fn()
    callbacks.set('F8', other)
    driver.register.mockImplementationOnce(() => { throw new Error('Unsupported accelerator') })
    const status = shortcuts.sync(preferences())
    expect(status.timer).toMatchObject({ registered: false, accelerator: 'F8', error: expect.stringContaining('Unavailable') })
    expect(status.counters.maps).toMatchObject({ registered: false, error: 'Unsupported accelerator' })
    shortcuts.stop()
    expect(callbacks.get('F8')).toBe(other)
  })

  it.each([['', true], ['not-a-token', false], [null, true], [first, null], [first, 'true']])(
    'rejects an invalid recorder token or state (%j, %j) without changing bindings', (token, value) => {
      const { callbacks, shortcuts } = fixture()
      shortcuts.sync(preferences())
      expect(() => shortcuts.setRecording(token, value, preferences())).toThrow('Invalid shortcut recording request')
      expect(callbacks.size).toBe(2)
    },
  )
})

describe('recorder IPC sender', () => {
  const frame = {}
  const webContents = { mainFrame: frame }
  const owner = { webContents, isFocused: () => true, isDestroyed: () => false }

  it('allows the focused main frame and accepts its cleanup after focus has moved', () => {
    expect(() => assertOverlayRecorderOwner(owner, webContents, frame, true)).not.toThrow()
    expect(() => assertOverlayRecorderOwner({ ...owner, isFocused: () => false }, webContents, frame, false)).not.toThrow()
  })

  it.each([
    ['no owner', null, webContents, frame],
    ['destroyed owner', { ...owner, isDestroyed: () => true }, webContents, frame],
    ['unfocused owner', { ...owner, isFocused: () => false }, webContents, frame],
    ['overlay or another webContents', owner, { mainFrame: frame }, frame],
    ['child frame', owner, webContents, {}],
    ['missing frame', owner, webContents, null],
  ] as const)('refuses %s', (_label, window, sender, senderFrame) => {
    expect(() => assertOverlayRecorderOwner(window, sender, senderFrame, true)).toThrow('only in the main window')
  })
})
