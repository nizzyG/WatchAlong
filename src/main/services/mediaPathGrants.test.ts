import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isSupportedMediaPath,
  MediaPathGrantStore,
  normalizeMediaPath,
  secureDownloadedMediaEvent
} from './mediaPathGrants'

describe('MediaPathGrantStore', () => {
  let root: string
  let pickedPath: string
  let otherPath: string
  let boundPaths: Array<string | null>
  let grants: MediaPathGrantStore

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'watchalong-media-grants-'))
    pickedPath = join(root, 'Picked Reaction.MP4')
    otherPath = join(root, 'private.mp4')
    writeFileSync(pickedPath, 'video')
    writeFileSync(otherPath, 'video')
    boundPaths = []
    grants = new MediaPathGrantStore(() => boundPaths)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('accepts a picker-minted path once and returns the main-process canonical path', () => {
    const grantedPath = grants.grantPickerPath(pickedPath)

    expect(grantedPath).toBe(pickedPath)
    expect(grants.authorize([pickedPath])).toEqual([pickedPath])
    expect(() => grants.authorize([pickedPath])).toThrow(/Select the media file/)
  })

  it('accepts successful-download grants and paths already bound to a stored session', () => {
    expect(grants.grantDownloadedPath(pickedPath)).toBe(pickedPath)
    expect(grants.authorize([pickedPath])).toEqual([pickedPath])

    boundPaths = [otherPath]
    expect(grants.authorize([otherPath])).toEqual([otherPath])
    expect(grants.authorize([otherPath])).toEqual([otherPath])
  })

  it('blocks arbitrary renderer paths even when they point to real videos', () => {
    expect(() => grants.authorize([otherPath])).toThrow(/Select the media file/)
    expect(() => grants.authorize(['relative.mp4'])).toThrow(/invalid media file path/)
    expect(() => grants.authorize([null])).toThrow(/invalid media file path/)
  })

  it('validates picker and download grants as existing regular media files', () => {
    const textPath = join(root, 'notes.txt')
    const missingPath = join(root, 'missing.mkv')
    const directoryPath = join(root, 'folder.mp4')
    writeFileSync(textPath, 'notes')
    mkdirSync(directoryPath)

    expect(grants.grantPickerPath(textPath)).toBeNull()
    expect(grants.grantPickerPath(missingPath)).toBeNull()
    expect(grants.grantDownloadedPath(directoryPath)).toBeNull()
  })

  it('authorizes batches atomically without consuming a good grant when another path is blocked', () => {
    grants.grantPickerPath(pickedPath)

    expect(() => grants.authorize([pickedPath, otherPath])).toThrow(/Select the media file/)
    expect(grants.authorize([pickedPath])).toEqual([pickedPath])
  })

  it('keeps a one-time grant when its library mutation fails, then consumes it after a retry succeeds', () => {
    grants.grantDownloadedPath(pickedPath)

    expect(() => grants.withAuthorizedPaths([pickedPath], () => {
      throw new Error('disk write failed')
    })).toThrow(/disk write failed/)
    expect(grants.withAuthorizedPaths([pickedPath], ([authorizedPath]) => authorizedPath)).toBe(pickedPath)
    expect(() => grants.authorize([pickedPath])).toThrow(/Select the media file/)
  })

  it('can keep a grant when a mutation returns a non-throwing rejection result', () => {
    grants.grantDownloadedPath(pickedPath)

    expect(grants.withAuthorizedPaths(
      [pickedPath],
      () => ({ status: 'missing' as const }),
      (result) => result.status !== 'missing'
    )).toEqual({ status: 'missing' })
    expect(grants.authorize([pickedPath])).toEqual([pickedPath])
  })

  it('never reports an unusable downloaded path as a successful download', () => {
    const event = {
      jobId: 'job-1',
      source: 'youtube' as const,
      state: 'success' as const,
      message: 'Ready.',
      percent: 100,
      filePath: join(root, 'missing.mp4')
    }

    expect(secureDownloadedMediaEvent(event, grants)).toMatchObject({
      state: 'failed',
      percent: null,
      filePath: undefined
    })
    expect(secureDownloadedMediaEvent({ ...event, filePath: pickedPath }, grants)).toBeTruthy()
    expect(grants.authorize([pickedPath])).toEqual([pickedPath])
  })
})

describe('media path normalization', () => {
  it('normalizes ordinary and extended Windows paths case-insensitively', () => {
    expect(normalizeMediaPath('C:/Users/Viewer/Videos/../Videos/Movie.MP4', 'win32')).toEqual({
      key: 'c:\\users\\viewer\\videos\\movie.mp4',
      path: 'C:\\Users\\Viewer\\Videos\\Movie.MP4'
    })
    expect(normalizeMediaPath('\\\\?\\C:\\Videos\\Movie.mp4', 'win32')).toEqual({
      key: 'c:\\videos\\movie.mp4',
      path: 'C:\\Videos\\Movie.mp4'
    })
  })

  it('rejects relative, drive-relative, device, and alternate-stream Windows paths', () => {
    expect(normalizeMediaPath('movie.mp4', 'win32')).toBeNull()
    expect(normalizeMediaPath('C:movie.mp4', 'win32')).toBeNull()
    expect(normalizeMediaPath('\\movie.mp4', 'win32')).toBeNull()
    expect(normalizeMediaPath('\\\\.\\PhysicalDrive0', 'win32')).toBeNull()
    expect(normalizeMediaPath('C:\\Videos\\movie.mp4:preview.mp4', 'win32')).toBeNull()
  })

  it('recognizes the formats exposed by the WatchAlong video picker', () => {
    for (const extension of ['mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', 'mkv', 'avi']) {
      expect(isSupportedMediaPath(`C:\\Videos\\reaction.${extension}`, 'win32')).toBe(true)
    }
    expect(isSupportedMediaPath('C:\\Videos\\notes.txt', 'win32')).toBe(false)
  })
})
