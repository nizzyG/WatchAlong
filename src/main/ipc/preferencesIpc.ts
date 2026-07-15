import { BrowserWindow, dialog } from 'electron'
import { realpathSync, statSync } from 'node:fs'
import type { AppPreferences } from '@shared/types'
import { IPC_PREFIX } from '../constants'
import { getDefaultReactionDownloadDirectory } from '../services/downloadManager'
import { PreferencesStore } from '../preferencesStore'
import { handleTrustedIpc, isTrustedRendererWebContents } from './security'
import { getSenderWindow } from './utils'

const MAIN_RENDERER = ['main'] as const
const APP_RENDERERS = ['main', 'wizard'] as const
const CABINET_RENDERERS = ['main', 'wizard', 'movie'] as const

export function registerPreferencesIpc(deps: { preferencesStore: PreferencesStore; mainWindowGetter: () => BrowserWindow | null }): void {
  const { preferencesStore, mainWindowGetter } = deps
  handleTrustedIpc(`${IPC_PREFIX}:get-preferences`, APP_RENDERERS, () => preferencesStore.read())
  handleTrustedIpc(`${IPC_PREFIX}:get-cabinet-theme-preference`, CABINET_RENDERERS, () => preferencesStore.read().cabinetTheme)
  handleTrustedIpc(`${IPC_PREFIX}:set-preference`, MAIN_RENDERER, (_event, key: keyof AppPreferences, value: AppPreferences[keyof AppPreferences]) => {
    if (!isPreferenceKey(key)) throw new Error(`Unknown preference key: ${String(key)}`)
    if (key === 'reactionDownloadDirectory' && value !== null) {
      throw new Error('Choose the download location with the WatchAlong folder picker.')
    }
    const preferences = preferencesStore.setPreference(key, value as never)
    if (key === 'cabinetTheme') broadcastCabinetThemePreference(preferences.cabinetTheme)
    return preferences
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

function broadcastCabinetThemePreference(preference: AppPreferences['cabinetTheme']): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (
      !window.webContents.isDestroyed()
      && isTrustedRendererWebContents(window.webContents, CABINET_RENDERERS)
    ) {
      window.webContents.send(`${IPC_PREFIX}:cabinet-theme-preference`, preference)
    }
  }
}

function isPreferenceKey(key: unknown): key is keyof AppPreferences {
  return key === 'hasCompletedOnboarding'
    || key === 'openLibraryOnLaunch'
    || key === 'libraryView'
    || key === 'reactionDownloadDirectory'
    || key === 'cabinetTheme'
}
