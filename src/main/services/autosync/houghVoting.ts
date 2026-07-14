import type {
  AutoSyncAnchor,
  BurstWeightedSequenceMatchCandidate
} from './matching'

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
    const key = candidates[0].reactionTime.toFixed(6)
    groupsByProbe.set(key, [...(groupsByProbe.get(key) ?? []), ...candidates])
  }
  const groups = [...groupsByProbe.values()]
  const minimumSupport = Math.max(3, Math.round(options.minimumSupport ?? 3))
  if (groups.length < minimumSupport) return null

  const probeTimes = groups.map((candidates) => candidates[0].reactionTime)
  const minimumProbeTime = Math.min(...probeTimes)
  const maximumProbeTime = Math.max(...probeTimes)
  if (maximumProbeTime - minimumProbeTime <= 0) return null
  const referenceReactionTime = median(probeTimes)
  const minimumRate = options.minimumRate ?? 0.9
  const maximumRate = options.maximumRate ?? 1.1
  if (maximumRate <= minimumRate) return null
  const offsetBinSeconds = Math.max(0.01, options.offsetBinSeconds ?? 0.25)
  const inlierToleranceSeconds = Math.max(
    offsetBinSeconds,
    options.inlierToleranceSeconds ?? offsetBinSeconds * 2
  )
  const runnerUpRidgeToleranceSeconds = Math.max(
    inlierToleranceSeconds,
    options.runnerUpRidgeToleranceSeconds ?? Math.max(3, inlierToleranceSeconds * 4)
  )
  const reactionRadius = Math.max(
    1,
    ...probeTimes.map((time) => Math.abs(time - referenceReactionTime))
  )
  const desiredSlopeStep = Math.min(
    options.maximumSlopeStep ?? 0.001,
    offsetBinSeconds / (2 * reactionRadius)
  )
  const slopeRange = maximumRate - minimumRate
  const slopeBinCount = Math.max(1, Math.min(
    Math.round(options.maximumSlopeBins ?? 5000),
    Math.ceil(slopeRange / Math.max(1e-7, desiredSlopeStep))
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
      Math.max(0.08, runnerUpCandidate.distance)
    )
    return [{
      reactionTime: selected.candidate.reactionTime,
      movieTime: selected.candidate.movieTime,
      confidence: clamp01(selected.candidate.rawSimilarity * 0.58 + separation * 0.42),
      score: selected.candidate.distance,
      runnerUpScore: runnerUpCandidate.distance,
      rawSimilarity: selected.candidate.rawSimilarity,
      fitWeight: Math.max(1e-6, selected.candidate.burstSimilarity ** 2)
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
    peakMargin: clamp01((bestPeak.score - runnerUpPeakScore) / Math.max(1e-9, bestPeak.score)),
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
    const score = candidate.rawSimilarity * 0.85 + candidate.burstSimilarity * 0.15 + proximity * 1e-6
    if (!best || score > best.score) best = { candidate, proximity: Math.max(0.05, proximity), score }
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

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
