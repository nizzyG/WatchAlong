import { protocol } from 'electron'
import { statSync } from 'node:fs'
import { posix, win32, type PlatformPath } from 'node:path'
import type { LibrarySession, MediaRole } from '@shared/types'
import { APP_NAME, MEDIA_SCHEME } from './constants'
import { createMediaResponse } from './mediaRange'
import { SessionStore } from './sessionStore'
import { getMediaPath } from './ipc/utils'
import { MAX_MOVIE_POSTER_BYTES, resolveMoviePosterPath } from './services/moviePosterFiles'

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

const AVATAR_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const
const YOUTUBE_AVATAR_BASENAME = 'reactor-avatar'
const MAX_YOUTUBE_ANCESTOR_LEVELS = 2
const MAX_AVATAR_BYTES = 8 * 1024 * 1024

export function registerMediaProtocol(sessionStore: SessionStore): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const mediaRequest = parseMediaRequest(request.url)
    if (!mediaRequest) return new Response(`Invalid ${APP_NAME} media URL`, { status: 404 })
    const session = sessionStore.getSession(mediaRequest.sessionId)
    const path = await resolveMediaRequestPath(session, mediaRequest.role)
    if (!path) return mediaErrorResponse('Media file is missing', 404, mediaRequest.role)
    try {
      const maxBytes = mediaRequest.role === 'reactor-avatar'
        ? MAX_AVATAR_BYTES
        : mediaRequest.role === 'movie-poster' ? MAX_MOVIE_POSTER_BYTES : undefined
      return createMediaResponse(
        path,
        request.headers.get('range'),
        maxBytes,
        mediaRequest.role === 'movie-poster' ? 'no-store' : undefined
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
  session: LibrarySession | null,
  role: MediaRequestRole
): Promise<string | null> {
  switch (role) {
    case 'reactor-avatar': return resolveReactorAvatarPath(session)
    case 'movie-poster': return resolveMoviePosterPath(session)
    default: return getMediaPath(session, role)
  }
}

function mediaErrorResponse(message: string, status: number, role: MediaRequestRole): Response {
  return new Response(message, {
    status,
    headers: role === 'movie-poster'
      ? { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
      : undefined
  })
}

/**
 * Returns only fixed filenames derived from a trusted session reaction path.
 * No URL or renderer-provided filesystem component is accepted here.
 */
export function getReactorAvatarCandidates(
  session: Pick<LibrarySession, 'reactionPath' | 'reactionSource'> | null
): string[] {
  const reactionPath = session?.reactionPath
  if (!reactionPath || reactionPath.includes('\0')) {
    return []
  }

  const pathApi = pathApiFor(reactionPath)
  if (!pathApi.isAbsolute(reactionPath) || containsParentTraversal(reactionPath, pathApi)) {
    return []
  }

  const normalizedPath = pathApi.normalize(reactionPath)
  const { root } = pathApi.parse(normalizedPath)
  const segments = normalizedPath
    .slice(root.length)
    .split(pathApi.sep)
    .filter(Boolean)

  if (segments.length < 2) {
    return []
  }

  if (session.reactionSource === 'patreon') {
    return getPatreonAvatarCandidates(root, segments, pathApi)
  }

  if (session.reactionSource === 'youtube') {
    return getYouTubeAvatarCandidates(root, segments, pathApi)
  }

  return []
}

export function resolveReactorAvatarPath(
  session: Pick<LibrarySession, 'reactionPath' | 'reactionSource'> | null,
  isFile: (filePath: string) => boolean = isRegularFile
): string | null {
  return getReactorAvatarCandidates(session).find((candidate) => isFile(candidate)) ?? null
}

function getPatreonAvatarCandidates(root: string, segments: string[], pathApi: PlatformPath): string[] {
  const lowerSegments = segments.map((segment) => segment.toLowerCase())
  let patreonIndex = -1
  for (let index = lowerSegments.length - 1; index >= 0; index -= 1) {
    if (lowerSegments[index] === 'patreon' && lowerSegments[index + 3] === 'posts') {
      patreonIndex = index
      break
    }
  }

  if (patreonIndex < 0 || !segments[patreonIndex + 1] || !segments[patreonIndex + 2]) {
    return []
  }

  const campaignRoot = pathApi.join(root, ...segments.slice(0, patreonIndex + 3))
  return AVATAR_EXTENSIONS.map((extension) =>
    pathApi.join(campaignRoot, 'campaign_info', `avatar${extension}`)
  )
}

function getYouTubeAvatarCandidates(root: string, segments: string[], pathApi: PlatformPath): string[] {
  const lowerSegments = segments.map((segment) => segment.toLowerCase())
  const youtubeIndex = lowerSegments.lastIndexOf('youtube')
  const containingDirectoryLength = segments.length - 1
  const jobRootLength = youtubeIndex >= 0 && segments[youtubeIndex + 1]
    ? youtubeIndex + 2
    : containingDirectoryLength
  const shallowestDirectoryLength = Math.max(
    jobRootLength,
    containingDirectoryLength - MAX_YOUTUBE_ANCESTOR_LEVELS
  )
  const candidates: string[] = []

  for (
    let directoryLength = containingDirectoryLength;
    directoryLength >= shallowestDirectoryLength;
    directoryLength -= 1
  ) {
    const directory = pathApi.join(root, ...segments.slice(0, directoryLength))
    for (const extension of AVATAR_EXTENSIONS) {
      candidates.push(pathApi.join(directory, `${YOUTUBE_AVATAR_BASENAME}${extension}`))
    }
  }

  return candidates
}

function pathApiFor(filePath: string): PlatformPath {
  return /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith('\\\\') ? win32 : posix
}

function containsParentTraversal(filePath: string, pathApi: PlatformPath): boolean {
  return filePath.split(/[\\/]/).some((segment) => segment === '..') || pathApi.normalize(filePath).includes('\0')
}

function isSafeSessionId(sessionId: string): boolean {
  return sessionId.length > 0 &&
    sessionId.length <= 256 &&
    sessionId !== '.' &&
    sessionId !== '..' &&
    !/[\\/\u0000-\u001f\u007f]/.test(sessionId)
}

function isRegularFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}
