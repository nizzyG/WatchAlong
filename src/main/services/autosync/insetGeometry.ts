import { findSequenceAnchors, type AutoSyncAnchor, type TimedSignature } from './matching'
import { clamp, median } from '@shared/numeric'
import {
  COMPACT_GEOMETRY_WIDTHS,
  GENERAL_GEOMETRY_WIDTHS,
  GEOMETRY_AXIS_POSITIONS,
  GEOMETRY_CORNER_POSITIONS,
  GEOMETRY_FINAL_CONFIDENCE_WEIGHT,
  GEOMETRY_KEY_DECIMAL_PLACES,
  GEOMETRY_REFINEMENT,
  GEOMETRY_SCORE_WEIGHTS,
  INSET_GEOMETRY
} from './constants'
import {
  applySignatureMask,
  createFrameSignature,
  createTemporalVarianceMask,
  type NormalizedRect,
  type PixelFrame,
  type SignatureCellMask
} from './signatures'

export interface TimedPixelFrame extends PixelFrame {
  time: number
}

export interface InsetGeometry extends NormalizedRect {
  flipHorizontal: boolean
}

export interface InsetGeometryResult {
  geometry: InsetGeometry
  mask: SignatureCellMask | null
  confidence: number
  initialOffsetSeconds: number
  referenceReactionTime: number
  referenceMovieTime: number
  anchors: AutoSyncAnchor[]
  anchorCount: number
  runnerUpScore: number
}

export interface GeometryOptions {
  movieAspectRatio: number
  gridSize?: number
  minimumConfidence?: number
  minimumAnchors?: number
  candidates?: NormalizedRect[]
}

interface ScoredGeometry {
  geometry: InsetGeometry
  mask: SignatureCellMask | null
  score: number
  confidence: number
  offset: number
  anchorCount: number
  reference: { reactionTime: number; movieTime: number }
  anchors: AutoSyncAnchor[]
}

export function findInsetGeometry(
  reactionFrames: TimedPixelFrame[],
  movie: TimedSignature[],
  options: GeometryOptions
): InsetGeometryResult | null {
  if (reactionFrames.length < INSET_GEOMETRY.minimumFrames ||
    movie.length < INSET_GEOMETRY.minimumFrames ||
    !Number.isFinite(options.movieAspectRatio) || options.movieAspectRatio <= 0) return null
  const candidates = options.candidates ?? generateGeometryCandidates(
    reactionFrames[0].width / reactionFrames[0].height,
    options.movieAspectRatio
  )
  // More cheap signature probes make large persistent overlays (notably
  // on-screen timers) unlikely to hide every usable moment.
  const probeTimes = selectProbeTimes(reactionFrames, INSET_GEOMETRY.probeCount)
  const minimumAnchors = options.minimumAnchors ?? INSET_GEOMETRY.minimumAnchors
  const scored: ScoredGeometry[] = []
  for (const candidate of candidates) {
    for (const flipHorizontal of [false, true]) {
      const geometry = { ...candidate, flipHorizontal }
      const rawReaction = reactionFrames.map((frame) => ({
        time: frame.time,
        signature: createFrameSignature(frame, {
          crop: geometry,
          flipHorizontal,
          gridSize: options.gridSize ?? INSET_GEOMETRY.gridSize
        })
      }))
      const rawAnchors = findSequenceAnchors(rawReaction, movie, probeTimes, {
        windowSize: INSET_GEOMETRY.matchWindowSize,
        minimumConfidence: INSET_GEOMETRY.minimumMatchConfidence,
        minimumSequenceActivity: INSET_GEOMETRY.minimumSequenceActivity
      })
      // Bootstrap masking only after the crop shows at least two mutually
      // consistent sequence matches. This avoids doing expensive mask work on
      // obvious face-cam/background candidates and limits false positives.
      const discoveredMask = densestOffsetCluster(
        rawAnchors,
        INSET_GEOMETRY.offsetClusterToleranceSeconds
      ).length >= INSET_GEOMETRY.maskBootstrapAnchors
        ? createTemporalVarianceMask(rawReaction.map((frame) => frame.signature))
        : null
      const maskedReaction = discoveredMask
        ? rawReaction.map((frame) => ({ ...frame, signature: applySignatureMask(frame.signature, discoveredMask) }))
        : rawReaction
      const maskedAnchors = discoveredMask
        ? findSequenceAnchors(maskedReaction, movie, probeTimes, {
            windowSize: INSET_GEOMETRY.matchWindowSize,
            minimumConfidence: INSET_GEOMETRY.minimumMatchConfidence,
            minimumSequenceActivity: INSET_GEOMETRY.minimumSequenceActivity
          })
        : rawAnchors
      // A quiet region is only treated as an overlay when excluding it adds
      // consistent temporal evidence. This prevents ordinary static scenery
      // from winning geometry selection merely because it was masked.
      const mask = discoveredMask && maskImprovesConsistency(rawAnchors, maskedAnchors) ? discoveredMask : null
      const anchors = mask ? maskedAnchors : rawAnchors
      if (anchors.length < minimumAnchors) continue
      const clustered = densestOffsetCluster(anchors, INSET_GEOMETRY.offsetClusterToleranceSeconds)
      if (clustered.length < minimumAnchors) continue
      const offsets = clustered.map((anchor) => anchor.movieTime - anchor.reactionTime)
      const offset = median(offsets)
      const dispersion = median(offsets.map((value) => Math.abs(value - offset)))
      const consistent = clustered.filter((anchor) =>
        Math.abs(anchor.movieTime - anchor.reactionTime - offset) <= Math.max(
          INSET_GEOMETRY.minimumConsistencyToleranceSeconds,
          dispersion * INSET_GEOMETRY.dispersionMultiplier
        )
      )
      if (consistent.length < minimumAnchors) continue
      const confidence = consistent.reduce((sum, anchor) => sum + anchor.confidence, 0) / consistent.length
      const consistency = Math.max(0, 1 - dispersion / INSET_GEOMETRY.consistencyScaleSeconds)
      const score = confidence * GEOMETRY_SCORE_WEIGHTS.confidence +
        consistency * GEOMETRY_SCORE_WEIGHTS.consistency +
        Math.min(1, consistent.length / INSET_GEOMETRY.anchorSaturationCount) *
          GEOMETRY_SCORE_WEIGHTS.anchorCount
      const reference = [...consistent]
        .sort((a, b) => b.confidence - a.confidence || a.reactionTime - b.reactionTime)[0]
      scored.push({
        geometry,
        mask,
        score,
        confidence,
        offset,
        anchorCount: consistent.length,
        reference: { reactionTime: reference.reactionTime, movieTime: reference.movieTime },
        anchors: consistent
      })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (!best) return null
  const runnerUp = scored.find((value) =>
    geometryDistance(value.geometry, best.geometry) > INSET_GEOMETRY.runnerUpGeometryDistance
  ) ?? scored[1]
  const separation = runnerUp ? Math.max(0, best.score - runnerUp.score) : best.score
  const finalConfidence = Math.min(
    1,
    best.confidence * GEOMETRY_FINAL_CONFIDENCE_WEIGHT +
      separation * INSET_GEOMETRY.finalSeparationWeight +
      Math.min(
        INSET_GEOMETRY.maximumAnchorConfidenceBonus,
        best.anchorCount * INSET_GEOMETRY.confidenceBonusPerAnchor
      )
  )
  if (finalConfidence < (options.minimumConfidence ?? INSET_GEOMETRY.minimumConfidence)) return null
  return {
    geometry: best.geometry,
    mask: best.mask,
    confidence: finalConfidence,
    initialOffsetSeconds: best.offset,
    referenceReactionTime: best.reference.reactionTime,
    referenceMovieTime: best.reference.movieTime,
    anchors: best.anchors,
    anchorCount: best.anchorCount,
    runnerUpScore: runnerUp?.score ?? 0
  }
}

export function generateGeometryCandidates(reactionAspectRatio: number, movieAspectRatio: number): NormalizedRect[] {
  const result: NormalizedRect[] = [{ x: 0, y: 0, width: 1, height: 1 }]
  for (const width of GENERAL_GEOMETRY_WIDTHS) {
    // Reactors often place a CinemaScope movie inside a 16:9 player box. Try
    // both the encoded movie aspect and common video-container aspects.
    for (const contentAspectRatio of [movieAspectRatio, reactionAspectRatio, INSET_GEOMETRY.commonPlayerAspectRatio]) {
      const height = Math.min(1, width * reactionAspectRatio / contentAspectRatio)
      for (const horizontal of GEOMETRY_AXIS_POSITIONS) {
        for (const vertical of GEOMETRY_AXIS_POSITIONS) {
          result.push({
            x: (1 - width) * horizontal,
            y: (1 - height) * vertical,
            width,
            height
          })
        }
      }
    }
  }
  return dedupeRects(result)
}

export function generateCompactCornerCandidates(reactionAspectRatio: number, movieAspectRatio: number): NormalizedRect[] {
  const result: NormalizedRect[] = []
  // Some watchalong editors keep a deliberately blurred movie reference in a
  // tiny corner window. Keep this as a fallback search so ordinary reactions
  // retain the faster, higher-information geometry pass above.
  for (const width of COMPACT_GEOMETRY_WIDTHS) {
    for (const contentAspectRatio of [movieAspectRatio, reactionAspectRatio, INSET_GEOMETRY.commonPlayerAspectRatio]) {
      const height = Math.min(1, width * reactionAspectRatio / contentAspectRatio)
      for (const horizontal of GEOMETRY_CORNER_POSITIONS) {
        for (const vertical of GEOMETRY_CORNER_POSITIONS) {
          result.push({
            x: (1 - width) * horizontal,
            y: (1 - height) * vertical,
            width,
            height
          })
        }
      }
    }
  }
  return dedupeRects(result)
}

export function refineGeometryCandidates(base: InsetGeometry, reactionAspectRatio: number, movieAspectRatio: number): NormalizedRect[] {
  const candidates: NormalizedRect[] = [{ x: 0, y: 0, width: 1, height: 1 }]
  const detectedAspectRatio = base.width * reactionAspectRatio /
    Math.max(GEOMETRY_REFINEMENT.aspectRatioDenominatorFloor, base.height)
  const contentAspectRatio = Number.isFinite(detectedAspectRatio) && detectedAspectRatio > 0 ? detectedAspectRatio : movieAspectRatio
  const minimumWidth = base.width < GEOMETRY_REFINEMENT.narrowWidthThreshold
    ? GEOMETRY_REFINEMENT.narrowMinimumWidth
    : GEOMETRY_REFINEMENT.standardMinimumWidth
  for (const widthDelta of GEOMETRY_REFINEMENT.widthDeltas) {
    const width = clamp(base.width + widthDelta, minimumWidth, 1)
    const height = Math.min(1, width * reactionAspectRatio / contentAspectRatio)
    for (const xDelta of GEOMETRY_REFINEMENT.positionDeltas) {
      for (const yDelta of GEOMETRY_REFINEMENT.positionDeltas) {
        candidates.push({
          x: clamp(base.x + xDelta, 0, 1 - width),
          y: clamp(base.y + yDelta, 0, 1 - height),
          width,
          height
        })
      }
    }
  }
  return dedupeRects(candidates)
}

function selectProbeTimes(frames: TimedPixelFrame[], count: number): number[] {
  const margin = INSET_GEOMETRY.probeFrameMargin
  const available = frames.slice(margin, Math.max(margin + 1, frames.length - margin))
  return Array.from({ length: Math.min(count, available.length) }, (_, index) =>
    available[Math.round(index * (available.length - 1) / Math.max(1, Math.min(count, available.length) - 1))].time
  )
}

function geometryDistance(a: InsetGeometry, b: InsetGeometry): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) +
    Math.abs(a.width - b.width) + Math.abs(a.height - b.height) +
    (a.flipHorizontal === b.flipHorizontal ? 0 : INSET_GEOMETRY.flipDistancePenalty)
}

function dedupeRects(rects: NormalizedRect[]): NormalizedRect[] {
  const seen = new Set<string>()
  return rects.filter((rect) => {
    const key = [rect.x, rect.y, rect.width, rect.height]
      .map((value) => value.toFixed(GEOMETRY_KEY_DECIMAL_PLACES)).join(':')
    if (seen.has(key)) return false
    seen.add(key); return true
  })
}

function densestOffsetCluster(anchors: AutoSyncAnchor[], tolerance: number): AutoSyncAnchor[] {
  let best: AutoSyncAnchor[] = []
  let bestConfidence = 0
  for (const candidate of anchors) {
    const candidateOffset = candidate.movieTime - candidate.reactionTime
    const cluster = anchors.filter((anchor) => Math.abs((anchor.movieTime - anchor.reactionTime) - candidateOffset) <= tolerance)
    const confidence = cluster.reduce((sum, anchor) => sum + anchor.confidence, 0)
    if (cluster.length > best.length || (cluster.length === best.length && confidence > bestConfidence)) {
      best = cluster
      bestConfidence = confidence
    }
  }
  return best
}

function maskImprovesConsistency(rawAnchors: AutoSyncAnchor[], maskedAnchors: AutoSyncAnchor[]): boolean {
  const rawCluster = densestOffsetCluster(rawAnchors, INSET_GEOMETRY.offsetClusterToleranceSeconds)
  const maskedCluster = densestOffsetCluster(maskedAnchors, INSET_GEOMETRY.offsetClusterToleranceSeconds)
  // Discarding cells raises the risk of an accidental match, so masked
  // geometry requires one more corroborating probe than ordinary geometry.
  if (maskedCluster.length < INSET_GEOMETRY.maskMinimumAnchors) return false
  if (maskedCluster.length > rawCluster.length) return true
  if (maskedCluster.length !== rawCluster.length) return false
  const average = (anchors: AutoSyncAnchor[]): number =>
    anchors.reduce((sum, anchor) => sum + anchor.confidence, 0) / Math.max(1, anchors.length)
  return average(maskedCluster) >= average(rawCluster) + INSET_GEOMETRY.maskMinimumConfidenceImprovement
}
