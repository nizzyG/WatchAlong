import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_PREFIX } from '../constants'
import type { AppPreferences } from '@shared/types'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  showOpenDialog: vi.fn(),
  senderWindow: {}
}))

vi.mock('electron', () => ({
  dialog: { showOpenDialog: (...args: unknown[]) => mocks.showOpenDialog(...args) }
}))

vi.mock('./security', () => ({
  handleTrustedIpc: (
    channel: string,
    _roles: readonly string[],
    listener: (...args: unknown[]) => unknown
  ) => mocks.handlers.set(channel, listener)
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
    mocks.showOpenDialog.mockReset()
    root = mkdtempSync(join(tmpdir(), 'watchalong-preferences-ipc-'))
    preferences = {
      hasCompletedOnboarding: true,
      openLibraryOnLaunch: true,
      libraryView: 'grid',
      reactionDownloadDirectory: null
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
