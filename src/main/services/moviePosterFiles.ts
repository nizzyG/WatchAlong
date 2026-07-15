import { statSync } from 'node:fs'
import { stat as statAsync } from 'node:fs/promises'
import { posix, win32, type PlatformPath } from 'node:path'
import type { LibrarySession } from '@shared/types'
import { normalizeMediaPath } from './mediaPathGrants'

const MANUAL_POSTER_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
/** Large enough for high-resolution local sleeve scans while remaining bounded. */
export const MAX_MOVIE_POSTER_BYTES = 64 * 1024 * 1024

type PosterSession = Pick<LibrarySession, 'moviePath' | 'moviePosterPath'>
type IsFileAsync = (filePath: string) => Promise<boolean>

export type MoviePosterPathRejectionReason =
  | 'invalid-path'
  | 'unsupported-format'
  | 'unavailable'
  | 'not-file'
  | 'too-large'

export type MoviePosterPathValidation =
  | { ok: true; path: string }
  | { ok: false; reason: MoviePosterPathRejectionReason }

/**
 * Builds only the fixed, ecosystem-standard sidecar names requested by the
 * app. No renderer-provided path component participates in this lookup.
 */
export function getMoviePosterCandidates(session: Pick<LibrarySession, 'moviePath'> | null): string[] {
  const moviePath = normalizeLocalPath(session?.moviePath)
  if (!moviePath) return []

  const pathApi = pathApiFor(moviePath)
  const parsed = pathApi.parse(moviePath)
  if (!parsed.name || !parsed.dir) return []

  return [
    pathApi.join(parsed.dir, 'poster.jpg'),
    pathApi.join(parsed.dir, 'poster.png'),
    pathApi.join(parsed.dir, 'folder.jpg'),
    pathApi.join(parsed.dir, 'folder.png'),
    pathApi.join(parsed.dir, `${parsed.name}.jpg`),
    pathApi.join(parsed.dir, `${parsed.name}.png`),
    pathApi.join(parsed.dir, `${parsed.name}-poster.jpg`)
  ]
}

/**
 * Validates a manually selected poster and returns its normalized local path.
 * SVG and arbitrary file formats are intentionally excluded from the image
 * decoder surface exposed to the renderer.
 */
export function validateMoviePosterPath(value: unknown): MoviePosterPathValidation {
  const normalized = normalizeLocalPath(value)
  if (!normalized) return { ok: false, reason: 'invalid-path' }

  const pathApi = pathApiFor(normalized)
  if (!MANUAL_POSTER_EXTENSIONS.has(pathApi.extname(normalized).toLowerCase())) {
    return { ok: false, reason: 'unsupported-format' }
  }

  try {
    const stats = statSync(normalized)
    if (!stats.isFile()) return { ok: false, reason: 'not-file' }
    if (stats.size > MAX_MOVIE_POSTER_BYTES) return { ok: false, reason: 'too-large' }
    return { ok: true, path: normalized }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

/** Synchronous validation is reserved for the user's one-off picker action. */
export function normalizeMoviePosterPath(value: unknown): string | null {
  const validation = validateMoviePosterPath(value)
  return validation.ok ? validation.path : null
}

/**
 * Manual art wins when usable; missing/invalid manual art falls back. All
 * filesystem probes are asynchronous so remote and removable volumes never
 * block Electron's main event loop while the library renders.
 */
export async function resolveMoviePosterPath(
  session: PosterSession | null,
  isFile: IsFileAsync = isUsablePosterFileAsync
): Promise<string | null> {
  const manualPath = normalizePosterCandidatePath(session?.moviePosterPath)
  if (manualPath && await safelyCheckFile(manualPath, isFile)) return manualPath

  const candidates = getMoviePosterCandidates(session)
  const available = await Promise.all(candidates.map((candidate) => safelyCheckFile(candidate, isFile)))
  return candidates.find((_candidate, index) => available[index]) ?? null
}

function normalizePosterCandidatePath(value: unknown): string | null {
  const normalized = normalizeLocalPath(value)
  if (!normalized) return null
  return MANUAL_POSTER_EXTENSIONS.has(pathApiFor(normalized).extname(normalized).toLowerCase())
    ? normalized
    : null
}

function normalizeLocalPath(value: unknown): string | null {
  if (typeof value !== 'string' || containsParentTraversal(value)) return null

  const platform = isWindowsPath(value) ? 'win32' : 'linux'
  return normalizeMediaPath(value, platform)?.path ?? null
}

function pathApiFor(filePath: string): PlatformPath {
  return isWindowsPath(filePath) ? win32 : posix
}

function isWindowsPath(filePath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(filePath) || /^(?:\\\\|\/\/)[^\\/]/.test(filePath)
}

function containsParentTraversal(filePath: string): boolean {
  return filePath.split(/[\\/]/).some((segment) => segment === '..')
}

async function safelyCheckFile(filePath: string, isFile: IsFileAsync): Promise<boolean> {
  try {
    return await isFile(filePath)
  } catch {
    return false
  }
}

async function isUsablePosterFileAsync(filePath: string): Promise<boolean> {
  try {
    const stats = await statAsync(filePath)
    return stats.isFile() && stats.size <= MAX_MOVIE_POSTER_BYTES
  } catch {
    return false
  }
}
