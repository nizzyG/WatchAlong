import { contextBridge, ipcRenderer } from 'electron'
import type { LibrarySession, MediaRole, WatchAlongApi } from '@shared/types'

const IPC_PREFIX = 'watchalong'

const api: WatchAlongApi = {
  openVideos: () => ipcRenderer.invoke(`${IPC_PREFIX}:open-videos`),
  getLibrary: () => ipcRenderer.invoke(`${IPC_PREFIX}:get-library`),
  saveActiveSession: (patch: Partial<LibrarySession>) => ipcRenderer.invoke(`${IPC_PREFIX}:save-active-session`, patch),
  setActiveSession: (sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:set-active-session`, sessionId),
  deleteSession: (sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:delete-session`, sessionId),
  renameSession: (sessionId: string, title: string) => ipcRenderer.invoke(`${IPC_PREFIX}:rename-session`, sessionId, title),
  openSubtitle: () => ipcRenderer.invoke(`${IPC_PREFIX}:open-subtitle`),
  clearSubtitle: () => ipcRenderer.invoke(`${IPC_PREFIX}:clear-subtitle`),
  getSubtitleText: (sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:get-subtitle-text`, sessionId),
  getMediaUrl: (role: MediaRole, sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:get-media-url`, role, sessionId)
}

contextBridge.exposeInMainWorld('watchAlong', api)
