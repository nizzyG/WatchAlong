import type { LibrarySession } from '@shared/types'
import { median } from '@shared/numeric'
import type { MediaInfo } from './ffmpegBackend'
import {
  findInsetGeometry,
  generateCompactCornerCandidates,
  generateGeometryCandidates,
  type GeometryOptions,
  type InsetGeometry,
  type InsetGeometryResult,
  type TimedPixelFrame
} from './insetGeometry'
import {
  findSequenceMatchCandidates,
  sequenceActivity,
  selectBurstWeightedMatches,
  type AutoSyncAnchor,
  type SequenceMatchCandidate,
  type TimedSignature
} from './matching'
import { createFrameSignature, type SignatureCellMask } from './signatures'
import {
  GEOMETRY_SCAN,
  GEOMETRY_KEY_DECIMAL_PLACES,
  OFFSET_DECIMAL_PLACES,
  OPENING_CANDIDATE_HEIGHTS,
  OPENING_CANDIDATE_VERTICAL_POSITIONS,
  OPENING_CANDIDATE_WIDTHS,
  OPENING_CANDIDATE_X_POSITIONS,
  OPENING_CANDIDATE_Y_POSITIONS,
  OPENING_EVIDENCE,
  OPENING_MOTION,
  OPENING_MOTION_SCAN,
  OPENING_PREFIX_SCAN,
  OPENING_PROBE_TIMES,
  OPENING_SCAN
} from './constants'

export interface DetectedInset extends InsetGeometryResult {
  openingOnly: boolean
  openingMotionOffset: number | null
}

export interface OffsetStats {
  offsetSeconds: number
  maximumDeviation: number
  count: number
}

export interface OffsetStatsOptions {
  maximumDeviationSeconds?: number
  decimalPlaces?: number
}

export interface OpeningScanResult {
  anchors: AutoSyncAnchor[]
  consensus: null
}

export type PixelFrameExtractor = (
  filePath: string,
  start: number,
  duration: number,
  fps: number,
  width: number,
  height: number,
  signal: AbortSignal
) => Promise<TimedPixelFrame[]>

export type SignatureExtractor = (
  filePath: string,
  start: number,
  duration: number,
  fps: number,
  width: number,
  height: number,
  geometry: InsetGeometry | undefined,
  signal: AbortSignal,
  gridSize?: number,
  mask?: SignatureCellMask | null
) => Promise<TimedSignature[]>

export type OpeningMotionOffsetFinder = (
  session: LibrarySession,
  intro: DetectedInset,
  signal: AbortSignal
) => Promise<number | null>

export interface OpeningEvidenceStats {
  offsetSeconds: number
  maximumDeviation: number
  count: number
  spanSeconds: number
}

export function offsetStatsForRate(
  anchors: AutoSyncAnchor[],
  rate: number,
  options: OffsetStatsOptions = {}
): OffsetStats | null {
  if (!anchors.length) return null
  const values = anchors.map((anchor) => anchor.movieTime - rate * anchor.reactionTime).sort((a, b) => a - b)
  // Preserve the algorithm's upper median for even-sized sets. The shared
  // numeric median intentionally averages them and is not equivalent here.
  const offsetSeconds = values[Math.floor(values.length / 2)]
  const maximumDeviation = Math.max(...values.map((value) => Math.abs(value - offsetSeconds)))
  if (maximumDeviation > (options.maximumDeviationSeconds ?? Number.POSITIVE_INFINITY)) return null
  return {
    offsetSeconds: Number(offsetSeconds.toFixed(options.decimalPlaces ?? OFFSET_DECIMAL_PLACES)),
    maximumDeviation,
    count: values.length
  }
}

export async function findOpeningPrefixInset(
  session: LibrarySession,
  movieInfo: MediaInfo,
  reactionInfo: MediaInfo,
  reactionFrames: TimedPixelFrame[],
  movie: TimedSignature[],
  geometryOptions: GeometryOptions,
  signal: AbortSignal,
  extractPixelFrames: PixelFrameExtractor,
  findMotionOffset: OpeningMotionOffsetFinder
): Promise<DetectedInset | null> {
  const openingCandidates = expandOpeningCandidatePositions(generateGeometryCandidates(
    reactionInfo.width / reactionInfo.height,
    movieInfo.width / movieInfo.height
  ).filter((candidate) =>
    candidate.width <= GEOMETRY_SCAN.openingCandidateMaximumWidth &&
    candidate.height <= GEOMETRY_SCAN.openingCandidateMaximumHeight
  ))
  const [timerReactionFrames, timerMovieFrames] = await Promise.all([
    extractPixelFrames(
      session.reactionPath!, 0,
      Math.min(OPENING_PREFIX_SCAN.timerReactionDurationSeconds, reactionInfo.duration), GEOMETRY_SCAN.fps,
      OPENING_PREFIX_SCAN.timerReactionWidth, OPENING_PREFIX_SCAN.timerReactionHeight, signal
    ),
    extractPixelFrames(
      session.moviePath!, 0,
      Math.min(OPENING_PREFIX_SCAN.timerMovieDurationSeconds, movieInfo.duration), GEOMETRY_SCAN.fps,
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
      const motionOffset = await findMotionOffset(session, candidate, signal)
      if (motionOffset === null ||
        Math.abs(motionOffset - coarse.offsetSeconds) > OPENING_PREFIX_SCAN.maximumMotionDisagreementSeconds) continue
      validated.push({ ...candidate, openingMotionOffset: motionOffset })
    }
    validated.sort((left, right) =>
      right.anchors.length - left.anchors.length ||
      right.confidence - left.confidence
    )
    const first = validated[0] ?? null
    if (first) return first
  }
  return null
}

export async function scanOpeningTimelines(
  session: LibrarySession,
  movieInfo: MediaInfo,
  reactionInfo: MediaInfo,
  intro: DetectedInset,
  signal: AbortSignal,
  extractSignatures: SignatureExtractor
): Promise<OpeningScanResult> {
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
    extractSignatures(
      session.reactionPath!, predictedReactionStart, reactionDuration, fps,
      OPENING_SCAN.reactionWidth, OPENING_SCAN.reactionHeight,
      intro.geometry, signal, OPENING_SCAN.gridSize, intro.mask
    ),
    extractSignatures(
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

export async function findOpeningMotionOffset(
  session: LibrarySession,
  intro: DetectedInset,
  signal: AbortSignal,
  extractSignatures: SignatureExtractor
): Promise<number | null> {
  const predictedStart = -intro.initialOffsetSeconds
  if (!Number.isFinite(predictedStart) || predictedStart < 0) return null
  const start = Math.max(0, predictedStart - OPENING_MOTION_SCAN.prerollSeconds)
  const signatures = await extractSignatures(
    session.reactionPath!, start, OPENING_MOTION_SCAN.durationSeconds, OPENING_MOTION_SCAN.fps,
    OPENING_MOTION_SCAN.width, OPENING_MOTION_SCAN.height,
    intro.geometry, signal, OPENING_MOTION_SCAN.gridSize, intro.mask
  )
  const motionStart = detectSustainedOpeningMotion(signatures, predictedStart)
  return motionStart === null ? null : Number((-motionStart).toFixed(OPENING_MOTION_SCAN.resultDecimalPlaces))
}

export function signatureWindow(signatures: TimedSignature[], centerTime: number, size: number): TimedSignature[] {
  if (!signatures.length || size < OPENING_EVIDENCE.minimumWindowSize) return []
  let center = 0
  let nearest = Number.POSITIVE_INFINITY
  for (let index = 0; index < signatures.length; index += 1) {
    const distance = Math.abs(signatures[index].time - centerTime)
    if (distance < nearest) {
      nearest = distance
      center = index
    }
  }
  const half = Math.floor(size / 2)
  if (center < half || center + half >= signatures.length) return []
  return signatures.slice(center - half, center + half + 1)
}

export function openingEvidenceStats(anchors: AutoSyncAnchor[], rate: number): OpeningEvidenceStats | null {
  const distinct = dedupeOpeningAnchors(anchors)
  if (distinct.length < OPENING_EVIDENCE.minimumAnchors) return null
  let best: AutoSyncAnchor[] = []
  let bestConfidence = 0
  for (const candidate of distinct) {
    const offset = candidate.movieTime - rate * candidate.reactionTime
    const cluster = distinct.filter((anchor) =>
      Math.abs((anchor.movieTime - rate * anchor.reactionTime) - offset) <=
        OPENING_EVIDENCE.clusterToleranceSeconds
    )
    const confidence = cluster.reduce((sum, anchor) => sum + anchor.confidence, 0)
    if (cluster.length > best.length || (cluster.length === best.length && confidence > bestConfidence)) {
      best = cluster
      bestConfidence = confidence
    }
  }
  if (best.length < OPENING_EVIDENCE.minimumAnchors) return null
  const spanSeconds = Math.max(...best.map((anchor) => anchor.reactionTime)) -
    Math.min(...best.map((anchor) => anchor.reactionTime))
  if (spanSeconds < OPENING_EVIDENCE.minimumSpanSeconds) return null
  const stats = offsetStatsForRate(best, rate, {
    maximumDeviationSeconds: OPENING_EVIDENCE.maximumDeviationSeconds,
    decimalPlaces: OPENING_EVIDENCE.offsetDecimalPlaces
  })
  if (!stats) return null
  return {
    ...stats,
    spanSeconds
  }
}

export function detectSustainedOpeningMotion(signatures: TimedSignature[], predictedStart: number): number | null {
  if (signatures.length < OPENING_MOTION.minimumSignatures || !Number.isFinite(predictedStart)) return null
  const activity = signatures.slice(1).map((current, index) => ({
    time: current.time,
    value: upperTailLumaChange(
      signatures[index].signature.luma,
      current.signature.luma,
      combinedCellWeights(signatures[index].signature.cellWeights, current.signature.cellWeights)
    )
  }))
  const candidates = activity.filter((item) =>
    item.time >= predictedStart - OPENING_MOTION.searchBeforeSeconds &&
    item.time <= predictedStart + OPENING_MOTION.searchAfterSeconds
  )
  const matches: Array<{ time: number; strength: number }> = []
  for (const candidate of candidates) {
    const before = activity
      .filter((item) =>
        item.time >= candidate.time - OPENING_MOTION.quietWindowSeconds && item.time < candidate.time
      )
      .map((item) => item.value)
    const after = activity
      .filter((item) =>
        item.time >= candidate.time && item.time <= candidate.time + OPENING_MOTION.movingWindowSeconds
      )
      .map((item) => item.value)
    if (before.length < OPENING_MOTION.minimumQuietSamples ||
      after.length < OPENING_MOTION.minimumMovingSamples) continue
    const quiet = before.length ? median(before) : 0
    const moving = after.length ? median(after) : 0
    if (quiet <= OPENING_MOTION.maximumQuietActivity &&
      moving >= OPENING_MOTION.minimumMovingActivity &&
      moving >= quiet * OPENING_MOTION.minimumActivityMultiplier + OPENING_MOTION.minimumActivityDelta) {
      matches.push({ time: candidate.time + OPENING_MOTION.timeAdjustmentSeconds, strength: moving - quiet })
    }
  }
  return matches.sort((left, right) =>
    Math.abs(left.time - predictedStart) - Math.abs(right.time - predictedStart) ||
    right.strength - left.strength
  )[0]?.time ?? null
}

export function expandOpeningCandidatePositions<T extends { x: number; y: number; width: number; height: number }>(
  candidates: T[]
): T[] {
  const seen = new Set<string>()
  return candidates.flatMap((candidate) => [candidate, ...OPENING_CANDIDATE_VERTICAL_POSITIONS.map((vertical) => ({
    ...candidate,
    y: (1 - candidate.height) * vertical
  }))]).filter((candidate) => {
    const key = [candidate.x, candidate.y, candidate.width, candidate.height]
      .map((value) => value.toFixed(GEOMETRY_KEY_DECIMAL_PLACES)).join(':')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function generateOpeningInsetCandidates(): Array<{ x: number; y: number; width: number; height: number }> {
  const candidates: Array<{ x: number; y: number; width: number; height: number }> = []
  // Some reactions place a shallow reference player low and centered. Search
  // that physical layout densely, but keep it separate from the general pass
  // so faces and room backgrounds cannot win merely by being large crops.
  for (const x of OPENING_CANDIDATE_X_POSITIONS) {
    for (const y of OPENING_CANDIDATE_Y_POSITIONS) {
      for (const width of OPENING_CANDIDATE_WIDTHS) {
        for (const height of OPENING_CANDIDATE_HEIGHTS) {
          if (x + width <= 1 && y + height <= 1) candidates.push({ x, y, width, height })
        }
      }
    }
  }
  return candidates
}

function dedupeOpeningAnchors(anchors: AutoSyncAnchor[]): AutoSyncAnchor[] {
  return [...anchors]
    .sort((left, right) => right.confidence - left.confidence)
    .filter((anchor, index, ranked) => !ranked.slice(0, index).some((kept) =>
      Math.abs(kept.reactionTime - anchor.reactionTime) < OPENING_EVIDENCE.anchorDedupeToleranceSeconds ||
      Math.abs(kept.movieTime - anchor.movieTime) < OPENING_EVIDENCE.anchorDedupeToleranceSeconds
    ))
    .sort((left, right) => left.reactionTime - right.reactionTime)
}

function upperTailLumaChange(left: Float32Array, right: Float32Array, weights?: Float32Array): number {
  if (left.length !== right.length || left.length === 0) return 0
  const differences = Array.from(left, (value, index) => Math.abs(value - right[index]) * (weights?.[index] ?? 1))
    .sort((a, b) => b - a)
  const count = Math.max(1, Math.ceil(differences.length * OPENING_MOTION.upperActivityFraction))
  return differences.slice(0, count).reduce((sum, value) => sum + value, 0) / count
}

function combinedCellWeights(left?: Float32Array, right?: Float32Array): Float32Array | undefined {
  if (!left && !right) return undefined
  const length = left?.length ?? right?.length ?? 0
  return Float32Array.from({ length }, (_, index) => Math.min(left?.[index] ?? 1, right?.[index] ?? 1))
}
