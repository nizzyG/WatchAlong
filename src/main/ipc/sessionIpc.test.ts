import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_PREFIX } from '../constants'
import { MediaPathGrantStore } from '../services/mediaPathGrants'

const ipcMocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  selectVideo: vi.fn(),
  showItemInFolder: vi.fn(),
  senderWindow: {}
}))

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn(() => ipcMocks.senderWindow) },
  shell: { showItemInFolder: ipcMocks.showItemInFolder }
}))

vi.mock('./security', () => ({
  handleTrustedIpc: (
    channel: string,
    _roles: readonly string[],
    listener: (...args: unknown[]) => unknown
  ) => ipcMocks.handlers.set(channel, listener)
}))

vi.mock('./utils', () => ({
  getMediaPath: vi.fn(() => null),
  getSenderWindow: vi.fn(() => ipcMocks.senderWindow),
  selectSubtitle: vi.fn(async () => null),
  selectVideo: (...args: unknown[]) => ipcMocks.selectVideo(...args)
}))

import { registerSessionIpc } from './sessionIpc'

describe('session media IPC capabilities', () => {
  let root: string
  let reactionPath: string
  let moviePath: string
  let arbitraryPath: string
  let boundPaths: Array<string | null>
  let sessionStore: ReturnType<typeof createSessionStore>
  let mediaPathGrants: MediaPathGrantStore

  beforeEach(() => {
    ipcMocks.handlers.clear()
    ipcMocks.selectVideo.mockReset()
    ipcMocks.showItemInFolder.mockReset()
    root = mkdtempSync(join(tmpdir(), 'watchalong-session-ipc-'))
    reactionPath = join(root, 'reaction.mp4')
    moviePath = join(root, 'movie.mkv')
    arbitraryPath = join(root, 'private.mp4')
    for (const filePath of [reactionPath, moviePath, arbitraryPath]) {
      writeFileSync(filePath, 'video')
    }
    boundPaths = []
    sessionStore = createSessionStore()
    mediaPathGrants = new MediaPathGrantStore(() => boundPaths)
    registerSessionIpc({
      sessionStore: sessionStore as never,
      mediaPathGrants,
      mainWindowGetter: () => ipcMocks.senderWindow as never
    })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it.each([
    [`${IPC_PREFIX}:set-session-media`, ['reaction', 'PATH']],
    [`${IPC_PREFIX}:replace-session-media`, ['session-id', 'reaction', 'PATH']],
    [`${IPC_PREFIX}:create-or-switch-session-from-paths`, ['PATH', 'PATH']]
  ])('blocks arbitrary renderer paths on %s', async (channel, rawArgs) => {
    const handler = getHandler(channel)
    const args = rawArgs.map((value) => value === 'PATH' ? arbitraryPath : value)

    expect(() => handler({}, ...args)).toThrow(/Select the media file/)
    expect(sessionStore.setSessionMedia).not.toHaveBeenCalled()
    expect(sessionStore.replaceSessionMedia).not.toHaveBeenCalled()
    expect(sessionStore.createOrSwitchSession).not.toHaveBeenCalled()
  })

  it('mints a grant from the video picker and consumes it when media is attached', async () => {
    ipcMocks.selectVideo.mockResolvedValue({ path: reactionPath, name: 'reaction.mp4' })
    const select = getHandler(`${IPC_PREFIX}:select-reaction-file`)
    const setMedia = getHandler(`${IPC_PREFIX}:set-session-media`)

    await expect(select({})).resolves.toEqual({ path: reactionPath, name: 'reaction.mp4' })
    expect(setMedia({}, 'reaction', reactionPath, 'local')).toEqual({ ok: true })
    expect(sessionStore.setSessionMedia).toHaveBeenCalledWith('reaction', reactionPath, 'local', undefined, undefined)
    expect(() => setMedia({}, 'reaction', reactionPath, 'local')).toThrow(/Select the media file/)
  })

  it('keeps a downloaded grant available when attachment persistence fails so Attach can be retried', () => {
    mediaPathGrants.grantDownloadedPath(reactionPath)
    sessionStore.setSessionMedia
      .mockImplementationOnce(() => { throw new Error('disk write failed') })
      .mockReturnValueOnce({ ok: true })
    const setMedia = getHandler(`${IPC_PREFIX}:set-session-media`)

    expect(() => setMedia({}, 'reaction', reactionPath, 'youtube')).toThrow(/disk write failed/)
    expect(setMedia({}, 'reaction', reactionPath, 'youtube')).toEqual({ ok: true })
    expect(sessionStore.setSessionMedia).toHaveBeenCalledTimes(2)
    expect(() => setMedia({}, 'reaction', reactionPath, 'youtube')).toThrow(/Select the media file/)
  })

  it('keeps a downloaded grant when its replacement target disappeared so it can attach elsewhere', () => {
    mediaPathGrants.grantDownloadedPath(reactionPath)
    sessionStore.replaceSessionMedia.mockReturnValueOnce({ status: 'missing' } as never)
    const replaceMedia = getHandler(`${IPC_PREFIX}:replace-session-media`)
    const setMedia = getHandler(`${IPC_PREFIX}:set-session-media`)

    expect(replaceMedia({}, 'deleted-session', 'reaction', reactionPath, 'youtube')).toEqual({ status: 'missing' })
    expect(setMedia({}, 'reaction', reactionPath, 'youtube')).toEqual({ ok: true })
    expect(sessionStore.setSessionMedia).toHaveBeenCalledWith('reaction', reactionPath, 'youtube', undefined, undefined)
  })

  it('accepts a downloaded reaction together with an already-bound movie', () => {
    boundPaths = [moviePath]
    mediaPathGrants.grantDownloadedPath(reactionPath)
    const create = getHandler(`${IPC_PREFIX}:create-or-switch-session-from-paths`)

    expect(create({}, reactionPath, moviePath, 'youtube', 'Movie — Creator', 'Creator')).toEqual({ ok: true })
    expect(sessionStore.createOrSwitchSession).toHaveBeenCalledWith(
      reactionPath,
      moviePath,
      'youtube',
      'Movie — Creator',
      'Creator'
    )
  })

  it('passes reactor edits through the trusted rename channel', () => {
    const rename = getHandler(`${IPC_PREFIX}:rename-session`)

    expect(rename({}, 'session-a', 'My WatchAlong', 'Cinema Therapy')).toEqual({ ok: true })
    expect(sessionStore.renameSession).toHaveBeenCalledWith(
      'session-a',
      'My WatchAlong',
      'Cinema Therapy'
    )
  })

  it('does not return or grant unsupported files chosen through the picker', async () => {
    const textPath = join(root, 'notes.txt')
    writeFileSync(textPath, 'notes')
    ipcMocks.selectVideo.mockResolvedValue({ path: textPath, name: 'notes.txt' })
    const select = getHandler(`${IPC_PREFIX}:select-movie-file`)

    await expect(select({})).resolves.toBeNull()
    expect(() => mediaPathGrants.authorize([textPath])).toThrow(/Select the media file/)
  })

  it('persists detached-window state against the requested session, never the active session', () => {
    const saveWindowState = getHandler(`${IPC_PREFIX}:save-movie-window-state`)
    const geometry = { x: 25, y: 35, width: 480, height: 270 }

    expect(saveWindowState({}, 'session-a', {
      isMoviePoppedOut: true,
      movieWindowGeometry: geometry,
      moviePath: arbitraryPath,
      title: 'Injected'
    })).toEqual({ ok: true })
    expect(sessionStore.updateSession).toHaveBeenCalledWith('session-a', {
      isMoviePoppedOut: true,
      movieWindowGeometry: geometry
    })
    expect(sessionStore.updateActive).not.toHaveBeenCalled()
  })

  it('reveals only the main-process recovery path and can explicitly start fresh', () => {
    sessionStore.getLatestRecoveryPath.mockReturnValue(join(root, 'library.json.corrupt-123'))
    const status = getHandler(`${IPC_PREFIX}:get-library-recovery-status`)
    const reveal = getHandler(`${IPC_PREFIX}:reveal-library-recovery-file`)
    const startFresh = getHandler(`${IPC_PREFIX}:start-fresh-library-after-recovery`)

    expect(status({})).toEqual({ available: true })
    expect(reveal({})).toBe(true)
    expect(ipcMocks.showItemInFolder).toHaveBeenCalledWith(join(root, 'library.json.corrupt-123'))
    expect(startFresh({})).toEqual({ ok: true })
    expect(sessionStore.startFreshLibraryAfterRecovery).toHaveBeenCalledOnce()
  })
})

function getHandler(channel: string): (...args: unknown[]) => any {
  const handler = ipcMocks.handlers.get(channel)
  expect(handler).toBeTypeOf('function')
  return handler!
}

function createSessionStore() {
  return {
    read: vi.fn(() => ({ version: 4, activeSessionId: null, sessions: [] })),
    updateActive: vi.fn(() => ({ ok: true })),
    updateSession: vi.fn(() => ({ ok: true })),
    saveSessionPosition: vi.fn(() => ({ ok: true })),
    setSessionMedia: vi.fn(() => ({ ok: true })),
    replaceSessionMedia: vi.fn(() => ({ ok: true })),
    createOrSwitchSession: vi.fn(() => ({ ok: true })),
    setActiveSession: vi.fn(() => ({ ok: true })),
    deleteSession: vi.fn(() => ({ ok: true })),
    renameSession: vi.fn(() => ({ ok: true })),
    getSession: vi.fn(() => null),
    getActiveSession: vi.fn(() => null),
    getLatestRecoveryPath: vi.fn<() => string | null>(() => null),
    startFreshLibraryAfterRecovery: vi.fn(() => ({ ok: true }))
  }
}
