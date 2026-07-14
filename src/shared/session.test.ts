import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OVERLAY,
  createDefaultSession,
  createSessionFromPaths,
  findMatchingSession,
  mergeSession,
  normalizeLibrary,
  normalizeSession
} from './session'

describe('session helpers', () => {
  it('normalizes missing values to safe defaults', () => {
    const session = normalizeSession({ volume: 4, overlay: { width: 10, height: 10 } })

    expect(session.reactionVolume).toBe(1)
    expect(session.movieVolume).toBe(1)
    expect(session.overlay.width).toBe(320)
    expect(session.overlay.height).toBe(180)
    expect(session.reactionPath).toBeNull()
    expect(session.titleOrigin).toBe('generated')
    expect(session.playbackRate).toBe(1)
    expect(session.reactorSource).toBe('ntsc')
    expect(session.detectedMovieFps).toBeNull()
    expect(session.movieRateCorrection).toBe(1)
    expect(session.timingOrigin).toBe('manual')
    expect(session.autoSyncConfidence).toBeNull()
    expect(session.autoSyncAnalyzedAt).toBeNull()
    expect(session.autoSyncAlgorithmVersion).toBeNull()
    expect(session.isMoviePoppedOut).toBe(false)
    expect(session.movieWindowGeometry).toMatchObject({
      width: 320,
      height: 180
    })
  })

  it('merges overlay patches without dropping existing geometry', () => {
    const session = createDefaultSession()
    const merged = mergeSession(session, { overlay: { x: 88 } as typeof DEFAULT_OVERLAY })

    expect(merged.overlay).toMatchObject({
      x: 88,
      y: DEFAULT_OVERLAY.y,
      width: DEFAULT_OVERLAY.width,
      height: DEFAULT_OVERLAY.height
    })
  })

  it('merges movie window geometry patches without dropping existing geometry', () => {
    const session = createDefaultSession()
    const merged = mergeSession(session, { movieWindowGeometry: { x: 144 } as typeof DEFAULT_OVERLAY })

    expect(merged.movieWindowGeometry).toMatchObject({
      x: 144,
      y: DEFAULT_OVERLAY.y,
      width: DEFAULT_OVERLAY.width,
      height: DEFAULT_OVERLAY.height
    })
  })

  it('treats generic title patches as custom unless generation is explicit', () => {
    const session = createSessionFromPaths('reaction.mp4', 'movie.mp4')

    expect(mergeSession(session, { title: 'My own title' }).titleOrigin).toBe('custom')
    expect(mergeSession(session, {
      title: 'Movie — Reactor',
      titleOrigin: 'generated'
    }).titleOrigin).toBe('generated')
    expect(mergeSession(session, { titleOrigin: 'custom' }).titleOrigin).toBe('generated')
  })

  it('migrates legacy single-session data into a library', () => {
    const library = normalizeLibrary({
      reactionPath: 'C:\\Videos\\reaction.mp4',
      moviePath: 'C:\\Videos\\movie.mp4',
      volume: 0.4,
      offsetSeconds: 12.5,
      lastReactionTimeSeconds: 90
    })

    expect(library.version).toBe(4)
    expect(library.sessions).toHaveLength(1)
    expect(library.activeSessionId).toBe(library.sessions[0].id)
    expect(library.sessions[0]).toMatchObject({
      title: 'movie.mp4',
      reactionVolume: 0.4,
      movieVolume: 0.4,
      offsetSeconds: 12.5,
      lastReactionTimeSeconds: 90,
      timingOrigin: 'manual',
      autoSyncConfidence: null,
      autoSyncAnalyzedAt: null,
      autoSyncAlgorithmVersion: null
    })
  })

  it('deduplicates and finds sessions by media pair', () => {
    const first = createDefaultSession(new Date('2026-01-01T00:00:00.000Z'), {
      reactionPath: 'C:\\Reactions\\A.mp4',
      moviePath: 'C:\\Movies\\B.mp4'
    })
    const duplicate = createDefaultSession(new Date('2026-01-02T00:00:00.000Z'), {
      reactionPath: 'c:\\reactions\\a.mp4',
      moviePath: 'c:\\movies\\b.mp4'
    })
    const library = normalizeLibrary({ sessions: [first, duplicate], activeSessionId: duplicate.id })

    expect(library.sessions).toHaveLength(1)
    expect(findMatchingSession(library, 'C:\\REACTIONS\\A.mp4', 'C:\\MOVIES\\B.mp4')?.id).toBe(first.id)
  })

  it('keeps case-distinct and delimiter-containing POSIX media pairs separate', () => {
    const upper = createDefaultSession(new Date('2026-01-01T00:00:00.000Z'), {
      reactionPath: '/media/Reactions/A|B.mp4',
      moviePath: '/media/Movies/C.mp4'
    })
    const lower = createDefaultSession(new Date('2026-01-02T00:00:00.000Z'), {
      reactionPath: '/media/reactions/a.mp4',
      moviePath: '/media/movies/B|C.mp4'
    })
    const caseVariant = createDefaultSession(new Date('2026-01-03T00:00:00.000Z'), {
      reactionPath: '/media/Reactions/a|b.mp4',
      moviePath: '/media/Movies/C.mp4'
    })

    const library = normalizeLibrary({ sessions: [upper, lower, caseVariant] })

    expect(library.sessions.map((session) => session.id)).toEqual([
      upper.id,
      lower.id,
      caseVariant.id
    ])
  })

  it('sanitizes a suggested title and falls back to the movie filename when it is blank', () => {
    const named = createSessionFromPaths(
      'C:\\Reactions\\Reaction.mp4',
      'C:\\Movies\\Movie.mp4',
      new Date('2026-07-13T00:00:00.000Z'),
      'youtube',
      '  Movie\nTitle\u0000 —\t Reactor\u0085Name  '
    )
    const fallback = createSessionFromPaths(
      'C:\\Reactions\\Reaction.mp4',
      'C:\\Movies\\Movie.mp4',
      new Date('2026-07-13T00:00:00.000Z'),
      'patreon',
      '\n\u0000\t\u0085'
    )

    expect(named.title).toBe('Movie Title — Reactor Name')
    expect(named.titleOrigin).toBe('generated')
    expect(fallback.title).toBe('Movie.mp4')
    expect(fallback.titleOrigin).toBe('generated')
  })

  it('migrates titles without provenance conservatively as custom', () => {
    const legacyNamed = normalizeSession({
      title: 'Movie — My Favorite Reactor',
      moviePath: 'C:\\Movies\\Movie.mp4',
      reactionPath: 'C:\\Reactions\\Reaction.mp4'
    })
    const legacyDefault = normalizeSession({
      title: 'Movie.mp4',
      moviePath: 'C:\\Movies\\Movie.mp4'
    })

    expect(legacyNamed.titleOrigin).toBe('custom')
    expect(legacyDefault.titleOrigin).toBe('custom')
  })
})
