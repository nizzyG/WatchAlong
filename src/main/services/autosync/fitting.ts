import type { AutoSyncAnchor } from './matching'
import { clamp01, median, round } from '@shared/numeric'

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
  const minimumAnchors = options.minimumAnchors ?? 3
  if (anchors.length < minimumAnchors || !Number.isFinite(options.movieDuration) || options.movieDuration <= 0) return null
  let inliers = options.seedAnchors && options.seedAnchors.length >= minimumAnchors
    ? [...options.seedAnchors]
    : [...anchors]

  for (let iteration = 0; iteration < 5 && inliers.length >= minimumAnchors; iteration += 1) {
    const line = weightedLine(inliers)
    if (!line) return null
    const residuals = inliers.map((anchor) => Math.abs(anchor.movieTime - (line.slope * anchor.reactionTime + line.intercept)))
    const medianResidual = median(residuals)
    const mad = median(residuals.map((value) => Math.abs(value - medianResidual)))
    const threshold = Math.max(0.3, medianResidual + Math.max(0.15, mad * 3.5))
    const next = inliers.filter((_anchor, index) => residuals[index] <= threshold)
    if (next.length === inliers.length) break
    inliers = next
  }

  if (inliers.length < minimumAnchors) return null
  const measuredLine = weightedLine(inliers)
  const snapped = measuredLine ? snapToCommonRate(measuredLine, inliers) : null
  const line = snapped?.line ?? measuredLine
  if (!line || line.slope < (options.minimumRate ?? 0.9) || line.slope > (options.maximumRate ?? 1.1)) return null
  const residuals = inliers.map((anchor) => Math.abs(anchor.movieTime - (line.slope * anchor.reactionTime + line.intercept)))
  const reactionTimes = inliers.map((anchor) => anchor.reactionTime)
  const spanSeconds = Math.max(...reactionTimes) - Math.min(...reactionTimes)
  const spanFraction = spanSeconds / options.movieDuration
  if (spanFraction < (options.minimumSpanFraction ?? 0.5)) return null

  const medianSeconds = median(residuals)
  const maximumSeconds = Math.max(...residuals)
  const rmsSeconds = Math.sqrt(residuals.reduce((sum, value) => sum + value ** 2, 0) / residuals.length)
  const confidenceAverage = inliers.reduce((sum, anchor) => sum + anchor.confidence, 0) / inliers.length
  const residualQuality = clamp01(1 - medianSeconds / Math.max(0.01, options.maximumMedianResidual ?? 0.35))
  const maximumQuality = clamp01(1 - maximumSeconds / Math.max(0.01, options.maximumResidual ?? 0.75))
  const spanQuality = clamp01((spanFraction - 0.5) / 0.35)
  const consensus = options.consensusEvidence
  const confidence = consensus
    ? clamp01(
      clamp01(consensus.meanSimilarity) * 0.32 +
      clamp01(consensus.peakMargin) * 0.18 +
      clamp01(consensus.supportFraction) * 0.12 +
      residualQuality * 0.2 +
      maximumQuality * 0.1 +
      spanQuality * 0.08
    )
    : clamp01(confidenceAverage * 0.55 + residualQuality * 0.25 + maximumQuality * 0.12 + spanQuality * 0.08)

  return {
    offsetSeconds: round(line.intercept, 6),
    movieRateCorrection: round(line.slope, 8),
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
  return fit.anchors.length >= 3 && fit.residualStats.spanFraction >= 0.5 &&
    fit.residualStats.medianSeconds <= 0.35 && fit.residualStats.maximumSeconds <= 0.75 &&
    fit.movieRateCorrection >= 0.9 && fit.movieRateCorrection <= 1.1 &&
    fit.confidence >= 0.5 &&
    (!fit.consensusStats || isReliableConsensusEvidence(fit.consensusStats))
}

/** Absolute evidence floor shared by auto-commit and the service handoff. */
export function isReliableConsensusEvidence(evidence: FitConsensusEvidence): boolean {
  return evidence.peakMargin >= 0.02 &&
    evidence.meanSimilarity >= 0.35 &&
    evidence.supportFraction >= 0.4 &&
    evidence.meanSeedResidual <= 0.75 &&
    evidence.maximumSeedResidual <= 0.8
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
  if (variance <= 1e-9) return null
  const slope = covariance / variance
  return { slope, intercept: meanY - slope * meanX }
}

function anchorWeight(anchor: AutoSyncAnchor): number {
  return Math.max(1e-6, anchor.fitWeight ?? Math.max(0.05, anchor.confidence ** 2))
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
  const tolerance = Math.min(0.0015, Math.max(0.00003, standardError * 2.5))
  if (Math.abs(nearestRate - measured.slope) > tolerance) return { line: measured, snapped: false }

  const snappedLine = fixedSlopeLine(nearestRate, anchors)
  const measuredResiduals = absoluteResiduals(measured, anchors)
  const snappedResiduals = absoluteResiduals(snappedLine, anchors)
  const measuredMedian = median(measuredResiduals)
  const snappedMedian = median(snappedResiduals)
  const measuredMaximum = Math.max(...measuredResiduals)
  const snappedMaximum = Math.max(...snappedResiduals)
  if (snappedMedian + 1e-6 < measuredMedian && snappedMaximum <= measuredMaximum + 0.1) {
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
  return { slope, intercept: weightedOffset / Math.max(1e-9, weightTotal) }
}

function slopeStandardError(line: { slope: number; intercept: number }, anchors: AutoSyncAnchor[]): number {
  let weightTotal = 0
  let weightedX = 0
  for (const anchor of anchors) {
    const weight = anchorWeight(anchor)
    weightTotal += weight
    weightedX += anchor.reactionTime * weight
  }
  const meanX = weightedX / Math.max(1e-9, weightTotal)
  let variance = 0
  let squaredError = 0
  for (const anchor of anchors) {
    const weight = anchorWeight(anchor)
    variance += weight * (anchor.reactionTime - meanX) ** 2
    squaredError += weight * (anchor.movieTime - (line.slope * anchor.reactionTime + line.intercept)) ** 2
  }
  if (variance <= 1e-9) return Number.POSITIVE_INFINITY
  return Math.sqrt((squaredError / Math.max(1, anchors.length - 2)) / variance)
}

function absoluteResiduals(line: { slope: number; intercept: number }, anchors: AutoSyncAnchor[]): number[] {
  return anchors.map((anchor) => Math.abs(anchor.movieTime - (line.slope * anchor.reactionTime + line.intercept)))
}
