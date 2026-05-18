import type { LibrarySession, OverlayGeometry, PlaybackRate, SessionLibrary, SessionData } from './types'

export const SESSION_LIBRARY_VERSION = 2

export const DEFAULT_OVERLAY: OverlayGeometry = {
  x: 24,
  y: 24,
  width: 420,
  height: 236
}

const PLAYBACK_RATES: PlaybackRate[] = [1, 1.25, 1.5, 2]

export function createDefaultSession(now = new Date(), patch: Partial<LibrarySession> = {}): LibrarySession {
  const timestamp = now.toISOString()
  const reactionPath = stringOrNull(patch.reactionPath)
  const moviePath = stringOrNull(patch.moviePath)
  const legacyVolume = clamp(finiteOr((patch as Partial<LibrarySession> & { volume?: number }).volume, 1), 0, 1)

  return {
    id: stringOrNull(patch.id) ?? createSessionId(now),
    title: stringOrDefault(patch.title, defaultSessionTitle(moviePath, reactionPath)),
    reactionPath,
    moviePath,
    subtitlePath: stringOrNull(patch.subtitlePath),
    offsetSeconds: finiteOr(patch.offsetSeconds, 0),
    lastReactionTimeSeconds: Math.max(0, finiteOr(patch.lastReactionTimeSeconds, 0)),
    overlay: normalizeOverlay(patch.overlay),
    isPipHidden: Boolean(patch.isPipHidden),
    reactionVolume: clamp(finiteOr(patch.reactionVolume, legacyVolume), 0, 1),
    movieVolume: clamp(finiteOr(patch.movieVolume, legacyVolume), 0, 1),
    isReactionMuted: Boolean(patch.isReactionMuted),
    isMovieMuted: Boolean(patch.isMovieMuted),
    playbackRate: normalizePlaybackRate(patch.playbackRate),
    movieRateCorrection: normalizeMovieRateCorrection(patch.movieRateCorrection),
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

export function createDefaultLibrary(): SessionLibrary {
  return {
    version: SESSION_LIBRARY_VERSION,
    activeSessionId: null,
    sessions: []
  }
}

export function normalizeOverlay(value: unknown): OverlayGeometry {
  const overlay = value as Partial<OverlayGeometry> | null
  const fallback = DEFAULT_OVERLAY
  return {
    x: finiteOr(overlay?.x, fallback.x),
    y: finiteOr(overlay?.y, fallback.y),
    width: Math.max(320, finiteOr(overlay?.width, fallback.width)),
    height: Math.max(180, finiteOr(overlay?.height, fallback.height))
  }
}

export function normalizeSession(value: unknown, now = new Date()): SessionData {
  const source = value as Partial<SessionData> | null
  const fallback = createDefaultSession(now, source ?? {})
  const createdAt = typeof source?.createdAt === 'string' ? source.createdAt : fallback.createdAt
  const updatedAt = typeof source?.updatedAt === 'string' ? source.updatedAt : fallback.updatedAt
  const legacyVolume = clamp(finiteOr((source as Partial<SessionData> & { volume?: number } | null)?.volume, 1), 0, 1)
  const reactionPath = stringOrNull(source?.reactionPath)
  const moviePath = stringOrNull(source?.moviePath)

  return {
    id: stringOrNull(source?.id) ?? fallback.id,
    title: stringOrDefault(source?.title, defaultSessionTitle(moviePath, reactionPath)),
    reactionPath,
    moviePath,
    subtitlePath: stringOrNull(source?.subtitlePath),
    offsetSeconds: finiteOr(source?.offsetSeconds, fallback.offsetSeconds),
    lastReactionTimeSeconds: Math.max(0, finiteOr(source?.lastReactionTimeSeconds, fallback.lastReactionTimeSeconds)),
    overlay: normalizeOverlay(source?.overlay),
    isPipHidden: Boolean(source?.isPipHidden),
    reactionVolume: clamp(finiteOr(source?.reactionVolume, legacyVolume), 0, 1),
    movieVolume: clamp(finiteOr(source?.movieVolume, legacyVolume), 0, 1),
    isReactionMuted: Boolean(source?.isReactionMuted),
    isMovieMuted: Boolean(source?.isMovieMuted),
    playbackRate: normalizePlaybackRate(source?.playbackRate),
    movieRateCorrection: normalizeMovieRateCorrection(source?.movieRateCorrection),
    createdAt,
    updatedAt
  }
}

export function mergeSession(session: SessionData, patch: Partial<SessionData>, now = new Date()): SessionData {
  return normalizeSession(
    {
      ...session,
      ...patch,
      overlay: patch.overlay ? { ...session.overlay, ...patch.overlay } : session.overlay,
      createdAt: session.createdAt,
      updatedAt: now.toISOString()
    },
    now
  )
}

export function normalizeLibrary(value: unknown, now = new Date()): SessionLibrary {
  const source = value as Partial<SessionLibrary> | null
  const sourceSessions = Array.isArray(source?.sessions) ? source.sessions : legacySessionsFromValue(value)
  const deduped = new Map<string, LibrarySession>()

  for (const rawSession of sourceSessions) {
    const session = normalizeSession(rawSession, now)
    const key = dedupeKey(session)
    if (!deduped.has(key)) {
      deduped.set(key, session)
    }
  }

  const sessions = [...deduped.values()]
  const requestedActiveId = stringOrNull(source?.activeSessionId)
  const activeSessionId =
    sessions.find((session) => session.id === requestedActiveId)?.id ?? sessions[0]?.id ?? null

  return {
    version: SESSION_LIBRARY_VERSION,
    activeSessionId,
    sessions
  }
}

export function getActiveSession(library: SessionLibrary): LibrarySession | null {
  return library.sessions.find((session) => session.id === library.activeSessionId) ?? null
}

export function getSessionById(library: SessionLibrary, sessionId: string): LibrarySession | null {
  return library.sessions.find((session) => session.id === sessionId) ?? null
}

export function createSessionFromPaths(reactionPath: string, moviePath: string, now = new Date()): LibrarySession {
  return createDefaultSession(now, {
    reactionPath,
    moviePath,
    title: defaultSessionTitle(moviePath, reactionPath)
  })
}

export function findMatchingSession(
  library: SessionLibrary,
  reactionPath: string,
  moviePath: string
): LibrarySession | null {
  const target = pairKey(reactionPath, moviePath)
  return library.sessions.find((session) => pairKey(session.reactionPath, session.moviePath) === target) ?? null
}

export function normalizePlaybackRate(value: unknown): PlaybackRate {
  return PLAYBACK_RATES.includes(value as PlaybackRate) ? (value as PlaybackRate) : 1
}

export function normalizeMovieRateCorrection(value: unknown): number {
  const rate = finiteOr(value, 1)
  return clamp(rate, 0.95, 1.05)
}

export function defaultSessionTitle(moviePath: string | null, reactionPath: string | null): string {
  return fileName(moviePath ?? reactionPath ?? 'Untitled watchalong')
}

function legacySessionsFromValue(value: unknown): unknown[] {
  const legacy = value as Partial<SessionData> | null
  return legacy?.reactionPath || legacy?.moviePath ? [legacy] : []
}

function dedupeKey(session: LibrarySession): string {
  const mediaKey = pairKey(session.reactionPath, session.moviePath)
  return mediaKey === '|' ? session.id : mediaKey
}

function pairKey(reactionPath: string | null, moviePath: string | null): string {
  return `${reactionPath ?? ''}|${moviePath ?? ''}`.toLocaleLowerCase()
}

function createSessionId(now: Date): string {
  return `session-${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function fileName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path
}
