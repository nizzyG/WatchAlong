import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OVERLAY,
  createDefaultSession,
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
    expect(session.playbackRate).toBe(1)
    expect(session.movieRateCorrection).toBe(1)
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

  it('migrates legacy single-session data into a library', () => {
    const library = normalizeLibrary({
      reactionPath: 'C:\\Videos\\reaction.mp4',
      moviePath: 'C:\\Videos\\movie.mp4',
      volume: 0.4,
      offsetSeconds: 12.5,
      lastReactionTimeSeconds: 90
    })

    expect(library.version).toBe(3)
    expect(library.sessions).toHaveLength(1)
    expect(library.activeSessionId).toBe(library.sessions[0].id)
    expect(library.sessions[0]).toMatchObject({
      title: 'movie.mp4',
      reactionVolume: 0.4,
      movieVolume: 0.4,
      offsetSeconds: 12.5,
      lastReactionTimeSeconds: 90
    })
  })

  it('deduplicates and finds sessions by media pair', () => {
    const first = createDefaultSession(new Date('2026-01-01T00:00:00.000Z'), {
      reactionPath: 'A.mp4',
      moviePath: 'B.mp4'
    })
    const duplicate = createDefaultSession(new Date('2026-01-02T00:00:00.000Z'), {
      reactionPath: 'a.mp4',
      moviePath: 'b.mp4'
    })
    const library = normalizeLibrary({ sessions: [first, duplicate], activeSessionId: duplicate.id })

    expect(library.sessions).toHaveLength(1)
    expect(findMatchingSession(library, 'A.mp4', 'B.mp4')?.id).toBe(first.id)
  })
})
