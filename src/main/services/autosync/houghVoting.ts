import type {
  AutoSyncAnchor,
  BurstWeightedSequenceMatchCandidate
} from './matching'
import { clamp01, median } from '@shared/numeric'
import {
  HOUGH_DEFAULTS,
  HOUGH_LOCAL_SCORE_WEIGHTS,
  MATCH_CONFIDENCE_WEIGHTS,
  RATE_BAND
} from './constants'

export interface HoughVotingOptions {
  minimumRate?: number
  maximumRate?: number
  offsetBinSeconds?: number
  inlierToleranceSeconds?: number
  minimumSupport?: number
  maximumSlopeStep?: number
  maximumSlopeBins?: number
  runnerUpRidgeToleranceSeconds?: number
}

export interface HoughConsensus {
  anchors: AutoSyncAnchor[]
  seedOffsetSeconds: number
  seedRate: number
  peakScore: number
  runnerUpPeakScore: number
  peakMargin: number
  supportCount: number
  totalProbeCount: number
  supportFraction: number
  meanSimilarity: number
  meanSeedResidual: number
  maximumSeedResidual: number
}

interface HoughPeak {
  slope: number
  movieTimeAtReference: number
  score: number
  support: number
}

interface BinVote {
  score: number
  support: number
}

interface HoughScanConfig {
  minimumRate: number
  slopeBinCount: number
  slopeStep: number
  referenceReactionTime: number
  offsetBinSeconds: number
  minimumSupport: number
}

export function voteForTemporalConsensus(
  candidateGroups: BurstWeightedSequenceMatchCandidate[][],
  options: HoughVotingOptions = {}
): HoughConsensus | null {
  const groupsByProbe = new Map<string, BurstWeightedSequenceMatchCandidate[]>()
  for (const candidates of candidateGroups) {
    if (!candidates.length) continue
    const key = candidates[0].reactionTime.toFixed(HOUGH_DEFAULTS.probeTimeDecimalPlaces)
    groupsByProbe.set(key, [...(groupsByProbe.get(key) ?? []), ...candidates])
  }
  const groups = [...groupsByProbe.values()]
  const minimumSupport = Math.max(
    HOUGH_DEFAULTS.minimumSupport,
    Math.round(options.minimumSupport ?? HOUGH_DEFAULTS.minimumSupport)
  )
  if (groups.length < minimumSupport) return null

  const probeTimes = groups.map((candidates) => candidates[0].reactionTime)
  const minimumProbeTime = Math.min(...probeTimes)
  const maximumProbeTime = Math.max(...probeTimes)
  if (maximumProbeTime - minimumProbeTime <= 0) return null
  const referenceReactionTime = median(probeTimes)
  const minimumRate = options.minimumRate ?? RATE_BAND.min
  const maximumRate = options.maximumRate ?? RATE_BAND.max
  if (maximumRate <= minimumRate) return null
  const offsetBinSeconds = Math.max(
    HOUGH_DEFAULTS.minimumOffsetBinSeconds,
    options.offsetBinSeconds ?? HOUGH_DEFAULTS.offsetBinSeconds
  )
  const inlierToleranceSeconds = Math.max(
    offsetBinSeconds,
    options.inlierToleranceSeconds ?? offsetBinSeconds * HOUGH_DEFAULTS.inlierToleranceMultiplier
  )
  const runnerUpRidgeToleranceSeconds = Math.max(
    inlierToleranceSeconds,
    options.runnerUpRidgeToleranceSeconds ?? Math.max(
      HOUGH_DEFAULTS.minimumRunnerUpRidgeToleranceSeconds,
      inlierToleranceSeconds * HOUGH_DEFAULTS.runnerUpRidgeToleranceMultiplier
    )
  )
  const reactionRadius = Math.max(
    HOUGH_DEFAULTS.minimumReactionRadiusSeconds,
    ...probeTimes.map((time) => Math.abs(time - referenceReactionTime))
  )
  const desiredSlopeStep = Math.min(
    options.maximumSlopeStep ?? HOUGH_DEFAULTS.maximumSlopeStep,
    offsetBinSeconds / (HOUGH_DEFAULTS.slopeResolutionDivisor * reactionRadius)
  )
  const slopeRange = maximumRate - minimumRate
  const slopeBinCount = Math.max(1, Math.min(
    Math.round(options.maximumSlopeBins ?? HOUGH_DEFAULTS.maximumSlopeBins),
    Math.ceil(slopeRange / Math.max(HOUGH_DEFAULTS.slopeStepEpsilon, desiredSlopeStep))
  ))
  const slopeStep = slopeRange / slopeBinCount
  const scanConfig: HoughScanConfig = {
    minimumRate,
    slopeBinCount,
    slopeStep,
    referenceReactionTime,
    offsetBinSeconds,
    minimumSupport
  }
  const bestPeak = findBestPeak(groups, scanConfig)
  if (!bestPeak) return null
  const runnerUp = findBestPeak(groups, scanConfig, (peak) => !isSameRidge(
      bestPeak, peak, minimumProbeTime, maximumProbeTime,
      referenceReactionTime, runnerUpRidgeToleranceSeconds
    ))
  const anchors = groups.flatMap((candidates) => {
    const selected = selectCandidateOnPeak(
      candidates,
      bestPeak,
      referenceReactionTime,
      inlierToleranceSeconds
    )
    if (!selected) return []
    const alternatives = candidates
      .filter((candidate) => candidate !== selected.candidate)
      .sort((a, b) => a.distance - b.distance)
    const runnerUpCandidate = alternatives[0] ?? selected.candidate
    const separation = clamp01(
      (runnerUpCandidate.distance - selected.candidate.distance) /
      Math.max(HOUGH_DEFAULTS.runnerUpDistanceFloor, runnerUpCandidate.distance)
    )
    return [{
      reactionTime: selected.candidate.reactionTime,
      movieTime: selected.candidate.movieTime,
      confidence: clamp01(
        selected.candidate.rawSimilarity * MATCH_CONFIDENCE_WEIGHTS.rawSimilarity +
        separation * MATCH_CONFIDENCE_WEIGHTS.separation
      ),
      score: selected.candidate.distance,
      runnerUpScore: runnerUpCandidate.distance,
      rawSimilarity: selected.candidate.rawSimilarity,
      fitWeight: Math.max(
        HOUGH_DEFAULTS.fitWeightEpsilon,
        selected.candidate.burstSimilarity ** HOUGH_DEFAULTS.burstFitWeightExponent
      )
    }]
  })
  if (anchors.length < minimumSupport) return null

  const seedOffsetSeconds = bestPeak.movieTimeAtReference - bestPeak.slope * referenceReactionTime
  const seedResiduals = anchors.map((anchor) =>
    Math.abs(anchor.movieTime - (bestPeak.slope * anchor.reactionTime + seedOffsetSeconds))
  )
  const runnerUpPeakScore = runnerUp?.score ?? 0
  return {
    anchors,
    seedOffsetSeconds,
    seedRate: bestPeak.slope,
    peakScore: bestPeak.score,
    runnerUpPeakScore,
    peakMargin: clamp01(
      (bestPeak.score - runnerUpPeakScore) / Math.max(HOUGH_DEFAULTS.peakScoreEpsilon, bestPeak.score)
    ),
    supportCount: bestPeak.support,
    totalProbeCount: groups.length,
    supportFraction: bestPeak.support / groups.length,
    meanSimilarity: anchors.reduce((sum, anchor) => sum + (anchor.rawSimilarity ?? 1 - anchor.score), 0) / anchors.length,
    meanSeedResidual: seedResiduals.reduce((sum, value) => sum + value, 0) / seedResiduals.length,
    maximumSeedResidual: Math.max(...seedResiduals)
  }
}

function selectCandidateOnPeak(
  candidates: BurstWeightedSequenceMatchCandidate[],
  peak: HoughPeak,
  referenceReactionTime: number,
  tolerance: number
): { candidate: BurstWeightedSequenceMatchCandidate; proximity: number } | null {
  let best: { candidate: BurstWeightedSequenceMatchCandidate; proximity: number; score: number } | null = null
  for (const candidate of candidates) {
    const predicted = peak.movieTimeAtReference + peak.slope * (candidate.reactionTime - referenceReactionTime)
    const residual = Math.abs(candidate.movieTime - predicted)
    if (residual > tolerance) continue
    const proximity = clamp01(1 - residual / tolerance)
    // Hough establishes the consensus neighborhood; the strongest raw local
    // match supplies precision within it. This avoids quantized bin phase
    // pulling WLS toward a weaker adjacent frame.
    const score = candidate.rawSimilarity * HOUGH_LOCAL_SCORE_WEIGHTS.rawSimilarity +
      candidate.burstSimilarity * HOUGH_LOCAL_SCORE_WEIGHTS.burstSimilarity +
      proximity * HOUGH_DEFAULTS.localScoreTieBreaker
    if (!best || score > best.score) {
      best = { candidate, proximity: Math.max(HOUGH_DEFAULTS.minimumProximity, proximity), score }
    }
  }
  return best
}

function voteWeight(candidate: BurstWeightedSequenceMatchCandidate): number {
  return Math.max(0, candidate.burstSimilarity) * Math.max(0, candidate.rawSimilarity)
}

function keepStrongest(votes: Map<number, number>, bin: number, score: number): void {
  if (score > (votes.get(bin) ?? 0)) votes.set(bin, score)
}

function scanPeaks(
  groups: BurstWeightedSequenceMatchCandidate[][],
  config: HoughScanConfig,
  visit: (peak: HoughPeak) => void
): void {
  for (let slopeIndex = 0; slopeIndex <= config.slopeBinCount; slopeIndex += 1) {
    const slope = config.minimumRate + slopeIndex * config.slopeStep
    const accumulator = new Map<number, BinVote>()
    for (const candidates of groups) {
      const strongestProbeVotes = new Map<number, number>()
      for (const candidate of candidates) {
        const weight = voteWeight(candidate)
        if (weight <= 0) continue
        const movieTimeAtReference = candidate.movieTime - slope * (candidate.reactionTime - config.referenceReactionTime)
        const position = movieTimeAtReference / config.offsetBinSeconds
        const lowerBin = Math.floor(position)
        const upperFraction = position - lowerBin
        keepStrongest(strongestProbeVotes, lowerBin, weight * (1 - upperFraction))
        if (upperFraction > 0) keepStrongest(strongestProbeVotes, lowerBin + 1, weight * upperFraction)
      }
      for (const [offsetBin, score] of strongestProbeVotes) {
        const vote = accumulator.get(offsetBin) ?? { score: 0, support: 0 }
        vote.score += score
        vote.support += 1
        accumulator.set(offsetBin, vote)
      }
    }
    for (const [offsetBin, vote] of accumulator) {
      if (vote.support < config.minimumSupport) continue
      visit({
        slope,
        movieTimeAtReference: offsetBin * config.offsetBinSeconds,
        score: vote.score,
        support: vote.support
      })
    }
  }
}

function findBestPeak(
  groups: BurstWeightedSequenceMatchCandidate[][],
  config: HoughScanConfig,
  accept: (peak: HoughPeak) => boolean = () => true
): HoughPeak | null {
  let best: HoughPeak | null = null
  scanPeaks(groups, config, (peak) => {
    if (!accept(peak)) return
    if (!best || peak.score > best.score || (peak.score === best.score && peak.support > best.support)) best = peak
  })
  return best
}

function isSameRidge(
  a: HoughPeak,
  b: HoughPeak,
  minimumReactionTime: number,
  maximumReactionTime: number,
  referenceReactionTime: number,
  tolerance: number
): boolean {
  const differenceAt = (reactionTime: number): number => Math.abs(
    (a.movieTimeAtReference + a.slope * (reactionTime - referenceReactionTime)) -
    (b.movieTimeAtReference + b.slope * (reactionTime - referenceReactionTime))
  )
  return differenceAt(minimumReactionTime) <= tolerance &&
    differenceAt(maximumReactionTime) <= tolerance
}
