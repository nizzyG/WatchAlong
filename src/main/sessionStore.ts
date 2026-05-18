import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  createDefaultLibrary,
  createSessionFromPaths,
  findMatchingSession,
  getActiveSession,
  normalizeLibrary,
  normalizeSession
} from '@shared/session'
import type { LibrarySession, SessionLibrary } from '@shared/types'

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

  createOrSwitchSession(reactionPath: string, moviePath: string): SessionLibrary {
    const library = this.read()
    const existing = findMatchingSession(library, reactionPath, moviePath)
    const now = new Date()
    const next = existing
      ? { ...library, activeSessionId: existing.id }
      : {
          ...library,
          activeSessionId: null,
          sessions: [...library.sessions, createSessionFromPaths(reactionPath, moviePath, now)]
        }

    if (!existing) {
      next.activeSessionId = next.sessions.at(-1)?.id ?? null
    }

    return this.writeAndReturn(next)
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
