import { dialog, ipcMain, type BrowserWindow } from 'electron'
import type { AppPreferences } from '@shared/types'
import { IPC_PREFIX } from '../constants'
import { getDefaultReactionDownloadDirectory } from '../services/downloadManager'
import { PreferencesStore } from '../preferencesStore'
import { getSenderWindow } from './utils'

export function registerPreferencesIpc(deps: { preferencesStore: PreferencesStore; mainWindowGetter: () => BrowserWindow | null }): void {
  const { preferencesStore, mainWindowGetter } = deps
  ipcMain.handle(`${IPC_PREFIX}:get-preferences`, () => preferencesStore.read())
  ipcMain.handle(`${IPC_PREFIX}:set-preference`, (_event, key: keyof AppPreferences, value: AppPreferences[keyof AppPreferences]) => {
    if (!isPreferenceKey(key)) throw new Error(`Unknown preference key: ${String(key)}`)
    return preferencesStore.setPreference(key, value as never)
  })
  ipcMain.handle(`${IPC_PREFIX}:select-download-directory`, async (event): Promise<string | null> => {
    const parent = getSenderWindow(event, mainWindowGetter)
    if (!parent) return null
    const result = await dialog.showOpenDialog(parent, {
      title: 'Choose reaction download location',
      defaultPath: preferencesStore.read().reactionDownloadDirectory ?? getDefaultReactionDownloadDirectory(),
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  ipcMain.handle(`${IPC_PREFIX}:complete-onboarding`, () => preferencesStore.update({ hasCompletedOnboarding: true }))
}

function isPreferenceKey(key: unknown): key is keyof AppPreferences {
  return key === 'hasCompletedOnboarding' || key === 'openLibraryOnLaunch' || key === 'libraryView' || key === 'reactionDownloadDirectory'
}
