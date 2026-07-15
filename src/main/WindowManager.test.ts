import { describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, WebContents } from 'electron'
import type { MovieWindowInit, RemoteMediaCommandResult } from '@shared/types'

const electronMocks = vi.hoisted(() => ({
  browserWindowOptions: [] as Array<Record<string, unknown>>
}))

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindow {
    readonly webContents = {
      on: vi.fn(),
      send: vi.fn(),
      setWindowOpenHandler: vi.fn()
    }

    constructor(options: Record<string, unknown>) {
      electronMocks.browserWindowOptions.push(options)
    }

    setMenuBarVisibility = vi.fn()
    on = vi.fn()
    loadURL = vi.fn(async () => undefined)
  },
  ipcMain: { handle: vi.fn() },
  screen: {},
  shell: { openExternal: vi.fn(async () => undefined) }
}))

import { rendererWebPreferencesForRole, WindowManager } from './WindowManager'

describe('WindowManager main window sizing', () => {
  it('keeps the application at or above a comfortable 1280 by 720 viewport', () => {
    electronMocks.browserWindowOptions.length = 0

    const manager = new WindowManager({} as never)
    manager.createMainWindow()

    expect(electronMocks.browserWindowOptions).toHaveLength(1)
    expect(electronMocks.browserWindowOptions[0]).toMatchObject({
      width: 1280,
      height: 780,
      minWidth: 1280,
      minHeight: 720
    })
  })
})

describe('WindowManager renderer capabilities', () => {
  const preload = 'C:\\WatchAlong\\preload.js'
  const sandboxedPreferences = {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  }

  it.each(['main', 'movie'] as const)('enables native audio-track access for the %s playback renderer', (role) => {
    expect(rendererWebPreferencesForRole(preload, role)).toEqual({
      ...sandboxedPreferences,
      enableBlinkFeatures: 'AudioVideoTracks'
    })
  })

  it('keeps the onboarding and import wizard on the baseline renderer capabilities', () => {
    const preferences = rendererWebPreferencesForRole(preload, 'wizard')

    expect(preferences).toEqual(sandboxedPreferences)
    expect(preferences).not.toHaveProperty('enableBlinkFeatures')
  })
})

describe('WindowManager detached renderer binding', () => {
  it('accepts lifecycle and media reports only from the current movie webContents', () => {
    const manager = new WindowManager({} as never)
    const currentSender = {} as WebContents
    const staleSender = {} as WebContents
    const mainSend = vi.fn()
    const ready = vi.fn()
    const init: MovieWindowInit = {
      sessionId: 'session-1',
      title: 'The Raid',
      mediaUrl: 'watchalong://media/session-1/movie',
      subtitleText: null,
      currentTime: 12,
      playbackRate: 1,
      volume: 0.8,
      muted: false,
      audioTrackPreference: { label: 'Indonesian', language: 'ind', ordinal: 1 }
    }
    const internals = manager as unknown as {
      movieWindow: BrowserWindow | null
      mainWindow: BrowserWindow | null
      movieWindowInit: MovieWindowInit | null
      resolveMovieWindowReady: (() => void) | null
      pendingMovieCommands: {
        add(id: string, resolve: (result: RemoteMediaCommandResult) => void): void
      }
    }
    internals.movieWindow = {
      isDestroyed: () => false,
      webContents: currentSender
    } as unknown as BrowserWindow
    internals.mainWindow = {
      isDestroyed: () => false,
      webContents: { send: mainSend }
    } as unknown as BrowserWindow
    internals.movieWindowInit = init
    internals.resolveMovieWindowReady = ready

    expect(manager.getMovieWindowInit(staleSender)).toBeNull()
    expect(manager.getMovieWindowInit(currentSender)).toBe(init)
    expect(manager.markMovieWindowReady(staleSender)).toBe(false)
    expect(ready).not.toHaveBeenCalled()
    expect(manager.markMovieWindowReady(currentSender)).toBe(true)
    expect(ready).toHaveBeenCalledOnce()

    expect(manager.requestMovieWindowPopIn(staleSender)).toBe(false)
    expect(mainSend).not.toHaveBeenCalled()
    expect(manager.requestMovieWindowPopIn(currentSender)).toBe(true)
    expect(mainSend).toHaveBeenCalledWith('watchalong:movie-window-pop-in-requested', {
      sessionId: 'session-1'
    })

    mainSend.mockClear()
    const mediaEvent = {
      type: 'audiotrackchange',
      state: remoteState(),
      audioTrackSnapshot: { tracks: 'malformed' }
    }
    expect(manager.handleMovieMediaEvent(staleSender, mediaEvent)).toBe(false)
    expect(mainSend).not.toHaveBeenCalled()
    expect(manager.handleMovieMediaEvent(currentSender, mediaEvent)).toBe(true)
    expect(mainSend).toHaveBeenCalledWith('watchalong:movie-media-event', {
      type: 'audiotrackchange',
      state: remoteState()
    })

    const resolved = vi.fn()
    internals.pendingMovieCommands.add('audio-1', resolved)
    const commandResult = {
      id: 'audio-1',
      ok: true,
      state: remoteState({ currentTime: 14 }),
      audioTrackSnapshot: { tracks: [null] }
    }
    expect(manager.handleMovieMediaCommandResult(staleSender, commandResult)).toBe(false)
    expect(resolved).not.toHaveBeenCalled()
    expect(manager.handleMovieMediaCommandResult(currentSender, commandResult)).toBe(true)
    expect(resolved).toHaveBeenCalledWith({
      id: 'audio-1',
      ok: true,
      state: remoteState({ currentTime: 14 })
    })
  })

  it('rejects reports from a sender whose movie window is already destroyed', () => {
    const manager = new WindowManager({} as never)
    const sender = {} as WebContents
    const internals = manager as unknown as { movieWindow: BrowserWindow | null }
    internals.movieWindow = {
      isDestroyed: () => true,
      webContents: sender
    } as unknown as BrowserWindow

    expect(manager.getMovieWindowInit(sender)).toBeNull()
    expect(manager.markMovieWindowReady(sender)).toBe(false)
    expect(manager.requestMovieWindowPopIn(sender)).toBe(false)
    expect(manager.handleMovieMediaEvent(sender, { type: 'pause', state: remoteState() })).toBe(false)
  })
})

function remoteState(patch: Partial<ReturnType<typeof remoteStateShape>> = {}) {
  return { ...remoteStateShape(), ...patch }
}

function remoteStateShape() {
  return {
    currentTime: 0,
    duration: 120,
    paused: true,
    playbackRate: 1,
    readyState: 4,
    seeking: false,
    ended: false,
    volume: 1,
    muted: false
  }
}
