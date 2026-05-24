import { contextBridge, ipcRenderer } from 'electron'
import type {
  BrowserName,
  DownloadProgressCallback,
  ImportWizardLaunchOptions,
  LibrarySession,
  MainWindowCloseCallback,
  MediaRole,
  MovieWindowCommandCallback,
  MovieWindowGeometryCallback,
  MovieWindowLifecycleCallback,
  RemoteMediaEventCallback,
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
  saveSessionPosition: (sessionId: string, lastReactionTimeSeconds: number) =>
    ipcRenderer.invoke(`${IPC_PREFIX}:save-session-position`, sessionId, lastReactionTimeSeconds),
  setSessionMedia: (role, path, reactionSource) => ipcRenderer.invoke(`${IPC_PREFIX}:set-session-media`, role, path, reactionSource),
  replaceSessionMedia: (sessionId, role, path, reactionSource) =>
    ipcRenderer.invoke(`${IPC_PREFIX}:replace-session-media`, sessionId, role, path, reactionSource),
  setActiveSession: (sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:set-active-session`, sessionId),
  deleteSession: (sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:delete-session`, sessionId),
  renameSession: (sessionId: string, title: string) => ipcRenderer.invoke(`${IPC_PREFIX}:rename-session`, sessionId, title),
  openSubtitle: () => ipcRenderer.invoke(`${IPC_PREFIX}:open-subtitle`),
  clearSubtitle: () => ipcRenderer.invoke(`${IPC_PREFIX}:clear-subtitle`),
  getSubtitleText: (sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:get-subtitle-text`, sessionId),
  getMediaUrl: (role: MediaRole, sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:get-media-url`, role, sessionId),
  openMovieWindow: (request) => ipcRenderer.invoke(`${IPC_PREFIX}:open-movie-window`, request),
  closeMovieWindow: (options) => ipcRenderer.invoke(`${IPC_PREFIX}:close-movie-window`, options),
  requestMovieWindowPopIn: () => ipcRenderer.invoke(`${IPC_PREFIX}:request-movie-window-pop-in`),
  getMovieWindowInit: () => ipcRenderer.invoke(`${IPC_PREFIX}:get-movie-window-init`),
  movieWindowReady: () => ipcRenderer.invoke(`${IPC_PREFIX}:movie-window-ready`),
  sendMovieMediaCommand: (command) => ipcRenderer.invoke(`${IPC_PREFIX}:movie-media-command`, command),
  acknowledgeMovieMediaCommand: (result) => ipcRenderer.invoke(`${IPC_PREFIX}:movie-media-command-result`, result),
  reportMovieMediaEvent: (event) => ipcRenderer.invoke(`${IPC_PREFIX}:movie-media-event`, event),
  onMovieMediaCommand: (callback: MovieWindowCommandCallback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<MovieWindowCommandCallback>[0]): void => {
      callback(payload)
    }
    ipcRenderer.on(`${IPC_PREFIX}:movie-media-command`, listener)
    return () => ipcRenderer.removeListener(`${IPC_PREFIX}:movie-media-command`, listener)
  },
  onMovieMediaEvent: (callback: RemoteMediaEventCallback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<RemoteMediaEventCallback>[0]): void => {
      callback(payload)
    }
    ipcRenderer.on(`${IPC_PREFIX}:movie-media-event`, listener)
    return () => ipcRenderer.removeListener(`${IPC_PREFIX}:movie-media-event`, listener)
  },
  onMovieWindowGeometry: (callback: MovieWindowGeometryCallback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<MovieWindowGeometryCallback>[0]): void => {
      callback(payload)
    }
    ipcRenderer.on(`${IPC_PREFIX}:movie-window-geometry`, listener)
    return () => ipcRenderer.removeListener(`${IPC_PREFIX}:movie-window-geometry`, listener)
  },
  onMovieWindowPopInRequest: (callback: MovieWindowLifecycleCallback) => {
    const listener = (): void => {
      callback()
    }
    ipcRenderer.on(`${IPC_PREFIX}:movie-window-pop-in-requested`, listener)
    return () => ipcRenderer.removeListener(`${IPC_PREFIX}:movie-window-pop-in-requested`, listener)
  },
  onMovieWindowClosed: (callback: MovieWindowLifecycleCallback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<MovieWindowLifecycleCallback>[0]): void => {
      callback(payload)
    }
    ipcRenderer.on(`${IPC_PREFIX}:movie-window-closed`, listener)
    return () => ipcRenderer.removeListener(`${IPC_PREFIX}:movie-window-closed`, listener)
  },
  checkTools: () => ipcRenderer.invoke(`${IPC_PREFIX}:check-tools`),
  detectBrowsers: () => ipcRenderer.invoke(`${IPC_PREFIX}:detect-browsers`),
  extractPatreonSession: (browserName: BrowserName) => ipcRenderer.invoke(`${IPC_PREFIX}:extract-patreon-session`, browserName),
  openPatreonLoginWindow: () => ipcRenderer.invoke(`${IPC_PREFIX}:open-patreon-login-window`),
  getSavedPatreonSessionStatus: () => ipcRenderer.invoke(`${IPC_PREFIX}:get-saved-patreon-session-status`),
  saveLastPatreonSession: (jobId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:save-last-patreon-session`, jobId),
  discardLastPatreonSession: (jobId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:discard-last-patreon-session`, jobId),
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
  openImportWizard: (options?: ImportWizardLaunchOptions) => ipcRenderer.invoke(`${IPC_PREFIX}:open-import-wizard`, options),
  getImportWizardContext: () => ipcRenderer.invoke(`${IPC_PREFIX}:get-import-wizard-context`),
  finishOnboardingWizard: (outcome: WizardOutcome) => ipcRenderer.invoke(`${IPC_PREFIX}:finish-onboarding-wizard`, outcome),
  onWizardLifecycle: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]): void => {
      callback(payload)
    }
    ipcRenderer.on(`${IPC_PREFIX}:wizard-lifecycle`, listener)
    return () => ipcRenderer.removeListener(`${IPC_PREFIX}:wizard-lifecycle`, listener)
  },
  confirmMainWindowClose: () => ipcRenderer.invoke(`${IPC_PREFIX}:confirm-main-window-close`),
  onMainWindowCloseRequest: (callback: MainWindowCloseCallback) => {
    const listener = (): void => {
      callback()
    }
    ipcRenderer.on(`${IPC_PREFIX}:main-window-close-request`, listener)
    return () => ipcRenderer.removeListener(`${IPC_PREFIX}:main-window-close-request`, listener)
  },
  getPreferences: () => ipcRenderer.invoke(`${IPC_PREFIX}:get-preferences`),
  setPreference: (key, value) => ipcRenderer.invoke(`${IPC_PREFIX}:set-preference`, key, value),
  selectDownloadDirectory: () => ipcRenderer.invoke(`${IPC_PREFIX}:select-download-directory`),
  completeOnboarding: () => ipcRenderer.invoke(`${IPC_PREFIX}:complete-onboarding`)
}

contextBridge.exposeInMainWorld('watchAlong', api)
