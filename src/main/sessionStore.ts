import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, posix, win32 } from 'node:path'
import {
  createDefaultLibrary,
  createSessionFromMedia,
  createSessionFromPaths,
  findMatchingSession,
  getActiveSession,
  mediaPathIdentity,
  normalizeLibrary,
  normalizeSession,
  sanitizeReactorName,
  sanitizeSuggestedSessionTitle
} from '@shared/session'
import type {
  LibrarySession,
  MediaRole,
  ReactionSource,
  ReplaceSessionMediaResult,
  SessionLibrary
} from '@shared/types'

export class LibraryRecoveryError extends Error {
  constructor(readonly preservedPath: string) {
    super('WatchAlong moved a damaged library to a recovery file so it cannot be overwritten.')
    this.name = 'LibraryRecoveryError'
  }
}

export class SessionStore {
  constructor(
    private readonly libraryPath: string,
    private readonly legacySessionPath: string
  ) {}

  read(): SessionLibrary {
    try {
      const raw = readFileSync(this.libraryPath, 'utf8')
      return parseStoredLibrary(raw)
    } catch (error) {
      if (isMissingFileError(error)) {
        const backup = this.readBackup()
        if (backup) {
          this.write(backup)
          return backup
        }
        const preservedPath = this.getLatestRecoveryPath()
        if (preservedPath) {
          throw new LibraryRecoveryError(preservedPath)
        }
        return this.migrateLegacySession()
      }
      // A transient filesystem failure must not be mistaken for an empty
      // library. Propagate it so no later operation can overwrite user data.
      if (!(error instanceof SyntaxError)) {
        throw error
      }
      return this.recoverCorruptLibrary()
    }
  }

  getActiveSession(): LibrarySession | null {
    return getActiveSession(this.read())
  }

  getSession(sessionId: string): LibrarySession | null {
    return this.read().sessions.find((session) => session.id === sessionId) ?? null
  }

  createOrSwitchSession(
    reactionPath: string,
    moviePath: string,
    reactionSource: ReactionSource = 'local',
    suggestedTitle?: string,
    reactorName?: string
  ): SessionLibrary {
    const library = this.read()
    const existing = findMatchingSession(library, reactionPath, moviePath)
    const now = new Date()
    const updatedExisting = existing && existing.reactorNameOrigin === 'metadata' && sanitizeReactorName(reactorName)
      ? normalizeSession({
          ...existing,
          reactorName,
          reactorNameOrigin: 'metadata',
          createdAt: existing.createdAt,
          updatedAt: now.toISOString()
        })
      : existing
    const createdSession = updatedExisting
      ? null
      : {
          ...createSessionFromPaths(
            reactionPath,
            moviePath,
            now,
            reactionSource,
            suggestedTitle,
            reactorName
          ),
          moviePosterPath: findMoviePosterPath(library.sessions, moviePath)
        }
    const next = updatedExisting
      ? {
          ...library,
          activeSessionId: updatedExisting.id,
          sessions: library.sessions.map((session) => session.id === updatedExisting.id ? updatedExisting : session)
        }
      : {
          ...library,
          activeSessionId: null,
          sessions: [...library.sessions, createdSession!]
        }

    if (!updatedExisting) {
      next.activeSessionId = next.sessions.at(-1)?.id ?? null
    }

    return this.writeAndReturn(next)
  }

  setSessionMedia(
    role: MediaRole,
    filePath: string,
    reactionSource: ReactionSource = 'local',
    suggestedTitle?: string,
    reactorName?: string
  ): SessionLibrary {
    const library = this.read()
    const active = getActiveSession(library)
    const pathKey = role === 'reaction' ? 'reactionPath' : 'moviePath'
    const now = new Date()

    if (!active || (active.reactionPath && active.moviePath)) {
      const baseDraft = createSessionFromMedia(
        {
          [pathKey]: filePath,
          ...(role === 'reaction'
            ? { reactionSource, reactorName: sanitizeReactorName(reactorName), reactorNameOrigin: 'metadata' as const }
            : {})
        },
        now
      )
      const draft = role === 'movie'
        ? { ...baseDraft, moviePosterPath: findMoviePosterPath(library.sessions, filePath) }
        : baseDraft
      return this.writeAndReturn({
        ...library,
        activeSessionId: draft.id,
        sessions: [...library.sessions, draft]
      })
    }

    const nextSession = normalizeSession({
      ...active,
      [pathKey]: filePath,
      ...(role === 'reaction' ? { reactionSource } : {}),
      ...reactorIdentityAfterReactionChange(active, role, reactorName),
      ...(role === 'movie'
        ? {
            detectedMovieFps: null,
            moviePosterPath: moviePosterPathAfterMovieChange(library.sessions, active, filePath)
          }
        : {}),
      ...resetAutoSyncMetadata,
      title: completedDraftTitle(active, role, suggestedTitle) ?? (
        role === 'movie' && active.titleOrigin === 'generated' ? basenameForTitle(filePath) : active.title
      ),
      createdAt: active.createdAt,
      updatedAt: now.toISOString()
    })

    if (nextSession.reactionPath && nextSession.moviePath) {
      const existing = findMatchingSession(library, nextSession.reactionPath, nextSession.moviePath)
      if (existing && existing.id !== active.id) {
        return this.writeAndReturn({
          ...library,
          activeSessionId: existing.id,
          sessions: library.sessions.filter((session) => session.id !== active.id)
        })
      }
    }

    const updatedSessions = library.sessions.map((session) => (session.id === active.id ? nextSession : session))
    const sessions = role === 'movie' && nextSession.moviePosterPath
      ? applyMoviePosterToPath(
          updatedSessions,
          nextSession.moviePath,
          nextSession.moviePosterPath,
          nextSession.updatedAt
        )
      : updatedSessions

    return this.writeAndReturn({
      ...library,
      activeSessionId: active.id,
      sessions
    })
  }

  replaceSessionMedia(
    sessionId: string,
    role: MediaRole,
    filePath: string,
    reactionSource: ReactionSource = 'local',
    suggestedTitle?: string,
    reactorName?: string
  ): ReplaceSessionMediaResult {
    const library = this.read()
    const target = library.sessions.find((session) => session.id === sessionId)
    if (!target) {
      return { status: 'missing', library }
    }

    const now = new Date()
    const updatedAt = now.toISOString()
    const nextMoviePosterPath = role === 'movie'
      ? moviePosterPathAfterMovieChange(library.sessions, target, filePath)
      : target.moviePosterPath
    const nextSession = normalizeSession({
      ...target,
      ...(role === 'movie'
        ? { moviePath: filePath, moviePosterPath: nextMoviePosterPath, detectedMovieFps: null }
        : { reactionPath: filePath, reactionSource }),
      ...reactorIdentityAfterReactionChange(target, role, reactorName),
      title: completedDraftTitle(target, role, suggestedTitle) ?? target.title,
      ...resetAutoSyncMetadata,
      createdAt: target.createdAt,
      updatedAt
    })

    if (nextSession.reactionPath && nextSession.moviePath) {
      const existing = findMatchingSession(library, nextSession.reactionPath, nextSession.moviePath)
      if (existing && existing.id !== target.id) {
        // Do not let normalizeLibrary decide which duplicate survives. Keep
        // both complete sessions untouched and let the UI offer the already
        // saved pairing explicitly.
        return { status: 'conflict', library, existingSessionId: existing.id }
      }
    }

    const replacedSessions = library.sessions.map((session) => (session.id === sessionId ? nextSession : session))
    const sessions = role === 'movie' && nextSession.moviePosterPath
      ? applyMoviePosterToPath(
          replacedSessions,
          nextSession.moviePath,
          nextSession.moviePosterPath,
          updatedAt
        )
      : replacedSessions

    return {
      status: 'replaced',
      library: this.writeAndReturn({
        ...library,
        activeSessionId: sessionId,
        sessions
      })
    }
  }

  getLatestRecoveryPath(): string | null {
    const directory = dirname(this.libraryPath)
    const prefixes = [
      `${basename(this.libraryPath)}.corrupt-`,
      `${basename(this.backupPath())}.corrupt-`,
      `${basename(this.legacySessionPath)}.corrupt-`
    ]
    try {
      const fileName = readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && prefixes.some((prefix) => entry.name.startsWith(prefix)))
        .map((entry) => entry.name)
        .sort((left, right) => compareRecoveryNames(left, right, prefixes))
        .at(-1)
      return fileName ? join(directory, fileName) : null
    } catch {
      return null
    }
  }

  startFreshLibraryAfterRecovery(): SessionLibrary {
    if (existsSync(this.libraryPath) || !this.getLatestRecoveryPath()) {
      throw new Error('A preserved library recovery file is required before starting fresh.')
    }
    const library = createDefaultLibrary()
    this.write(library)
    return library
  }

  setActiveSession(sessionId: string): SessionLibrary {
    const library = this.read()
    if (!library.sessions.some((session) => session.id === sessionId)) {
      return library
    }

    return this.writeAndReturn({ ...library, activeSessionId: sessionId })
  }

  updateActive(patch: Partial<LibrarySession>): SessionLibrary {
    const library = this.read()
    const active = getActiveSession(library)
    if (!active) {
      return library
    }

    return this.updateSession(active.id, patch)
  }

  updateSession(sessionId: string, patch: Partial<LibrarySession>): SessionLibrary {
    const library = this.read()
    const target = library.sessions.find((session) => session.id === sessionId)
    if (!target) {
      return library
    }

    const now = new Date()
    const timingPatch = isManualTimingPatch(patch) && patch.timingOrigin !== 'automatic'
      ? resetAutoSyncMetadata
      : {}
    const sessions = library.sessions.map((session) =>
      session.id === target.id
        ? normalizeSession({
            ...session,
            ...patch,
            ...timingPatch,
            titleOrigin: !Object.prototype.hasOwnProperty.call(patch, 'title')
              ? session.titleOrigin
              : patch.titleOrigin === 'generated' ? 'generated' : 'custom',
            reactorNameOrigin: !Object.prototype.hasOwnProperty.call(patch, 'reactorName')
              ? session.reactorNameOrigin
              : patch.reactorNameOrigin === 'metadata' ? 'metadata' : 'custom',
            id: session.id,
            overlay: patch.overlay ? { ...session.overlay, ...patch.overlay } : session.overlay,
            movieWindowGeometry: patch.movieWindowGeometry
              ? { ...session.movieWindowGeometry, ...patch.movieWindowGeometry }
              : session.movieWindowGeometry,
            createdAt: session.createdAt,
            updatedAt: now.toISOString()
          })
        : session
    )

    return this.writeAndReturn({ ...library, sessions })
  }

  setMoviePosterPath(sessionId: string, moviePosterPath: string | null): SessionLibrary {
    const library = this.read()
    const target = library.sessions.find((session) => session.id === sessionId)
    const targetMovieIdentity = mediaPathIdentity(target?.moviePath ?? null)
    if (!target || !targetMovieIdentity) {
      return library
    }

    const updatedAt = new Date().toISOString()
    const sessions = library.sessions.map((session) =>
      mediaPathIdentity(session.moviePath) === targetMovieIdentity
        ? normalizeSession({
            ...session,
            moviePosterPath,
            createdAt: session.createdAt,
            updatedAt
          })
        : session
    )

    return this.writeAndReturn({ ...library, sessions })
  }

  saveSessionPosition(sessionId: string, lastReactionTimeSeconds: number): SessionLibrary {
    const library = this.read()
    if (!library.sessions.some((session) => session.id === sessionId)) {
      return library
    }

    const now = new Date()
    const sessions = library.sessions.map((session) =>
      session.id === sessionId
        ? normalizeSession({
            ...session,
            lastReactionTimeSeconds,
            createdAt: session.createdAt,
            updatedAt: now.toISOString()
          })
        : session
    )

    return this.writeAndReturn({ ...library, sessions })
  }

  renameSession(sessionId: string, title: string, reactorName?: string): SessionLibrary {
    const now = new Date().toISOString()
    const library = this.read()
    const sanitizedReactorName = reactorName === undefined ? undefined : sanitizeReactorName(reactorName)
    const sessions = library.sessions.map((session) =>
      session.id === sessionId
        ? normalizeSession({
            ...session,
            title,
            titleOrigin: title.trim() === session.title ? session.titleOrigin : 'custom',
            ...(sanitizedReactorName === undefined || sanitizedReactorName === session.reactorName
              ? {}
              : { reactorName: sanitizedReactorName, reactorNameOrigin: 'custom' as const }),
            updatedAt: now,
            createdAt: session.createdAt
          })
        : session
    )

    return this.writeAndReturn({ ...library, sessions })
  }

  deleteSession(sessionId: string): SessionLibrary {
    const library = this.read()
    const sessions = library.sessions.filter((session) => session.id !== sessionId)
    const activeSessionId =
      library.activeSessionId === sessionId ? sessions[0]?.id ?? null : library.activeSessionId
    return this.writeAndReturn({ ...library, sessions, activeSessionId })
  }

  writeAndReturn(library: SessionLibrary): SessionLibrary {
    const next = normalizeLibrary(library)
    this.write(next)
    return next
  }

  write(library: SessionLibrary): void {
    const serialized = `${JSON.stringify(library, null, 2)}\n`
    this.writeAtomically(this.libraryPath, serialized)
    try {
      // Keep a last-known-good copy. The primary write remains authoritative;
      // a backup failure after it succeeds must not make the UI report a false
      // save failure.
      this.writeAtomically(this.backupPath(), serialized)
    } catch (error) {
      console.error('Could not update the WatchAlong library backup.', error)
    }
  }

  private recoverCorruptLibrary(): SessionLibrary {
    const backup = this.readBackup()
    const corruptPath = this.nextCorruptPath()

    // Preserve the original bytes before creating any replacement. If this
    // rename cannot complete, fail closed instead of risking an overwrite.
    renameSync(this.libraryPath, corruptPath)

    if (backup) {
      this.write(backup)
      return backup
    }

    throw new LibraryRecoveryError(corruptPath)
  }

  private readBackup(): SessionLibrary | null {
    const backupPath = this.backupPath()
    try {
      return parseStoredLibrary(readFileSync(backupPath, 'utf8'))
    } catch (error) {
      if (isMissingFileError(error)) {
        return null
      }
      if (error instanceof SyntaxError) {
        this.quarantineFile(backupPath)
        return null
      }
      throw error
    }
  }

  private writeAtomically(filePath: string, serialized: string): void {
    mkdirSync(dirname(filePath), { recursive: true })
    const tempPath = `${filePath}.tmp`
    writeFileSync(tempPath, serialized, 'utf8')
    renameSync(tempPath, filePath)
  }

  private backupPath(): string {
    return `${this.libraryPath}.bak`
  }

  private nextCorruptPath(filePath = this.libraryPath): string {
    const base = `${filePath}.corrupt-${Date.now()}`
    let candidate = base
    let suffix = 1
    while (existsSync(candidate)) {
      candidate = `${base}-${suffix}`
      suffix += 1
    }
    return candidate
  }

  private migrateLegacySession(): SessionLibrary {
    const legacy = this.readLegacyLibrary()
    if (!legacy) {
      return createDefaultLibrary()
    }
    this.write(legacy)
    return legacy
  }

  private readLegacyLibrary(): SessionLibrary | null {
    try {
      const raw = readFileSync(this.legacySessionPath, 'utf8')
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch (error) {
        if (error instanceof SyntaxError) {
          return this.quarantineLegacySession()
        }
        throw error
      }
      if (!isDirectSessionShape(parsed)) {
        return this.quarantineLegacySession()
      }
      const legacySession = normalizeSession(parsed)
      const library =
        legacySession.reactionPath || legacySession.moviePath
          ? {
              ...createDefaultLibrary(),
              activeSessionId: legacySession.id,
              sessions: [legacySession]
            }
          : createDefaultLibrary()

      const next = normalizeLibrary(library)
      return next
    } catch (error) {
      if (isMissingFileError(error)) {
        return null
      }
      throw error
    }
  }

  private quarantineLegacySession(): never {
    const preservedPath = this.quarantineFile(this.legacySessionPath)
    throw new LibraryRecoveryError(preservedPath)
  }

  private quarantineFile(filePath: string): string {
    const preservedPath = this.nextCorruptPath(filePath)
    renameSync(filePath, preservedPath)
    return preservedPath
  }
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}

function parseStoredLibrary(raw: string): SessionLibrary {
  const parsed: unknown = JSON.parse(raw)
  if (!isPersistedLibraryShape(parsed)) {
    throw new SyntaxError('The library JSON has an invalid structure.')
  }
  return normalizeLibrary(parsed)
}

function isPersistedLibraryShape(value: unknown): boolean {
  if (!isRecord(value)) return false

  if (Object.prototype.hasOwnProperty.call(value, 'sessions')) {
    return Array.isArray(value.sessions) && value.sessions.every(isPersistedSessionShape)
  }

  // Pre-library releases stored one session directly. Keep that migration
  // path, but do not mistake arbitrary parseable JSON for an empty library.
  return isDirectSessionShape(value)
}

function isDirectSessionShape(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const hasMediaPath = Object.prototype.hasOwnProperty.call(value, 'reactionPath') ||
    Object.prototype.hasOwnProperty.call(value, 'moviePath')
  return hasMediaPath && isPersistedSessionShape(value)
}

function isPersistedSessionShape(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (
    !isNullableStringProperty(value, 'reactionPath') ||
    !isNullableStringProperty(value, 'moviePath') ||
    !isNullableStringProperty(value, 'moviePosterPath')
  ) {
    return false
  }
  return (typeof value.id === 'string' && value.id.length > 0) ||
    Object.prototype.hasOwnProperty.call(value, 'reactionPath') ||
    Object.prototype.hasOwnProperty.call(value, 'moviePath')
}

function isNullableStringProperty(value: Record<string, unknown>, key: string): boolean {
  return !Object.prototype.hasOwnProperty.call(value, key) || value[key] === null || typeof value[key] === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function compareRecoveryNames(left: string, right: string, prefixes: readonly string[]): number {
  const timestampDifference = recoveryTimestamp(left) - recoveryTimestamp(right)
  if (timestampDifference !== 0) return timestampDifference

  // Prefer the current library over its backup and the legacy snapshot when
  // multiple files were quarantined in the same millisecond.
  const leftPriority = prefixes.length - prefixes.findIndex((prefix) => left.startsWith(prefix))
  const rightPriority = prefixes.length - prefixes.findIndex((prefix) => right.startsWith(prefix))
  return leftPriority - rightPriority || left.localeCompare(right)
}

function recoveryTimestamp(fileName: string): number {
  const match = fileName.match(/\.corrupt-(\d+)/)
  return match ? Number(match[1]) : 0
}

const resetAutoSyncMetadata: Pick<
  LibrarySession,
  'timingOrigin' | 'autoSyncConfidence' | 'autoSyncAnalyzedAt' | 'autoSyncAlgorithmVersion'
> = {
  timingOrigin: 'manual',
  autoSyncConfidence: null,
  autoSyncAnalyzedAt: null,
  autoSyncAlgorithmVersion: null
}

function isManualTimingPatch(patch: Partial<LibrarySession>): boolean {
  return 'offsetSeconds' in patch || 'movieRateCorrection' in patch || 'reactorSource' in patch
}

function basenameForTitle(filePath: string): string {
  return filePath.split(/[\\/]/).at(-1) ?? filePath
}

function findMoviePosterPath(
  sessions: readonly LibrarySession[],
  moviePath: string | null
): string | null {
  const movieIdentity = mediaPathIdentity(moviePath)
  if (!movieIdentity) return null

  return sessions.find((session) =>
    mediaPathIdentity(session.moviePath) === movieIdentity && session.moviePosterPath
  )?.moviePosterPath ?? null
}

function moviePosterPathAfterMovieChange(
  sessions: readonly LibrarySession[],
  session: LibrarySession,
  nextMoviePath: string
): string | null {
  const destinationPoster = findMoviePosterPath(sessions, nextMoviePath)
  if (destinationPoster) return destinationPoster

  // Movie replacement is currently the missing-file relocation workflow. An
  // identical platform-aware leaf name is the strongest evidence available
  // locally that the user found the same file in a new directory. A different
  // name may be another movie, so carrying its old art would be misleading.
  const currentFileName = movieFileNameIdentity(session.moviePath)
  return session.moviePosterPath && currentFileName !== null && currentFileName === movieFileNameIdentity(nextMoviePath)
    ? session.moviePosterPath
    : null
}

function movieFileNameIdentity(filePath: string | null): string | null {
  const pathIdentity = mediaPathIdentity(filePath)
  if (!filePath || !pathIdentity) return null

  const isWindowsPath = pathIdentity.startsWith('win:')
  const fileName = (isWindowsPath ? win32 : posix).basename(filePath)
  if (!fileName || fileName === '.' || fileName === '..') return null

  return `${isWindowsPath ? 'win' : 'posix'}:${isWindowsPath ? fileName.toLowerCase() : fileName}`
}

function applyMoviePosterToPath(
  sessions: readonly LibrarySession[],
  moviePath: string | null,
  moviePosterPath: string,
  updatedAt: string
): LibrarySession[] {
  const movieIdentity = mediaPathIdentity(moviePath)
  if (!movieIdentity) return [...sessions]

  return sessions.map((session) =>
    mediaPathIdentity(session.moviePath) === movieIdentity && session.moviePosterPath !== moviePosterPath
      ? normalizeSession({
          ...session,
          moviePosterPath,
          createdAt: session.createdAt,
          updatedAt
        })
      : session
  )
}

function completedDraftTitle(
  session: LibrarySession,
  role: MediaRole,
  suggestedTitle?: string
): string | null {
  if (role !== 'reaction' || !session.moviePath) return null
  const title = sanitizeSuggestedSessionTitle(suggestedTitle)
  if (!title) return null
  return session.titleOrigin === 'generated' ? title : null
}

function reactorIdentityAfterReactionChange(
  session: LibrarySession,
  role: MediaRole,
  reactorName?: string
): Partial<Pick<LibrarySession, 'reactorName' | 'reactorNameOrigin'>> {
  if (role !== 'reaction' || session.reactorNameOrigin === 'custom') return {}
  return {
    reactorName: sanitizeReactorName(reactorName),
    reactorNameOrigin: 'metadata'
  }
}
