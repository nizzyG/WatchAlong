import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  createDefaultLibrary,
  createSessionFromMedia,
  createSessionFromPaths,
  findMatchingSession,
  getActiveSession,
  normalizeLibrary,
  normalizeSession
} from '@shared/session'
import type { LibrarySession, MediaRole, ReactionSource, SessionLibrary } from '@shared/types'

export class SessionStore {
  constructor(
    private readonly libraryPath: string,
    private readonly legacySessionPath: string
  ) {}

  read(): SessionLibrary {
    try {
      const raw = readFileSync(this.libraryPath, 'utf8')
      return normalizeLibrary(JSON.parse(raw))
    } catch {
      return this.migrateLegacySession()
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
    reactionSource: ReactionSource = 'local'
  ): SessionLibrary {
    const library = this.read()
    const existing = findMatchingSession(library, reactionPath, moviePath)
    const now = new Date()
    const next = existing
      ? { ...library, activeSessionId: existing.id }
      : {
          ...library,
          activeSessionId: null,
          sessions: [...library.sessions, createSessionFromPaths(reactionPath, moviePath, now, reactionSource)]
        }

    if (!existing) {
      next.activeSessionId = next.sessions.at(-1)?.id ?? null
    }

    return this.writeAndReturn(next)
  }

  setSessionMedia(role: MediaRole, filePath: string, reactionSource: ReactionSource = 'local'): SessionLibrary {
    const library = this.read()
    const active = getActiveSession(library)
    const pathKey = role === 'reaction' ? 'reactionPath' : 'moviePath'
    const now = new Date()

    if (!active || (active.reactionPath && active.moviePath)) {
      const draft = createSessionFromMedia(
        {
          [pathKey]: filePath,
          ...(role === 'reaction' ? { reactionSource } : {})
        },
        now
      )
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
      title: role === 'movie' ? basenameForTitle(filePath) : active.title,
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

    return this.writeAndReturn({
      ...library,
      activeSessionId: active.id,
      sessions: library.sessions.map((session) => (session.id === active.id ? nextSession : session))
    })
  }

  replaceSessionMedia(
    sessionId: string,
    role: MediaRole,
    filePath: string,
    reactionSource: ReactionSource = 'local'
  ): SessionLibrary {
    const library = this.read()
    const target = library.sessions.find((session) => session.id === sessionId)
    if (!target) {
      return library
    }

    const now = new Date()
    const nextSession = normalizeSession({
      ...target,
      ...(role === 'movie'
        ? { moviePath: filePath }
        : { reactionPath: filePath, reactionSource }),
      createdAt: target.createdAt,
      updatedAt: now.toISOString()
    })

    return this.writeAndReturn({
      ...library,
      activeSessionId: sessionId,
      sessions: library.sessions.map((session) => (session.id === sessionId ? nextSession : session))
    })
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

    const now = new Date()
    const sessions = library.sessions.map((session) =>
      session.id === active.id
        ? normalizeSession({
            ...session,
            ...patch,
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

  renameSession(sessionId: string, title: string): SessionLibrary {
    const now = new Date().toISOString()
    const library = this.read()
    const sessions = library.sessions.map((session) =>
      session.id === sessionId
        ? normalizeSession({ ...session, title, updatedAt: now, createdAt: session.createdAt })
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
    mkdirSync(dirname(this.libraryPath), { recursive: true })
    const tempPath = `${this.libraryPath}.tmp`
    writeFileSync(tempPath, `${JSON.stringify(library, null, 2)}\n`, 'utf8')
    renameSync(tempPath, this.libraryPath)
  }

  private migrateLegacySession(): SessionLibrary {
    if (!existsSync(this.legacySessionPath)) {
      return createDefaultLibrary()
    }

    try {
      const raw = readFileSync(this.legacySessionPath, 'utf8')
      const legacySession = normalizeSession(JSON.parse(raw))
      const library =
        legacySession.reactionPath || legacySession.moviePath
          ? {
              ...createDefaultLibrary(),
              activeSessionId: legacySession.id,
              sessions: [legacySession]
            }
          : createDefaultLibrary()

      const next = normalizeLibrary(library)
      this.write(next)
      return next
    } catch {
      return createDefaultLibrary()
    }
  }
}

function basenameForTitle(filePath: string): string {
  return filePath.split(/[\\/]/).at(-1) ?? filePath
}
