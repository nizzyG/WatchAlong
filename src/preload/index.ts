import { contextBridge, ipcRenderer } from 'electron'
import type {
  BrowserName,
  DownloadProgressCallback,
  LibrarySession,
  MediaRole,
  ReactionDownloadRequest,
  WatchAlongApi,
  WizardOutcome
} from '@shared/types'

const IPC_PREFIX = 'watchalong'

const api: WatchAlongApi = {
  openVideos: () => ipcRenderer.invoke(`${IPC_PREFIX}:open-videos`),
  selectMovieFile: () => ipcRenderer.invoke(`${IPC_PREFIX}:select-movie-file`),
  selectReactionFile: () => ipcRenderer.invoke(`${IPC_PREFIX}:select-reaction-file`),
  createOrSwitchSessionFromPaths: (reactionPath, moviePath, reactionSource) =>
    ipcRenderer.invoke(`${IPC_PREFIX}:create-or-switch-session-from-paths`, reactionPath, moviePath, reactionSource),
  getLibrary: () => ipcRenderer.invoke(`${IPC_PREFIX}:get-library`),
  saveActiveSession: (patch: Partial<LibrarySession>) => ipcRenderer.invoke(`${IPC_PREFIX}:save-active-session`, patch),
  setSessionMedia: (role, path, reactionSource) => ipcRenderer.invoke(`${IPC_PREFIX}:set-session-media`, role, path, reactionSource),
  setActiveSession: (sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:set-active-session`, sessionId),
  deleteSession: (sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:delete-session`, sessionId),
  renameSession: (sessionId: string, title: string) => ipcRenderer.invoke(`${IPC_PREFIX}:rename-session`, sessionId, title),
  openSubtitle: () => ipcRenderer.invoke(`${IPC_PREFIX}:open-subtitle`),
  clearSubtitle: () => ipcRenderer.invoke(`${IPC_PREFIX}:clear-subtitle`),
  getSubtitleText: (sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:get-subtitle-text`, sessionId),
  getMediaUrl: (role: MediaRole, sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:get-media-url`, role, sessionId),
  checkTools: () => ipcRenderer.invoke(`${IPC_PREFIX}:check-tools`),
  detectBrowsers: () => ipcRenderer.invoke(`${IPC_PREFIX}:detect-browsers`),
  extractPatreonSession: (browserName: BrowserName) => ipcRenderer.invoke(`${IPC_PREFIX}:extract-patreon-session`, browserName),
  openPatreonLoginWindow: () => ipcRenderer.invoke(`${IPC_PREFIX}:open-patreon-login-window`),
  getSavedPatreonSessionStatus: () => ipcRenderer.invoke(`${IPC_PREFIX}:get-saved-patreon-session-status`),
  saveLastPatreonSession: (jobId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:save-last-patreon-session`, jobId),
  forgetPatreonSession: () => ipcRenderer.invoke(`${IPC_PREFIX}:forget-patreon-session`),
  startReactionDownload: (request: ReactionDownloadRequest) => ipcRenderer.invoke(`${IPC_PREFIX}:start-reaction-download`, request),
  cancelDownload: (jobId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:cancel-download`, jobId),
  onDownloadProgress: (callback: DownloadProgressCallback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<DownloadProgressCallback>[0]): void => {
      callback(payload)
    }
    ipcRenderer.on(`${IPC_PREFIX}:download-progress`, listener)
    return () => ipcRenderer.removeListener(`${IPC_PREFIX}:download-progress`, listener)
  },
  openOnboardingWizard: () => ipcRenderer.invoke(`${IPC_PREFIX}:open-onboarding-wizard`),
  openImportWizard: () => ipcRenderer.invoke(`${IPC_PREFIX}:open-import-wizard`),
  finishOnboardingWizard: (outcome: WizardOutcome) => ipcRenderer.invoke(`${IPC_PREFIX}:finish-onboarding-wizard`, outcome),
  onWizardLifecycle: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]): void => {
      callback(payload)
    }
    ipcRenderer.on(`${IPC_PREFIX}:wizard-lifecycle`, listener)
    return () => ipcRenderer.removeListener(`${IPC_PREFIX}:wizard-lifecycle`, listener)
  },
  getPreferences: () => ipcRenderer.invoke(`${IPC_PREFIX}:get-preferences`),
  setPreference: (key, value) => ipcRenderer.invoke(`${IPC_PREFIX}:set-preference`, key, value),
  selectDownloadDirectory: () => ipcRenderer.invoke(`${IPC_PREFIX}:select-download-directory`),
  completeOnboarding: () => ipcRenderer.invoke(`${IPC_PREFIX}:complete-onboarding`)
}

contextBridge.exposeInMainWorld('watchAlong', api)
