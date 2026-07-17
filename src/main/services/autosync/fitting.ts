import type { AutoSyncAnchor } from './matching'
import { clamp01, median, round } from '@shared/numeric'
import {
  CONSENSUS_FIT_CONFIDENCE_WEIGHTS,
  FIT_DEFAULTS,
  FIT_NUMERICS,
  LEGACY_FIT_CONFIDENCE_WEIGHTS,
  MIN_CONFIDENT_FIT,
  RATE_BAND,
  RATE_SNAPPING,
  RELIABLE_CONSENSUS
} from './constants'

export interface ResidualStats {
  medianSeconds: number
  maximumSeconds: number
  rmsSeconds: number
  inlierCount: number
  totalCount: number
  spanSeconds: number
  spanFraction: number
}

export interface AutoSyncFit {
  offsetSeconds: number
  movieRateCorrection: number
  confidence: number
  residualStats: ResidualStats
  anchors: AutoSyncAnchor[]
  consensusStats?: FitConsensusEvidence
  rateSnapped: boolean
}

export interface FitConsensusEvidence {
  peakMargin: number
  supportFraction: number
  meanSimilarity: number
  meanSeedResidual: number
  maximumSeedResidual: number
}

export interface FitOptions {
  movieDuration: number
  minimumAnchors?: number
  minimumSpanFraction?: number
  maximumMedianResidual?: number
  maximumResidual?: number
  minimumRate?: number
  maximumRate?: number
  seedAnchors?: AutoSyncAnchor[]
  consensusEvidence?: FitConsensusEvidence
}

export function fitAnchors(anchors: AutoSyncAnchor[], options: FitOptions): AutoSyncFit | null {
  const minimumAnchors = options.minimumAnchors ?? FIT_DEFAULTS.minimumAnchors
  if (anchors.length < minimumAnchors || !Number.isFinite(options.movieDuration) || options.movieDuration <= 0) return null
  let inliers = options.seedAnchors && options.seedAnchors.length >= minimumAnchors
    ? [...options.seedAnchors]
    : [...anchors]

  for (let iteration = 0;
    iteration < FIT_DEFAULTS.maximumRobustIterations && inliers.length >= minimumAnchors;
    iteration += 1) {
    const line = weightedLine(inliers)
    if (!line) return null
    const residuals = inliers.map((anchor) => Math.abs(anchor.movieTime - (line.slope * anchor.reactionTime + line.intercept)))
    const medianResidual = median(residuals)
    const mad = median(residuals.map((value) => Math.abs(value - medianResidual)))
    const threshold = Math.max(
      FIT_DEFAULTS.minimumResidualThresholdSeconds,
      medianResidual + Math.max(
        FIT_DEFAULTS.minimumMadAllowanceSeconds,
        mad * FIT_DEFAULTS.madMultiplier
      )
    )
    const next = inliers.filter((_anchor, index) => residuals[index] <= threshold)
    if (next.length === inliers.length) break
    inliers = next
  }

  if (inliers.length < minimumAnchors) return null
  const measuredLine = weightedLine(inliers)
  const snapped = measuredLine ? snapToCommonRate(measuredLine, inliers) : null
  const line = snapped?.line ?? measuredLine
  if (!line || line.slope < (options.minimumRate ?? RATE_BAND.min) ||
    line.slope > (options.maximumRate ?? RATE_BAND.max)) return null
  const residuals = inliers.map((anchor) => Math.abs(anchor.movieTime - (line.slope * anchor.reactionTime + line.intercept)))
  const reactionTimes = inliers.map((anchor) => anchor.reactionTime)
  const spanSeconds = Math.max(...reactionTimes) - Math.min(...reactionTimes)
  const spanFraction = spanSeconds / options.movieDuration
  if (spanFraction < (options.minimumSpanFraction ?? FIT_DEFAULTS.minimumSpanFraction)) return null

  const medianSeconds = median(residuals)
  const maximumSeconds = Math.max(...residuals)
  const rmsSeconds = Math.sqrt(residuals.reduce((sum, value) => sum + value ** 2, 0) / residuals.length)
  const confidenceAverage = inliers.reduce((sum, anchor) => sum + anchor.confidence, 0) / inliers.length
  const residualQuality = clamp01(1 - medianSeconds / Math.max(
    FIT_DEFAULTS.qualityDenominatorFloor,
    options.maximumMedianResidual ?? FIT_DEFAULTS.maximumMedianResidualSeconds
  ))
  const maximumQuality = clamp01(1 - maximumSeconds / Math.max(
    FIT_DEFAULTS.qualityDenominatorFloor,
    options.maximumResidual ?? FIT_DEFAULTS.maximumResidualSeconds
  ))
  const spanQuality = clamp01(
    (spanFraction - FIT_DEFAULTS.minimumSpanFraction) / FIT_DEFAULTS.spanQualityRange
  )
  const consensus = options.consensusEvidence
  const confidence = consensus
    ? clamp01(
      clamp01(consensus.meanSimilarity) * CONSENSUS_FIT_CONFIDENCE_WEIGHTS.meanSimilarity +
      clamp01(consensus.peakMargin) * CONSENSUS_FIT_CONFIDENCE_WEIGHTS.peakMargin +
      clamp01(consensus.supportFraction) * CONSENSUS_FIT_CONFIDENCE_WEIGHTS.supportFraction +
      residualQuality * CONSENSUS_FIT_CONFIDENCE_WEIGHTS.residualQuality +
      maximumQuality * CONSENSUS_FIT_CONFIDENCE_WEIGHTS.maximumQuality +
      spanQuality * CONSENSUS_FIT_CONFIDENCE_WEIGHTS.spanQuality
    )
    : clamp01(
      confidenceAverage * LEGACY_FIT_CONFIDENCE_WEIGHTS.anchorConfidence +
      residualQuality * LEGACY_FIT_CONFIDENCE_WEIGHTS.residualQuality +
      maximumQuality * LEGACY_FIT_CONFIDENCE_WEIGHTS.maximumQuality +
      spanQuality * LEGACY_FIT_CONFIDENCE_WEIGHTS.spanQuality
    )

  return {
    offsetSeconds: round(line.intercept, FIT_DEFAULTS.offsetDecimalPlaces),
    movieRateCorrection: round(line.slope, FIT_DEFAULTS.rateDecimalPlaces),
    confidence,
    residualStats: {
      medianSeconds,
      maximumSeconds,
      rmsSeconds,
      inlierCount: inliers.length,
      totalCount: anchors.length,
      spanSeconds,
      spanFraction
    },
    anchors: inliers,
    consensusStats: consensus,
    rateSnapped: snapped?.snapped ?? false
  }
}

export function isConfidentFit(fit: AutoSyncFit): boolean {
  return fit.anchors.length >= FIT_DEFAULTS.minimumAnchors &&
    fit.residualStats.spanFraction >= FIT_DEFAULTS.minimumSpanFraction &&
    fit.residualStats.medianSeconds <= FIT_DEFAULTS.maximumMedianResidualSeconds &&
    fit.residualStats.maximumSeconds <= FIT_DEFAULTS.maximumResidualSeconds &&
    fit.movieRateCorrection >= RATE_BAND.min && fit.movieRateCorrection <= RATE_BAND.max &&
    fit.confidence >= MIN_CONFIDENT_FIT &&
    (!fit.consensusStats || isReliableConsensusEvidence(fit.consensusStats))
}

/** Absolute evidence floor shared by auto-commit and the service handoff. */
export function isReliableConsensusEvidence(evidence: FitConsensusEvidence): boolean {
  return evidence.peakMargin >= RELIABLE_CONSENSUS.minimumPeakMargin &&
    evidence.meanSimilarity >= RELIABLE_CONSENSUS.minimumMeanSimilarity &&
    evidence.supportFraction >= RELIABLE_CONSENSUS.minimumSupportFraction &&
    evidence.meanSeedResidual <= RELIABLE_CONSENSUS.maximumMeanSeedResidualSeconds &&
    evidence.maximumSeedResidual <= RELIABLE_CONSENSUS.maximumSeedResidualSeconds
}

function weightedLine(anchors: AutoSyncAnchor[]): { slope: number; intercept: number } | null {
  let weightSum = 0; let xSum = 0; let ySum = 0
  for (const anchor of anchors) {
    const weight = anchorWeight(anchor)
    weightSum += weight; xSum += anchor.reactionTime * weight; ySum += anchor.movieTime * weight
  }
  if (weightSum <= 0) return null
  const meanX = xSum / weightSum; const meanY = ySum / weightSum
  let covariance = 0; let variance = 0
  for (const anchor of anchors) {
    const weight = anchorWeight(anchor)
    covariance += weight * (anchor.reactionTime - meanX) * (anchor.movieTime - meanY)
    variance += weight * (anchor.reactionTime - meanX) ** 2
  }
  if (variance <= FIT_NUMERICS.varianceEpsilon) return null
  const slope = covariance / variance
  return { slope, intercept: meanY - slope * meanX }
}

function anchorWeight(anchor: AutoSyncAnchor): number {
  return Math.max(
    FIT_NUMERICS.weightEpsilon,
    anchor.fitWeight ?? Math.max(
      FIT_NUMERICS.minimumConfidenceWeight,
      anchor.confidence ** FIT_NUMERICS.confidenceWeightExponent
    )
  )
}

const COMMON_MOVIE_RATES = [
  1,
  (24000 / 1001) / 24,
  24 / (24000 / 1001),
  24 / 25,
  25 / 24,
  (24000 / 1001) / 25,
  25 / (24000 / 1001)
]

function snapToCommonRate(
  measured: { slope: number; intercept: number },
  anchors: AutoSyncAnchor[]
): { line: { slope: number; intercept: number }; snapped: boolean } {
  const nearestRate = COMMON_MOVIE_RATES.reduce((best, candidate) =>
    Math.abs(candidate - measured.slope) < Math.abs(best - measured.slope) ? candidate : best
  )
  const standardError = slopeStandardError(measured, anchors)
  const tolerance = Math.min(
    RATE_SNAPPING.maximumTolerance,
    Math.max(RATE_SNAPPING.minimumTolerance, standardError * RATE_SNAPPING.standardErrorMultiplier)
  )
  if (Math.abs(nearestRate - measured.slope) > tolerance) return { line: measured, snapped: false }

  const snappedLine = fixedSlopeLine(nearestRate, anchors)
  const measuredResiduals = absoluteResiduals(measured, anchors)
  const snappedResiduals = absoluteResiduals(snappedLine, anchors)
  const measuredMedian = median(measuredResiduals)
  const snappedMedian = median(snappedResiduals)
  const measuredMaximum = Math.max(...measuredResiduals)
  const snappedMaximum = Math.max(...snappedResiduals)
  if (snappedMedian + RATE_SNAPPING.improvementEpsilon < measuredMedian &&
    snappedMaximum <= measuredMaximum + RATE_SNAPPING.maximumResidualSlackSeconds) {
    return { line: snappedLine, snapped: true }
  }
  return { line: measured, snapped: false }
}

function fixedSlopeLine(slope: number, anchors: AutoSyncAnchor[]): { slope: number; intercept: number } {
  let weightedOffset = 0
  let weightTotal = 0
  for (const anchor of anchors) {
    const weight = anchorWeight(anchor)
    weightedOffset += (anchor.movieTime - slope * anchor.reactionTime) * weight
    weightTotal += weight
  }
  return { slope, intercept: weightedOffset / Math.max(FIT_NUMERICS.weightSumEpsilon, weightTotal) }
}

function slopeStandardError(line: { slope: number; intercept: number }, anchors: AutoSyncAnchor[]): number {
  let weightTotal = 0
  let weightedX = 0
  for (const anchor of anchors) {
    const weight = anchorWeight(anchor)
    weightTotal += weight
    weightedX += anchor.reactionTime * weight
  }
  const meanX = weightedX / Math.max(FIT_NUMERICS.weightSumEpsilon, weightTotal)
  let variance = 0
  let squaredError = 0
  for (const anchor of anchors) {
    const weight = anchorWeight(anchor)
    variance += weight * (anchor.reactionTime - meanX) ** 2
    squaredError += weight * (anchor.movieTime - (line.slope * anchor.reactionTime + line.intercept)) ** 2
  }
  if (variance <= FIT_NUMERICS.varianceEpsilon) return Number.POSITIVE_INFINITY
  return Math.sqrt((squaredError / Math.max(1, anchors.length - 2)) / variance)
}

function absoluteResiduals(line: { slope: number; intercept: number }, anchors: AutoSyncAnchor[]): number[] {
  return anchors.map((anchor) => Math.abs(anchor.movieTime - (line.slope * anchor.reactionTime + line.intercept)))
}
