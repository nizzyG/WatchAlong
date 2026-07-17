import {
  createTemporalOrdinalSignature,
  signatureDistance,
  temporalOrdinalDistance,
  type FrameSignature
} from './signatures'
import { clamp01 } from '@shared/numeric'
import {
  MATCH_CONFIDENCE_WEIGHTS,
  MATCH_DEFAULTS,
  SEQUENCE_SCORE_WEIGHTS,
  SEQUENCE_SCORING
} from './constants'

export interface TimedSignature {
  time: number
  signature: FrameSignature
}

export interface AutoSyncAnchor {
  reactionTime: number
  movieTime: number
  confidence: number
  score: number
  runnerUpScore: number
  rawSimilarity?: number
  fitWeight?: number
}

export interface SequenceMatchCandidate {
  reactionTime: number
  movieTime: number
  candidateIndex: number
  distance: number
  rawSimilarity: number
}

export interface BurstWeightedSequenceMatchCandidate extends SequenceMatchCandidate {
  movieNormalizedSimilarity: number
  burstSimilarity: number
}

export interface MatchOptions {
  windowSize?: number
  minimumConfidence?: number
  minimumSequenceActivity?: number
  runnerUpExclusionFrames?: number
  candidateExclusionFrames?: number
  maximumCandidatesPerProbe?: number
  referenceTimeBinSeconds?: number
}

export function findSequenceAnchors(
  reaction: TimedSignature[],
  movie: TimedSignature[],
  probeTimes: number[],
  options: MatchOptions = {}
): AutoSyncAnchor[] {
  const windowSize = makeOdd(Math.max(
    MATCH_DEFAULTS.minimumWindowSize,
    options.windowSize ?? MATCH_DEFAULTS.windowSize
  ))
  const halfWindow = Math.floor(windowSize / 2)
  const minimumConfidence = options.minimumConfidence ?? MATCH_DEFAULTS.minimumConfidence
  const candidateGroups: SequenceMatchCandidate[][] = []

  for (const probeTime of probeTimes) {
    const center = nearestIndex(reaction, probeTime)
    if (center < halfWindow || center + halfWindow >= reaction.length || movie.length < windowSize) continue
    const window = reaction.slice(center - halfWindow, center + halfWindow + 1)
    const activity = sequenceActivity(window)
    if (activity < (options.minimumSequenceActivity ?? MATCH_DEFAULTS.minimumSequenceActivity)) continue
    const candidates = findSequenceMatchCandidates(window, movie, options)
    if (candidates.length) candidateGroups.push(candidates)
  }

  const anchors = selectBurstWeightedMatches(candidateGroups, {
    runnerUpExclusionFrames: options.runnerUpExclusionFrames ??
      windowSize * MATCH_DEFAULTS.runnerUpWindowMultiplier,
    referenceTimeBinSeconds: options.referenceTimeBinSeconds
  }).filter((match) => match.confidence >= minimumConfidence)
  return dedupeAnchors(anchors, Math.max(MATCH_DEFAULTS.minimumDedupeTolerance, windowSize))
}

export function matchSequence(
  reactionWindow: TimedSignature[],
  movie: TimedSignature[],
  options: Pick<MatchOptions, 'runnerUpExclusionFrames'> = {}
): AutoSyncAnchor | null {
  const candidates = findSequenceMatchCandidates(reactionWindow, movie)
  return selectBurstWeightedMatches([candidates], options)[0] ?? null
}

export function findSequenceMatchCandidates(
  reactionWindow: TimedSignature[],
  movie: TimedSignature[],
  options: Pick<MatchOptions, 'candidateExclusionFrames' | 'maximumCandidatesPerProbe'> = {}
): SequenceMatchCandidate[] {
  if (reactionWindow.length < MATCH_DEFAULTS.minimumWindowSize ||
    movie.length < reactionWindow.length) return []
  const scores: Array<{ index: number; score: number }> = []
  const reactionOrdinal = createTemporalOrdinalSignature(reactionWindow.map((item) => item.signature))
  for (let start = 0; start <= movie.length - reactionWindow.length; start += 1) {
    scores.push({
      index: start,
      score: sequenceScore(reactionWindow, movie.slice(start, start + reactionWindow.length), reactionOrdinal)
    })
  }
  scores.sort((a, b) => a.score - b.score)
  const centerOffset = Math.floor(reactionWindow.length / 2)
  const maximumCandidates = Math.max(
    MATCH_DEFAULTS.minimumCandidateCount,
    Math.round(options.maximumCandidatesPerProbe ?? MATCH_DEFAULTS.maximumCandidatesPerProbe)
  )
  const exclusion = Math.max(0, Math.round(options.candidateExclusionFrames ?? 0))
  const kept: Array<{ index: number; score: number }> = []
  for (const candidate of scores) {
    if (kept.some((other) => Math.abs(other.index - candidate.index) <= exclusion)) continue
    kept.push(candidate)
    if (kept.length >= maximumCandidates) break
  }
  return kept.map((candidate) => ({
    reactionTime: reactionWindow[centerOffset].time,
    movieTime: movie[candidate.index + centerOffset].time,
    candidateIndex: candidate.index,
    distance: candidate.score,
    rawSimilarity: clamp01(1 - candidate.score)
  }))
}

/**
 * Douze et al. Eq. 13, adapted to sparse sequence candidates. Similarities are
 * normalized by movie location first, then by reaction probe. The result is a
 * vote weight, not a probability or user-facing confidence.
 */
export function applyBurstinessReweighting(
  candidateGroups: SequenceMatchCandidate[][],
  options: Pick<MatchOptions, 'referenceTimeBinSeconds'> = {}
): BurstWeightedSequenceMatchCandidate[][] {
  const timeBin = Math.max(
    MATCH_DEFAULTS.minimumReferenceTimeBinSeconds,
    options.referenceTimeBinSeconds ?? MATCH_DEFAULTS.referenceTimeBinSeconds
  )
  const movieSums = new Map<number, number>()
  for (const candidates of candidateGroups) for (const candidate of candidates) {
    const key = Math.round(candidate.movieTime / timeBin)
    movieSums.set(key, (movieSums.get(key) ?? 0) + Math.max(0, candidate.rawSimilarity))
  }

  return candidateGroups.map((candidates) => {
    const movieNormalized = candidates.map((candidate) => {
      const denominator = Math.sqrt(movieSums.get(Math.round(candidate.movieTime / timeBin)) ?? 0)
      return denominator > 0 ? candidate.rawSimilarity / denominator : 0
    })
    const queryDenominator = Math.sqrt(movieNormalized.reduce((sum, value) => sum + value, 0))
    return candidates.map((candidate, index) => ({
      ...candidate,
      movieNormalizedSimilarity: movieNormalized[index],
      burstSimilarity: queryDenominator > 0 ? movieNormalized[index] / queryDenominator : 0
    }))
  })
}

export function selectBurstWeightedMatches(
  candidateGroups: SequenceMatchCandidate[][],
  options: Pick<MatchOptions, 'runnerUpExclusionFrames' | 'referenceTimeBinSeconds'> = {}
): AutoSyncAnchor[] {
  const weightedGroups = applyBurstinessReweighting(candidateGroups, options)
  return weightedGroups.flatMap((candidates) => {
    const ranked = [...candidates].sort((a, b) =>
      b.rawSimilarity - a.rawSimilarity || b.burstSimilarity - a.burstSimilarity
    )
    const best = ranked[0]
    if (!best) return []
    const exclusion = options.runnerUpExclusionFrames ?? 0
    const runnerUp = ranked.find((candidate) =>
      Math.abs(candidate.candidateIndex - best.candidateIndex) > exclusion
    ) ?? ranked[1] ?? best
    const rawSeparation = clamp01(
      (runnerUp.distance - best.distance) /
      Math.max(MATCH_DEFAULTS.runnerUpDistanceFloor, runnerUp.distance)
    )
    const confidence = clamp01(
      best.rawSimilarity * MATCH_CONFIDENCE_WEIGHTS.rawSimilarity +
      rawSeparation * MATCH_CONFIDENCE_WEIGHTS.separation
    )
    return [{
      reactionTime: best.reactionTime,
      movieTime: best.movieTime,
      confidence,
      score: best.distance,
      runnerUpScore: runnerUp.distance,
      rawSimilarity: best.rawSimilarity,
      fitWeight: Math.max(
        MATCH_DEFAULTS.fitWeightEpsilon,
        best.burstSimilarity ** MATCH_DEFAULTS.burstFitWeightExponent
      )
    }]
  })
}

export function sequenceActivity(sequence: TimedSignature[]): number {
  if (sequence.length < 2) return 0
  let sum = 0
  for (let index = 1; index < sequence.length; index += 1) {
    sum += signatureDistance(sequence[index - 1].signature, sequence[index].signature)
  }
  return sum / (sequence.length - 1)
}

function sequenceScore(
  reaction: TimedSignature[],
  movie: TimedSignature[],
  reactionOrdinal = createTemporalOrdinalSignature(reaction.map((item) => item.signature))
): number {
  let spatial = 0
  let motion = 0
  let weightTotal = 0
  for (let index = 0; index < reaction.length; index += 1) {
    const frameDistance = signatureDistance(reaction[index].signature, movie[index].signature)
    const cutWeight = index === 0
      ? 1
      : 1 + Math.min(
        SEQUENCE_SCORING.maximumCutBoost,
        signatureDistance(reaction[index - 1].signature, reaction[index].signature) *
          SEQUENCE_SCORING.cutBoostMultiplier
      )
    spatial += frameDistance * cutWeight
    weightTotal += cutWeight
    if (index > 0) {
      const reactionMotion = signatureDistance(reaction[index - 1].signature, reaction[index].signature)
      const movieMotion = signatureDistance(movie[index - 1].signature, movie[index].signature)
      motion += Math.min(
        SEQUENCE_SCORING.maximumMotionDifference,
        Math.abs(reactionMotion - movieMotion) * SEQUENCE_SCORING.motionDifferenceMultiplier
      )
    }
  }
  const temporalOrdinal = temporalOrdinalDistance(
    reactionOrdinal,
    createTemporalOrdinalSignature(movie.map((item) => item.signature))
  )
  return clamp01(
    (spatial / Math.max(1, weightTotal)) * SEQUENCE_SCORE_WEIGHTS.spatial +
    (motion / Math.max(1, reaction.length - 1)) * SEQUENCE_SCORE_WEIGHTS.motion +
    temporalOrdinal * SEQUENCE_SCORE_WEIGHTS.temporalOrdinal
  )
}

function dedupeAnchors(anchors: AutoSyncAnchor[], timeTolerance: number): AutoSyncAnchor[] {
  return [...anchors]
    .sort((a, b) => b.confidence - a.confidence)
    .filter((anchor, index, all) => !all.slice(0, index).some((kept) =>
      Math.abs(kept.reactionTime - anchor.reactionTime) < timeTolerance ||
      Math.abs(kept.movieTime - anchor.movieTime) < timeTolerance
    ))
    .sort((a, b) => a.reactionTime - b.reactionTime)
}

function nearestIndex(values: TimedSignature[], time: number): number {
  let best = 0
  let distance = Number.POSITIVE_INFINITY
  for (let index = 0; index < values.length; index += 1) {
    const next = Math.abs(values[index].time - time)
    if (next < distance) { best = index; distance = next }
  }
  return best
}

function makeOdd(value: number): number {
  const rounded = Math.round(value)
  return rounded % 2 === 0 ? rounded + 1 : rounded
}
