import { statSync } from 'node:fs'
import { extname, posix, win32, type PlatformPath } from 'node:path'
import { deriveProviderReactorIdentity, normalizeReactorLabel } from '@shared/reactorIdentity'
import type { LibrarySession, SessionLibrary } from '@shared/types'

const AVATAR_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const
const YOUTUBE_AVATAR_BASENAME = 'reactor-avatar'
const MAX_YOUTUBE_ANCESTOR_LEVELS = 2

/** Returns only fixed filenames derived from a trusted session reaction path. */
export function getReactorAvatarCandidates(
  session: Pick<LibrarySession, 'reactionPath' | 'reactionSource'> | null
): string[] {
  const reactionPath = session?.reactionPath
  if (!reactionPath || reactionPath.includes('\0')) return []

  const pathApi = pathApiFor(reactionPath)
  if (!pathApi.isAbsolute(reactionPath) || containsParentTraversal(reactionPath, pathApi)) return []

  const normalizedPath = pathApi.normalize(reactionPath)
  const { root } = pathApi.parse(normalizedPath)
  const segments = normalizedPath.slice(root.length).split(pathApi.sep).filter(Boolean)
  if (segments.length < 2) return []

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
  return getReactorAvatarCandidates(session).find(isFile) ?? null
}

/**
 * Resolves one canonical picture for a profile. A profile-owned path wins;
 * otherwise a sidecar whose intrinsic provider label matches the profile name
 * wins. This prevents a custom reassignment from lending the old creator's
 * picture to the new creator.
 */
export function resolveReactorProfileAvatarPath(
  library: Pick<SessionLibrary, 'sessions' | 'reactors'>,
  reactorId: string,
  isFile: (filePath: string) => boolean = isRegularFile
): string | null {
  const profile = library.reactors.find((candidate) => candidate.id === reactorId)
  if (!profile) return null
  if (profile.avatarPath && isSafeExplicitAvatarPath(profile.avatarPath) && isFile(profile.avatarPath)) {
    return profile.avatarPath
  }

  const sessions = library.sessions.filter((session) => session.reactorId === reactorId)
  const matching = sessions.filter((session) => {
    const provider = session.reactionPath
      ? deriveProviderReactorIdentity(session.reactionPath)
      : null
    return provider && normalizeReactorLabel(provider.label) === normalizeReactorLabel(profile.name)
  })

  for (const session of [...matching, ...sessions.filter((session) => !matching.includes(session))]) {
    const path = resolveReactorAvatarPath(session, isFile)
    if (path) return path
  }
  return null
}

export function isSafeExplicitAvatarPath(filePath: string): boolean {
  if (!filePath || filePath.includes('\0')) return false
  const pathApi = pathApiFor(filePath)
  return pathApi.isAbsolute(filePath) &&
    !containsParentTraversal(filePath, pathApi) &&
    AVATAR_EXTENSIONS.includes(extname(filePath).toLocaleLowerCase() as typeof AVATAR_EXTENSIONS[number])
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
  if (patreonIndex < 0 || !segments[patreonIndex + 1] || !segments[patreonIndex + 2]) return []

  const campaignRoot = pathApi.join(root, ...segments.slice(0, patreonIndex + 3))
  return AVATAR_EXTENSIONS.map((extension) =>
    pathApi.join(campaignRoot, 'campaign_info', `avatar${extension}`))
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

  for (let directoryLength = containingDirectoryLength; directoryLength >= shallowestDirectoryLength; directoryLength -= 1) {
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

function isRegularFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}
