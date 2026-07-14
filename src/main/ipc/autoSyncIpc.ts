import { ipcMain } from 'electron'
import { IPC_PREFIX } from '../constants'
import { AutoSyncService } from '../services/autosync/AutoSyncService'

export function registerAutoSyncIpc({ autoSyncService }: { autoSyncService: AutoSyncService | null }): void {
  ipcMain.handle(`${IPC_PREFIX}:start-session-auto-sync`, (_event, sessionId: string) => {
    return autoSyncService?.start(sessionId) ?? { started: false, reason: 'tools-unavailable' as const }
  })
  ipcMain.handle(`${IPC_PREFIX}:cancel-session-auto-sync`, (_event, sessionId: string) => {
    autoSyncService?.cancel(sessionId)
  })
}
