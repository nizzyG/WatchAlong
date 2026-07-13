import type { AutoSyncAnchor } from './matching'

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
}

export interface FitOptions {
  movieDuration: number
  minimumAnchors?: number
  minimumSpanFraction?: number
  maximumMedianResidual?: number
  maximumResidual?: number
  minimumRate?: number
  maximumRate?: number
}

export function fitAnchors(anchors: AutoSyncAnchor[], options: FitOptions): AutoSyncFit | null {
  const minimumAnchors = options.minimumAnchors ?? 3
  if (anchors.length < minimumAnchors || !Number.isFinite(options.movieDuration) || options.movieDuration <= 0) return null
  let inliers = [...anchors]

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
  const line = weightedLine(inliers)
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
  const confidence = clamp01(confidenceAverage * 0.55 + residualQuality * 0.25 + maximumQuality * 0.12 + spanQuality * 0.08)

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
    anchors: inliers
  }
}

export function isConfidentFit(fit: AutoSyncFit): boolean {
  return fit.anchors.length >= 3 && fit.residualStats.spanFraction >= 0.5 &&
    fit.residualStats.medianSeconds <= 0.35 && fit.residualStats.maximumSeconds <= 0.75 &&
    fit.movieRateCorrection >= 0.9 && fit.movieRateCorrection <= 1.1
}

function weightedLine(anchors: AutoSyncAnchor[]): { slope: number; intercept: number } | null {
  let weightSum = 0; let xSum = 0; let ySum = 0
  for (const anchor of anchors) {
    const weight = Math.max(0.05, anchor.confidence ** 2)
    weightSum += weight; xSum += anchor.reactionTime * weight; ySum += anchor.movieTime * weight
  }
  if (weightSum <= 0) return null
  const meanX = xSum / weightSum; const meanY = ySum / weightSum
  let covariance = 0; let variance = 0
  for (const anchor of anchors) {
    const weight = Math.max(0.05, anchor.confidence ** 2)
    covariance += weight * (anchor.reactionTime - meanX) * (anchor.movieTime - meanY)
    variance += weight * (anchor.reactionTime - meanX) ** 2
  }
  if (variance <= 1e-9) return null
  const slope = covariance / variance
  return { slope, intercept: meanY - slope * meanX }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function round(value: number, places: number): number {
  return Number(value.toFixed(places))
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
