import { existsSync } from 'node:fs'
import { shell, type BrowserWindow } from 'electron'
import type { LibrarySession, MediaFile, MediaRole, OpenVideosResult, ReactionSource } from '@shared/types'
import { IPC_PREFIX } from '../constants'
import { createSessionMediaUrl } from '../mediaProtocol'
import { pickMovieWindowSessionPatch, pickRendererSessionPatch } from '../sessionPatch'
import { MediaPathGrantStore } from '../services/mediaPathGrants'
import { readSubtitleFile } from '../services/subtitleFiles'
import { SessionStore } from '../sessionStore'
import { handleTrustedIpc } from './security'
import { getMediaPath, getSenderWindow, selectMoviePoster, selectSubtitle, selectVideo } from './utils'

const MAIN_RENDERER = ['main'] as const
const APP_RENDERERS = ['main', 'wizard'] as const

export function registerSessionIpc(deps: {
  sessionStore: SessionStore
  mediaPathGrants?: MediaPathGrantStore
  mainWindowGetter: () => BrowserWindow | null
}): void {
  const { sessionStore, mainWindowGetter } = deps
  const mediaPathGrants = deps.mediaPathGrants ?? new MediaPathGrantStore(() =>
    sessionStore.read().sessions.flatMap((session) => [session.reactionPath, session.moviePath]))
  handleTrustedIpc(`${IPC_PREFIX}:get-library`, APP_RENDERERS, () => sessionStore.read())
  handleTrustedIpc(`${IPC_PREFIX}:get-library-recovery-status`, MAIN_RENDERER, () => ({
    available: Boolean(sessionStore.getLatestRecoveryPath())
  }))
  handleTrustedIpc(`${IPC_PREFIX}:reveal-library-recovery-file`, MAIN_RENDERER, () => {
    const path = sessionStore.getLatestRecoveryPath()
    if (!path) return false
    shell.showItemInFolder(path)
    return true
  })
  handleTrustedIpc(`${IPC_PREFIX}:start-fresh-library-after-recovery`, MAIN_RENDERER, () =>
    sessionStore.startFreshLibraryAfterRecovery())
  handleTrustedIpc(`${IPC_PREFIX}:save-active-session`, MAIN_RENDERER, (_event, patch: Partial<LibrarySession>) =>
    sessionStore.updateActive(pickRendererSessionPatch(patch)))
  handleTrustedIpc(`${IPC_PREFIX}:save-session-position`, MAIN_RENDERER, (_event, id: string, time: number) =>
    sessionStore.saveSessionPosition(id, time))
  handleTrustedIpc(`${IPC_PREFIX}:save-movie-window-state`, MAIN_RENDERER, (_event, id: string, patch: unknown) =>
    sessionStore.updateSession(id, pickMovieWindowSessionPatch(patch)))
  handleTrustedIpc(
    `${IPC_PREFIX}:set-session-media`,
    APP_RENDERERS,
    (_event, role: MediaRole, path: string, source?: ReactionSource, suggestedTitle?: string, reactorName?: string) =>
      mediaPathGrants.withAuthorizedPaths([path], ([authorizedPath]) =>
        sessionStore.setSessionMedia(role, authorizedPath, source, suggestedTitle, reactorName))
  )
  handleTrustedIpc(
    `${IPC_PREFIX}:replace-session-media`,
    APP_RENDERERS,
    (_event, id: string, role: MediaRole, path: string, source?: ReactionSource, suggestedTitle?: string, reactorName?: string) =>
      mediaPathGrants.withAuthorizedPaths([path], ([authorizedPath]) =>
        sessionStore.replaceSessionMedia(id, role, authorizedPath, source, suggestedTitle, reactorName),
      (result) => result.status !== 'missing')
  )
  handleTrustedIpc(
    `${IPC_PREFIX}:create-or-switch-session-from-paths`,
    APP_RENDERERS,
    (_event, reaction: string, movie: string, source?: ReactionSource, suggestedTitle?: string, reactorName?: string) =>
      mediaPathGrants.withAuthorizedPaths([reaction, movie], ([authorizedReaction, authorizedMovie]) =>
        sessionStore.createOrSwitchSession(authorizedReaction, authorizedMovie, source, suggestedTitle, reactorName))
  )
  handleTrustedIpc(`${IPC_PREFIX}:set-active-session`, MAIN_RENDERER, (_event, id: string) => sessionStore.setActiveSession(id))
  handleTrustedIpc(`${IPC_PREFIX}:delete-session`, MAIN_RENDERER, (_event, id: string) => sessionStore.deleteSession(id))
  handleTrustedIpc(`${IPC_PREFIX}:rename-session`, MAIN_RENDERER, (_event, id: string, title: string, reactorName?: string) =>
    sessionStore.renameSession(id, title, reactorName))
  handleTrustedIpc(`${IPC_PREFIX}:choose-movie-poster`, MAIN_RENDERER, async (event, sessionId: unknown) => {
    const session = isSafeSessionIdInput(sessionId) ? sessionStore.getSession(sessionId) : null
    if (!session?.moviePath) return null

    const parent = getSenderWindow(event, mainWindowGetter)
    if (!parent) return null
    const result = await selectMoviePoster(parent)
    if (result.status === 'cancelled') return null
    if (result.status === 'rejected') throw new Error(result.message)
    return sessionStore.setMoviePosterPath(session.id, result.file.path)
  })
  handleTrustedIpc(`${IPC_PREFIX}:clear-movie-poster`, MAIN_RENDERER, (_event, sessionId: unknown) => {
    const session = isSafeSessionIdInput(sessionId) ? sessionStore.getSession(sessionId) : null
    return session?.moviePath
      ? sessionStore.setMoviePosterPath(session.id, null)
      : sessionStore.read()
  })

  handleTrustedIpc(`${IPC_PREFIX}:get-media-url`, MAIN_RENDERER, (_event, role: MediaRole, sessionId: string) => {
    const session = sessionStore.getSession(sessionId)
    const path = getMediaPath(session, role)
    return path && existsSync(path)
      ? createSessionMediaUrl(session!, role)
      : null
  })

  handleTrustedIpc(`${IPC_PREFIX}:open-videos`, MAIN_RENDERER, async (event): Promise<OpenVideosResult | null> => {
    const parent = getSenderWindow(event, mainWindowGetter)
    if (!parent) return null
    const reaction = await selectGrantedVideo(parent, 'Select the reaction watchalong video', mediaPathGrants)
    if (!reaction) return null
    const movie = await selectGrantedVideo(parent, 'Select the movie video', mediaPathGrants)
    if (!movie) {
      mediaPathGrants.revoke(reaction.path)
      return null
    }
    return mediaPathGrants.withAuthorizedPaths([reaction.path, movie.path], ([reactionPath, moviePath]) => {
      const previousCount = sessionStore.read().sessions.length
      const library = sessionStore.createOrSwitchSession(reactionPath, moviePath)
      return {
        library,
        session: sessionStore.getActiveSession(),
        created: library.sessions.length > previousCount,
        reaction,
        movie
      }
    })
  })

  const select = (title: string) => async (event: Electron.IpcMainInvokeEvent): Promise<MediaFile | null> => {
    const parent = getSenderWindow(event, mainWindowGetter)
    return parent ? selectGrantedVideo(parent, title, mediaPathGrants) : null
  }
  handleTrustedIpc(`${IPC_PREFIX}:select-movie-file`, APP_RENDERERS, select('Select the movie video'))
  handleTrustedIpc(`${IPC_PREFIX}:select-reaction-file`, APP_RENDERERS, select('Select the reaction watchalong video'))
  handleTrustedIpc(`${IPC_PREFIX}:open-subtitle`, MAIN_RENDERER, async (event) => {
    const parent = getSenderWindow(event, mainWindowGetter)
    if (!parent || !sessionStore.getActiveSession()) return null
    const subtitle = await selectSubtitle(parent)
    return subtitle ? sessionStore.updateActive({ subtitlePath: subtitle.path }) : null
  })
  handleTrustedIpc(`${IPC_PREFIX}:clear-subtitle`, MAIN_RENDERER, () => sessionStore.updateActive({ subtitlePath: null }))
  handleTrustedIpc(`${IPC_PREFIX}:get-subtitle-text`, MAIN_RENDERER, (_event, sessionId: string) => {
    // Only read the path already bound to a stored session. subtitlePath is not
    // renderer-writable; new paths can enter the store only through the picker.
    const path = sessionStore.getSession(sessionId)?.subtitlePath
    return path ? readSubtitleFile(path) : null
  })
}

function isSafeSessionIdInput(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\\/\u0000-\u001f\u007f]/.test(value)
}

async function selectGrantedVideo(
  parent: BrowserWindow,
  title: string,
  mediaPathGrants: MediaPathGrantStore
): Promise<MediaFile | null> {
  const selected = await selectVideo(parent, title)
  if (!selected) return null
  const grantedPath = mediaPathGrants.grantPickerPath(selected.path)
  return grantedPath ? { ...selected, path: grantedPath } : null
}
