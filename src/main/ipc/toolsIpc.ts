import { IPC_PREFIX } from '../constants'
import { detectMovieFrameRate, ToolResolver } from '../services/toolResolution'
import { SessionStore } from '../sessionStore'
import { handleTrustedIpc } from './security'

export function registerToolsIpc({
  toolResolver,
  sessionStore
}: {
  toolResolver: ToolResolver
  sessionStore: SessionStore
}): void {
  handleTrustedIpc(`${IPC_PREFIX}:check-tools`, ['main', 'wizard'], () => toolResolver.checkTools())
  handleTrustedIpc(`${IPC_PREFIX}:detect-movie-frame-rate`, ['main'], (_event, sessionId: unknown) => {
    if (typeof sessionId !== 'string') return null
    const moviePath = sessionStore.getSession(sessionId)?.moviePath
    return moviePath ? detectMovieFrameRate(moviePath, toolResolver) : null
  })
}
