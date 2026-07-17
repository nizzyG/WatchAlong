import { describe, expect, it, vi } from 'vitest'
import { createDefaultSession } from '@shared/session'
import {
  GEOMETRY_SCAN,
  OPENING_MOTION_SCAN,
  OPENING_PREFIX_SCAN,
  OPENING_SCAN
} from './constants'
import type { MediaInfo } from './ffmpegBackend'
import type { AutoSyncAnchor } from './matching'
import {
  findOpeningMotionOffset,
  findOpeningPrefixInset,
  generateOpeningInsetCandidates,
  offsetStatsForRate,
  openingEvidenceStats,
  scanOpeningTimelines,
  type DetectedInset
} from './openingFallback'

describe('opening fallback evidence', () => {
  it('accepts three distinct tightly agreeing visual probes', () => {
    const result = openingEvidenceStats([
      anchor(111, -105.625),
      anchor(120, -105.5),
      anchor(128, -105.625)
    ], 1)

    expect(result).toEqual({
      offsetSeconds: -105.625,
      maximumDeviation: 0.125,
      count: 3,
      spanSeconds: 17
    })
  })

  it('does not count the same visual moment twice', () => {
    expect(openingEvidenceStats([
      anchor(64, -56),
      anchor(64.25, -56.125),
      anchor(144, -56)
    ], 1)).toBeNull()
  })

  it('rejects visual probes that do not form a tight offset cluster', () => {
    expect(openingEvidenceStats([
      anchor(60, -56),
      anchor(68, -53),
      anchor(76, -58)
    ], 1)).toBeNull()
  })

  it('keeps the dense shallow-player search inside the reaction frame', () => {
    const candidates = generateOpeningInsetCandidates()
    expect(candidates.length).toBeGreaterThan(50)
    expect(candidates.every((candidate) =>
      candidate.x >= 0 && candidate.y >= 0 &&
      candidate.x + candidate.width <= 1 && candidate.y + candidate.height <= 1
    )).toBe(true)
  })

  it('preserves the upper median for even-sized offset sets', () => {
    const anchors = [anchor(10, 1), anchor(20, 3)]

    expect(offsetStatsForRate(anchors, 1)).toEqual({
      offsetSeconds: 3,
      maximumDeviation: 2,
      count: 2
    })
    expect(offsetStatsForRate(anchors, 1, { maximumDeviationSeconds: 1 })).toBeNull()
  })

  it('does not extract motion signatures for an invalid predicted start', async () => {
    const extractSignatures = vi.fn(async () => [])

    const result = await findOpeningMotionOffset(
      session(),
      inset({ initialOffsetSeconds: 1 }),
      new AbortController().signal,
      extractSignatures
    )

    expect(result).toBeNull()
    expect(extractSignatures).not.toHaveBeenCalled()
  })

  it('passes the exact opening motion request to the injected extractor', async () => {
    const currentSession = session()
    const intro = inset({ initialOffsetSeconds: -20 })
    const signal = new AbortController().signal
    const extractSignatures = vi.fn(async () => [])

    expect(await findOpeningMotionOffset(currentSession, intro, signal, extractSignatures)).toBeNull()
    expect(extractSignatures).toHaveBeenCalledWith(
      currentSession.reactionPath,
      20 - OPENING_MOTION_SCAN.prerollSeconds,
      OPENING_MOTION_SCAN.durationSeconds,
      OPENING_MOTION_SCAN.fps,
      OPENING_MOTION_SCAN.width,
      OPENING_MOTION_SCAN.height,
      intro.geometry,
      signal,
      OPENING_MOTION_SCAN.gridSize,
      intro.mask
    )
  })

  it('skips opening timeline extraction when too little reaction remains', async () => {
    const extractSignatures = vi.fn(async () => [])

    const result = await scanOpeningTimelines(
      session(),
      mediaInfo(600),
      mediaInfo(105),
      inset({ initialOffsetSeconds: -100 }),
      new AbortController().signal,
      extractSignatures
    )

    expect(result).toEqual({ anchors: [], consensus: null })
    expect(extractSignatures).not.toHaveBeenCalled()
  })

  it('passes both opening timeline requests to the injected extractor', async () => {
    const currentSession = session()
    const intro = inset({ initialOffsetSeconds: -20 })
    const signal = new AbortController().signal
    const extractSignatures = vi.fn(async () => [])

    const result = await scanOpeningTimelines(
      currentSession,
      mediaInfo(600),
      mediaInfo(600),
      intro,
      signal,
      extractSignatures
    )

    expect(result).toEqual({ anchors: [], consensus: null })
    expect(extractSignatures).toHaveBeenNthCalledWith(
      1,
      currentSession.reactionPath,
      20 - OPENING_SCAN.reactionPrerollSeconds,
      OPENING_SCAN.maximumMovieDurationSeconds + OPENING_SCAN.reactionTailSeconds,
      OPENING_SCAN.fps,
      OPENING_SCAN.reactionWidth,
      OPENING_SCAN.reactionHeight,
      intro.geometry,
      signal,
      OPENING_SCAN.gridSize,
      intro.mask
    )
    expect(extractSignatures).toHaveBeenNthCalledWith(
      2,
      currentSession.moviePath,
      0,
      OPENING_SCAN.maximumMovieDurationSeconds,
      OPENING_SCAN.fps,
      OPENING_SCAN.movieWidth,
      OPENING_SCAN.movieHeight,
      undefined,
      signal,
      OPENING_SCAN.gridSize
    )
  })

  it('extracts timer frames once and avoids motion work without a viable prefix', async () => {
    const currentSession = session()
    const movieInfo = mediaInfo(80)
    const reactionInfo = mediaInfo(90)
    const signal = new AbortController().signal
    const extractPixelFrames = vi.fn(async () => [])
    const findMotionOffset = vi.fn(async () => null)

    const result = await findOpeningPrefixInset(
      currentSession,
      movieInfo,
      reactionInfo,
      [],
      [],
      {
        movieAspectRatio: movieInfo.width / movieInfo.height,
        gridSize: GEOMETRY_SCAN.gridSize,
        minimumConfidence: GEOMETRY_SCAN.minimumConfidence
      },
      signal,
      extractPixelFrames,
      findMotionOffset
    )

    expect(result).toBeNull()
    expect(extractPixelFrames).toHaveBeenCalledTimes(2)
    expect(extractPixelFrames).toHaveBeenNthCalledWith(
      1,
      currentSession.reactionPath,
      0,
      reactionInfo.duration,
      GEOMETRY_SCAN.fps,
      OPENING_PREFIX_SCAN.timerReactionWidth,
      OPENING_PREFIX_SCAN.timerReactionHeight,
      signal
    )
    expect(extractPixelFrames).toHaveBeenNthCalledWith(
      2,
      currentSession.moviePath,
      0,
      movieInfo.duration,
      GEOMETRY_SCAN.fps,
      OPENING_PREFIX_SCAN.timerMovieWidth,
      OPENING_PREFIX_SCAN.timerMovieHeight,
      signal
    )
    expect(findMotionOffset).not.toHaveBeenCalled()
  })
})

function anchor(reactionTime: number, offset: number): AutoSyncAnchor {
  return {
    reactionTime,
    movieTime: reactionTime + offset,
    confidence: 0.7,
    score: 0.1,
    runnerUpScore: 0.4,
    rawSimilarity: 0.82
  }
}

function session() {
  return createDefaultSession(new Date('2026-07-17T00:00:00.000Z'), {
    id: 'opening-test',
    moviePath: 'movie.mp4',
    reactionPath: 'reaction.mp4'
  })
}

function mediaInfo(duration: number): MediaInfo {
  return { duration, width: 1920, height: 1080, frameRate: 24 }
}

function inset(overrides: Partial<DetectedInset> = {}): DetectedInset {
  return {
    geometry: { x: 0.25, y: 0.6, width: 0.5, height: 0.28, flipHorizontal: false },
    mask: null,
    confidence: 0.5,
    initialOffsetSeconds: -20,
    referenceReactionTime: 20,
    referenceMovieTime: 0,
    anchors: [],
    anchorCount: 0,
    runnerUpScore: 0,
    openingOnly: true,
    openingMotionOffset: null,
    ...overrides
  }
}
