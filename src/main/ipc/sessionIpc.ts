import { ipcMain } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import type { BrowserWindow } from 'electron'
import type { LibrarySession, MediaFile, MediaRole, OpenVideosResult, ReactionSource } from '@shared/types'
import { IPC_PREFIX, MEDIA_SCHEME } from '../constants'
import { SessionStore } from '../sessionStore'
import { getMediaPath, getSenderWindow, selectSubtitle, selectVideo } from './utils'

export function registerSessionIpc(deps: {
  sessionStore: SessionStore
  mainWindowGetter: () => BrowserWindow | null
}): void {
  const { sessionStore, mainWindowGetter } = deps
  ipcMain.handle(`${IPC_PREFIX}:get-library`, () => sessionStore.read())
  ipcMain.handle(`${IPC_PREFIX}:save-active-session`, (_event, patch: Partial<LibrarySession>) => sessionStore.updateActive(patch))
  ipcMain.handle(`${IPC_PREFIX}:save-session-position`, (_event, id: string, time: number) => sessionStore.saveSessionPosition(id, time))
  ipcMain.handle(`${IPC_PREFIX}:set-session-media`, (_event, role: MediaRole, path: string, source?: ReactionSource) => sessionStore.setSessionMedia(role, path, source))
  ipcMain.handle(`${IPC_PREFIX}:replace-session-media`, (_event, id: string, role: MediaRole, path: string, source?: ReactionSource) => sessionStore.replaceSessionMedia(id, role, path, source))
  ipcMain.handle(`${IPC_PREFIX}:create-or-switch-session-from-paths`, (_event, reaction: string, movie: string, source?: ReactionSource) => sessionStore.createOrSwitchSession(reaction, movie, source))
  ipcMain.handle(`${IPC_PREFIX}:set-active-session`, (_event, id: string) => sessionStore.setActiveSession(id))
  ipcMain.handle(`${IPC_PREFIX}:delete-session`, (_event, id: string) => sessionStore.deleteSession(id))
  ipcMain.handle(`${IPC_PREFIX}:rename-session`, (_event, id: string, title: string) => sessionStore.renameSession(id, title))

  ipcMain.handle(`${IPC_PREFIX}:get-media-url`, (_event, role: MediaRole, sessionId: string) => {
    const session = sessionStore.getSession(sessionId)
    const path = getMediaPath(session, role)
    return path && existsSync(path)
      ? `${MEDIA_SCHEME}://media/${encodeURIComponent(sessionId)}/${role}?updated=${encodeURIComponent(session!.updatedAt)}`
      : null
  })

  ipcMain.handle(`${IPC_PREFIX}:open-videos`, async (event): Promise<OpenVideosResult | null> => {
    const parent = getSenderWindow(event, mainWindowGetter)
    if (!parent) return null
    const reaction = await selectVideo(parent, 'Select the reaction watchalong video')
    if (!reaction) return null
    const movie = await selectVideo(parent, 'Select the movie video')
    if (!movie) return null
    const previousCount = sessionStore.read().sessions.length
    const library = sessionStore.createOrSwitchSession(reaction.path, movie.path)
    return { library, session: sessionStore.getActiveSession(), created: library.sessions.length > previousCount, reaction, movie }
  })

  const select = (title: string) => async (event: Electron.IpcMainInvokeEvent): Promise<MediaFile | null> => {
    const parent = getSenderWindow(event, mainWindowGetter)
    return parent ? selectVideo(parent, title) : null
  }
  ipcMain.handle(`${IPC_PREFIX}:select-movie-file`, select('Select the movie video'))
  ipcMain.handle(`${IPC_PREFIX}:select-reaction-file`, select('Select the reaction watchalong video'))
  ipcMain.handle(`${IPC_PREFIX}:open-subtitle`, async (event) => {
    const parent = getSenderWindow(event, mainWindowGetter)
    if (!parent || !sessionStore.getActiveSession()) return null
    const subtitle = await selectSubtitle(parent)
    return subtitle ? sessionStore.updateActive({ subtitlePath: subtitle.path }) : null
  })
  ipcMain.handle(`${IPC_PREFIX}:clear-subtitle`, () => sessionStore.updateActive({ subtitlePath: null }))
  ipcMain.handle(`${IPC_PREFIX}:get-subtitle-text`, (_event, sessionId: string) => {
    const path = sessionStore.getSession(sessionId)?.subtitlePath
    if (!path || !existsSync(path)) return null
    try { return readFileSync(path, 'utf8') } catch { return null }
  })
}
