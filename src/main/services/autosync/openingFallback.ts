import type { AutoSyncAnchor, TimedSignature } from './matching'
import { median } from '@shared/numeric'

export interface OpeningEvidenceStats {
  offsetSeconds: number
  maximumDeviation: number
  count: number
  spanSeconds: number
}

export function signatureWindow(signatures: TimedSignature[], centerTime: number, size: number): TimedSignature[] {
  if (!signatures.length || size < 3) return []
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
  if (distinct.length < 3) return null
  let best: AutoSyncAnchor[] = []
  let bestConfidence = 0
  for (const candidate of distinct) {
    const offset = candidate.movieTime - rate * candidate.reactionTime
    const cluster = distinct.filter((anchor) =>
      Math.abs((anchor.movieTime - rate * anchor.reactionTime) - offset) <= 0.75
    )
    const confidence = cluster.reduce((sum, anchor) => sum + anchor.confidence, 0)
    if (cluster.length > best.length || (cluster.length === best.length && confidence > bestConfidence)) {
      best = cluster
      bestConfidence = confidence
    }
  }
  if (best.length < 3) return null
  const spanSeconds = Math.max(...best.map((anchor) => anchor.reactionTime)) -
    Math.min(...best.map((anchor) => anchor.reactionTime))
  if (spanSeconds < 6) return null
  const values = best.map((anchor) => anchor.movieTime - rate * anchor.reactionTime).sort((a, b) => a - b)
  const offsetSeconds = values[Math.floor(values.length / 2)]
  const maximumDeviation = Math.max(...values.map((value) => Math.abs(value - offsetSeconds)))
  if (maximumDeviation > 0.75) return null
  return {
    offsetSeconds: Number(offsetSeconds.toFixed(6)),
    maximumDeviation,
    count: values.length,
    spanSeconds
  }
}

export function detectSustainedOpeningMotion(signatures: TimedSignature[], predictedStart: number): number | null {
  if (signatures.length < 12 || !Number.isFinite(predictedStart)) return null
  const activity = signatures.slice(1).map((current, index) => ({
    time: current.time,
    value: upperQuartileLumaChange(
      signatures[index].signature.luma,
      current.signature.luma,
      combinedCellWeights(signatures[index].signature.cellWeights, current.signature.cellWeights)
    )
  }))
  const candidates = activity.filter((item) => item.time >= predictedStart - 3 && item.time <= predictedStart + 2)
  const matches: Array<{ time: number; strength: number }> = []
  for (const candidate of candidates) {
    const before = activity
      .filter((item) => item.time >= candidate.time - 0.75 && item.time < candidate.time)
      .map((item) => item.value)
    const after = activity
      .filter((item) => item.time >= candidate.time && item.time <= candidate.time + 1)
      .map((item) => item.value)
    if (before.length < 3 || after.length < 5) continue
    const quiet = before.length ? median(before) : 0
    const moving = after.length ? median(after) : 0
    if (quiet <= 0.012 && moving >= 0.025 && moving >= quiet * 3 + 0.01) {
      matches.push({ time: candidate.time + 0.25, strength: moving - quiet })
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
  return candidates.flatMap((candidate) => [candidate, ...[0.65, 0.75, 0.85].map((vertical) => ({
    ...candidate,
    y: (1 - candidate.height) * vertical
  }))]).filter((candidate) => {
    const key = [candidate.x, candidate.y, candidate.width, candidate.height]
      .map((value) => value.toFixed(3)).join(':')
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
  for (const x of [0.3, 0.32, 0.34, 0.36]) {
    for (const y of [0.58, 0.61, 0.64, 0.67]) {
      for (const width of [0.32, 0.36, 0.4]) {
        for (const height of [0.18, 0.21, 0.24]) {
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
      Math.abs(kept.reactionTime - anchor.reactionTime) < 1 ||
      Math.abs(kept.movieTime - anchor.movieTime) < 1
    ))
    .sort((left, right) => left.reactionTime - right.reactionTime)
}

function upperQuartileLumaChange(left: Float32Array, right: Float32Array, weights?: Float32Array): number {
  if (left.length !== right.length || left.length === 0) return 0
  const differences = Array.from(left, (value, index) => Math.abs(value - right[index]) * (weights?.[index] ?? 1))
    .sort((a, b) => b - a)
  const count = Math.max(1, Math.ceil(differences.length * 0.25))
  return differences.slice(0, count).reduce((sum, value) => sum + value, 0) / count
}

function combinedCellWeights(left?: Float32Array, right?: Float32Array): Float32Array | undefined {
  if (!left && !right) return undefined
  const length = left?.length ?? right?.length ?? 0
  return Float32Array.from({ length }, (_, index) => Math.min(left?.[index] ?? 1, right?.[index] ?? 1))
}
