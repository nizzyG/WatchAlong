import { dialog, type BrowserWindow } from 'electron'
import { realpathSync, statSync } from 'node:fs'
import type { AppPreferences } from '@shared/types'
import { IPC_PREFIX } from '../constants'
import { getDefaultReactionDownloadDirectory } from '../services/downloadManager'
import { PreferencesStore } from '../preferencesStore'
import { handleTrustedIpc } from './security'
import { getSenderWindow } from './utils'

const MAIN_RENDERER = ['main'] as const
const APP_RENDERERS = ['main', 'wizard'] as const

export function registerPreferencesIpc(deps: { preferencesStore: PreferencesStore; mainWindowGetter: () => BrowserWindow | null }): void {
  const { preferencesStore, mainWindowGetter } = deps
  handleTrustedIpc(`${IPC_PREFIX}:get-preferences`, APP_RENDERERS, () => preferencesStore.read())
  handleTrustedIpc(`${IPC_PREFIX}:set-preference`, MAIN_RENDERER, (_event, key: keyof AppPreferences, value: AppPreferences[keyof AppPreferences]) => {
    if (!isPreferenceKey(key)) throw new Error(`Unknown preference key: ${String(key)}`)
    if (key === 'reactionDownloadDirectory' && value !== null) {
      throw new Error('Choose the download location with the WatchAlong folder picker.')
    }
    return preferencesStore.setPreference(key, value as never)
  })
  handleTrustedIpc(`${IPC_PREFIX}:select-download-directory`, MAIN_RENDERER, async (event): Promise<AppPreferences | null> => {
    const parent = getSenderWindow(event, mainWindowGetter)
    if (!parent) return null
    const result = await dialog.showOpenDialog(parent, {
      title: 'Choose reaction download location',
      defaultPath: preferencesStore.read().reactionDownloadDirectory ?? getDefaultReactionDownloadDirectory(),
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    try {
      const directory = realpathSync(result.filePaths[0])
      if (!statSync(directory).isDirectory()) return null
      return preferencesStore.setPreference('reactionDownloadDirectory', directory)
    } catch {
      return null
    }
  })
  handleTrustedIpc(`${IPC_PREFIX}:complete-onboarding`, ['wizard'], () => preferencesStore.update({ hasCompletedOnboarding: true }))
}

function isPreferenceKey(key: unknown): key is keyof AppPreferences {
  return key === 'hasCompletedOnboarding' || key === 'openLibraryOnLaunch' || key === 'libraryView' || key === 'reactionDownloadDirectory'
}
