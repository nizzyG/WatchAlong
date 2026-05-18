export type MediaRole = 'reaction' | 'movie'
export type PlaybackRate = 1 | 1.25 | 1.5 | 2

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

export interface WatchAlongApi {
  openVideos(): Promise<OpenVideosResult | null>
  getLibrary(): Promise<SessionLibrary>
  saveActiveSession(patch: Partial<LibrarySession>): Promise<SessionLibrary>
  setActiveSession(sessionId: string): Promise<SessionLibrary>
  deleteSession(sessionId: string): Promise<SessionLibrary>
  renameSession(sessionId: string, title: string): Promise<SessionLibrary>
  openSubtitle(): Promise<SessionLibrary | null>
  clearSubtitle(): Promise<SessionLibrary>
  getSubtitleText(sessionId: string): Promise<string | null>
  getMediaUrl(role: MediaRole, sessionId: string): Promise<string | null>
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
