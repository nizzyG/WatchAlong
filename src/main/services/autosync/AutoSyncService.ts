import type {
  AutoSyncCompleteEvent,
  AutoSyncIntent,
  AutoSyncProgressEvent,
  LibrarySession,
  SessionLibrary,
  StartAutoSyncResult
} from '@shared/types'
import {
  fitAnchors,
  isConfidentFit,
  isReliableConsensusEvidence,
  type AutoSyncFit,
  type FitConsensusEvidence
} from './fitting'
import { voteForTemporalConsensus, type HoughConsensus, type HoughVotingOptions } from './houghVoting'
import {
  findInsetGeometry,
  generateCompactCornerCandidates,
  refineGeometryCandidates,
  type InsetGeometry,
  type TimedPixelFrame
} from './insetGeometry'
import {
  applyBurstinessReweighting,
  findSequenceMatchCandidates,
  matchSequence,
  selectBurstWeightedMatches,
  type AutoSyncAnchor,
  type SequenceMatchCandidate,
  type TimedSignature
} from './matching'
import { applySignatureMask, createFrameSignature, type SignatureCellMask } from './signatures'
import type { AutoSyncMediaBackend, MediaInfo } from './ffmpegBackend'

export const AUTO_SYNC_ALGORITHM_VERSION = 2

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
}

interface AnchorMatchSet {
  anchors: AutoSyncAnchor[]
  consensus: HoughConsensus | null
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
    const effectiveSignal = options.signal ?? new AbortController().signal
    try {
      this.progress(sessionId, 'preparing', 3, 'Checking both videos…')
      const [movieInfo, reactionInfo] = await Promise.all([
        this.options.backend.probe(session.moviePath, effectiveSignal),
        this.options.backend.probe(session.reactionPath, effectiveSignal)
      ])

      this.progress(sessionId, 'finding-inset', 10, 'Finding the movie inside the reaction…')
      const intro = await this.findGeometry(session, movieInfo, reactionInfo, effectiveSignal)
      if (!intro) return fallback(sessionId, 'WatchAlong couldn’t clearly see the movie in this reaction. You can line it up manually.')

      this.progress(sessionId, 'scanning', 30, 'Comparing moments across the watchalong…')
      const scan = await this.scanTimelines(session, movieInfo, reactionInfo, intro, effectiveSignal)
      const coarse = scan.anchors
      this.progress(sessionId, 'refining', 72, 'Double-checking the best matches…')
      const refined = await this.refineAnchors(session, coarse, scan.geometry, scan.mask, effectiveSignal)
      const refinedFit = fitMatchSet(refined, movieInfo.duration)
      const coarseFit = fitMatchSet({ anchors: coarse, consensus: scan.consensus }, movieInfo.duration)
      // A refinement is only better when its complete evidence is stronger.
      // This also prevents a marginal refined pass from hiding a valid coarse fit.
      const fit = choosePreferredFit(refinedFit, coarseFit)
      const current = this.options.sessions.getSession(sessionId)
      if (!isAnalysisSnapshotCurrent(current, session)) return stale(sessionId)

      this.progress(sessionId, 'finishing', 94, 'Finishing the timing…')
      if (fit && isConfidentFit(fit)) {
        this.commit(sessionId, fit.offsetSeconds, fit.movieRateCorrection, fit.confidence, movieInfo.frameRate)
        return completeFromFit(sessionId, 'confident', fit, 'Ready — WatchAlong found the timing and will keep both videos together.')
      }

      const refinedIntro = await this.refineAnchors(session, intro.anchors, intro.geometry, intro.mask, effectiveSignal, false)
      const latest = this.options.sessions.getSession(sessionId)
      if (!isAnalysisSnapshotCurrent(latest, session)) return stale(sessionId)
      const introOffset = offsetStatsForRate(refinedIntro.anchors, latest.movieRateCorrection)
      const bodyOffset = offsetStatsForRate(refined.anchors, latest.movieRateCorrection)
      const partialOffset = introOffset && bodyOffset && Math.abs(bodyOffset.offsetSeconds - introOffset.offsetSeconds) <= 2
        ? bodyOffset.offsetSeconds
        : introOffset?.offsetSeconds
      const introOffsetIsReliable = Boolean(introOffset && introOffset.count >= 3 && introOffset.maximumDeviation <= 2)
      if (intro.confidence >= 0.5 && introOffsetIsReliable && partialOffset !== undefined && Number.isFinite(partialOffset)) {
        // A marginal drift estimate is useful evidence, but not safe to apply.
        // Keep the user's current rate and only prefill the well-supported start point.
        const rate = latest.movieRateCorrection
        const confidence = Math.min(0.69, fit?.confidence ?? intro.confidence)
        if (options.intent === 'initial') {
          this.commit(sessionId, partialOffset, rate, confidence, movieInfo.frameRate)
        }
        return {
          sessionId,
          outcome: 'partial',
          message: options.intent === 'initial'
            ? 'WatchAlong found the starting point. Please give the timing a quick check before you begin.'
            : 'WatchAlong found a possible starting point, but kept your existing timing because the new result was not certain enough.',
          offsetSeconds: partialOffset,
          movieRateCorrection: rate,
          confidence,
          anchorCount: introOffset!.count
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
    const fps = 0.25
    const reactionDuration = Math.min(reactionInfo.duration, 480)
    const movieDuration = Math.min(movieInfo.duration, 300)
    const [reactionFrames, movieFrames] = await Promise.all([
      this.extractPixelFrames(session.reactionPath!, 0, reactionDuration, fps, 96, 54, signal),
      this.extractPixelFrames(session.moviePath!, 0, movieDuration, fps, 64, 36, signal)
    ])
    const movie = movieFrames.map((frame) => ({ time: frame.time, signature: createFrameSignature(frame, { gridSize: 6 }) }))
    const geometryOptions = {
      movieAspectRatio: movieInfo.width / movieInfo.height,
      gridSize: 6,
      minimumConfidence: 0.4
    }
    const first = findInsetGeometry(reactionFrames, movie, geometryOptions) ?? findInsetGeometry(reactionFrames, movie, {
      ...geometryOptions,
      candidates: generateCompactCornerCandidates(
        reactionInfo.width / reactionInfo.height,
        movieInfo.width / movieInfo.height
      )
    })
    if (!first) return null
    const refinedCandidates = refineGeometryCandidates(first.geometry, reactionInfo.width / reactionInfo.height, movieInfo.width / movieInfo.height)
    const refined = findInsetGeometry(reactionFrames, movie, {
      movieAspectRatio: movieInfo.width / movieInfo.height,
      gridSize: 6,
      minimumConfidence: 0.38,
      candidates: refinedCandidates
    })
    return refined && refined.confidence > first.confidence ? refined : first
  }

  private async scanTimelines(
    session: LibrarySession,
    movieInfo: MediaInfo,
    reactionInfo: MediaInfo,
    intro: DetectedInset,
    signal: AbortSignal
  ): Promise<{ anchors: AutoSyncAnchor[]; consensus: HoughConsensus | null; geometry: InsetGeometry; mask: SignatureCellMask | null }> {
    const pivotReactionTime = clamp(reactionInfo.duration * 0.55, 30, reactionInfo.duration - 30)
    const reactionSpan = pivotReactionTime - intro.referenceReactionTime
    const possibleMovieTimes = [0.9, 1.1].map((rate) => intro.referenceMovieTime + reactionSpan * rate)
    const pivotMovieStart = clamp(Math.min(...possibleMovieTimes) - 20, 0, movieInfo.duration)
    const pivotMovieEnd = clamp(Math.max(...possibleMovieTimes) + 20, pivotMovieStart, movieInfo.duration)
    const pivotMovie = await this.extractSignatures(
      session.moviePath!, pivotMovieStart, Math.max(1, pivotMovieEnd - pivotMovieStart), 0.5, 96, 54, undefined, signal, 10
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
        session.reactionPath!, Math.max(0, pivotReactionTime - 14), 28, 0.5, 128, 72, geometry, signal, 10, mask
      )
      const pivot = matchSequence(pivotReaction, pivotMovie, { runnerUpExclusionFrames: 20 })
      if (pivot && (!selected || pivot.confidence > selected.pivot.confidence)) selected = { pivot, geometry, mask }
    }
    if (!selected || selected.pivot.confidence < 0.32 || Math.abs(selected.pivot.reactionTime - intro.referenceReactionTime) < 30) {
      return { anchors: [], consensus: null, geometry: intro.geometry, mask: intro.mask }
    }
    const { pivot, geometry, mask } = selected

    const estimatedRate = (pivot.movieTime - intro.referenceMovieTime) / (pivot.reactionTime - intro.referenceReactionTime)
    if (!Number.isFinite(estimatedRate) || estimatedRate < 0.88 || estimatedRate > 1.12) {
      return { anchors: [], consensus: null, geometry, mask }
    }
    const probeTimes = [0.08, 0.2, 0.38, 0.56, 0.74, 0.9]
      .map((fraction) => reactionInfo.duration * fraction)
      .filter((time) => time > 20 && time < reactionInfo.duration - 20)
    const anchors: AutoSyncAnchor[] = [pivot]
    const candidateGroups: SequenceMatchCandidate[][] = []
    for (let index = 0; index < probeTimes.length; index += 1) {
      const reactionTime = probeTimes[index]
      this.progress(session.id, 'scanning', 35 + Math.round(index / Math.max(1, probeTimes.length) * 32), 'Checking moments throughout the watchalong…')
      if (Math.abs(reactionTime - pivot.reactionTime) < 20) continue
      const predictedMovieTime = intro.referenceMovieTime + (reactionTime - intro.referenceReactionTime) * estimatedRate
      const reactionStart = Math.max(0, reactionTime - 5)
      const movieStart = Math.max(0, predictedMovieTime - 14)
      const [reaction, movie] = await Promise.all([
        this.extractSignatures(session.reactionPath!, reactionStart, 10, 2, 128, 72, geometry, signal, 10, mask),
        this.extractSignatures(session.moviePath!, movieStart, 28, 2, 96, 54, undefined, signal, 10)
      ])
      const candidates = findSequenceMatchCandidates(reaction, movie)
      if (candidates.length) candidateGroups.push(candidates)
    }
    const body = resolveCandidateGroups(candidateGroups, {
      offsetBinSeconds: 0.5,
      inlierToleranceSeconds: 0.75
    }, 12, 0.35)
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
    for (let index = 0; index < Math.min(8, anchors.length); index += 1) {
      const anchor = anchors[index]
      if (reportProgress) {
        this.progress(session.id, 'refining', 72 + Math.round((index / Math.max(1, anchors.length)) * 18), 'Checking the timing at several points…')
      }
      const reactionStart = Math.max(0, anchor.reactionTime - 5)
      const movieStart = Math.max(0, anchor.movieTime - 7)
      const [reaction, movie] = await Promise.all([
        this.extractSignatures(session.reactionPath!, reactionStart, 10, 4, 192, 108, geometry, signal, 12, mask),
        this.extractSignatures(session.moviePath!, movieStart, 14, 4, 128, 72, undefined, signal)
      ])
      const candidates = findSequenceMatchCandidates(reaction, movie)
      if (candidates.length) candidateGroups.push(candidates)
    }
    return resolveCandidateGroups(candidateGroups, {
      offsetBinSeconds: 0.25,
      inlierToleranceSeconds: 0.5
    }, 20, 0.4)
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
    gridSize = 12,
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

  private progress(sessionId: string, phase: AutoSyncProgressEvent['phase'], percent: number, message: string): void {
    this.options.emitProgress({ sessionId, phase, percent: Math.min(100, Math.max(0, percent)), message })
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
    offsetSeconds: Number(offsetSeconds.toFixed(6)),
    maximumDeviation: Math.max(...values.map((value) => Math.abs(value - offsetSeconds))),
    count: values.length
  }
}

function resolveCandidateGroups(
  candidateGroups: SequenceMatchCandidate[][],
  houghOptions: HoughVotingOptions,
  runnerUpExclusionFrames: number,
  minimumConfidence: number
): AnchorMatchSet {
  const weighted = applyBurstinessReweighting(candidateGroups)
  const consensus = voteForTemporalConsensus(weighted, houghOptions)
  if (consensus && isReliableConsensusEvidence(consensusEvidence(consensus))) {
    return { anchors: consensus.anchors, consensus }
  }
  return {
    anchors: selectBurstWeightedMatches(candidateGroups, { runnerUpExclusionFrames })
      .filter((match) => match.confidence >= minimumConfidence),
    consensus: null
  }
}

function fitMatchSet(matched: AnchorMatchSet, movieDuration: number): AutoSyncFit | null {
  if (!matched.consensus || matched.anchors.length < 3) return null
  return fitAnchors(matched.anchors, {
    movieDuration,
    seedAnchors: matched.consensus.anchors,
    consensusEvidence: consensusEvidence(matched.consensus)
  })
}

function consensusEvidence(consensus: HoughConsensus): FitConsensusEvidence {
  return {
    peakMargin: consensus.peakMargin,
    supportFraction: consensus.supportFraction,
    meanSimilarity: consensus.meanSimilarity,
    meanSeedResidual: consensus.meanSeedResidual,
    maximumSeedResidual: consensus.maximumSeedResidual
  }
}

function choosePreferredFit(...fits: Array<AutoSyncFit | null>): AutoSyncFit | null {
  return fits.filter((fit): fit is AutoSyncFit => Boolean(fit)).sort((a, b) =>
    Number(isConfidentFit(b)) - Number(isConfidentFit(a)) ||
    b.confidence - a.confidence
  )[0] ?? null
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

function isAnalysisSnapshotCurrent(
  current: LibrarySession | null,
  snapshot: LibrarySession
): current is LibrarySession {
  return Boolean(
    current &&
    current.moviePath === snapshot.moviePath &&
    current.reactionPath === snapshot.reactionPath &&
    current.offsetSeconds === snapshot.offsetSeconds &&
    current.movieRateCorrection === snapshot.movieRateCorrection &&
    current.reactorSource === snapshot.reactorSource &&
    current.detectedMovieFps === snapshot.detectedMovieFps &&
    current.timingOrigin === snapshot.timingOrigin &&
    current.autoSyncConfidence === snapshot.autoSyncConfidence &&
    current.autoSyncAnalyzedAt === snapshot.autoSyncAnalyzedAt &&
    current.autoSyncAlgorithmVersion === snapshot.autoSyncAlgorithmVersion
  )
}

function friendlyError(error: unknown): string {
  const detail = error instanceof Error ? error.message : ''
  if (/video stream|invalid data|could not be analyzed/i.test(detail)) return 'One of these files could not be read clearly. Your existing timing was left unchanged.'
  return 'Automatic sync couldn’t finish this time. Your existing timing was left unchanged.'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
