export type MediaRole = 'reaction' | 'movie'
export type PlaybackRate = 1 | 1.25 | 1.5 | 2
export type ToolName = 'yt-dlp' | 'ffmpeg' | 'node' | 'patreon-dl'
export type BrowserName = 'firefox' | 'chrome' | 'edge' | 'brave' | 'safari' | 'opera'
export type BrowserExtractionMode = 'automatic' | 'best-effort' | 'manual-only'
export type ReactionDownloadSource = 'youtube' | 'patreon'
export type ReactionSource = 'local' | ReactionDownloadSource
export type DownloadJobState = 'idle' | 'checking' | 'downloading' | 'success' | 'failed' | 'cancelled'
export type WizardOutcome = 'cancelled' | 'completed'
export type LibraryViewPreference = 'grid' | 'list'
export type ImportWizardMode = 'new' | 'show-again' | 'swap-reaction'

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
  isMoviePoppedOut: boolean
  movieWindowGeometry: OverlayGeometry
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
  version: 3
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
  extractionMode: BrowserExtractionMode
  subtitle?: string
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

export type RemoteMediaEventType =
  | 'play'
  | 'pause'
  | 'seeking'
  | 'seeked'
  | 'waiting'
  | 'canplay'
  | 'stalled'
  | 'ended'
  | 'error'
  | 'timeupdate'
  | 'loadedmetadata'
  | 'durationchange'
  | 'ratechange'
  | 'volumechange'
  | 'loadeddata'
  | 'canplaythrough'

export interface RemoteMediaState {
  currentTime: number
  duration: number
  paused: boolean
  playbackRate: number
  readyState: number
  seeking: boolean
  ended: boolean
  volume: number
  muted: boolean
}

export interface RemoteMediaEvent {
  type: RemoteMediaEventType
  state: RemoteMediaState
  error?: string
}

export type RemoteMediaEventCallback = (event: RemoteMediaEvent) => void

export type RemoteMediaCommand =
  | { id: string; type: 'setSource'; mediaUrl: string | null; currentTime: number; playbackRate: number; volume: number; muted: boolean; subtitleText: string | null; title: string }
  | { id: string; type: 'play' }
  | { id: string; type: 'pause' }
  | { id: string; type: 'setCurrentTime'; value: number }
  | { id: string; type: 'setPlaybackRate'; value: number }
  | { id: string; type: 'setVolume'; value: number }
  | { id: string; type: 'setMuted'; value: boolean }
  | { id: string; type: 'setSubtitleText'; value: string | null }
  | { id: string; type: 'fadeOut' }

export interface RemoteMediaCommandResult {
  id: string
  ok: boolean
  state: RemoteMediaState
  error?: string
}

export interface MovieWindowOpenRequest {
  sessionId: string
  title: string
  mediaUrl: string
  subtitleText: string | null
  currentTime: number
  playbackRate: number
  volume: number
  muted: boolean
  geometry: OverlayGeometry
  geometryMode: 'overlay' | 'screen'
}

export interface MovieWindowOpenResult {
  opened: boolean
  geometry: OverlayGeometry
  state: RemoteMediaState | null
  reason?: string
}

export interface MovieWindowCloseOptions {
  notifyMainWindow?: boolean
}

export interface MovieWindowCloseResult {
  geometry: OverlayGeometry | null
  overlay: OverlayGeometry | null
  state: RemoteMediaState | null
}

export interface MovieWindowGeometryEvent {
  geometry: OverlayGeometry
  overlay: OverlayGeometry | null
}

export interface MovieWindowClosedEvent {
  reason?: 'unresponsive'
}

export interface MovieWindowInit {
  sessionId: string
  title: string
  mediaUrl: string
  subtitleText: string | null
  currentTime: number
  playbackRate: number
  volume: number
  muted: boolean
}

export type MovieWindowGeometryCallback = (event: MovieWindowGeometryEvent) => void
export type MovieWindowLifecycleCallback = (event?: MovieWindowClosedEvent) => void
export type MovieWindowCommandCallback = (command: RemoteMediaCommand) => void
export type MainWindowCloseCallback = () => void

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

export interface ImportWizardLaunchOptions {
  mode?: ImportWizardMode
  sessionId?: string | null
}

export interface ImportWizardContext {
  mode: ImportWizardMode
  sessionId: string | null
  movie: MediaFile | null
}

export interface WatchAlongApi {
  openVideos(): Promise<OpenVideosResult | null>
  selectMovieFile(): Promise<MediaFile | null>
  selectReactionFile(): Promise<MediaFile | null>
  createOrSwitchSessionFromPaths(reactionPath: string, moviePath: string, reactionSource?: ReactionSource): Promise<SessionLibrary>
  getLibrary(): Promise<SessionLibrary>
  saveActiveSession(patch: Partial<LibrarySession>): Promise<SessionLibrary>
  saveSessionPosition(sessionId: string, lastReactionTimeSeconds: number): Promise<SessionLibrary>
  setSessionMedia(role: MediaRole, path: string, reactionSource?: ReactionSource): Promise<SessionLibrary>
  replaceSessionMedia(sessionId: string, role: MediaRole, path: string, reactionSource?: ReactionSource): Promise<SessionLibrary>
  setActiveSession(sessionId: string): Promise<SessionLibrary>
  deleteSession(sessionId: string): Promise<SessionLibrary>
  renameSession(sessionId: string, title: string): Promise<SessionLibrary>
  openSubtitle(): Promise<SessionLibrary | null>
  clearSubtitle(): Promise<SessionLibrary>
  getSubtitleText(sessionId: string): Promise<string | null>
  getMediaUrl(role: MediaRole, sessionId: string): Promise<string | null>
  openMovieWindow(request: MovieWindowOpenRequest): Promise<MovieWindowOpenResult>
  closeMovieWindow(options?: MovieWindowCloseOptions): Promise<MovieWindowCloseResult>
  requestMovieWindowPopIn(): Promise<void>
  getMovieWindowInit(): Promise<MovieWindowInit | null>
  movieWindowReady(): Promise<void>
  sendMovieMediaCommand(command: RemoteMediaCommand): Promise<RemoteMediaCommandResult>
  acknowledgeMovieMediaCommand(result: RemoteMediaCommandResult): Promise<void>
  reportMovieMediaEvent(event: RemoteMediaEvent): Promise<void>
  onMovieMediaCommand(callback: MovieWindowCommandCallback): () => void
  onMovieMediaEvent(callback: RemoteMediaEventCallback): () => void
  onMovieWindowGeometry(callback: MovieWindowGeometryCallback): () => void
  onMovieWindowPopInRequest(callback: MovieWindowLifecycleCallback): () => void
  onMovieWindowClosed(callback: MovieWindowLifecycleCallback): () => void
  checkTools(): Promise<ToolCheckResult>
  detectBrowsers(): Promise<BrowserDetection[]>
  extractPatreonSession(browserName: BrowserName): Promise<PatreonSessionExtractionResult>
  openPatreonLoginWindow(): Promise<PatreonSessionExtractionResult>
  getSavedPatreonSessionStatus(): Promise<SavedPatreonSessionStatus>
  saveLastPatreonSession(jobId: string): Promise<SavedPatreonSessionStatus>
  discardLastPatreonSession(jobId: string): Promise<SavedPatreonSessionStatus>
  forgetPatreonSession(): Promise<SavedPatreonSessionStatus>
  startReactionDownload(request: ReactionDownloadRequest): Promise<StartDownloadResult>
  cancelDownload(jobId: string): Promise<void>
  onDownloadProgress(callback: DownloadProgressCallback): () => void
  openOnboardingWizard(): Promise<void>
  openImportWizard(options?: ImportWizardLaunchOptions): Promise<void>
  getImportWizardContext(): Promise<ImportWizardContext>
  finishOnboardingWizard(outcome: WizardOutcome): Promise<void>
  onWizardLifecycle(callback: WizardLifecycleCallback): () => void
  confirmMainWindowClose(): Promise<void>
  onMainWindowCloseRequest(callback: MainWindowCloseCallback): () => void
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
