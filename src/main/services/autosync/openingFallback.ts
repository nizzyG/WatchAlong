import type { AutoSyncAnchor, TimedSignature } from './matching'
import { median } from '@shared/numeric'
import {
  GEOMETRY_KEY_DECIMAL_PLACES,
  OPENING_CANDIDATE_HEIGHTS,
  OPENING_CANDIDATE_VERTICAL_POSITIONS,
  OPENING_CANDIDATE_WIDTHS,
  OPENING_CANDIDATE_X_POSITIONS,
  OPENING_CANDIDATE_Y_POSITIONS,
  OPENING_EVIDENCE,
  OPENING_MOTION
} from './constants'

export interface OpeningEvidenceStats {
  offsetSeconds: number
  maximumDeviation: number
  count: number
  spanSeconds: number
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
  const values = best.map((anchor) => anchor.movieTime - rate * anchor.reactionTime).sort((a, b) => a - b)
  const offsetSeconds = values[Math.floor(values.length / 2)]
  const maximumDeviation = Math.max(...values.map((value) => Math.abs(value - offsetSeconds)))
  if (maximumDeviation > OPENING_EVIDENCE.maximumDeviationSeconds) return null
  return {
    offsetSeconds: Number(offsetSeconds.toFixed(OPENING_EVIDENCE.offsetDecimalPlaces)),
    maximumDeviation,
    count: values.length,
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
