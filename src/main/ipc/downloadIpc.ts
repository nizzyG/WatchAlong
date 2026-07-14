import type { ReactionDownloadRequest } from '@shared/types'
import { IPC_PREFIX } from '../constants'
import { DownloadManager } from '../services/downloadManager'
import { handleTrustedIpc } from './security'

const APP_RENDERERS = ['main', 'wizard'] as const

export function registerDownloadIpc({ downloadManager }: { downloadManager: DownloadManager }): void {
  handleTrustedIpc(`${IPC_PREFIX}:save-last-patreon-session`, APP_RENDERERS, (_event, id: string) => downloadManager.saveLastPatreonSession(id))
  handleTrustedIpc(`${IPC_PREFIX}:discard-last-patreon-session`, APP_RENDERERS, (_event, id: string) => downloadManager.discardLastPatreonSession(id))
  handleTrustedIpc(`${IPC_PREFIX}:start-reaction-download`, APP_RENDERERS, (_event, request: ReactionDownloadRequest) => downloadManager.start(request))
  handleTrustedIpc(`${IPC_PREFIX}:cancel-download`, APP_RENDERERS, (_event, id: string) => downloadManager.cancel(id))
}
