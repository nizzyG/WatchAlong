import { ipcMain } from 'electron'
import type { ReactionDownloadRequest } from '@shared/types'
import { IPC_PREFIX } from '../constants'
import { DownloadManager } from '../services/downloadManager'

export function registerDownloadIpc({ downloadManager }: { downloadManager: DownloadManager }): void {
  ipcMain.handle(`${IPC_PREFIX}:save-last-patreon-session`, (_event, id: string) => downloadManager.saveLastPatreonSession(id))
  ipcMain.handle(`${IPC_PREFIX}:discard-last-patreon-session`, (_event, id: string) => downloadManager.discardLastPatreonSession(id))
  ipcMain.handle(`${IPC_PREFIX}:start-reaction-download`, (_event, request: ReactionDownloadRequest) => downloadManager.start(request))
  ipcMain.handle(`${IPC_PREFIX}:cancel-download`, (_event, id: string) => downloadManager.cancel(id))
}
