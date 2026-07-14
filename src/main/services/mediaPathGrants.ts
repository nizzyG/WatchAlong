import { existsSync, statSync } from 'node:fs'
import { posix, win32 } from 'node:path'
import type { DownloadProgressEvent } from '@shared/types'

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.m4v',
  '.mov',
  '.webm',
  '.ogv',
  '.ogg',
  '.mkv',
  '.avi'
])

type Platform = NodeJS.Platform
type BoundMediaPaths = () => Iterable<string | null | undefined>

interface NormalizedMediaPath {
  key: string
  path: string
}

/**
 * Keeps renderer-provided media paths capability-bound. A path is accepted only
 * after the user selected it, a downloader completed it, or it was persisted in
 * the library already. The renderer never gets to mint filesystem authority by
 * supplying an arbitrary absolute path.
 */
export class MediaPathGrantStore {
  private readonly grants = new Map<string, string>()

  constructor(
    private readonly getBoundMediaPaths: BoundMediaPaths,
    private readonly platform: Platform = process.platform
  ) {}

  grantPickerPath(filePath: unknown): string | null {
    return this.grantExistingMediaFile(filePath)
  }

  grantDownloadedPath(filePath: unknown): string | null {
    return this.grantExistingMediaFile(filePath)
  }

  revoke(filePath: unknown): void {
    const normalized = normalizeMediaPath(filePath, this.platform)
    if (normalized) {
      this.grants.delete(normalized.key)
    }
  }

  /**
   * Authorizes all paths before consuming any one-time grants. This matters for
   * two-file imports: a bad second path must not invalidate a valid first pick.
   * Returned paths are the exact main-process-minted/stored representations, not
   * renderer-controlled aliases containing different casing or `..` segments.
   */
  authorize(paths: readonly unknown[]): string[] {
    return this.withAuthorizedPaths(paths, (authorizedPaths) => authorizedPaths)
  }

  /**
   * Runs a synchronous library mutation with canonical, authorized paths and
   * consumes one-time grants only after that mutation succeeds. If persistence
   * fails, the grant remains available so the user can retry Attach without
   * selecting or downloading the file again.
   */
  withAuthorizedPaths<T>(
    paths: readonly unknown[],
    mutation: (authorizedPaths: string[]) => T,
    shouldConsume: (result: T) => boolean = () => true
  ): T {
    const bound = this.boundPathMap()
    const pending: Array<{ key: string; path: string; granted: boolean }> = []

    for (const candidate of paths) {
      const normalized = normalizeMediaPath(candidate, this.platform)
      if (!normalized) {
        throw new Error('Blocked an invalid media file path.')
      }

      const boundPath = bound.get(normalized.key)
      if (boundPath) {
        pending.push({ key: normalized.key, path: boundPath, granted: false })
        continue
      }

      const grantedPath = this.grants.get(normalized.key)
      if (!grantedPath || !isExistingMediaFile(grantedPath, this.platform)) {
        this.grants.delete(normalized.key)
        throw new Error('Select the media file in WatchAlong before using it.')
      }

      pending.push({ key: normalized.key, path: grantedPath, granted: true })
    }

    const authorizedPaths = pending.map((entry) => entry.path)
    const result = mutation(authorizedPaths)

    if (shouldConsume(result)) {
      for (const entry of pending) {
        if (entry.granted) {
          this.grants.delete(entry.key)
        }
      }
    }
    return result
  }

  private grantExistingMediaFile(filePath: unknown): string | null {
    const normalized = normalizeMediaPath(filePath, this.platform)
    if (!normalized || !isExistingMediaFile(normalized.path, this.platform)) {
      return null
    }

    this.grants.set(normalized.key, normalized.path)
    return normalized.path
  }

  private boundPathMap(): Map<string, string> {
    const result = new Map<string, string>()
    for (const filePath of this.getBoundMediaPaths()) {
      const normalized = normalizeMediaPath(filePath, this.platform)
      if (normalized) {
        result.set(normalized.key, normalized.path)
      }
    }
    return result
  }
}

export function secureDownloadedMediaEvent(
  event: DownloadProgressEvent,
  grants: MediaPathGrantStore
): DownloadProgressEvent {
  if (event.state !== 'success') {
    return event
  }

  if (event.filePath && grants.grantDownloadedPath(event.filePath)) {
    return event
  }

  return {
    ...event,
    state: 'failed',
    message: 'The download finished, but WatchAlong could not safely open the saved video. Please try again.',
    percent: null,
    filePath: undefined,
    error: 'The downloaded file was missing or was not a supported video file.'
  }
}

export function normalizeMediaPath(
  value: unknown,
  platform: Platform = process.platform
): NormalizedMediaPath | null {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    return null
  }

  if (platform === 'win32') {
    return normalizeWindowsMediaPath(value)
  }

  if (!posix.isAbsolute(value)) {
    return null
  }
  const normalized = posix.normalize(value)
  return { key: normalized, path: normalized }
}

export function isSupportedMediaPath(
  value: unknown,
  platform: Platform = process.platform
): boolean {
  const normalized = normalizeMediaPath(value, platform)
  const pathApi = platform === 'win32' ? win32 : posix
  return Boolean(normalized && VIDEO_EXTENSIONS.has(pathApi.extname(normalized.path).toLowerCase()))
}

function normalizeWindowsMediaPath(value: string): NormalizedMediaPath | null {
  let candidate = value.replace(/\//g, '\\')

  // Normalize the two ordinary extended-length forms, but reject Windows
  // device namespaces such as \\.\ and \\?\GLOBALROOT.
  if (/^\\\\\?\\UNC\\/i.test(candidate)) {
    candidate = `\\\\${candidate.slice(8)}`
  } else if (/^\\\\\?\\[a-z]:\\/i.test(candidate)) {
    candidate = candidate.slice(4)
  } else if (/^\\\\[?.]\\/.test(candidate)) {
    return null
  }

  const normalized = win32.normalize(candidate)
  const isDriveAbsolute = /^[a-z]:\\/i.test(normalized)
  const isUncAbsolute = /^\\\\[^\\]+\\[^\\]+(?:\\|$)/.test(normalized)
  if (!isDriveAbsolute && !isUncAbsolute) {
    return null
  }

  // Alternate data streams are not media files even when their final suffix
  // happens to look like one.
  const withoutDrivePrefix = isDriveAbsolute ? normalized.slice(2) : normalized
  if (withoutDrivePrefix.includes(':')) {
    return null
  }

  return { key: normalized.toLowerCase(), path: normalized }
}

function isExistingMediaFile(filePath: string, platform: Platform): boolean {
  if (!isSupportedMediaPath(filePath, platform) || !existsSync(filePath)) {
    return false
  }

  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}
