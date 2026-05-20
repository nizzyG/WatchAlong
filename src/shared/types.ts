export type MediaRole = 'reaction' | 'movie'
export type PlaybackRate = 1 | 1.25 | 1.5 | 2
export type ToolName = 'yt-dlp' | 'ffmpeg' | 'node' | 'patreon-dl'
export type BrowserName = 'chrome' | 'firefox' | 'edge' | 'brave' | 'opera'
export type ReactionDownloadSource = 'youtube' | 'patreon'
export type ReactionSource = 'local' | ReactionDownloadSource
export type DownloadJobState = 'idle' | 'checking' | 'downloading' | 'success' | 'failed' | 'cancelled'
export type WizardOutcome = 'cancelled' | 'completed'
export type LibraryViewPreference = 'grid' | 'list'

export interface MediaFile {
  path: string
  name: string
}

export interface OverlayGeometry {
  x: number
  y: number
  width: number
  height: number
}

export interface LibrarySession {
  id: string
  title: string
  reactionPath: string | null
  reactionSource: ReactionSource
  reactionDurationSeconds: number | null
  moviePath: string | null
  subtitlePath: string | null
  offsetSeconds: number
  lastReactionTimeSeconds: number
  overlay: OverlayGeometry
  isPipHidden: boolean
  reactionVolume: number
  movieVolume: number
  isReactionMuted: boolean
  isMovieMuted: boolean
  playbackRate: PlaybackRate
  movieRateCorrection: number
  createdAt: string
  updatedAt: string
}

export type SessionData = LibrarySession

export interface SessionLibrary {
  version: 2
  activeSessionId: string | null
  sessions: LibrarySession[]
}

export interface OpenVideosResult {
  library: SessionLibrary
  session: LibrarySession | null
  created: boolean
  reaction?: MediaFile
  movie?: MediaFile
}

export interface ToolStatus {
  name: ToolName
  label: string
  ok: boolean
  path: string | null
  version?: string
  message?: string
}

export interface ToolCheckResult {
  ready: boolean
  tools: ToolStatus[]
}

export interface BrowserDetection {
  name: BrowserName
  label: string
  installed: boolean
  extractionSupported: boolean
  paths: string[]
}

export type PatreonSessionSource =
  | { type: 'browser'; browser: BrowserName; token: string }
  | { type: 'token'; token: string }
  | { type: 'manual'; sessionId: string }
  | { type: 'saved' }

export type ReactionDownloadRequest =
  | { source: 'youtube'; url: string }
  | { source: 'patreon'; url: string; sessionSource: PatreonSessionSource }

export interface StartDownloadResult {
  jobId: string
}

export interface DownloadProgressEvent {
  jobId: string
  source: ReactionDownloadSource
  state: DownloadJobState
  message: string
  percent: number | null
  filePath?: string
  error?: string
}

export type DownloadProgressCallback = (event: DownloadProgressEvent) => void

export type WizardLifecycleCallback = (event: WizardLifecycleEvent) => void

export type WizardLifecycleEvent =
  | { type: 'opened' }
  | { type: 'closed'; outcome: WizardOutcome }

export interface PatreonSessionExtractionResult {
  ok: boolean
  token?: string
  message?: string
}

export interface SavedPatreonSessionStatus {
  available: boolean
  canEncrypt: boolean
}

export interface AppPreferences {
  hasCompletedOnboarding: boolean
  openLibraryOnLaunch: boolean
  libraryView: LibraryViewPreference
  reactionDownloadDirectory: string | null
}

export interface WatchAlongApi {
  openVideos(): Promise<OpenVideosResult | null>
  selectMovieFile(): Promise<MediaFile | null>
  selectReactionFile(): Promise<MediaFile | null>
  createOrSwitchSessionFromPaths(reactionPath: string, moviePath: string, reactionSource?: ReactionSource): Promise<SessionLibrary>
  getLibrary(): Promise<SessionLibrary>
  saveActiveSession(patch: Partial<LibrarySession>): Promise<SessionLibrary>
  setSessionMedia(role: MediaRole, path: string, reactionSource?: ReactionSource): Promise<SessionLibrary>
  setActiveSession(sessionId: string): Promise<SessionLibrary>
  deleteSession(sessionId: string): Promise<SessionLibrary>
  renameSession(sessionId: string, title: string): Promise<SessionLibrary>
  openSubtitle(): Promise<SessionLibrary | null>
  clearSubtitle(): Promise<SessionLibrary>
  getSubtitleText(sessionId: string): Promise<string | null>
  getMediaUrl(role: MediaRole, sessionId: string): Promise<string | null>
  checkTools(): Promise<ToolCheckResult>
  detectBrowsers(): Promise<BrowserDetection[]>
  extractPatreonSession(browserName: BrowserName): Promise<PatreonSessionExtractionResult>
  openPatreonLoginWindow(): Promise<PatreonSessionExtractionResult>
  getSavedPatreonSessionStatus(): Promise<SavedPatreonSessionStatus>
  saveLastPatreonSession(jobId: string): Promise<SavedPatreonSessionStatus>
  forgetPatreonSession(): Promise<SavedPatreonSessionStatus>
  startReactionDownload(request: ReactionDownloadRequest): Promise<StartDownloadResult>
  cancelDownload(jobId: string): Promise<void>
  onDownloadProgress(callback: DownloadProgressCallback): () => void
  openOnboardingWizard(): Promise<void>
  openImportWizard(): Promise<void>
  finishOnboardingWizard(outcome: WizardOutcome): Promise<void>
  onWizardLifecycle(callback: WizardLifecycleCallback): () => void
  getPreferences(): Promise<AppPreferences>
  setPreference<K extends keyof AppPreferences>(key: K, value: AppPreferences[K]): Promise<AppPreferences>
  selectDownloadDirectory(): Promise<string | null>
  completeOnboarding(): Promise<AppPreferences>
}

export type SyncState =
  | 'empty'
  | 'loading'
  | 'paused'
  | 'seeking'
  | 'buffering'
  | 'playing'
  | 'ended'
  | 'error'

export type SyncCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seekReaction'; time: number }
  | { type: 'seekMovie'; time: number }
  | { type: 'syncNow' }
  | { type: 'loadSession'; time: number }
