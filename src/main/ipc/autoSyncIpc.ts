import { IPC_PREFIX } from '../constants'
import { AutoSyncService } from '../services/autosync/AutoSyncService'
import type { AutoSyncIntent } from '@shared/types'
import { handleTrustedIpc } from './security'

const APP_RENDERERS = ['main', 'wizard'] as const

export function registerAutoSyncIpc({ autoSyncService }: { autoSyncService: AutoSyncService | null }): void {
  handleTrustedIpc(`${IPC_PREFIX}:start-session-auto-sync`, APP_RENDERERS, (_event, sessionId: string, intent: AutoSyncIntent) => {
    if (typeof sessionId !== 'string' || !sessionId || (intent !== 'initial' && intent !== 'recheck')) {
      throw new Error('Invalid automatic sync request.')
    }
    return autoSyncService?.start(sessionId, intent) ?? { started: false, reason: 'tools-unavailable' as const }
  })
  handleTrustedIpc(`${IPC_PREFIX}:cancel-session-auto-sync`, APP_RENDERERS, (_event, sessionId: string) => {
    autoSyncService?.cancel(sessionId)
  })
}
