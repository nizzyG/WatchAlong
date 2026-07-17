import type {
  AutoSyncCompleteEvent,
  AutoSyncIntent,
  AutoSyncProgressEvent,
  LibrarySession,
  SessionLibrary,
  StartAutoSyncResult
} from '@shared/types'
import { clamp } from '@shared/numeric'
import { captureTimingSnapshot, isTimingSnapshotCurrent } from '@shared/sessionTiming'
import { isConfidentFit, type AutoSyncFit } from './fitting'
import {
  choosePreferredFit,
  fitMatchSet,
  resolveCandidateGroups,
  type AnchorMatchSet
} from './fitResolution'
import type { HoughConsensus } from './houghVoting'
import {
  findInsetGeometry,
  generateCompactCornerCandidates,
  generateGeometryCandidates,
  refineGeometryCandidates,
  type InsetGeometry,
  type InsetGeometryResult,
  type TimedPixelFrame
} from './insetGeometry'
import {
  findSequenceMatchCandidates,
  matchSequence,
  sequenceActivity,
  selectBurstWeightedMatches,
  type AutoSyncAnchor,
  type SequenceMatchCandidate,
  type TimedSignature
} from './matching'
import {
  detectSustainedOpeningMotion,
  expandOpeningCandidatePositions,
  generateOpeningInsetCandidates,
  openingEvidenceStats,
  signatureWindow
} from './openingFallback'
import { applySignatureMask, createFrameSignature, type SignatureCellMask } from './signatures'
import type { AutoSyncMediaBackend, MediaInfo } from './ffmpegBackend'
import {
  AUTO_SYNC_ALGORITHM_VERSION,
  AUTO_SYNC_PROGRESS,
  BODY_SCAN,
  COARSE_RATE_BAND,
  DEFAULT_SIGNATURE_GRID_SIZE,
  GEOMETRY_SCAN,
  MAX_OPENING_ELIGIBLE_DEVIATION_SECONDS,
  MAX_PARTIAL_DEVIATION_SECONDS,
  MAX_STRONG_OPENING_DEVIATION_SECONDS,
  MIN_OPENING_ELIGIBLE_ANCHORS,
  MIN_PARTIAL_ANCHORS,
  MIN_PARTIAL_GEOMETRY_CONFIDENCE,
  MIN_STRONG_OPENING_ANCHORS,
  MIN_STRONG_OPENING_SPAN_SECONDS,
  OFFSET_DECIMAL_PLACES,
  OPENING_CORROBORATION_TOLERANCE_SECONDS,
  OPENING_MOTION_SCAN,
  OPENING_PARTIAL_FLOOR,
  OPENING_PREFIX_SCAN,
  OPENING_PROBE_TIMES,
  OPENING_SCAN,
  PARTIAL_CONFIDENCE_CAP,
  PARTIAL_OFFSET_AGREEMENT_SECONDS,
  PROBE_FRACTIONS,
  RATE_BAND,
  REFINEMENT_SCAN
} from './constants'

export { AUTO_SYNC_ALGORITHM_VERSION } from './constants'

export interface AutoSyncSessionRepository {
  getSession(sessionId: string): LibrarySession | null
  updateSession(sessionId: string, patch: Partial<LibrarySession>): SessionLibrary
}

export interface AutoSyncServiceOptions {
  sessions: AutoSyncSessionRepository
  backend: AutoSyncMediaBackend
  emitProgress: (event: AutoSyncProgressEvent) => void
  emitComplete: (event: AutoSyncCompleteEvent) => void
  now?: () => Date
}

interface RunningAnalysis {
  abortController: AbortController
}

export interface AutoSyncAnalysisOptions {
  intent: AutoSyncIntent
  snapshot?: LibrarySession
  signal?: AbortSignal
}

interface DetectedInset {
  geometry: InsetGeometry
  mask: SignatureCellMask | null
  confidence: number
  initialOffsetSeconds: number
  referenceReactionTime: number
  referenceMovieTime: number
  anchors: AutoSyncAnchor[]
  anchorCount: number
  runnerUpScore: number
  openingOnly: boolean
  openingMotionOffset: number | null
}

export class AutoSyncService {
  private readonly running = new Map<string, RunningAnalysis>()
  private readonly now: () => Date

  constructor(private readonly options: AutoSyncServiceOptions) {
    this.now = options.now ?? (() => new Date())
  }

  start(sessionId: string, intent: AutoSyncIntent): StartAutoSyncResult {
    if (this.running.has(sessionId)) return { started: false, reason: 'already-running' }
    const session = this.options.sessions.getSession(sessionId)
    if (!session) return { started: false, reason: 'missing-session' }
    if (!session.moviePath || !session.reactionPath) return { started: false, reason: 'missing-media' }
    const abortController = new AbortController()
    const snapshot = snapshotSession(session)
    this.running.set(sessionId, { abortController })
    void this.analyze(sessionId, { intent, snapshot, signal: abortController.signal })
      .then((result) => this.options.emitComplete(result))
      .finally(() => this.running.delete(sessionId))
    return { started: true }
  }

  cancel(sessionId: string): void {
    this.running.get(sessionId)?.abortController.abort()
  }

  isRunning(sessionId: string): boolean {
    return this.running.has(sessionId)
  }

  async analyze(sessionId: string, options: AutoSyncAnalysisOptions): Promise<AutoSyncCompleteEvent> {
    const sourceSession = options.snapshot ?? this.options.sessions.getSession(sessionId)
    const session = sourceSession ? snapshotSession(sourceSession) : null
    if (!session?.moviePath || !session.reactionPath) return fallback(sessionId, 'This watchalong needs both files before sync can be found.')
    const timingSnapshot = captureTimingSnapshot(session)
    const effectiveSignal = options.signal ?? new AbortController().signal
    try {
      this.progress(sessionId, 'preparing', AUTO_SYNC_PROGRESS.preparing, 'Checking both videos…')
      const [movieInfo, reactionInfo] = await Promise.all([
        this.options.backend.probe(session.moviePath, effectiveSignal),
        this.options.backend.probe(session.reactionPath, effectiveSignal)
      ])

      this.progress(sessionId, 'finding-inset', AUTO_SYNC_PROGRESS.findingInset, 'Finding the movie inside the reaction…')
      const intro = await this.findGeometry(session, movieInfo, reactionInfo, effectiveSignal)
      if (!intro) return fallback(sessionId, 'WatchAlong couldn’t clearly see the movie in this reaction. You can line it up manually.')

      this.progress(sessionId, 'scanning', AUTO_SYNC_PROGRESS.scanning, 'Comparing moments across the watchalong…')
      const scan = intro.openingOnly
        ? { anchors: [], consensus: null, geometry: intro.geometry, mask: intro.mask }
        : await this.scanTimelines(session, movieInfo, reactionInfo, intro, effectiveSignal)
      const coarse = scan.anchors
      this.progress(sessionId, 'refining', AUTO_SYNC_PROGRESS.refining, 'Double-checking the best matches…')
      const refined = await this.refineAnchors(session, coarse, scan.geometry, scan.mask, effectiveSignal)
      const refinedFit = fitMatchSet(refined, movieInfo.duration)
      const coarseFit = fitMatchSet({ anchors: coarse, consensus: scan.consensus }, movieInfo.duration)
      // A refinement is only better when its complete evidence is stronger.
      // This also prevents a marginal refined pass from hiding a valid coarse fit.
      const fit = choosePreferredFit(refinedFit, coarseFit)
      const current = this.options.sessions.getSession(sessionId)
      if (!isTimingSnapshotCurrent(current, timingSnapshot)) return stale(sessionId)

      this.progress(sessionId, 'finishing', AUTO_SYNC_PROGRESS.finishing, 'Finishing the timing…')
      if (fit && isConfidentFit(fit)) {
        this.commit(sessionId, fit.offsetSeconds, fit.movieRateCorrection, fit.confidence, movieInfo.frameRate)
        return completeFromFit(sessionId, 'confident', fit, 'Ready — WatchAlong found the timing and will keep both videos together.')
      }

      const refinedIntro = await this.refineAnchors(session, intro.anchors, intro.geometry, intro.mask, effectiveSignal, false)
      const latest = this.options.sessions.getSession(sessionId)
      if (!isTimingSnapshotCurrent(latest, timingSnapshot)) return stale(sessionId)
      const introOffset = offsetStatsForRate(refinedIntro.anchors, latest.movieRateCorrection)
      const bodyOffset = offsetStatsForRate(refined.anchors, latest.movieRateCorrection)
      const partialOffset = introOffset && bodyOffset &&
        Math.abs(bodyOffset.offsetSeconds - introOffset.offsetSeconds) <= PARTIAL_OFFSET_AGREEMENT_SECONDS
        ? bodyOffset.offsetSeconds
        : introOffset?.offsetSeconds
      const introOffsetIsReliable = Boolean(
        introOffset && introOffset.count >= MIN_PARTIAL_ANCHORS &&
        introOffset.maximumDeviation <= MAX_PARTIAL_DEVIATION_SECONDS
      )
      if (!intro.openingOnly && intro.confidence >= MIN_PARTIAL_GEOMETRY_CONFIDENCE &&
        introOffsetIsReliable && partialOffset !== undefined && Number.isFinite(partialOffset)) {
        // A marginal drift estimate is useful evidence, but not safe to apply.
        // Keep the user's current rate and only prefill the well-supported start point.
        return this.completePartial(sessionId, options.intent, partialOffset, latest.movieRateCorrection,
          Math.min(PARTIAL_CONFIDENCE_CAP, fit?.confidence ?? intro.confidence), introOffset!.count, movieInfo.frameRate)
      }

      // Preserve the established whole-runtime and partial paths above. Only
      // when they cannot decide do we spend extra work on the opening. This
      // recovers reactions that briefly show the movie and then blur or black
      // it out, without letting those low-information later frames invent a
      // drift fit.
      const coarseIntroOffset = offsetStatsForRate(intro.anchors, latest.movieRateCorrection)
      const openingEligible = Boolean(
        coarseIntroOffset &&
        coarseIntroOffset.count >= MIN_OPENING_ELIGIBLE_ANCHORS &&
        coarseIntroOffset.maximumDeviation <= MAX_OPENING_ELIGIBLE_DEVIATION_SECONDS
      )
      if (openingEligible) {
        const opening = await this.scanOpeningTimelines(
          session,
          movieInfo,
          reactionInfo,
          intro,
          effectiveSignal
        )
        const independentOpeningOffset = openingEvidenceStats(opening.anchors, latest.movieRateCorrection)
        const openingOffset = independentOpeningOffset ?? (
          intro.openingOnly && opening.anchors.length >= MIN_OPENING_ELIGIBLE_ANCHORS
            ? openingEvidenceStats([...intro.anchors, ...opening.anchors], latest.movieRateCorrection)
            : null
        )
        const strongIndependentVisualEvidence = Boolean(
          independentOpeningOffset &&
          independentOpeningOffset.count >= MIN_STRONG_OPENING_ANCHORS &&
          independentOpeningOffset.maximumDeviation <= MAX_STRONG_OPENING_DEVIATION_SECONDS &&
          independentOpeningOffset.spanSeconds >= MIN_STRONG_OPENING_SPAN_SECONDS
        )
        const openingMotionOffset = strongIndependentVisualEvidence
          ? null
          : intro.openingMotionOffset ?? await this.findOpeningMotionOffset(session, intro, effectiveSignal)
        const hasRequiredCorroboration = strongIndependentVisualEvidence || (
          openingMotionOffset !== null && openingOffset !== null &&
          Math.abs(openingMotionOffset - openingOffset.offsetSeconds) <= OPENING_CORROBORATION_TOLERANCE_SECONDS
        )
        if (openingOffset && hasRequiredCorroboration) {
          const currentAfterOpening = this.options.sessions.getSession(sessionId)
          if (!isTimingSnapshotCurrent(currentAfterOpening, timingSnapshot)) return stale(sessionId)
          return this.completeReadyOpeningPartial(sessionId, openingOffset.offsetSeconds,
            currentAfterOpening.movieRateCorrection,
            Math.min(PARTIAL_CONFIDENCE_CAP, Math.max(intro.confidence, OPENING_PARTIAL_FLOOR)),
            openingOffset.count, movieInfo.frameRate)
        }
      }

      return fallback(sessionId, 'WatchAlong wasn’t certain enough to change your timing. You can line it up manually.')
    } catch (error) {
      if (effectiveSignal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        return { sessionId, outcome: 'cancelled', message: 'Automatic sync was cancelled. Your timing was left unchanged.' }
      }
      return { sessionId, outcome: 'failed', message: friendlyError(error) }
    }
  }

  private async findGeometry(
    session: LibrarySession,
    movieInfo: MediaInfo,
    reactionInfo: MediaInfo,
    signal: AbortSignal
  ): Promise<DetectedInset | null> {
    const fps = GEOMETRY_SCAN.fps
    const reactionDuration = Math.min(reactionInfo.duration, GEOMETRY_SCAN.maximumReactionDurationSeconds)
    const movieDuration = Math.min(movieInfo.duration, GEOMETRY_SCAN.maximumMovieDurationSeconds)
    const [reactionFrames, movieFrames] = await Promise.all([
      this.extractPixelFrames(
        session.reactionPath!, 0, reactionDuration, fps,
        GEOMETRY_SCAN.reactionWidth, GEOMETRY_SCAN.reactionHeight, signal
      ),
      this.extractPixelFrames(
        session.moviePath!, 0, movieDuration, fps,
        GEOMETRY_SCAN.movieWidth, GEOMETRY_SCAN.movieHeight, signal
      )
    ])
    const movie = movieFrames.map((frame) => ({
      time: frame.time,
      signature: createFrameSignature(frame, { gridSize: GEOMETRY_SCAN.gridSize })
    }))
    const geometryOptions = {
      movieAspectRatio: movieInfo.width / movieInfo.height,
      gridSize: GEOMETRY_SCAN.gridSize,
      minimumConfidence: GEOMETRY_SCAN.minimumConfidence
    }
    let first: InsetGeometryResult | DetectedInset | null = findInsetGeometry(reactionFrames, movie, geometryOptions) ?? findInsetGeometry(reactionFrames, movie, {
      ...geometryOptions,
      candidates: generateCompactCornerCandidates(
        reactionInfo.width / reactionInfo.height,
        movieInfo.width / movieInfo.height
      )
    })
    // A whole-runtime probe undersamples reactions whose movie is visible only
    // near the opening timer. Retry on progressively tighter prefixes so the
    // limited honest evidence receives enough probes to identify its crop.
    if (!first) {
      const openingCandidates = expandOpeningCandidatePositions(generateGeometryCandidates(
        reactionInfo.width / reactionInfo.height,
        movieInfo.width / movieInfo.height
      ).filter((candidate) =>
        candidate.width <= GEOMETRY_SCAN.openingCandidateMaximumWidth &&
        candidate.height <= GEOMETRY_SCAN.openingCandidateMaximumHeight
      ))
      const [timerReactionFrames, timerMovieFrames] = await Promise.all([
        this.extractPixelFrames(
          session.reactionPath!, 0,
          Math.min(OPENING_PREFIX_SCAN.timerReactionDurationSeconds, reactionInfo.duration), fps,
          OPENING_PREFIX_SCAN.timerReactionWidth, OPENING_PREFIX_SCAN.timerReactionHeight, signal
        ),
        this.extractPixelFrames(
          session.moviePath!, 0,
          Math.min(OPENING_PREFIX_SCAN.timerMovieDurationSeconds, movieInfo.duration), fps,
          OPENING_PREFIX_SCAN.timerMovieWidth, OPENING_PREFIX_SCAN.timerMovieHeight, signal
        )
      ])
      const timerMovie = timerMovieFrames.map((frame) => ({
        time: frame.time,
        signature: createFrameSignature(frame, { gridSize: OPENING_PREFIX_SCAN.timerGridSize })
      }))
      for (const prefixSeconds of OPENING_PREFIX_SCAN.prefixSeconds) {
        const prefixReaction = reactionFrames.filter((frame) => frame.time <= prefixSeconds)
        const prefixMovie = movie.filter((frame) => frame.time <= Math.min(
          OPENING_PREFIX_SCAN.prefixMovieMaximumSeconds,
          prefixSeconds - OPENING_PREFIX_SCAN.prefixMovieLeadSeconds
        ))
        const prefixResults = [findInsetGeometry(prefixReaction, prefixMovie, {
          ...geometryOptions,
          candidates: openingCandidates
        }), findInsetGeometry(prefixReaction, prefixMovie, {
          ...geometryOptions,
          candidates: generateCompactCornerCandidates(
            reactionInfo.width / reactionInfo.height,
            movieInfo.width / movieInfo.height
          )
        }), prefixSeconds === OPENING_PREFIX_SCAN.timerPrefixSeconds
          ? findInsetGeometry(timerReactionFrames, timerMovie, {
          ...geometryOptions,
          gridSize: OPENING_PREFIX_SCAN.timerGridSize,
          minimumConfidence: OPENING_PREFIX_SCAN.minimumConfidence,
          minimumAnchors: OPENING_PREFIX_SCAN.minimumAnchors,
            candidates: generateOpeningInsetCandidates()
          })
          : null].filter((result): result is NonNullable<typeof result> => Boolean(result))

        const validated: DetectedInset[] = []
        for (const result of prefixResults) {
          const coarse = offsetStatsForRate(result.anchors, 1)
          if (!coarse || coarse.count < OPENING_PREFIX_SCAN.minimumAnchors ||
            coarse.maximumDeviation > OPENING_PREFIX_SCAN.maximumOffsetDeviationSeconds) continue
          const candidate: DetectedInset = {
            ...result,
            openingOnly: true,
            openingMotionOffset: null
          }
          const motionOffset = await this.findOpeningMotionOffset(session, candidate, signal)
          if (motionOffset === null ||
            Math.abs(motionOffset - coarse.offsetSeconds) > OPENING_PREFIX_SCAN.maximumMotionDisagreementSeconds) continue
          validated.push({ ...candidate, openingMotionOffset: motionOffset })
        }
        validated.sort((left, right) =>
          right.anchors.length - left.anchors.length ||
          right.confidence - left.confidence
        )
        first = validated[0] ?? null
        if (first) break
      }
    }
    if (!first) return null
    if ('openingOnly' in first && first.openingOnly) return first
    const refinedCandidates = refineGeometryCandidates(first.geometry, reactionInfo.width / reactionInfo.height, movieInfo.width / movieInfo.height)
    const refined = findInsetGeometry(reactionFrames, movie, {
      movieAspectRatio: movieInfo.width / movieInfo.height,
      gridSize: GEOMETRY_SCAN.gridSize,
      minimumConfidence: GEOMETRY_SCAN.refinedMinimumConfidence,
      candidates: refinedCandidates
    })
    return {
      ...(refined && refined.confidence > first.confidence ? refined : first),
      openingOnly: false,
      openingMotionOffset: null
    }
  }

  private async scanOpeningTimelines(
    session: LibrarySession,
    movieInfo: MediaInfo,
    reactionInfo: MediaInfo,
    intro: DetectedInset,
    signal: AbortSignal
  ): Promise<AnchorMatchSet> {
    const fps = OPENING_SCAN.fps
    const openingMovieDuration = Math.min(OPENING_SCAN.maximumMovieDurationSeconds, movieInfo.duration)
    const coarseOffset = offsetStatsForRate(intro.anchors, 1)?.offsetSeconds ?? intro.initialOffsetSeconds
    const predictedReactionStart = Math.max(0, -coarseOffset - OPENING_SCAN.reactionPrerollSeconds)
    const reactionDuration = Math.min(
      openingMovieDuration + OPENING_SCAN.reactionTailSeconds,
      Math.max(0, reactionInfo.duration - predictedReactionStart)
    )
    if (reactionDuration < OPENING_SCAN.minimumReactionDurationSeconds) return { anchors: [], consensus: null }

    const [reaction, movie] = await Promise.all([
      this.extractSignatures(
        session.reactionPath!, predictedReactionStart, reactionDuration, fps,
        OPENING_SCAN.reactionWidth, OPENING_SCAN.reactionHeight,
        intro.geometry, signal, OPENING_SCAN.gridSize, intro.mask
      ),
      this.extractSignatures(
        session.moviePath!, 0, openingMovieDuration, fps,
        OPENING_SCAN.movieWidth, OPENING_SCAN.movieHeight,
        undefined, signal, OPENING_SCAN.gridSize
      )
    ])
    const candidateGroups: SequenceMatchCandidate[][] = []
    for (const movieTime of OPENING_PROBE_TIMES) {
      if (movieTime >= openingMovieDuration - OPENING_SCAN.probeEndMarginSeconds) continue
      const window = signatureWindow(reaction, movieTime - coarseOffset, OPENING_SCAN.windowSize)
      if (window.length < OPENING_SCAN.windowSize ||
        sequenceActivity(window) < OPENING_SCAN.minimumSequenceActivity) continue
      const candidates = findSequenceMatchCandidates(window, movie, {
        candidateExclusionFrames: OPENING_SCAN.candidateExclusionFrames,
        maximumCandidatesPerProbe: OPENING_SCAN.maximumCandidatesPerProbe
      }).filter((candidate) =>
        candidate.rawSimilarity >= OPENING_SCAN.minimumCandidateRawSimilarity &&
        Math.abs((candidate.movieTime - candidate.reactionTime) - coarseOffset) <=
          OPENING_SCAN.candidateOffsetToleranceSeconds
      )
      if (candidates.length) candidateGroups.push(candidates)
    }
    const anchors = selectBurstWeightedMatches(candidateGroups, {
      runnerUpExclusionFrames: OPENING_SCAN.runnerUpExclusionFrames
    }).filter((anchor) =>
      anchor.confidence >= OPENING_SCAN.minimumAnchorConfidence &&
      (anchor.rawSimilarity ?? 0) >= OPENING_SCAN.minimumAnchorRawSimilarity
    )
    return { anchors, consensus: null }
  }

  private async findOpeningMotionOffset(
    session: LibrarySession,
    intro: DetectedInset,
    signal: AbortSignal
  ): Promise<number | null> {
    const predictedStart = -intro.initialOffsetSeconds
    if (!Number.isFinite(predictedStart) || predictedStart < 0) return null
    const start = Math.max(0, predictedStart - OPENING_MOTION_SCAN.prerollSeconds)
    const signatures = await this.extractSignatures(
      session.reactionPath!, start, OPENING_MOTION_SCAN.durationSeconds, OPENING_MOTION_SCAN.fps,
      OPENING_MOTION_SCAN.width, OPENING_MOTION_SCAN.height,
      intro.geometry, signal, OPENING_MOTION_SCAN.gridSize, intro.mask
    )
    const motionStart = detectSustainedOpeningMotion(signatures, predictedStart)
    return motionStart === null ? null : Number((-motionStart).toFixed(OPENING_MOTION_SCAN.resultDecimalPlaces))
  }

  private async scanTimelines(
    session: LibrarySession,
    movieInfo: MediaInfo,
    reactionInfo: MediaInfo,
    intro: DetectedInset,
    signal: AbortSignal
  ): Promise<{ anchors: AutoSyncAnchor[]; consensus: HoughConsensus | null; geometry: InsetGeometry; mask: SignatureCellMask | null }> {
    const pivotReactionTime = clamp(
      reactionInfo.duration * BODY_SCAN.pivotReactionFraction,
      BODY_SCAN.pivotEdgeMarginSeconds,
      reactionInfo.duration - BODY_SCAN.pivotEdgeMarginSeconds
    )
    const reactionSpan = pivotReactionTime - intro.referenceReactionTime
    const possibleMovieTimes = [RATE_BAND.min, RATE_BAND.max]
      .map((rate) => intro.referenceMovieTime + reactionSpan * rate)
    const pivotMovieStart = clamp(
      Math.min(...possibleMovieTimes) - BODY_SCAN.pivotMoviePaddingSeconds,
      0,
      movieInfo.duration
    )
    const pivotMovieEnd = clamp(
      Math.max(...possibleMovieTimes) + BODY_SCAN.pivotMoviePaddingSeconds,
      pivotMovieStart,
      movieInfo.duration
    )
    const pivotMovie = await this.extractSignatures(
      session.moviePath!, pivotMovieStart,
      Math.max(BODY_SCAN.pivotMovieMinimumDurationSeconds, pivotMovieEnd - pivotMovieStart),
      BODY_SCAN.pivotMovieFps, BODY_SCAN.pivotMovieWidth, BODY_SCAN.pivotMovieHeight,
      undefined, signal, BODY_SCAN.pivotMovieGridSize
    )
    const geometryCandidates = [
      { geometry: intro.geometry, mask: intro.mask },
      { geometry: { x: 0, y: 0, width: 1, height: 1, flipHorizontal: false }, mask: null }
    ].filter((candidate, index, all) => index === all.findIndex((other) =>
      candidate.geometry.x === other.geometry.x && candidate.geometry.y === other.geometry.y &&
      candidate.geometry.width === other.geometry.width && candidate.geometry.height === other.geometry.height &&
      candidate.geometry.flipHorizontal === other.geometry.flipHorizontal
    ))
    let selected: { pivot: AutoSyncAnchor; geometry: InsetGeometry; mask: SignatureCellMask | null } | null = null
    for (const candidate of geometryCandidates) {
      const { geometry, mask } = candidate
      const pivotReaction = await this.extractSignatures(
        session.reactionPath!,
        Math.max(0, pivotReactionTime - BODY_SCAN.pivotReactionHalfWindowSeconds),
        BODY_SCAN.pivotReactionDurationSeconds, BODY_SCAN.pivotReactionFps,
        BODY_SCAN.pivotReactionWidth, BODY_SCAN.pivotReactionHeight,
        geometry, signal, BODY_SCAN.pivotReactionGridSize, mask
      )
      const pivot = matchSequence(pivotReaction, pivotMovie, {
        runnerUpExclusionFrames: BODY_SCAN.pivotRunnerUpExclusionFrames
      })
      if (pivot && (!selected || pivot.confidence > selected.pivot.confidence)) selected = { pivot, geometry, mask }
    }
    if (!selected || selected.pivot.confidence < BODY_SCAN.minimumPivotConfidence ||
      Math.abs(selected.pivot.reactionTime - intro.referenceReactionTime) < BODY_SCAN.minimumPivotSeparationSeconds) {
      return { anchors: [], consensus: null, geometry: intro.geometry, mask: intro.mask }
    }
    const { pivot, geometry, mask } = selected

    const estimatedRate = (pivot.movieTime - intro.referenceMovieTime) / (pivot.reactionTime - intro.referenceReactionTime)
    if (!Number.isFinite(estimatedRate) ||
      estimatedRate < COARSE_RATE_BAND.min || estimatedRate > COARSE_RATE_BAND.max) {
      return { anchors: [], consensus: null, geometry, mask }
    }
    const probeTimes = PROBE_FRACTIONS
      .map((fraction) => reactionInfo.duration * fraction)
      .filter((time) =>
        time > BODY_SCAN.probeEdgeMarginSeconds &&
        time < reactionInfo.duration - BODY_SCAN.probeEdgeMarginSeconds
      )
    const anchors: AutoSyncAnchor[] = [pivot]
    const candidateGroups: SequenceMatchCandidate[][] = []
    for (let index = 0; index < probeTimes.length; index += 1) {
      const reactionTime = probeTimes[index]
      this.progress(
        session.id,
        'scanning',
        AUTO_SYNC_PROGRESS.bodyScanStart +
          Math.round(index / Math.max(1, probeTimes.length) * AUTO_SYNC_PROGRESS.bodyScanRange),
        'Checking moments throughout the watchalong…'
      )
      if (Math.abs(reactionTime - pivot.reactionTime) < BODY_SCAN.probePivotExclusionSeconds) continue
      const predictedMovieTime = intro.referenceMovieTime + (reactionTime - intro.referenceReactionTime) * estimatedRate
      const reactionStart = Math.max(0, reactionTime - BODY_SCAN.reactionHalfWindowSeconds)
      const movieStart = Math.max(0, predictedMovieTime - BODY_SCAN.movieHalfWindowSeconds)
      const [reaction, movie] = await Promise.all([
        this.extractSignatures(
          session.reactionPath!, reactionStart,
          BODY_SCAN.reactionDurationSeconds, BODY_SCAN.reactionFps,
          BODY_SCAN.reactionWidth, BODY_SCAN.reactionHeight,
          geometry, signal, BODY_SCAN.reactionGridSize, mask
        ),
        this.extractSignatures(
          session.moviePath!, movieStart,
          BODY_SCAN.movieDurationSeconds, BODY_SCAN.movieFps,
          BODY_SCAN.movieWidth, BODY_SCAN.movieHeight,
          undefined, signal, BODY_SCAN.movieGridSize
        )
      ])
      const candidates = findSequenceMatchCandidates(reaction, movie)
      if (candidates.length) candidateGroups.push(candidates)
    }
    const body = resolveCandidateGroups(candidateGroups, {
      offsetBinSeconds: BODY_SCAN.houghOffsetBinSeconds,
      inlierToleranceSeconds: BODY_SCAN.houghInlierToleranceSeconds
    }, BODY_SCAN.runnerUpExclusionFrames, BODY_SCAN.minimumAnchorConfidence)
    anchors.push(...body.anchors)
    return { anchors, consensus: body.consensus, geometry, mask }
  }

  private async refineAnchors(
    session: LibrarySession,
    anchors: AutoSyncAnchor[],
    geometry: InsetGeometry,
    mask: SignatureCellMask | null,
    signal: AbortSignal,
    reportProgress = true
  ): Promise<AnchorMatchSet> {
    const candidateGroups: SequenceMatchCandidate[][] = []
    for (let index = 0; index < Math.min(REFINEMENT_SCAN.maximumAnchors, anchors.length); index += 1) {
      const anchor = anchors[index]
      if (reportProgress) {
        this.progress(
          session.id,
          'refining',
          AUTO_SYNC_PROGRESS.anchorRefinementStart +
            Math.round((index / Math.max(1, anchors.length)) * AUTO_SYNC_PROGRESS.anchorRefinementRange),
          'Checking the timing at several points…'
        )
      }
      const reactionStart = Math.max(0, anchor.reactionTime - REFINEMENT_SCAN.reactionHalfWindowSeconds)
      const movieStart = Math.max(0, anchor.movieTime - REFINEMENT_SCAN.movieHalfWindowSeconds)
      const [reaction, movie] = await Promise.all([
        this.extractSignatures(
          session.reactionPath!, reactionStart,
          REFINEMENT_SCAN.reactionDurationSeconds, REFINEMENT_SCAN.reactionFps,
          REFINEMENT_SCAN.reactionWidth, REFINEMENT_SCAN.reactionHeight,
          geometry, signal, REFINEMENT_SCAN.reactionGridSize, mask
        ),
        this.extractSignatures(
          session.moviePath!, movieStart,
          REFINEMENT_SCAN.movieDurationSeconds, REFINEMENT_SCAN.movieFps,
          REFINEMENT_SCAN.movieWidth, REFINEMENT_SCAN.movieHeight,
          undefined, signal
        )
      ])
      const candidates = findSequenceMatchCandidates(reaction, movie)
      if (candidates.length) candidateGroups.push(candidates)
    }
    return resolveCandidateGroups(candidateGroups, {
      offsetBinSeconds: REFINEMENT_SCAN.houghOffsetBinSeconds,
      inlierToleranceSeconds: REFINEMENT_SCAN.houghInlierToleranceSeconds
    }, REFINEMENT_SCAN.runnerUpExclusionFrames, REFINEMENT_SCAN.minimumAnchorConfidence)
  }

  private async extractPixelFrames(
    filePath: string,
    start: number,
    duration: number,
    fps: number,
    width: number,
    height: number,
    signal: AbortSignal
  ): Promise<TimedPixelFrame[]> {
    const frames: TimedPixelFrame[] = []
    await this.options.backend.extractFrames(filePath, { start, duration, fps, width, height }, signal, (frame, time) => {
      frames.push({ ...frame, time })
    })
    return frames
  }

  private async extractSignatures(
    filePath: string,
    start: number,
    duration: number,
    fps: number,
    width: number,
    height: number,
    geometry: InsetGeometry | undefined,
    signal: AbortSignal,
    gridSize = DEFAULT_SIGNATURE_GRID_SIZE,
    mask: SignatureCellMask | null = null
  ): Promise<TimedSignature[]> {
    const signatures: TimedSignature[] = []
    await this.options.backend.extractFrames(filePath, { start, duration, fps, width, height }, signal, (frame, time) => {
      const signature = createFrameSignature(frame, geometry
          ? { crop: geometry, flipHorizontal: geometry.flipHorizontal, gridSize }
          : { gridSize })
      signatures.push({ time, signature: applySignatureMask(signature, mask ?? undefined) })
    })
    return signatures
  }

  private commit(sessionId: string, offsetSeconds: number, movieRateCorrection: number, confidence: number, detectedMovieFps: number): void {
    this.options.sessions.updateSession(sessionId, {
      offsetSeconds,
      movieRateCorrection,
      detectedMovieFps,
      timingOrigin: 'automatic',
      autoSyncConfidence: confidence,
      autoSyncAnalyzedAt: this.now().toISOString(),
      autoSyncAlgorithmVersion: AUTO_SYNC_ALGORITHM_VERSION
    })
  }

  private completePartial(
    sessionId: string,
    intent: AutoSyncIntent,
    offsetSeconds: number,
    movieRateCorrection: number,
    confidence: number,
    anchorCount: number,
    detectedMovieFps: number
  ): AutoSyncCompleteEvent {
    if (intent === 'initial') {
      this.commit(sessionId, offsetSeconds, movieRateCorrection, confidence, detectedMovieFps)
    }
    return {
      sessionId,
      outcome: 'partial',
      message: intent === 'initial'
        ? 'WatchAlong found the starting point. Please give the timing a quick check before you begin.'
        : 'WatchAlong found a possible starting point, but kept your existing timing because the new result was not certain enough.',
      offsetSeconds,
      movieRateCorrection,
      confidence,
      anchorCount
    }
  }

  private completeReadyOpeningPartial(
    sessionId: string,
    offsetSeconds: number,
    movieRateCorrection: number,
    confidence: number,
    anchorCount: number,
    detectedMovieFps: number
  ): AutoSyncCompleteEvent {
    // The opening establishes a trustworthy intercept, but not enough
    // full-runtime evidence to claim a drift-aware confident result. Commit
    // that honest partial for both import and an explicit recheck so the UI
    // can continue directly into playback without pretending it was a full
    // timeline fit.
    this.commit(sessionId, offsetSeconds, movieRateCorrection, confidence, detectedMovieFps)
    return {
      sessionId,
      outcome: 'partial',
      readyToPlay: true,
      message: 'Ready — WatchAlong found the starting point from the visible opening.',
      offsetSeconds,
      movieRateCorrection,
      confidence,
      anchorCount
    }
  }

  private progress(sessionId: string, phase: AutoSyncProgressEvent['phase'], percent: number, message: string): void {
    this.options.emitProgress({
      sessionId,
      phase,
      percent: Math.min(AUTO_SYNC_PROGRESS.maximum, Math.max(0, percent)),
      message
    })
  }
}

function completeFromFit(sessionId: string, outcome: 'confident', fit: AutoSyncFit, message: string): AutoSyncCompleteEvent {
  return {
    sessionId,
    outcome,
    message,
    offsetSeconds: fit.offsetSeconds,
    movieRateCorrection: fit.movieRateCorrection,
    confidence: fit.confidence,
    anchorCount: fit.anchors.length
  }
}

function offsetStatsForRate(anchors: AutoSyncAnchor[], rate: number): { offsetSeconds: number; maximumDeviation: number; count: number } | null {
  if (!anchors.length) return null
  const values = anchors.map((anchor) => anchor.movieTime - rate * anchor.reactionTime).sort((a, b) => a - b)
  const offsetSeconds = values[Math.floor(values.length / 2)]
  return {
    offsetSeconds: Number(offsetSeconds.toFixed(OFFSET_DECIMAL_PLACES)),
    maximumDeviation: Math.max(...values.map((value) => Math.abs(value - offsetSeconds))),
    count: values.length
  }
}

function fallback(sessionId: string, message: string): AutoSyncCompleteEvent {
  return { sessionId, outcome: 'fallback', message }
}

function stale(sessionId: string): AutoSyncCompleteEvent {
  return {
    sessionId,
    outcome: 'stale',
    message: 'The files or timing changed while WatchAlong was checking, so the old result was safely ignored.'
  }
}

function snapshotSession(session: LibrarySession): LibrarySession {
  return {
    ...session,
    overlay: { ...session.overlay },
    movieWindowGeometry: { ...session.movieWindowGeometry }
  }
}

function friendlyError(error: unknown): string {
  const detail = error instanceof Error ? error.message : ''
  if (/video stream|invalid data|could not be analyzed/i.test(detail)) return 'One of these files could not be read clearly. Your existing timing was left unchanged.'
  return 'Automatic sync couldn’t finish this time. Your existing timing was left unchanged.'
}
