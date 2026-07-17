import { protocol } from 'electron'
import type { LibrarySession, MediaRole, SessionLibrary } from '@shared/types'
import { APP_NAME, MEDIA_SCHEME } from './constants'
import { createMediaResponse } from './mediaRange'
import { SessionStore } from './sessionStore'
import { getMediaPath } from './ipc/utils'
import { MAX_MOVIE_POSTER_BYTES, resolveMoviePosterPath } from './services/moviePosterFiles'
import {
  resolveReactorAvatarPath,
  resolveReactorProfileAvatarPath
} from './services/reactorAvatarFiles'

export { getReactorAvatarCandidates, resolveReactorAvatarPath } from './services/reactorAvatarFiles'

export type MediaRequestRole = MediaRole | 'reactor-avatar' | 'movie-poster'

export interface MediaRequest {
  sessionId: string
  role: MediaRequestRole
}

export function createSessionMediaUrl(
  session: Pick<LibrarySession, 'id' | 'updatedAt'>,
  role: MediaRequestRole
): string {
  return `${MEDIA_SCHEME}://media/${encodeURIComponent(session.id)}/${role}?updated=${encodeURIComponent(session.updatedAt)}`
}

const MAX_AVATAR_BYTES = 8 * 1024 * 1024

export function registerMediaProtocol(sessionStore: SessionStore): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const mediaRequest = parseMediaRequest(request.url)
    if (!mediaRequest) return new Response(`Invalid ${APP_NAME} media URL`, { status: 404 })
    const library = sessionStore.read()
    const session = library.sessions.find((candidate) => candidate.id === mediaRequest.sessionId) ?? null
    const path = await resolveMediaRequestPath(library, session, mediaRequest.role)
    if (!path) return mediaErrorResponse('Media file is missing', 404, mediaRequest.role)
    try {
      const maxBytes = mediaRequest.role === 'reactor-avatar'
        ? MAX_AVATAR_BYTES
        : mediaRequest.role === 'movie-poster' ? MAX_MOVIE_POSTER_BYTES : undefined
      return createMediaResponse(
        path,
        request.headers.get('range'),
        maxBytes,
        mediaRequest.role === 'movie-poster' || mediaRequest.role === 'reactor-avatar' ? 'no-store' : undefined
      )
    }
    catch (error) {
      console.error(error)
      return mediaErrorResponse('Could not read media file', 500, mediaRequest.role)
    }
  })
}

export function parseMediaRequest(rawUrl: string): MediaRequest | null {
  try {
    const url = new URL(rawUrl)
    if (
      url.protocol !== `${MEDIA_SCHEME}:` ||
      url.hostname !== 'media' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    ) {
      return null
    }

    const match = /^\/([^/]+)\/(reaction|movie|reactor-avatar|movie-poster)$/.exec(url.pathname)
    if (!match) {
      return null
    }

    const sessionId = decodeURIComponent(match[1])
    if (!isSafeSessionId(sessionId)) {
      return null
    }

    return { sessionId, role: match[2] as MediaRequestRole }
  } catch {
    return null
  }
}

async function resolveMediaRequestPath(
  library: SessionLibrary,
  session: LibrarySession | null,
  role: MediaRequestRole
): Promise<string | null> {
  switch (role) {
    case 'reactor-avatar': return session?.reactorId
      ? resolveReactorProfileAvatarPath(library, session.reactorId)
      : resolveReactorAvatarPath(session)
    case 'movie-poster': return resolveMoviePosterPath(session)
    default: return getMediaPath(session, role)
  }
}

function mediaErrorResponse(message: string, status: number, role: MediaRequestRole): Response {
  return new Response(message, {
    status,
    headers: role === 'movie-poster' || role === 'reactor-avatar'
      ? { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
      : undefined
  })
}

function isSafeSessionId(sessionId: string): boolean {
  return sessionId.length > 0 &&
    sessionId.length <= 256 &&
    sessionId !== '.' &&
    sessionId !== '..' &&
    !/[\\/\u0000-\u001f\u007f]/.test(sessionId)
}
