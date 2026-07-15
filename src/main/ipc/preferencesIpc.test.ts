import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_PREFIX } from '../constants'
import type { AppPreferences } from '@shared/types'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  roles: new Map<string, readonly string[]>(),
  showOpenDialog: vi.fn(),
  senderWindow: {},
  send: vi.fn(),
  isDestroyed: vi.fn(() => false)
}))

vi.mock('electron', () => ({
  dialog: { showOpenDialog: (...args: unknown[]) => mocks.showOpenDialog(...args) },
  BrowserWindow: {
    getAllWindows: () => [{ webContents: { send: mocks.send, isDestroyed: mocks.isDestroyed } }]
  }
}))

vi.mock('./security', () => ({
  isTrustedRendererWebContents: vi.fn(() => true),
  handleTrustedIpc: (
    channel: string,
    roles: readonly string[],
    listener: (...args: unknown[]) => unknown
  ) => {
    mocks.roles.set(channel, roles)
    mocks.handlers.set(channel, listener)
  }
}))

vi.mock('./utils', () => ({
  getSenderWindow: vi.fn(() => mocks.senderWindow)
}))

vi.mock('../services/downloadManager', () => ({
  getDefaultReactionDownloadDirectory: vi.fn(() => 'C:\\Downloads')
}))

import { registerPreferencesIpc } from './preferencesIpc'

describe('preferences IPC filesystem authority', () => {
  let root: string
  let preferences: AppPreferences
  let store: ReturnType<typeof createStore>

  beforeEach(() => {
    mocks.handlers.clear()
    mocks.roles.clear()
    mocks.showOpenDialog.mockReset()
    mocks.send.mockReset()
    mocks.isDestroyed.mockClear()
    root = mkdtempSync(join(tmpdir(), 'watchalong-preferences-ipc-'))
    preferences = {
      hasCompletedOnboarding: true,
      openLibraryOnLaunch: true,
      libraryView: 'grid',
      reactionDownloadDirectory: null,
      cabinetTheme: 'system'
    }
    store = createStore(() => preferences, (next) => { preferences = next })
    registerPreferencesIpc({
      preferencesStore: store as never,
      mainWindowGetter: () => mocks.senderWindow as never
    })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects a renderer-forged download directory but permits clearing it', () => {
    const setPreference = getHandler(`${IPC_PREFIX}:set-preference`)

    expect(() => setPreference({}, 'reactionDownloadDirectory', '\\\\server\\share')).toThrow(/folder picker/)
    expect(store.setPreference).not.toHaveBeenCalled()
    expect(setPreference({}, 'reactionDownloadDirectory', null)).toMatchObject({ reactionDownloadDirectory: null })
  })

  it('allows cabinet choices through the existing preference channel', () => {
    const setPreference = getHandler(`${IPC_PREFIX}:set-preference`)

    expect(setPreference({}, 'cabinetTheme', 'oak')).toMatchObject({ cabinetTheme: 'oak' })
    expect(store.setPreference).toHaveBeenCalledWith('cabinetTheme', 'oak')
    expect(mocks.send).toHaveBeenCalledWith(`${IPC_PREFIX}:cabinet-theme-preference`, 'oak')
  })

  it('shares only the cabinet preference with every trusted app window', () => {
    const getCabinetTheme = getHandler(`${IPC_PREFIX}:get-cabinet-theme-preference`)

    expect(mocks.roles.get(`${IPC_PREFIX}:get-cabinet-theme-preference`)).toEqual(['main', 'wizard', 'movie'])
    expect(getCabinetTheme({})).toBe('system')
  })

  it('persists only the directory returned by the main-process picker', async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [root] })
    const selectDirectory = getHandler(`${IPC_PREFIX}:select-download-directory`)

    await expect(selectDirectory({})).resolves.toMatchObject({
      reactionDownloadDirectory: realpathSync(root)
    })
    expect(store.setPreference).toHaveBeenCalledWith('reactionDownloadDirectory', realpathSync(root))
  })
})

function getHandler(channel: string): (...args: unknown[]) => any {
  const handler = mocks.handlers.get(channel)
  expect(handler).toBeTypeOf('function')
  return handler!
}

function createStore(
  read: () => AppPreferences,
  commit: (next: AppPreferences) => void
) {
  return {
    read: vi.fn(read),
    setPreference: vi.fn((key: keyof AppPreferences, value: AppPreferences[keyof AppPreferences]) => {
      const next = { ...read(), [key]: value }
      commit(next)
      return next
    }),
    update: vi.fn()
  }
}
