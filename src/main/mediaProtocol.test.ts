import { mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { posix, win32 } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LibrarySession } from '@shared/types'
import type { SessionStore } from './sessionStore'

const electronMock = vi.hoisted(() => ({ handle: vi.fn() }))
vi.mock('electron', () => ({ protocol: { handle: electronMock.handle } }))

import {
  createSessionMediaUrl,
  getReactorAvatarCandidates,
  parseMediaRequest,
  registerMediaProtocol,
  resolveReactorAvatarPath
} from './mediaProtocol'
import { MAX_MOVIE_POSTER_BYTES } from './services/moviePosterFiles'

const tempDirs: string[] = []

afterEach(() => {
  electronMock.handle.mockReset()
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

describe('media protocol routing', () => {
  it('builds a fixed-role URL from stored session identity only', () => {
    const url = createSessionMediaUrl({
      id: 'session with spaces',
      updatedAt: '2026-07-13T12:34:56.000Z'
    }, 'movie')

    expect(parseMediaRequest(url)).toEqual({
      sessionId: 'session with spaces',
      role: 'movie'
    })
    expect(url).not.toContain('C:')
    expect(url).not.toContain('file:')
  })

  it('parses the fixed media roles and decodes only the session identifier', () => {
    expect(parseMediaRequest('watchalong://media/session-1/reaction')).toEqual({
      sessionId: 'session-1',
      role: 'reaction'
    })
    expect(parseMediaRequest('watchalong://media/session%20one/reactor-avatar?updated=1')).toEqual({
      sessionId: 'session one',
      role: 'reactor-avatar'
    })
    expect(parseMediaRequest('watchalong://media/session%20one/movie-poster?updated=1')).toEqual({
      sessionId: 'session one',
      role: 'movie-poster'
    })
  })

  it.each([
    'https://media/session-1/reactor-avatar',
    'watchalong://elsewhere/session-1/reactor-avatar',
    'watchalong://media/session-1/avatar',
    'watchalong://media/session-1/movie-poster/extra',
    'watchalong://media/session-1/reactor-avatar/extra',
    'watchalong://media/session-1/../reactor-avatar',
    'watchalong://media/%2e%2e/reactor-avatar',
    'watchalong://media/session%2Fother/reactor-avatar',
    'watchalong://media/session%5Cother/reactor-avatar',
    'watchalong://user@media/session-1/reactor-avatar',
    'watchalong://media/session-1/reactor-avatar#fragment',
    'not a url'
  ])('rejects malformed or traversal-shaped URL %s', (rawUrl) => {
    expect(parseMediaRequest(rawUrl)).toBeNull()
  })

  it('serves a resolved avatar through the fixed route with its image MIME type', async () => {
    const tempDir = mkdtempSync(posix.join(tmpdir().replace(/\\/g, '/'), 'watchalong-avatar-route-'))
    tempDirs.push(tempDir)
    const campaignRoot = posix.join(tempDir, 'patreon', 'job-1', 'creator')
    const reactionPath = posix.join(campaignRoot, 'posts', 'post-1', 'video', 'reaction.mp4')
    const avatarPath = posix.join(campaignRoot, 'campaign_info', 'avatar.png')
    mkdirSync(posix.dirname(reactionPath), { recursive: true })
    mkdirSync(posix.dirname(avatarPath), { recursive: true })
    writeFileSync(reactionPath, 'video')
    writeFileSync(avatarPath, 'avatar-bytes')

    const session = {
      id: 'session-1',
      reactionPath,
      reactionSource: 'patreon'
    } as LibrarySession
    const sessionStore = {
      getSession: (sessionId: string) => sessionId === session.id ? session : null
    } as unknown as SessionStore

    registerMediaProtocol(sessionStore)
    expect(electronMock.handle).toHaveBeenCalledWith('watchalong', expect.any(Function))
    const handler = electronMock.handle.mock.calls[0][1] as (request: Request) => Promise<Response>
    const response = await handler(new Request('watchalong://media/session-1/reactor-avatar'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(await response.text()).toBe('avatar-bytes')
  })

  it('serves an on-demand convention poster without putting its path in the URL', async () => {
    const tempDir = mkdtempSync(posix.join(tmpdir().replace(/\\/g, '/'), 'watchalong-poster-route-'))
    tempDirs.push(tempDir)
    const moviePath = posix.join(tempDir, 'Tombstone (1993)', 'Tombstone (1993).mkv')
    const posterPath = posix.join(posix.dirname(moviePath), 'poster.jpg')
    mkdirSync(posix.dirname(moviePath), { recursive: true })
    writeFileSync(moviePath, 'video')
    writeFileSync(posterPath, 'poster-bytes')

    const session = {
      id: 'session-poster',
      updatedAt: '2026-07-14T12:00:00.000Z',
      moviePath,
      moviePosterPath: null
    } as LibrarySession
    const sessionStore = {
      getSession: (sessionId: string) => sessionId === session.id ? session : null
    } as unknown as SessionStore
    const url = createSessionMediaUrl(session, 'movie-poster')

    expect(url).not.toContain(tempDir)
    expect(url).not.toContain('poster.jpg')
    registerMediaProtocol(sessionStore)
    const handler = electronMock.handle.mock.calls[0][1] as (request: Request) => Promise<Response>
    const response = await handler(new Request(url))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.text()).toBe('poster-bytes')
  })

  it('does not cache a missing poster placeholder decision', async () => {
    const session = {
      id: 'missing-poster',
      moviePath: '/media/Movies/Missing/Missing.mkv',
      moviePosterPath: null
    } as LibrarySession
    const sessionStore = {
      getSession: (sessionId: string) => sessionId === session.id ? session : null
    } as unknown as SessionStore

    registerMediaProtocol(sessionStore)
    const handler = electronMock.handle.mock.calls[0][1] as (request: Request) => Promise<Response>
    const response = await handler(new Request('watchalong://media/missing-poster/movie-poster'))

    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('refuses an oversized poster at the fixed route', async () => {
    const tempDir = mkdtempSync(posix.join(tmpdir().replace(/\\/g, '/'), 'watchalong-poster-cap-'))
    tempDirs.push(tempDir)
    const moviePath = posix.join(tempDir, 'Movie', 'Movie.mkv')
    const posterPath = posix.join(posix.dirname(moviePath), 'poster.jpg')
    mkdirSync(posix.dirname(moviePath), { recursive: true })
    writeFileSync(moviePath, 'video')
    writeFileSync(posterPath, '')
    truncateSync(posterPath, MAX_MOVIE_POSTER_BYTES + 1)

    const session = {
      id: 'oversized-poster',
      moviePath,
      moviePosterPath: null
    } as LibrarySession
    const sessionStore = {
      getSession: (sessionId: string) => sessionId === session.id ? session : null
    } as unknown as SessionStore

    registerMediaProtocol(sessionStore)
    const handler = electronMock.handle.mock.calls[0][1] as (request: Request) => Promise<Response>
    const response = await handler(new Request('watchalong://media/oversized-poster/movie-poster'))

    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('reactor avatar resolution', () => {
  it('derives Patreon campaign-info avatars from Windows paths', () => {
    const reactionPath = String.raw`C:\Users\viewer\Videos\WatchAlong\Reactions\patreon\job-1\creator - Creator Name\posts\123 - Post\video\reaction.mp4`
    const candidates = getReactorAvatarCandidates({ reactionPath, reactionSource: 'patreon' })

    expect(candidates).toEqual([
      win32.join(
        String.raw`C:\Users\viewer\Videos\WatchAlong\Reactions\patreon\job-1\creator - Creator Name`,
        'campaign_info',
        'avatar.jpg'
      ),
      win32.join(
        String.raw`C:\Users\viewer\Videos\WatchAlong\Reactions\patreon\job-1\creator - Creator Name`,
        'campaign_info',
        'avatar.jpeg'
      ),
      win32.join(
        String.raw`C:\Users\viewer\Videos\WatchAlong\Reactions\patreon\job-1\creator - Creator Name`,
        'campaign_info',
        'avatar.png'
      ),
      win32.join(
        String.raw`C:\Users\viewer\Videos\WatchAlong\Reactions\patreon\job-1\creator - Creator Name`,
        'campaign_info',
        'avatar.webp'
      )
    ])
  })

  it('derives Patreon campaign-info avatars from POSIX paths', () => {
    const reactionPath = '/Users/viewer/Videos/WatchAlong/Reactions/patreon/job-1/creator/posts/123/video/reaction.mp4'
    const [candidate] = getReactorAvatarCandidates({ reactionPath, reactionSource: 'patreon' })

    expect(candidate).toBe(
      posix.join('/Users/viewer/Videos/WatchAlong/Reactions/patreon/job-1/creator', 'campaign_info', 'avatar.jpg')
    )
  })

  it('checks YouTube sidecars from the nearest directory up to a bounded job root', () => {
    const reactionPath = String.raw`C:\Videos\WatchAlong\Reactions\youtube\job-1\formats\video\reaction.mp4`
    const candidates = getReactorAvatarCandidates({ reactionPath, reactionSource: 'youtube' })

    expect(candidates).toHaveLength(12)
    expect(candidates[0]).toBe(
      win32.join(String.raw`C:\Videos\WatchAlong\Reactions\youtube\job-1\formats\video`, 'reactor-avatar.jpg')
    )
    expect(candidates[4]).toBe(
      win32.join(String.raw`C:\Videos\WatchAlong\Reactions\youtube\job-1\formats`, 'reactor-avatar.jpg')
    )
    expect(candidates[8]).toBe(
      win32.join(String.raw`C:\Videos\WatchAlong\Reactions\youtube\job-1`, 'reactor-avatar.jpg')
    )
    expect(candidates).not.toContain(
      win32.join(String.raw`C:\Videos\WatchAlong\Reactions\youtube`, 'reactor-avatar.jpg')
    )
  })

  it('checks only the containing directory for a moved YouTube reaction', () => {
    const reactionPath = '/Users/viewer/Movies/reaction.mp4'

    expect(getReactorAvatarCandidates({ reactionPath, reactionSource: 'youtube' })).toEqual([
      '/Users/viewer/Movies/reactor-avatar.jpg',
      '/Users/viewer/Movies/reactor-avatar.jpeg',
      '/Users/viewer/Movies/reactor-avatar.png',
      '/Users/viewer/Movies/reactor-avatar.webp'
    ])
  })

  it('selects the first existing fixed candidate deterministically', () => {
    const reactionPath = '/Users/viewer/Movies/reaction.mp4'
    const candidates = getReactorAvatarCandidates({ reactionPath, reactionSource: 'youtube' })
    const existing = new Set([candidates[2], candidates[0]])

    expect(resolveReactorAvatarPath(
      { reactionPath, reactionSource: 'youtube' },
      (candidate) => existing.has(candidate)
    )).toBe(candidates[0])
  })

  it('does not resolve local reactions, relative paths, or parent traversal', () => {
    expect(getReactorAvatarCandidates({
      reactionPath: '/Users/viewer/Movies/reaction.mp4',
      reactionSource: 'local'
    })).toEqual([])
    expect(getReactorAvatarCandidates({
      reactionPath: 'youtube/job/reaction.mp4',
      reactionSource: 'youtube'
    })).toEqual([])
    expect(getReactorAvatarCandidates({
      reactionPath: String.raw`C:\Videos\youtube\job\..\outside\reaction.mp4`,
      reactionSource: 'youtube'
    })).toEqual([])
  })
})
