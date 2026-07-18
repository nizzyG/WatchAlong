import type {
  AudioTrackPreference,
  LibrarySession,
  OverlayGeometry,
  PlaybackRate,
  ReactionSource,
  ReactorNameOrigin,
  ReactorProfile,
  ReactorSource,
  SessionData,
  SessionLibrary,
  SessionTitleOrigin,
  SyncReadiness
} from './types'
import {
  deriveLegacyReactorIdentity,
  normalizeReactorLabel,
  providerIdentityKind
} from './reactorIdentity'
import { clamp } from './numeric'

export const SESSION_LIBRARY_VERSION = 8

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
  const reactorName = sanitizeReactorName(patch.reactorName)

  return {
    id: stringOrNull(patch.id) ?? createSessionId(now),
    title: stringOrDefault(patch.title, defaultSessionTitle(moviePath, reactionPath)),
    titleOrigin: normalizeTitleOrigin(patch.titleOrigin, hasExplicitTitle(patch.title) ? 'custom' : 'generated'),
    reactorId: sanitizeReactorId(patch.reactorId),
    reactorName,
    reactorNameOrigin: normalizeReactorNameOrigin(patch.reactorNameOrigin, reactorName ? 'custom' : 'metadata'),
    reactionPath,
    reactionSource: normalizeReactionSource(patch.reactionSource),
    reactionDurationSeconds: nullableFinite(patch.reactionDurationSeconds),
    moviePath,
    moviePosterPath: stringOrNull(patch.moviePosterPath),
    movieAudioTrackPreference: normalizeAudioTrackPreference(patch.movieAudioTrackPreference),
    subtitlePath: stringOrNull(patch.subtitlePath),
    offsetSeconds: finiteOr(patch.offsetSeconds, 0),
    lastReactionTimeSeconds: Math.max(0, finiteOr(patch.lastReactionTimeSeconds, 0)),
    overlay: normalizeOverlay(patch.overlay),
    isPipHidden: Boolean(patch.isPipHidden),
    isMoviePoppedOut: Boolean(patch.isMoviePoppedOut),
    movieWindowGeometry: normalizeOverlay(patch.movieWindowGeometry ?? patch.overlay),
    reactionVolume: clamp(finiteOr(patch.reactionVolume, legacyVolume), 0, 1),
    movieVolume: clamp(finiteOr(patch.movieVolume, legacyVolume), 0, 1),
    isReactionMuted: Boolean(patch.isReactionMuted),
    isMovieMuted: Boolean(patch.isMovieMuted),
    playbackRate: normalizePlaybackRate(patch.playbackRate),
    reactorSource: normalizeReactorSource(patch.reactorSource),
    detectedMovieFps: normalizeDetectedMovieFps(patch.detectedMovieFps),
    movieRateCorrection: normalizeMovieRateCorrection(patch.movieRateCorrection),
    timingOrigin: normalizeTimingOrigin(patch.timingOrigin),
    syncReadiness: normalizeSyncReadiness(patch.syncReadiness, reactionPath, moviePath, false),
    autoSyncConfidence: normalizeConfidence(patch.autoSyncConfidence),
    autoSyncAnalyzedAt: stringOrNull(patch.autoSyncAnalyzedAt),
    autoSyncAlgorithmVersion: normalizeAlgorithmVersion(patch.autoSyncAlgorithmVersion),
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

export function createDefaultLibrary(): SessionLibrary {
  return {
    version: SESSION_LIBRARY_VERSION,
    activeSessionId: null,
    sessions: [],
    reactors: []
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
  const reactorName = sanitizeReactorName(source?.reactorName)

  return {
    id: stringOrNull(source?.id) ?? fallback.id,
    title: stringOrDefault(source?.title, defaultSessionTitle(moviePath, reactionPath)),
    // Libraries written before title provenance existed cannot prove that an
    // existing title was generated. Treat it as custom so an upgrade can
    // never overwrite a name the user chose.
    titleOrigin: normalizeTitleOrigin(source?.titleOrigin, hasExplicitTitle(source?.title) ? 'custom' : 'generated'),
    reactorId: sanitizeReactorId(source?.reactorId),
    reactorName,
    // A stored name without provenance may have been entered by a person.
    // Preserve it as custom so later metadata cannot silently replace it.
    reactorNameOrigin: normalizeReactorNameOrigin(source?.reactorNameOrigin, reactorName ? 'custom' : 'metadata'),
    reactionPath,
    reactionSource: normalizeReactionSource(source?.reactionSource),
    reactionDurationSeconds: nullableFinite(source?.reactionDurationSeconds),
    moviePath,
    moviePosterPath: stringOrNull(source?.moviePosterPath),
    movieAudioTrackPreference: normalizeAudioTrackPreference(source?.movieAudioTrackPreference),
    subtitlePath: stringOrNull(source?.subtitlePath),
    offsetSeconds: finiteOr(source?.offsetSeconds, fallback.offsetSeconds),
    lastReactionTimeSeconds: Math.max(0, finiteOr(source?.lastReactionTimeSeconds, fallback.lastReactionTimeSeconds)),
    overlay: normalizeOverlay(source?.overlay),
    isPipHidden: Boolean(source?.isPipHidden),
    isMoviePoppedOut: Boolean(source?.isMoviePoppedOut),
    movieWindowGeometry: normalizeOverlay(source?.movieWindowGeometry ?? source?.overlay),
    reactionVolume: clamp(finiteOr(source?.reactionVolume, legacyVolume), 0, 1),
    movieVolume: clamp(finiteOr(source?.movieVolume, legacyVolume), 0, 1),
    isReactionMuted: Boolean(source?.isReactionMuted),
    isMovieMuted: Boolean(source?.isMovieMuted),
    playbackRate: normalizePlaybackRate(source?.playbackRate),
    reactorSource: normalizeReactorSource(source?.reactorSource),
    detectedMovieFps: normalizeDetectedMovieFps(source?.detectedMovieFps),
    movieRateCorrection: normalizeMovieRateCorrection(source?.movieRateCorrection),
    timingOrigin: normalizeTimingOrigin(source?.timingOrigin),
    // v7 and older had no explicit readiness. Preserve complete saved
    // pairings as usable; incomplete drafts still need both media files.
    syncReadiness: normalizeSyncReadiness(
      source?.syncReadiness,
      reactionPath,
      moviePath,
      !Object.prototype.hasOwnProperty.call(source ?? {}, 'syncReadiness')
    ),
    autoSyncConfidence: normalizeConfidence(source?.autoSyncConfidence),
    autoSyncAnalyzedAt: stringOrNull(source?.autoSyncAnalyzedAt),
    autoSyncAlgorithmVersion: normalizeAlgorithmVersion(source?.autoSyncAlgorithmVersion),
    createdAt,
    updatedAt
  }
}

export function mergeSession(session: SessionData, patch: Partial<SessionData>, now = new Date()): SessionData {
  return normalizeSession(
    {
      ...session,
      ...patch,
      titleOrigin: titleOriginAfterPatch(session, patch),
      reactorNameOrigin: reactorNameOriginAfterPatch(session, patch),
      overlay: patch.overlay ? { ...session.overlay, ...patch.overlay } : session.overlay,
      movieWindowGeometry: patch.movieWindowGeometry
        ? { ...session.movieWindowGeometry, ...patch.movieWindowGeometry }
        : session.movieWindowGeometry,
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

  const normalizedProfiles = normalizeReactorProfiles(
    Array.isArray(source?.reactors) ? source.reactors : [],
    now
  )
  const { sessions, reactors } = attachSessionsToReactorProfiles(
    [...deduped.values()],
    normalizedProfiles,
    now
  )
  const requestedActiveId = stringOrNull(source?.activeSessionId)
  const activeSessionId =
    sessions.find((session) => session.id === requestedActiveId)?.id ?? sessions[0]?.id ?? null

  return {
    version: SESSION_LIBRARY_VERSION,
    activeSessionId,
    sessions,
    reactors
  }
}

export function getActiveSession(library: SessionLibrary): LibrarySession | null {
  return library.sessions.find((session) => session.id === library.activeSessionId) ?? null
}

export function getSessionById(library: SessionLibrary, sessionId: string): LibrarySession | null {
  return library.sessions.find((session) => session.id === sessionId) ?? null
}

export function createSessionFromPaths(
  reactionPath: string,
  moviePath: string,
  now = new Date(),
  reactionSource: ReactionSource = 'local',
  suggestedTitle?: string,
  reactorName?: string
): LibrarySession {
  return createDefaultSession(now, {
    reactionPath,
    reactionSource,
    moviePath,
    title: sanitizeSuggestedSessionTitle(suggestedTitle) ?? defaultSessionTitle(moviePath, reactionPath),
    titleOrigin: 'generated',
    reactorName: sanitizeReactorName(reactorName),
    reactorNameOrigin: 'metadata'
  })
}

export function createSessionFromMedia(
  media: Partial<Pick<LibrarySession, 'reactionPath' | 'reactionSource' | 'moviePath' | 'reactorName' | 'reactorNameOrigin'>>,
  now = new Date()
): LibrarySession {
  const reactionPath = stringOrNull(media.reactionPath)
  const moviePath = stringOrNull(media.moviePath)
  return createDefaultSession(now, {
    reactionPath,
    reactionSource: normalizeReactionSource(media.reactionSource),
    moviePath,
    title: defaultSessionTitle(moviePath, reactionPath),
    titleOrigin: 'generated',
    reactorName: sanitizeReactorName(media.reactorName),
    reactorNameOrigin: media.reactorNameOrigin
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

export function normalizeReactorSource(value: unknown): ReactorSource {
  return value === 'ntsc' || value === 'pal' || value === 'streaming' ? value : 'ntsc'
}

export function normalizeDetectedMovieFps(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function normalizeMovieRateCorrection(value: unknown): number {
  const rate = finiteOr(value, 1)
  return clamp(rate, 0.9, 1.1)
}

export function normalizeTimingOrigin(value: unknown): LibrarySession['timingOrigin'] {
  return value === 'automatic' ? 'automatic' : 'manual'
}

export function normalizeSyncReadiness(
  value: unknown,
  reactionPath: string | null,
  moviePath: string | null,
  preserveLegacyCompletePair: boolean
): SyncReadiness {
  if (!reactionPath || !moviePath) return 'needs-sync'
  if (value === 'ready' || value === 'needs-sync') return value
  return preserveLegacyCompletePair ? 'ready' : 'needs-sync'
}

export function normalizeAudioTrackPreference(value: unknown): AudioTrackPreference | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const preference = value as Partial<AudioTrackPreference>
  const { label, language, ordinal } = preference
  if (
    typeof label !== 'string' ||
    typeof language !== 'string' ||
    typeof ordinal !== 'number' ||
    !Number.isSafeInteger(ordinal) ||
    ordinal < 0
  ) {
    return null
  }

  return { label, language, ordinal }
}

function normalizeConfidence(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 1) : null
}

function normalizeAlgorithmVersion(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

export function defaultSessionTitle(moviePath: string | null, reactionPath: string | null): string {
  return fileName(moviePath ?? reactionPath ?? 'Untitled watchalong')
}

function normalizeTitleOrigin(value: unknown, fallback: SessionTitleOrigin): SessionTitleOrigin {
  return value === 'generated' || value === 'custom' ? value : fallback
}

function titleOriginAfterPatch(
  session: SessionData,
  patch: Partial<SessionData>
): SessionTitleOrigin {
  if (!Object.prototype.hasOwnProperty.call(patch, 'title')) {
    return session.titleOrigin
  }
  return patch.titleOrigin === 'generated' ? 'generated' : 'custom'
}

function normalizeReactorNameOrigin(value: unknown, fallback: ReactorNameOrigin): ReactorNameOrigin {
  return value === 'metadata' || value === 'custom' ? value : fallback
}

function reactorNameOriginAfterPatch(
  session: SessionData,
  patch: Partial<SessionData>
): ReactorNameOrigin {
  if (!Object.prototype.hasOwnProperty.call(patch, 'reactorName')) {
    return session.reactorNameOrigin
  }
  return patch.reactorNameOrigin === 'metadata' ? 'metadata' : 'custom'
}

export function sanitizeSuggestedSessionTitle(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const printable = [...value].map((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) ? ' ' : character
  }).join('')
  const normalized = printable.replace(/\s+/g, ' ').trim()
  return normalized.length > 0 ? normalized : null
}

export function sanitizeReactorName(value: unknown): string | null {
  const sanitized = sanitizeSuggestedSessionTitle(value)
  return sanitized ? [...sanitized].slice(0, 120).join('').trim() || null : null
}

export function sanitizeReactorId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 &&
    normalized.length <= 160 &&
    normalized !== '.' &&
    normalized !== '..' &&
    !/[\\/\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : null
}

function normalizeReactorProfiles(values: unknown[], now: Date): ReactorProfile[] {
  const profiles = new Map<string, ReactorProfile>()
  for (const value of values) {
    const source = value as Partial<ReactorProfile> | null
    const id = sanitizeReactorId(source?.id)
    const name = sanitizeReactorName(source?.name)
    if (!id || !name) continue

    const timestamp = now.toISOString()
    const createdAt = typeof source?.createdAt === 'string' ? source.createdAt : timestamp
    const updatedAt = typeof source?.updatedAt === 'string' ? source.updatedAt : createdAt
    const externalIdentityKeys = normalizeExternalIdentityKeys(source?.externalIdentityKeys)
    const current = profiles.get(id)
    profiles.set(id, current
      ? {
          ...current,
          externalIdentityKeys: uniqueStrings([...current.externalIdentityKeys, ...externalIdentityKeys]),
          avatarPath: current.avatarPath ?? stringOrNull(source?.avatarPath),
          updatedAt: latestTimestamp(current.updatedAt, updatedAt)
        }
      : {
          id,
          name,
          avatarPath: stringOrNull(source?.avatarPath),
          externalIdentityKeys,
          createdAt,
          updatedAt
        })
  }
  return [...profiles.values()]
}

function attachSessionsToReactorProfiles(
  sourceSessions: LibrarySession[],
  sourceProfiles: ReactorProfile[],
  now: Date
): { sessions: LibrarySession[]; reactors: ReactorProfile[] } {
  const reactors = sourceProfiles.map((profile) => ({
    ...profile,
    externalIdentityKeys: [...profile.externalIdentityKeys]
  }))
  const byId = new Map(reactors.map((profile) => [profile.id, profile]))
  const usedIds = new Set(byId.keys())

  const sessions = sourceSessions.map((session) => {
    const linked = session.reactorId ? byId.get(session.reactorId) : null
    if (linked) return session

    const identity = deriveLegacyReactorIdentity(session)
    if (!identity.known) return { ...session, reactorId: null }

    let profile = reactors.find((candidate) =>
      identity.externalIdentityKeys.some((key) => candidate.externalIdentityKeys.includes(key)))

    if (!profile) {
      const sameName = reactors.filter((candidate) =>
        normalizeReactorLabel(candidate.name) === normalizeReactorLabel(identity.label) &&
        !hasConflictingProviderIdentity(candidate, identity.externalIdentityKeys))
      if (sameName.length === 1) profile = sameName[0]
    }

    if (!profile) {
      const timestamp = session.createdAt || now.toISOString()
      const id = uniqueReactorId(identity.key, usedIds)
      profile = {
        id,
        name: identity.label,
        avatarPath: null,
        externalIdentityKeys: [...identity.externalIdentityKeys],
        createdAt: timestamp,
        updatedAt: session.updatedAt || timestamp
      }
      reactors.push(profile)
      byId.set(id, profile)
      usedIds.add(id)
    } else {
      profile.externalIdentityKeys = uniqueStrings([
        ...profile.externalIdentityKeys,
        ...identity.externalIdentityKeys.filter((key) => !hasProviderAliasConflict(profile!, key))
      ])
    }

    return { ...session, reactorId: profile.id }
  })

  const referenced = new Set(sessions.map((session) => session.reactorId).filter(Boolean))
  return {
    sessions,
    reactors: reactors.filter((profile) => referenced.has(profile.id))
  }
}

function normalizeExternalIdentityKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return uniqueStrings(value.flatMap((item) => {
    if (typeof item !== 'string') return []
    const normalized = item.trim()
    return normalized && normalized.length <= 256 && !/[\u0000-\u001f\u007f]/.test(normalized)
      ? [normalized]
      : []
  }))
}

function hasConflictingProviderIdentity(profile: ReactorProfile, keys: string[]): boolean {
  return keys.some((key) => hasProviderAliasConflict(profile, key))
}

function hasProviderAliasConflict(profile: ReactorProfile, key: string): boolean {
  const kind = providerIdentityKind(key)
  return Boolean(kind && profile.externalIdentityKeys.some((candidate) =>
    providerIdentityKind(candidate) === kind && candidate !== key))
}

function uniqueReactorId(identityKey: string, usedIds: Set<string>): string {
  const base = deterministicReactorId(identityKey)
  let candidate = base
  let suffix = 2
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  return candidate
}

function deterministicReactorId(identityKey: string): string {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (const character of identityKey.normalize('NFKC')) {
    const codePoint = character.codePointAt(0) ?? 0
    first = Math.imul(first ^ codePoint, 0x01000193) >>> 0
    second = Math.imul(second ^ (codePoint + 0x9e37), 0x85ebca6b) >>> 0
  }
  return `reactor-${first.toString(36)}-${second.toString(36)}`
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function latestTimestamp(left: string, right: string): string {
  const leftTime = Date.parse(left)
  const rightTime = Date.parse(right)
  if (!Number.isFinite(leftTime)) return right
  if (!Number.isFinite(rightTime)) return left
  return rightTime > leftTime ? right : left
}

function legacySessionsFromValue(value: unknown): unknown[] {
  const legacy = value as Partial<SessionData> | null
  return legacy?.reactionPath || legacy?.moviePath ? [legacy] : []
}

function dedupeKey(session: LibrarySession): string {
  return session.reactionPath || session.moviePath
    ? pairKey(session.reactionPath, session.moviePath)
    : session.id
}

function pairKey(reactionPath: string | null, moviePath: string | null): string {
  return JSON.stringify([mediaPathIdentity(reactionPath), mediaPathIdentity(moviePath)])
}

/**
 * File identity follows the path's own platform syntax, not the platform doing
 * the comparison. This keeps Windows drive/UNC paths case-insensitive while
 * preserving case and legal delimiter characters on POSIX volumes.
 */
export function mediaPathIdentity(value: string | null): string | null {
  if (value === null) return null
  const windowsPath = /^[a-z]:[\\/]/i.test(value) || /^(?:\\\\|\/\/)[^\\/]/.test(value)
  return windowsPath
    ? `win:${value.replace(/\//g, '\\').toLowerCase()}`
    : `posix:${value}`
}

function createSessionId(now: Date): string {
  return `session-${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function nullableFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function normalizeReactionSource(value: unknown): ReactionSource {
  return value === 'youtube' || value === 'patreon' || value === 'local' ? value : 'local'
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function hasExplicitTitle(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function fileName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path
}
