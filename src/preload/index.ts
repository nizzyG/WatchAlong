import { contextBridge, ipcRenderer } from 'electron'
import type {
  BrowserName,
  CabinetThemePreferenceCallback,
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
  createOrSwitchSessionFromPaths: (reactionPath, moviePath, reactionSource, suggestedTitle, reactorName) =>
    ipcRenderer.invoke(
      `${IPC_PREFIX}:create-or-switch-session-from-paths`,
      reactionPath,
      moviePath,
      reactionSource,
      suggestedTitle,
      reactorName
    ),
  getLibrary: () => ipcRenderer.invoke(`${IPC_PREFIX}:get-library`),
  getLibraryRecoveryStatus: () => ipcRenderer.invoke(`${IPC_PREFIX}:get-library-recovery-status`),
  revealLibraryRecoveryFile: () => ipcRenderer.invoke(`${IPC_PREFIX}:reveal-library-recovery-file`),
  startFreshLibraryAfterRecovery: () => ipcRenderer.invoke(`${IPC_PREFIX}:start-fresh-library-after-recovery`),
  saveActiveSession: (patch: Partial<LibrarySession>) => ipcRenderer.invoke(`${IPC_PREFIX}:save-active-session`, patch),
  saveSessionPosition: (sessionId: string, lastReactionTimeSeconds: number) =>
    ipcRenderer.invoke(`${IPC_PREFIX}:save-session-position`, sessionId, lastReactionTimeSeconds),
  setSessionMedia: (role, path, reactionSource, suggestedTitle, reactorName) =>
    ipcRenderer.invoke(`${IPC_PREFIX}:set-session-media`, role, path, reactionSource, suggestedTitle, reactorName),
  replaceSessionMedia: (sessionId, role, path, reactionSource, suggestedTitle, reactorName) =>
    ipcRenderer.invoke(`${IPC_PREFIX}:replace-session-media`, sessionId, role, path, reactionSource, suggestedTitle, reactorName),
  setActiveSession: (sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:set-active-session`, sessionId),
  deleteSession: (sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:delete-session`, sessionId),
  renameSession: (sessionId: string, title: string, reactorName?: string) =>
    ipcRenderer.invoke(`${IPC_PREFIX}:rename-session`, sessionId, title, reactorName),
  chooseMoviePoster: (sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:choose-movie-poster`, sessionId),
  clearMoviePoster: (sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:clear-movie-poster`, sessionId),
  openSubtitle: () => ipcRenderer.invoke(`${IPC_PREFIX}:open-subtitle`),
  clearSubtitle: () => ipcRenderer.invoke(`${IPC_PREFIX}:clear-subtitle`),
  getSubtitleText: (sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:get-subtitle-text`, sessionId),
  getMediaUrl: (role: MediaRole, sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:get-media-url`, role, sessionId),
  saveMovieWindowState: (sessionId, patch) =>
    ipcRenderer.invoke(`${IPC_PREFIX}:save-movie-window-state`, sessionId, patch),
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
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<MovieWindowLifecycleCallback>[0]): void => {
      callback(payload)
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
  detectMovieFrameRate: (sessionId: string) => ipcRenderer.invoke(`${IPC_PREFIX}:detect-movie-frame-rate`, sessionId),
  detectBrowsers: () => ipcRenderer.invoke(`${IPC_PREFIX}:detect-browsers`),
  extractPatreonSession: (browserName: BrowserName) => ipcRenderer.invoke(`${IPC_PREFIX}:extract-patreon-session`, browserName),
  openPatreonLoginWindow: () => ipcRenderer.invoke(`${IPC_PREFIX}:open-patreon-login-window`),
  discardPatreonSessionToken: (token: string) => ipcRenderer.invoke(`${IPC_PREFIX}:discard-patreon-session-token`, token),
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
  startSessionAutoSync: (sessionId, intent) => ipcRenderer.invoke(`${IPC_PREFIX}:start-session-auto-sync`, sessionId, intent),
  cancelSessionAutoSync: (sessionId) => ipcRenderer.invoke(`${IPC_PREFIX}:cancel-session-auto-sync`, sessionId),
  onAutoSyncProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]): void => callback(payload)
    ipcRenderer.on(`${IPC_PREFIX}:auto-sync-progress`, listener)
    return () => ipcRenderer.removeListener(`${IPC_PREFIX}:auto-sync-progress`, listener)
  },
  onAutoSyncComplete: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]): void => callback(payload)
    ipcRenderer.on(`${IPC_PREFIX}:auto-sync-complete`, listener)
    return () => ipcRenderer.removeListener(`${IPC_PREFIX}:auto-sync-complete`, listener)
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
  onWizardCloseRequest: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on(`${IPC_PREFIX}:wizard-close-request`, listener)
    return () => ipcRenderer.removeListener(`${IPC_PREFIX}:wizard-close-request`, listener)
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
  getCabinetThemePreference: () => ipcRenderer.invoke(`${IPC_PREFIX}:get-cabinet-theme-preference`),
  onCabinetThemePreference: (callback: CabinetThemePreferenceCallback) => {
    const listener = (_event: Electron.IpcRendererEvent, preference: Parameters<CabinetThemePreferenceCallback>[0]): void => {
      callback(preference)
    }
    ipcRenderer.on(`${IPC_PREFIX}:cabinet-theme-preference`, listener)
    return () => ipcRenderer.removeListener(`${IPC_PREFIX}:cabinet-theme-preference`, listener)
  },
  setPreference: (key, value) => ipcRenderer.invoke(`${IPC_PREFIX}:set-preference`, key, value),
  selectDownloadDirectory: () => ipcRenderer.invoke(`${IPC_PREFIX}:select-download-directory`),
  completeOnboarding: () => ipcRenderer.invoke(`${IPC_PREFIX}:complete-onboarding`)
}

contextBridge.exposeInMainWorld('watchAlong', api)
