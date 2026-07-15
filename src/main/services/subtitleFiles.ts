import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync
} from 'node:fs'
import { extname } from 'node:path'

export const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024
const SUBTITLE_EXTENSIONS = new Set(['.srt', '.vtt'])

export function isSupportedSubtitleFile(filePath: string): boolean {
  if (!SUBTITLE_EXTENSIONS.has(extname(filePath).toLowerCase())) return false
  try {
    // Reject symlinks and special files before opening so a named pipe cannot
    // block the Electron main process.
    return lstatSync(filePath).isFile()
  } catch {
    return false
  }
}

export function readSubtitleFile(filePath: string): string | null {
  if (!isSupportedSubtitleFile(filePath)) return null

  let descriptor: number | null = null
  try {
    descriptor = openSync(filePath, constants.O_RDONLY | constants.O_NONBLOCK)
    const stat = fstatSync(descriptor)
    if (!stat.isFile() || stat.size > MAX_SUBTITLE_BYTES) return null

    const bytes = Buffer.alloc(MAX_SUBTITLE_BYTES + 1)
    let total = 0
    while (total < bytes.length) {
      const count = readSync(descriptor, bytes, total, bytes.length - total, total)
      if (count === 0) break
      total += count
    }
    return total <= MAX_SUBTITLE_BYTES ? bytes.subarray(0, total).toString('utf8') : null
  } catch {
    return null
  } finally {
    if (descriptor !== null) {
      try { closeSync(descriptor) } catch { /* already closed or invalid */ }
    }
  }
}
