import type { OverlayAction, OverlayPreferences, OverlayShortcutStatus } from '../shared/overlay'

type ShortcutDriver = {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
  isRegistered(accelerator: string): boolean
}

const emptyStatus = (): OverlayShortcutStatus => ({ timer: null, counters: {} })
const recordingTokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type RecorderOwner = {
  webContents: { mainFrame: unknown }
  isDestroyed(): boolean
  isFocused(): boolean
}

export function assertOverlayRecorderOwner(
  owner: RecorderOwner | null, sender: unknown, frame: unknown, recording: unknown,
): void {
  if (!owner || owner.isDestroyed() || sender !== owner.webContents || frame == null ||
    frame !== owner.webContents.mainFrame || (recording === true && !owner.isFocused())) {
    throw new Error('Shortcut recording is available only in the main window.')
  }
}

/** Owns only the app's overlay bindings. Recording state never enters saved preferences. */
export class OverlayShortcuts {
  private owned = new Map<string, () => void>()
  private recordingToken: string | null = null
  private status = emptyStatus()

  constructor(private readonly driver: ShortcutDriver, private readonly send: (action: OverlayAction) => void) {}

  private unregister(verifyRelease = false): void {
    for (const accelerator of this.owned.keys()) {
      this.driver.unregister(accelerator)
      if (verifyRelease && this.driver.isRegistered(accelerator)) {
        throw new Error('Could not pause overlay shortcuts for recording.')
      }
      this.owned.delete(accelerator)
    }
    this.status = emptyStatus()
  }

  private register(accelerator: string, action: OverlayAction): OverlayShortcutStatus['timer'] {
    if (!accelerator) return null
    const callback = (): void => {
      if (!this.recordingToken && this.owned.get(accelerator) === callback) this.send(action)
    }
    try {
      const registered = this.driver.register(accelerator, callback)
      if (registered) this.owned.set(accelerator, callback)
      return { accelerator, registered, error: registered ? null : 'Unavailable or already registered by another application' }
    } catch (error) {
      return { accelerator, registered: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  sync(preferences: OverlayPreferences): OverlayShortcutStatus {
    if (this.recordingToken) return this.status
    this.unregister()
    const counters: OverlayShortcutStatus['counters'] = {}
    for (const counterId of preferences.counterIds) {
      const result = this.register(preferences.counterShortcuts[counterId] ?? '', { type: 'counter-delta', counterId, delta: 1 })
      if (result) counters[counterId] = result
    }
    this.status = { timer: this.register(preferences.timerShortcut, { type: 'timer-toggle' }), counters }
    return this.status
  }

  setRecording(token: unknown, recording: unknown, preferences: OverlayPreferences): OverlayShortcutStatus {
    if (typeof token !== 'string' || !recordingTokenPattern.test(token) ||
      typeof recording !== 'boolean') throw new Error('Invalid shortcut recording request.')
    if (!recording) return token === this.recordingToken ? this.finishRecording(preferences) : this.status
    if (this.recordingToken && this.recordingToken !== token) throw new Error('Another shortcut is being recorded.')
    this.recordingToken = token
    try {
      this.unregister(true)
    } catch (error) {
      this.finishRecording(preferences)
      throw error
    }
    return this.status
  }

  finishRecording(preferences: OverlayPreferences): OverlayShortcutStatus {
    if (!this.recordingToken) return this.status
    this.recordingToken = null
    return this.sync(preferences)
  }

  stop(): void {
    this.recordingToken = null
    this.unregister()
  }
}
