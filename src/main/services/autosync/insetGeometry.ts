import { findSequenceAnchors, type AutoSyncAnchor, type TimedSignature } from './matching'
import { clamp, median } from '@shared/numeric'
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
  if (reactionFrames.length < 7 || movie.length < 7 || !Number.isFinite(options.movieAspectRatio) || options.movieAspectRatio <= 0) return null
  const candidates = options.candidates ?? generateGeometryCandidates(
    reactionFrames[0].width / reactionFrames[0].height,
    options.movieAspectRatio
  )
  // More cheap signature probes make large persistent overlays (notably
  // on-screen timers) unlikely to hide every usable moment.
  const probeTimes = selectProbeTimes(reactionFrames, 11)
  const minimumAnchors = options.minimumAnchors ?? 3
  const scored: ScoredGeometry[] = []
  for (const candidate of candidates) {
    for (const flipHorizontal of [false, true]) {
      const geometry = { ...candidate, flipHorizontal }
      const rawReaction = reactionFrames.map((frame) => ({
        time: frame.time,
        signature: createFrameSignature(frame, { crop: geometry, flipHorizontal, gridSize: options.gridSize ?? 8 })
      }))
      const rawAnchors = findSequenceAnchors(rawReaction, movie, probeTimes, {
        windowSize: 5,
        minimumConfidence: 0.28,
        minimumSequenceActivity: 0.018
      })
      // Bootstrap masking only after the crop shows at least two mutually
      // consistent sequence matches. This avoids doing expensive mask work on
      // obvious face-cam/background candidates and limits false positives.
      const discoveredMask = densestOffsetCluster(rawAnchors, 14).length >= 2
        ? createTemporalVarianceMask(rawReaction.map((frame) => frame.signature))
        : null
      const maskedReaction = discoveredMask
        ? rawReaction.map((frame) => ({ ...frame, signature: applySignatureMask(frame.signature, discoveredMask) }))
        : rawReaction
      const maskedAnchors = discoveredMask
        ? findSequenceAnchors(maskedReaction, movie, probeTimes, {
            windowSize: 5,
            minimumConfidence: 0.28,
            minimumSequenceActivity: 0.018
          })
        : rawAnchors
      // A quiet region is only treated as an overlay when excluding it adds
      // consistent temporal evidence. This prevents ordinary static scenery
      // from winning geometry selection merely because it was masked.
      const mask = discoveredMask && maskImprovesConsistency(rawAnchors, maskedAnchors) ? discoveredMask : null
      const anchors = mask ? maskedAnchors : rawAnchors
      if (anchors.length < minimumAnchors) continue
      const clustered = densestOffsetCluster(anchors, 14)
      if (clustered.length < minimumAnchors) continue
      const offsets = clustered.map((anchor) => anchor.movieTime - anchor.reactionTime)
      const offset = median(offsets)
      const dispersion = median(offsets.map((value) => Math.abs(value - offset)))
      const consistent = clustered.filter((anchor) => Math.abs(anchor.movieTime - anchor.reactionTime - offset) <= Math.max(1.5, dispersion * 3))
      if (consistent.length < minimumAnchors) continue
      const confidence = consistent.reduce((sum, anchor) => sum + anchor.confidence, 0) / consistent.length
      const consistency = Math.max(0, 1 - dispersion / 4)
      const score = confidence * 0.7 + consistency * 0.2 + Math.min(1, consistent.length / 4) * 0.1
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
  const runnerUp = scored.find((value) => geometryDistance(value.geometry, best.geometry) > 0.08) ?? scored[1]
  const separation = runnerUp ? Math.max(0, best.score - runnerUp.score) : best.score
  const finalConfidence = Math.min(1, best.confidence * 0.7 + separation * 1.5 + Math.min(0.15, best.anchorCount * 0.03))
  if (finalConfidence < (options.minimumConfidence ?? 0.44)) return null
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
  const widths = [0.32, 0.45, 0.6, 0.78]
  for (const width of widths) {
    // Reactors often place a CinemaScope movie inside a 16:9 player box. Try
    // both the encoded movie aspect and common video-container aspects.
    for (const contentAspectRatio of [movieAspectRatio, reactionAspectRatio, 16 / 9]) {
      const height = Math.min(1, width * reactionAspectRatio / contentAspectRatio)
      for (const horizontal of [0, 0.5, 1]) {
        for (const vertical of [0, 0.5, 1]) {
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
  for (const width of [0.2, 0.24, 0.28]) {
    for (const contentAspectRatio of [movieAspectRatio, reactionAspectRatio, 16 / 9]) {
      const height = Math.min(1, width * reactionAspectRatio / contentAspectRatio)
      for (const horizontal of [0, 1]) {
        for (const vertical of [0, 1]) {
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
  const detectedAspectRatio = base.width * reactionAspectRatio / Math.max(0.01, base.height)
  const contentAspectRatio = Number.isFinite(detectedAspectRatio) && detectedAspectRatio > 0 ? detectedAspectRatio : movieAspectRatio
  const minimumWidth = base.width < 0.32 ? 0.18 : 0.32
  for (const widthDelta of [-0.08, -0.04, 0, 0.04, 0.08]) {
    const width = clamp(base.width + widthDelta, minimumWidth, 1)
    const height = Math.min(1, width * reactionAspectRatio / contentAspectRatio)
    for (const xDelta of [-0.05, 0, 0.05]) for (const yDelta of [-0.05, 0, 0.05]) {
      candidates.push({
        x: clamp(base.x + xDelta, 0, 1 - width),
        y: clamp(base.y + yDelta, 0, 1 - height),
        width,
        height
      })
    }
  }
  return dedupeRects(candidates)
}

function selectProbeTimes(frames: TimedPixelFrame[], count: number): number[] {
  const margin = 3
  const available = frames.slice(margin, Math.max(margin + 1, frames.length - margin))
  return Array.from({ length: Math.min(count, available.length) }, (_, index) =>
    available[Math.round(index * (available.length - 1) / Math.max(1, Math.min(count, available.length) - 1))].time
  )
}

function geometryDistance(a: InsetGeometry, b: InsetGeometry): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.width - b.width) + Math.abs(a.height - b.height) + (a.flipHorizontal === b.flipHorizontal ? 0 : 0.2)
}

function dedupeRects(rects: NormalizedRect[]): NormalizedRect[] {
  const seen = new Set<string>()
  return rects.filter((rect) => {
    const key = [rect.x, rect.y, rect.width, rect.height].map((value) => value.toFixed(3)).join(':')
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
  const rawCluster = densestOffsetCluster(rawAnchors, 14)
  const maskedCluster = densestOffsetCluster(maskedAnchors, 14)
  // Discarding cells raises the risk of an accidental match, so masked
  // geometry requires one more corroborating probe than ordinary geometry.
  if (maskedCluster.length < 4) return false
  if (maskedCluster.length > rawCluster.length) return true
  if (maskedCluster.length !== rawCluster.length) return false
  const average = (anchors: AutoSyncAnchor[]): number =>
    anchors.reduce((sum, anchor) => sum + anchor.confidence, 0) / Math.max(1, anchors.length)
  return average(maskedCluster) >= average(rawCluster) + 0.08
}
