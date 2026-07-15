import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { extname, isAbsolute, join, relative } from 'node:path'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.webm', '.ogv', '.ogg', '.mkv', '.avi'])

export function getDefaultReactionDownloadDirectory(): string {
  return join(app.getPath('videos') || homedir(), 'WatchAlong', 'Reactions')
}

export function createDownloadDir(
  source: 'youtube' | 'patreon',
  preferredRoot: string | null
): string {
  const dir = join(preferredRoot ?? getDefaultReactionDownloadDirectory(), source, randomUUID())
  mkdirSync(dir, { recursive: true })
  return dir
}

export function findNewestMediaFile(root: string): string | null {
  const files: Array<{ path: string; mtime: number; size: number }> = []
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const entryPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(entryPath)
      } else if (entry.isFile()) {
        const path = normalizeCompletedPath(entryPath, root)
        if (!path) continue
        const stats = statSync(path)
        files.push({ path, mtime: stats.mtimeMs, size: stats.size })
      }
    }
  }

  try {
    visit(root)
  } catch {
    return null
  }
  return files.sort((a, b) => b.size - a.size || b.mtime - a.mtime)[0]?.path ?? null
}

export function normalizeCompletedPath(filePath: string | null, downloadRoot: string): string | null {
  if (!filePath) {
    return null
  }

  try {
    const canonicalRoot = realpathSync(downloadRoot)
    const canonicalFile = realpathSync(filePath.trim())
    const relativePath = relative(canonicalRoot, canonicalFile)
    if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) return null
    const stats = statSync(canonicalFile)
    return stats.isFile() && VIDEO_EXTENSIONS.has(extname(canonicalFile).toLowerCase())
      ? canonicalFile
      : null
  } catch {
    return null
  }
}
