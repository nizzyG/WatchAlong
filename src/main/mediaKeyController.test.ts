import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, WebContents } from 'electron'
import { IPC_PREFIX } from './constants'

const electronMocks = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn(),
  shortcutCallback: null as (() => void) | null
}))

vi.mock('electron', () => ({
  globalShortcut: {
    register: electronMocks.register,
    unregister: electronMocks.unregister
  }
}))

import { MEDIA_PLAY_PAUSE_ACCELERATOR, MediaKeyController } from './mediaKeyController'

describe('MediaKeyController', () => {
  beforeEach(() => {
    electronMocks.shortcutCallback = null
    electronMocks.register.mockReset().mockImplementation((_accelerator, callback) => {
      electronMocks.shortcutCallback = callback
      return true
    })
    electronMocks.unregister.mockReset()
  })

  it('registers globally only for the current main renderer and forwards the key there', () => {
    const owner = createWebContentsHarness()
    const mainWindow = createMainWindow(owner.webContents)
    const controller = new MediaKeyController(() => mainWindow)

    expect(controller.setPlayPauseEnabled(createWebContentsHarness().webContents, true)).toBe(false)
    expect(electronMocks.register).not.toHaveBeenCalled()

    expect(controller.setPlayPauseEnabled(owner.webContents, true)).toBe(true)
    expect(electronMocks.register).toHaveBeenCalledWith(
      MEDIA_PLAY_PAUSE_ACCELERATOR,
      expect.any(Function)
    )
    expect(controller.setPlayPauseEnabled(owner.webContents, true)).toBe(true)
    expect(electronMocks.register).toHaveBeenCalledOnce()

    electronMocks.shortcutCallback?.()
    expect(owner.send).toHaveBeenCalledWith(`${IPC_PREFIX}:media-play-pause`)

    expect(controller.setPlayPauseEnabled(owner.webContents, false)).toBe(false)
    expect(electronMocks.unregister).toHaveBeenCalledWith(MEDIA_PLAY_PAUSE_ACCELERATOR)
    electronMocks.shortcutCallback?.()
    expect(owner.send).toHaveBeenCalledOnce()
  })

  it.each(['destroyed', 'render-process-gone'])('releases the shortcut when its renderer emits %s', (eventName) => {
    const owner = createWebContentsHarness()
    const controller = new MediaKeyController(() => createMainWindow(owner.webContents))

    controller.setPlayPauseEnabled(owner.webContents, true)
    owner.emit(eventName)

    expect(electronMocks.unregister).toHaveBeenCalledWith(MEDIA_PLAY_PAUSE_ACCELERATOR)
    expect(owner.listenerCount()).toBe(0)
  })

  it('does not retain ownership when the OS declines the accelerator', () => {
    electronMocks.register.mockImplementationOnce(() => false)
    const owner = createWebContentsHarness()
    const controller = new MediaKeyController(() => createMainWindow(owner.webContents))

    expect(controller.setPlayPauseEnabled(owner.webContents, true)).toBe(false)
    expect(owner.listenerCount()).toBe(0)
    controller.dispose()
    expect(electronMocks.unregister).not.toHaveBeenCalled()
  })

  it('drops a stale registration before dispatch and validates renderer input', () => {
    const owner = createWebContentsHarness()
    let mainWindow = createMainWindow(owner.webContents)
    const controller = new MediaKeyController(() => mainWindow)

    expect(() => controller.setPlayPauseEnabled(owner.webContents, 'yes')).toThrow(TypeError)
    controller.setPlayPauseEnabled(owner.webContents, true)
    mainWindow = createMainWindow(createWebContentsHarness().webContents)
    electronMocks.shortcutCallback?.()

    expect(owner.send).not.toHaveBeenCalled()
    expect(electronMocks.unregister).toHaveBeenCalledWith(MEDIA_PLAY_PAUSE_ACCELERATOR)
  })
})

function createMainWindow(webContents: WebContents): BrowserWindow {
  return {
    isDestroyed: () => false,
    webContents
  } as unknown as BrowserWindow
}

function createWebContentsHarness(): {
  webContents: WebContents
  send: ReturnType<typeof vi.fn>
  emit(name: string): void
  listenerCount(): number
} {
  const listeners = new Map<string, Set<() => void>>()
  const send = vi.fn()
  const webContents = {
    isDestroyed: () => false,
    send,
    once: (name: string, callback: () => void) => {
      const wrapped = (): void => {
        listeners.get(name)?.delete(wrapped)
        callback()
      }
      const group = listeners.get(name) ?? new Set<() => void>()
      group.add(wrapped)
      listeners.set(name, group)
      return webContents
    },
    removeListener: (name: string, callback: () => void) => {
      // EventEmitter.once normally lets removeListener use the original callback.
      // This harness clears the matching lifecycle group for that same behavior.
      void callback
      listeners.get(name)?.clear()
      return webContents
    }
  } as unknown as WebContents

  return {
    webContents,
    send,
    emit(name) {
      for (const callback of [...(listeners.get(name) ?? [])]) callback()
    },
    listenerCount() {
      return [...listeners.values()].reduce((count, group) => count + group.size, 0)
    }
  }
}
