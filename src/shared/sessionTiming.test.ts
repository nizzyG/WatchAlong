import { describe, expect, it } from 'vitest'
import { createDefaultSession } from './session'
import { captureTimingSnapshot, isTimingSnapshotCurrent, type TimingSnapshot } from './sessionTiming'

describe('session timing snapshots', () => {
  const session = createDefaultSession(new Date('2026-07-18T00:00:00.000Z'), {
    id: 'session-1',
    moviePath: 'C:\\Movies\\Movie.mkv',
    reactionPath: 'C:\\Reactions\\Reaction.mp4',
    offsetSeconds: -42.5,
    movieRateCorrection: 1.001,
    reactorSource: 'ntsc',
    detectedMovieFps: 23.976,
    timingOrigin: 'automatic',
    autoSyncConfidence: 0.91,
    autoSyncAnalyzedAt: '2026-07-17T23:00:00.000Z',
    autoSyncAlgorithmVersion: 3
  })

  it('captures only the fields that can invalidate timing work', () => {
    expect(captureTimingSnapshot(session)).toEqual({
      id: 'session-1',
      moviePath: 'C:\\Movies\\Movie.mkv',
      reactionPath: 'C:\\Reactions\\Reaction.mp4',
      offsetSeconds: -42.5,
      movieRateCorrection: 1.001,
      reactorSource: 'ntsc',
      detectedMovieFps: 23.976,
      timingOrigin: 'automatic',
      autoSyncConfidence: 0.91,
      autoSyncAnalyzedAt: '2026-07-17T23:00:00.000Z',
      autoSyncAlgorithmVersion: 3
    })
  })

  it('invalidates every timing field while ignoring unrelated presentation changes', () => {
    const snapshot = captureTimingSnapshot(session)
    expect(isTimingSnapshotCurrent({
      ...session,
      title: 'Renamed only',
      reactionVolume: 0.25,
      overlay: { ...session.overlay, x: 300 },
      updatedAt: '2026-07-18T01:00:00.000Z'
    }, snapshot)).toBe(true)
    expect(isTimingSnapshotCurrent(null, snapshot)).toBe(false)

    const changes: Array<Partial<TimingSnapshot>> = [
      { id: 'session-2' },
      { moviePath: 'C:\\Movies\\Other.mkv' },
      { reactionPath: 'C:\\Reactions\\Other.mp4' },
      { offsetSeconds: -40 },
      { movieRateCorrection: 0.999 },
      { reactorSource: 'pal' },
      { detectedMovieFps: 25 },
      { timingOrigin: 'manual' },
      { autoSyncConfidence: 0.5 },
      { autoSyncAnalyzedAt: '2026-07-18T00:00:00.000Z' },
      { autoSyncAlgorithmVersion: 4 }
    ]
    for (const change of changes) {
      expect(isTimingSnapshotCurrent({ ...session, ...change }, snapshot)).toBe(false)
    }
  })
})
