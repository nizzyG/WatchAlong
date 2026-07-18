import { describe, expect, it, vi } from 'vitest'
import { createDefaultSession } from '@shared/session'
import { captureTimingSnapshot } from '@shared/sessionTiming'
import type { LibrarySession } from '@shared/types'
import {
  decideConfidentOutcome,
  decideOpeningOutcome,
  decidePartialOutcome,
  runAutoSyncAnalysis,
  runPrimaryPhases,
  type AutoSyncAnalysisContext,
  type AutoSyncAnalysisPorts,
  type PrimaryPhasePorts
} from './autoSyncAnalysis'
import { createAutoSyncEvents } from './autoSyncEvents'
import type { AnchorMatchSet } from './fitResolution'
import type { AutoSyncFit } from './fitting'
import type { MediaInfo } from './ffmpegBackend'
import type { InsetGeometry } from './insetGeometry'
import type { AutoSyncAnchor } from './matching'
import type { DetectedInset } from './openingFallback'

const GEOMETRY: InsetGeometry = {
  x: 0.2,
  y: 0.15,
  width: 0.6,
  height: 0.4,
  flipHorizontal: false
}
const MOVIE_INFO: MediaInfo = { duration: 600, width: 96, height: 54, frameRate: 24 }
const REACTION_INFO: MediaInfo = { duration: 660, width: 96, height: 54, frameRate: 30 }
const EMPTY_MATCH_SET: AnchorMatchSet = { anchors: [], consensus: null }

describe('auto-sync analysis phases', () => {
  it('starts both probes together and preserves the primary phase order', async () => {
    const session = testSession()
    const analysisId = 'requested-session'
    const signal = new AbortController().signal
    const order: string[] = []
    let resolveMovie!: (info: MediaInfo) => void
    let resolveReaction!: (info: MediaInfo) => void
    const probe = vi.fn((filePath: string) => {
      order.push(`probe:${filePath}`)
      return new Promise<MediaInfo>((resolve) => {
        if (filePath === session.moviePath) resolveMovie = resolve
        else resolveReaction = resolve
      })
    })
    const ports: PrimaryPhasePorts = {
      progress: (sessionId, phase, percent, message) => {
        order.push(`progress:${sessionId}:${phase}:${percent}:${message}`)
      },
      probe,
      findGeometry: async () => { order.push('geometry'); return detectedInset() },
      scanTimelines: async () => {
        order.push('scan')
        return { ...EMPTY_MATCH_SET, geometry: GEOMETRY, mask: null }
      },
      refineAnchors: async () => { order.push('refine'); return EMPTY_MATCH_SET }
    }

    const pending = runPrimaryPhases(analysisId, session, signal, ports)

    expect(probe).toHaveBeenCalledTimes(2)
    expect(order).toEqual([
      `progress:${analysisId}:preparing:3:Checking both videos…`,
      `probe:${session.moviePath}`,
      `probe:${session.reactionPath}`
    ])

    resolveMovie(MOVIE_INFO)
    resolveReaction(REACTION_INFO)
    const result = await pending

    expect(result.kind).toBe('complete')
    expect(order).toEqual([
      `progress:${analysisId}:preparing:3:Checking both videos…`,
      `probe:${session.moviePath}`,
      `probe:${session.reactionPath}`,
      `progress:${analysisId}:finding-inset:10:Finding the movie inside the reaction…`,
      'geometry',
      `progress:${analysisId}:scanning:30:Comparing moments across the watchalong…`,
      'scan',
      `progress:${analysisId}:refining:72:Double-checking the best matches…`,
      'refine'
    ])
  })

  it('stops after geometry failure', async () => {
    const session = testSession()
    const scanTimelines = vi.fn()
    const refineAnchors = vi.fn()
    const result = await runPrimaryPhases(session.id, session, new AbortController().signal, {
      progress: () => undefined,
      probe: async (filePath) => filePath.endsWith('movie.mp4') ? MOVIE_INFO : REACTION_INFO,
      findGeometry: async () => null,
      scanTimelines,
      refineAnchors
    })

    expect(result).toEqual({ kind: 'geometry-missing' })
    expect(scanTimelines).not.toHaveBeenCalled()
    expect(refineAnchors).not.toHaveBeenCalled()
  })

  it('skips whole-runtime scanning for an opening-only inset but still refines the empty coarse set', async () => {
    const session = testSession()
    const signal = new AbortController().signal
    const scanTimelines = vi.fn()
    const refineAnchors = vi.fn(async () => EMPTY_MATCH_SET)

    const result = await runPrimaryPhases(session.id, session, signal, {
      progress: () => undefined,
      probe: async (filePath) => filePath === session.moviePath ? MOVIE_INFO : REACTION_INFO,
      findGeometry: async () => detectedInset({ openingOnly: true }),
      scanTimelines,
      refineAnchors
    })

    expect(result.kind).toBe('complete')
    expect(scanTimelines).not.toHaveBeenCalled()
    expect(refineAnchors).toHaveBeenCalledWith(session, [], GEOMETRY, null, signal)
  })
})

describe('auto-sync outcome decisions', () => {
  it('recognizes only a fully confident fit', () => {
    const fit = confidentFit()
    expect(decideConfidentOutcome(fit)).toBe(fit)
    expect(decideConfidentOutcome({ ...fit, confidence: 0.49 })).toBeNull()
    expect(decideConfidentOutcome(null)).toBeNull()
  })

  it('uses the agreeing body offset for a reliable non-opening partial result', () => {
    const refinedIntro = matchSet([30, 60, 90].map((time) => anchor(time, time - 30)))
    const refinedBody = matchSet([300, 600, 900].map((time) => anchor(time, time - 29.5)))

    expect(decidePartialOutcome({
      intro: detectedInset({ confidence: 0.8 }),
      refinedIntro,
      refinedBody,
      fit: null,
      movieRateCorrection: 1
    })).toEqual({
      offsetSeconds: -29.5,
      movieRateCorrection: 1,
      confidence: 0.69,
      anchorCount: 3
    })
    expect(decidePartialOutcome({
      intro: detectedInset({ confidence: Number.NaN }),
      refinedIntro,
      refinedBody,
      fit: null,
      movieRateCorrection: 1
    })).toBeNull()
  })

  it('lets strong independent opening evidence bypass motion corroboration', async () => {
    const findMotionOffset = vi.fn(async () => -108)
    const result = await decideOpeningOutcome({
      intro: detectedInset({
        openingOnly: true,
        openingMotionOffset: null,
        anchors: [anchor(64, -44), anchor(144, 36)]
      }),
      movieRateCorrection: 1,
      scanOpening: async () => matchSet([
        anchor(112, 6.375),
        anchor(120, 14.5),
        anchor(128, 22.375)
      ]),
      findMotionOffset
    })

    expect(result).toMatchObject({ offsetSeconds: -105.625, anchorCount: 3 })
    expect(findMotionOffset).not.toHaveBeenCalled()
  })

  it('preserves the motion probe when eligible opening evidence produces no offset', async () => {
    const findMotionOffset = vi.fn(async () => -108)
    const result = await decideOpeningOutcome({
      intro: detectedInset({
        openingOnly: true,
        openingMotionOffset: null,
        anchors: [anchor(64, -44), anchor(144, 36)]
      }),
      movieRateCorrection: 1,
      scanOpening: async () => EMPTY_MATCH_SET,
      findMotionOffset
    })

    expect(result).toBeNull()
    expect(findMotionOffset).toHaveBeenCalledOnce()
  })
})

describe('auto-sync analysis staleness orchestration', () => {
  it('checks staleness after primary fitting before finishing', async () => {
    const session = testSession()
    const harness = analysisHarness(session, detectedInset())
    harness.getSession.mockReturnValue({ ...session, offsetSeconds: 1 })

    const result = await runAutoSyncAnalysis(analysisContext(session), harness.ports)

    expect(result.outcome).toBe('stale')
    expect(harness.progress.mock.calls.some((call) => call[1] === 'finishing')).toBe(false)
    expect(harness.commit).not.toHaveBeenCalled()
  })

  it('checks staleness again after intro refinement', async () => {
    const session = testSession()
    const harness = analysisHarness(session, detectedInset())
    harness.getSession
      .mockReturnValueOnce(session)
      .mockReturnValueOnce({ ...session, movieRateCorrection: 1.001 })

    const result = await runAutoSyncAnalysis(analysisContext(session), harness.ports)

    expect(result.outcome).toBe('stale')
    expect(harness.refineAnchors).toHaveBeenLastCalledWith(
      session,
      harness.intro.anchors,
      GEOMETRY,
      null,
      expect.any(AbortSignal),
      false
    )
    expect(harness.scanOpeningTimelines).not.toHaveBeenCalled()
    expect(harness.commit).not.toHaveBeenCalled()
  })

  it('checks staleness after an accepted opening result before committing it', async () => {
    const session = testSession()
    const intro = detectedInset({
      openingOnly: true,
      openingMotionOffset: -57,
      anchors: [anchor(64, 8), anchor(144, 88)]
    })
    const harness = analysisHarness(session, intro)
    harness.scanOpeningTimelines.mockResolvedValue(matchSet([
      anchor(59, 2.875),
      anchor(62, 6)
    ]))
    harness.getSession
      .mockReturnValueOnce(session)
      .mockReturnValueOnce(session)
      .mockReturnValueOnce({ ...session, detectedMovieFps: 25 })

    const result = await runAutoSyncAnalysis(analysisContext(session), harness.ports)

    expect(result.outcome).toBe('stale')
    expect(harness.getSession).toHaveBeenCalledTimes(3)
    expect(harness.commit).not.toHaveBeenCalled()
  })

  it('does not add a stale check after a rejected opening result', async () => {
    const session = testSession()
    const intro = detectedInset({
      openingOnly: true,
      openingMotionOffset: -57,
      anchors: [anchor(64, 8), anchor(144, 88)]
    })
    const harness = analysisHarness(session, intro)
    harness.scanOpeningTimelines.mockResolvedValue(EMPTY_MATCH_SET)
    harness.getSession
      .mockReturnValueOnce(session)
      .mockReturnValueOnce(session)
      .mockReturnValueOnce({ ...session, detectedMovieFps: 25 })

    const result = await runAutoSyncAnalysis(analysisContext(session), harness.ports)

    expect(result.outcome).toBe('fallback')
    expect(harness.getSession).toHaveBeenCalledTimes(2)
    expect(harness.commit).not.toHaveBeenCalled()
  })
})

function testSession(): LibrarySession {
  return createDefaultSession(new Date('2026-01-01T00:00:00Z'), {
    id: 'session-1',
    moviePath: 'movie.mp4',
    reactionPath: 'reaction.mp4'
  })
}

function detectedInset(overrides: Partial<DetectedInset> = {}): DetectedInset {
  const anchors = overrides.anchors ?? []
  return {
    geometry: GEOMETRY,
    mask: null,
    confidence: 0.8,
    initialOffsetSeconds: -30,
    referenceReactionTime: anchors[0]?.reactionTime ?? 30,
    referenceMovieTime: anchors[0]?.movieTime ?? 0,
    runnerUpScore: 0.4,
    openingOnly: false,
    openingMotionOffset: null,
    ...overrides,
    anchors,
    anchorCount: overrides.anchorCount ?? anchors.length
  }
}

function anchor(reactionTime: number, movieTime: number, confidence = 0.8): AutoSyncAnchor {
  return { reactionTime, movieTime, confidence, score: 0.1, runnerUpScore: 0.4 }
}

function matchSet(anchors: AutoSyncAnchor[]): AnchorMatchSet {
  return { anchors, consensus: null }
}

function confidentFit(): AutoSyncFit {
  const anchors = [anchor(0, -40), anchor(1000, 960), anchor(2000, 1960)]
  return {
    offsetSeconds: -40,
    movieRateCorrection: 1,
    confidence: 0.8,
    residualStats: {
      medianSeconds: 0.1,
      maximumSeconds: 0.2,
      rmsSeconds: 0.12,
      inlierCount: anchors.length,
      totalCount: anchors.length,
      spanSeconds: 2000,
      spanFraction: 1
    },
    anchors,
    rateSnapped: false
  }
}

function analysisContext(session: LibrarySession): AutoSyncAnalysisContext {
  return {
    sessionId: session.id,
    intent: 'initial',
    session,
    timingSnapshot: captureTimingSnapshot(session),
    signal: new AbortController().signal
  }
}

function analysisHarness(session: LibrarySession, intro: DetectedInset) {
  const progress = vi.fn()
  const getSession = vi.fn((_sessionId: string) => session)
  const refineAnchors = vi.fn(async () => EMPTY_MATCH_SET)
  const scanOpeningTimelines = vi.fn(async () => EMPTY_MATCH_SET)
  const findOpeningMotionOffset = vi.fn(async () => null)
  const commit = vi.fn()
  const ports: AutoSyncAnalysisPorts = {
    progress,
    getSession,
    probe: async (filePath) => filePath === session.moviePath ? MOVIE_INFO : REACTION_INFO,
    findGeometry: async () => intro,
    scanTimelines: async () => ({ ...EMPTY_MATCH_SET, geometry: GEOMETRY, mask: null }),
    refineAnchors,
    scanOpeningTimelines,
    findOpeningMotionOffset,
    events: createAutoSyncEvents(commit)
  }
  return {
    ports,
    intro,
    progress,
    getSession,
    refineAnchors,
    scanOpeningTimelines,
    findOpeningMotionOffset,
    commit
  }
}
