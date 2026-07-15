import { mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix, win32 } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getMoviePosterCandidates,
  MAX_MOVIE_POSTER_BYTES,
  normalizeMoviePosterPath,
  resolveMoviePosterPath,
  validateMoviePosterPath
} from './moviePosterFiles'

const tempDirs: string[] = []

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('movie poster candidates', () => {
  it('uses the requested priority and movie stem for Windows paths', () => {
    const moviePath = String.raw`C:\Movies\Tombstone (1993)\Tombstone.1993.mkv`

    expect(getMoviePosterCandidates({ moviePath })).toEqual([
      win32.join(String.raw`C:\Movies\Tombstone (1993)`, 'poster.jpg'),
      win32.join(String.raw`C:\Movies\Tombstone (1993)`, 'poster.png'),
      win32.join(String.raw`C:\Movies\Tombstone (1993)`, 'folder.jpg'),
      win32.join(String.raw`C:\Movies\Tombstone (1993)`, 'folder.png'),
      win32.join(String.raw`C:\Movies\Tombstone (1993)`, 'Tombstone.1993.jpg'),
      win32.join(String.raw`C:\Movies\Tombstone (1993)`, 'Tombstone.1993.png'),
      win32.join(String.raw`C:\Movies\Tombstone (1993)`, 'Tombstone.1993-poster.jpg')
    ])
  })

  it('derives the same fixed candidates for POSIX paths', () => {
    expect(getMoviePosterCandidates({ moviePath: '/media/Movies/Alien/Alien.mkv' })).toEqual([
      '/media/Movies/Alien/poster.jpg',
      '/media/Movies/Alien/poster.png',
      '/media/Movies/Alien/folder.jpg',
      '/media/Movies/Alien/folder.png',
      '/media/Movies/Alien/Alien.jpg',
      '/media/Movies/Alien/Alien.png',
      '/media/Movies/Alien/Alien-poster.jpg'
    ])
  })

  it('rejects missing, relative, traversal-shaped, and device movie paths', () => {
    expect(getMoviePosterCandidates(null)).toEqual([])
    expect(getMoviePosterCandidates({ moviePath: 'Movies/Alien.mkv' })).toEqual([])
    expect(getMoviePosterCandidates({ moviePath: '/media/Movies/../private/Alien.mkv' })).toEqual([])
    expect(getMoviePosterCandidates({ moviePath: String.raw`\\.\PhysicalDrive0` })).toEqual([])
  })
})

describe('movie poster resolution', () => {
  it('checks convention candidates asynchronously and selects the first match deterministically', async () => {
    const session = { moviePath: '/media/Movies/Alien/Alien.mkv', moviePosterPath: null }
    const candidates = getMoviePosterCandidates(session)
    const existing = new Set([candidates[4], candidates[1]])
    const checked: string[] = []

    await expect(resolveMoviePosterPath(session, async (candidate) => {
      checked.push(candidate)
      return existing.has(candidate)
    })).resolves.toBe(candidates[1])
    expect(checked).toEqual(candidates)
  })

  it('prefers a supported manual poster and falls back when it is missing or invalid', async () => {
    const moviePath = '/media/Movies/Alien/Alien.mkv'
    const conventionPath = '/media/Movies/Alien/poster.jpg'
    const manualPath = '/art/custom-alien.webp'
    const existing = new Set([manualPath, conventionPath])

    await expect(resolveMoviePosterPath(
      { moviePath, moviePosterPath: manualPath },
      async (candidate) => existing.has(candidate)
    )).resolves.toBe(manualPath)

    existing.delete(manualPath)
    await expect(resolveMoviePosterPath(
      { moviePath, moviePosterPath: manualPath },
      async (candidate) => existing.has(candidate)
    )).resolves.toBe(conventionPath)

    await expect(resolveMoviePosterPath(
      { moviePath, moviePosterPath: '/art/active-content.svg' },
      async (candidate) => existing.has(candidate)
    )).resolves.toBe(conventionPath)
  })

  it('treats rejected asynchronous probes as missing and preserves fallback priority', async () => {
    const session = { moviePath: '/media/Movies/Alien/Alien.mkv', moviePosterPath: null }
    const candidates = getMoviePosterCandidates(session)

    await expect(resolveMoviePosterPath(session, async (candidate) => {
      if (candidate === candidates[0]) throw new Error('removable drive unavailable')
      return candidate === candidates[2] || candidate === candidates[5]
    })).resolves.toBe(candidates[2])
  })

  it('accepts only existing regular jpg, jpeg, png, or webp files', () => {
    const root = mkdtempSync(join(tmpdir(), 'watchalong-movie-poster-'))
    tempDirs.push(root)
    const jpg = join(root, 'cover.JPG')
    const svg = join(root, 'cover.svg')
    const directory = join(root, 'folder.png')
    const highResolutionScan = join(root, 'high-resolution-scan.png')
    const oversized = join(root, 'oversized.jpg')
    writeFileSync(jpg, 'jpg')
    writeFileSync(svg, '<svg/>')
    mkdirSync(directory)
    writeFileSync(highResolutionScan, '')
    truncateSync(highResolutionScan, 48 * 1024 * 1024)
    writeFileSync(oversized, '')
    truncateSync(oversized, MAX_MOVIE_POSTER_BYTES + 1)

    expect(normalizeMoviePosterPath(jpg)).toBe(jpg)
    expect(normalizeMoviePosterPath(svg)).toBeNull()
    expect(normalizeMoviePosterPath(directory)).toBeNull()
    expect(normalizeMoviePosterPath(highResolutionScan)).toBe(highResolutionScan)
    expect(normalizeMoviePosterPath(oversized)).toBeNull()
    expect(normalizeMoviePosterPath(posix.join(root.replace(/\\/g, '/'), 'missing.webp'))).toBeNull()
    expect(normalizeMoviePosterPath('../cover.jpg')).toBeNull()
    expect(MAX_MOVIE_POSTER_BYTES).toBe(64 * 1024 * 1024)
    expect(validateMoviePosterPath(svg)).toEqual({ ok: false, reason: 'unsupported-format' })
    expect(validateMoviePosterPath(directory)).toEqual({ ok: false, reason: 'not-file' })
    expect(validateMoviePosterPath(oversized)).toEqual({ ok: false, reason: 'too-large' })
    expect(validateMoviePosterPath(join(root, 'missing.jpg'))).toEqual({ ok: false, reason: 'unavailable' })
    expect(validateMoviePosterPath('../cover.jpg')).toEqual({ ok: false, reason: 'invalid-path' })
  })
})
