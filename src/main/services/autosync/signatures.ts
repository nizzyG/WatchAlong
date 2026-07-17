import { clamp, clamp01, median } from '@shared/numeric'
import {
  NORMALIZED_RECT_MINIMUM_SIZE,
  SIGNATURE_DISTANCE,
  SIGNATURE_DISTANCE_WEIGHTS,
  SIGNATURE_GRID,
  TEMPORAL_MASK,
  WEIGHT_EPSILON
} from './constants'

export interface PixelFrame {
  data: Uint8Array
  width: number
  height: number
  channels?: 3 | 4
}

export interface NormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

export interface FrameSignature {
  gridSize: number
  luma: Float32Array
  chromaU: Float32Array
  chromaV: Float32Array
  cellWeights?: Float32Array
  meanLuma: number
  contrast: number
  edgeEnergy: number
}

export interface SignatureCellMask {
  gridSize: number
  weights: Float32Array
  maskedFraction: number
}

export interface TemporalOrdinalSignature {
  gridSize: number
  windowSize: number
  ranks: Float32Array
  cellWeights: Float32Array
}

export interface TemporalMaskOptions {
  maximumMaskedFraction?: number
  minimumComponentSize?: number
}

export interface SignatureOptions {
  gridSize?: number
  crop?: NormalizedRect
  flipHorizontal?: boolean
}

const FULL_FRAME: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 }

export function createFrameSignature(frame: PixelFrame, options: SignatureOptions = {}): FrameSignature {
  validateFrame(frame)
  const gridSize = Math.max(
    SIGNATURE_GRID.minimum,
    Math.min(SIGNATURE_GRID.maximum, Math.round(options.gridSize ?? SIGNATURE_GRID.default))
  )
  const crop = normalizeRect(options.crop ?? FULL_FRAME)
  const channels = frame.channels ?? 3
  const cellCount = gridSize * gridSize
  const luma = new Float32Array(cellCount)
  const chromaU = new Float32Array(cellCount)
  const chromaV = new Float32Array(cellCount)

  for (let gy = 0; gy < gridSize; gy += 1) {
    for (let gx = 0; gx < gridSize; gx += 1) {
      const sourceGx = options.flipHorizontal ? gridSize - 1 - gx : gx
      const x0 = Math.floor((crop.x + crop.width * (sourceGx / gridSize)) * frame.width)
      const x1 = Math.max(x0 + 1, Math.ceil((crop.x + crop.width * ((sourceGx + 1) / gridSize)) * frame.width))
      const y0 = Math.floor((crop.y + crop.height * (gy / gridSize)) * frame.height)
      const y1 = Math.max(y0 + 1, Math.ceil((crop.y + crop.height * ((gy + 1) / gridSize)) * frame.height))
      let sumY = 0
      let sumU = 0
      let sumV = 0
      let samples = 0
      for (let y = clamp(y0, 0, frame.height - 1); y < Math.min(frame.height, y1); y += 1) {
        for (let x = clamp(x0, 0, frame.width - 1); x < Math.min(frame.width, x1); x += 1) {
          const index = (y * frame.width + x) * channels
          const r = frame.data[index] / 255
          const g = frame.data[index + 1] / 255
          const b = frame.data[index + 2] / 255
          sumY += 0.2126 * r + 0.7152 * g + 0.0722 * b
          sumU += b - (0.2126 * r + 0.7152 * g + 0.0722 * b)
          sumV += r - (0.2126 * r + 0.7152 * g + 0.0722 * b)
          samples += 1
        }
      }
      const outputIndex = gy * gridSize + gx
      luma[outputIndex] = samples ? sumY / samples : 0
      chromaU[outputIndex] = samples ? sumU / samples : 0
      chromaV[outputIndex] = samples ? sumV / samples : 0
    }
  }

  const meanLuma = mean(luma)
  let variance = 0
  let edgeEnergy = 0
  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const index = y * gridSize + x
      variance += (luma[index] - meanLuma) ** 2
      if (x > 0) edgeEnergy += Math.abs(luma[index] - luma[index - 1])
      if (y > 0) edgeEnergy += Math.abs(luma[index] - luma[index - gridSize])
    }
  }

  return {
    gridSize,
    luma,
    chromaU,
    chromaV,
    meanLuma,
    contrast: Math.sqrt(variance / cellCount),
    edgeEnergy: edgeEnergy / Math.max(1, cellCount * 2 - gridSize * 2)
  }
}

export function signatureDistance(a: FrameSignature, b: FrameSignature): number {
  if (a.gridSize !== b.gridSize || a.luma.length !== b.luma.length) {
    throw new Error('Signature grids must have the same dimensions.')
  }

  const weights = combinedWeights(a, b)
  const statsA = weightedLumaStats(a.luma, weights)
  const statsB = weightedLumaStats(b.luma, weights)
  const lumaErrors: WeightedValue[] = []
  const chromaErrors: WeightedValue[] = []
  for (let index = 0; index < a.luma.length; index += 1) {
    const normalizedA = (a.luma[index] - statsA.mean) /
      Math.max(SIGNATURE_DISTANCE.minimumLumaContrast, statsA.contrast)
    const normalizedB = (b.luma[index] - statsB.mean) /
      Math.max(SIGNATURE_DISTANCE.minimumLumaContrast, statsB.contrast)
    lumaErrors.push({
      value: Math.min(SIGNATURE_DISTANCE.maximumLumaError, Math.abs(normalizedA - normalizedB)) /
        SIGNATURE_DISTANCE.maximumLumaError,
      weight: weights[index]
    })
    chromaErrors.push({
      value: Math.min(
        SIGNATURE_DISTANCE.maximumChromaError,
        Math.abs(a.chromaU[index] - b.chromaU[index]) + Math.abs(a.chromaV[index] - b.chromaV[index])
      ),
      weight: weights[index]
    })
  }

  // Ignore the worst cells so timers, subtitles, and face-cam overlap do not dominate.
  const spatial = weightedTrimmedMean(lumaErrors, SIGNATURE_DISTANCE.retainedSpatialFraction)
  const chroma = weightedTrimmedMean(chromaErrors, SIGNATURE_DISTANCE.retainedChromaFraction)
  const brightness = Math.min(
    1,
    Math.abs(statsA.mean - statsB.mean) * SIGNATURE_DISTANCE.brightnessMultiplier
  )
  const contrast = Math.min(
    1,
    Math.abs(statsA.contrast - statsB.contrast) * SIGNATURE_DISTANCE.contrastMultiplier
  )
  return clamp01(
    spatial * SIGNATURE_DISTANCE_WEIGHTS.spatial +
    chroma * SIGNATURE_DISTANCE_WEIGHTS.chroma +
    brightness * SIGNATURE_DISTANCE_WEIGHTS.brightness +
    contrast * SIGNATURE_DISTANCE_WEIGHTS.contrast
  )
}

export function signatureSimilarity(a: FrameSignature, b: FrameSignature): number {
  return 1 - signatureDistance(a, b)
}

/**
 * Ranks each spatial cell along one exact comparison window. Candidate windows
 * must be ranked independently: ranks from unrelated sliding neighborhoods are
 * not comparable (Chen–Stentiford temporal ordinal measurement).
 */
export function createTemporalOrdinalSignature(signatures: FrameSignature[]): TemporalOrdinalSignature {
  const first = signatures[0]
  if (!first || signatures.length < 2) {
    throw new Error('Temporal ordinal signatures need at least two frames.')
  }
  if (signatures.some((signature) =>
    signature.gridSize !== first.gridSize || signature.luma.length !== first.luma.length
  )) {
    throw new Error('Temporal ordinal signature grids must have the same dimensions.')
  }

  const windowSize = signatures.length
  const cellCount = first.luma.length
  const ranks = new Float32Array(windowSize * cellCount)
  const cellWeights = new Float32Array(cellCount).fill(1)
  for (let cell = 0; cell < cellCount; cell += 1) {
    for (let frame = 0; frame < windowSize; frame += 1) {
      const value = signatures[frame].luma[cell]
      let rank = 0
      for (let comparison = 0; comparison < windowSize; comparison += 1) {
        const other = signatures[comparison].luma[cell]
        if (other < value) rank += 1
        else if (comparison !== frame && other === value) rank += 0.5
      }
      ranks[frame * cellCount + cell] = rank
      cellWeights[cell] = Math.min(cellWeights[cell], signatures[frame].cellWeights?.[cell] ?? 1)
    }
  }
  return { gridSize: first.gridSize, windowSize, ranks, cellWeights }
}

export function temporalOrdinalDistance(
  a: TemporalOrdinalSignature,
  b: TemporalOrdinalSignature
): number {
  if (a.gridSize !== b.gridSize || a.windowSize !== b.windowSize || a.ranks.length !== b.ranks.length) {
    throw new Error('Temporal ordinal signatures must have the same dimensions.')
  }
  const cellCount = a.gridSize * a.gridSize
  // Maximum Spearman footrule distance between two permutations. floor() is
  // required for odd windows; W²/2 would never reach one for the windows we use.
  const normalization = Math.max(1, Math.floor((a.windowSize ** 2) / 2))
  let weightedDistance = 0
  let weightTotal = 0
  for (let cell = 0; cell < cellCount; cell += 1) {
    const weight = Math.min(a.cellWeights[cell] ?? 1, b.cellWeights[cell] ?? 1)
    if (weight <= 0) continue
    let distance = 0
    for (let frame = 0; frame < a.windowSize; frame += 1) {
      const index = frame * cellCount + cell
      distance += Math.abs(a.ranks[index] - b.ranks[index])
    }
    weightedDistance += Math.min(1, distance / normalization) * weight
    weightTotal += weight
  }
  return clamp01(weightedDistance / Math.max(WEIGHT_EPSILON, weightTotal))
}

export function mirrorSignature(signature: FrameSignature): FrameSignature {
  const mirror = (values: Float32Array): Float32Array => {
    const result = new Float32Array(values.length)
    for (let y = 0; y < signature.gridSize; y += 1) {
      for (let x = 0; x < signature.gridSize; x += 1) {
        result[y * signature.gridSize + x] = values[y * signature.gridSize + (signature.gridSize - 1 - x)]
      }
    }
    return result
  }
  return {
    ...signature,
    luma: mirror(signature.luma),
    chromaU: mirror(signature.chromaU),
    chromaV: mirror(signature.chromaV),
    cellWeights: signature.cellWeights ? mirror(signature.cellWeights) : undefined
  }
}

export function applySignatureMask(signature: FrameSignature, mask: SignatureCellMask | undefined): FrameSignature {
  if (!mask) return signature
  const cellWeights = mask.gridSize === signature.gridSize
    ? new Float32Array(mask.weights)
    : resampleWeights(mask, signature.gridSize)
  return { ...signature, cellWeights }
}

export function createTemporalVarianceMask(
  signatures: FrameSignature[],
  options: TemporalMaskOptions = {}
): SignatureCellMask | null {
  const first = signatures[0]
  const activity = calculateTemporalCellActivity(signatures)
  if (!first || !activity) return null
  const cellCount = first.luma.length

  const medianActivity = medianArray(activity)
  const quietActivity = percentileArray(activity, TEMPORAL_MASK.quietPercentile)
  // Require a distinct quiet population. This avoids masking an unobstructed
  // crop merely because the whole scene happens to be low-motion.
  if (medianActivity < TEMPORAL_MASK.minimumMedianActivity ||
    quietActivity / medianActivity > TEMPORAL_MASK.maximumQuietToMedianRatio) return null
  const seedThreshold = Math.min(
    TEMPORAL_MASK.maximumSeedActivity,
    medianActivity * TEMPORAL_MASK.seedMedianMultiplier
  )
  const growThreshold = Math.min(
    TEMPORAL_MASK.maximumGrowActivity,
    medianActivity * TEMPORAL_MASK.growMedianMultiplier
  )
  const seed = Array.from(activity, (value) => value <= seedThreshold)
  const eligible = Array.from(activity, (value) => value <= growThreshold)
  const selected = connectedStaticCells(
    seed,
    eligible,
    first.gridSize,
    options.minimumComponentSize ?? TEMPORAL_MASK.minimumComponentSize
  )
  const maximumMasked = Math.max(
    1,
    Math.floor(cellCount * (options.maximumMaskedFraction ?? TEMPORAL_MASK.maximumMaskedFraction))
  )
  const ranked = [...selected].sort((a, b) => activity[a] - activity[b]).slice(0, maximumMasked)
  if (ranked.length < (options.minimumComponentSize ?? TEMPORAL_MASK.minimumComponentSize)) return null

  const weights = new Float32Array(cellCount).fill(1)
  for (const index of ranked) weights[index] = TEMPORAL_MASK.maskedCellWeight
  return { gridSize: first.gridSize, weights, maskedFraction: ranked.length / cellCount }
}

function calculateTemporalCellActivity(signatures: FrameSignature[]): Float32Array | null {
  const first = signatures[0]
  if (!first || signatures.length < TEMPORAL_MASK.minimumSignatures ||
    signatures.some((signature) => signature.gridSize !== first.gridSize)) return null
  const activity = new Float32Array(first.luma.length)
  for (let cell = 0; cell < activity.length; cell += 1) {
    const lumaValues = signatures.map((signature) => signature.luma[cell])
    const uValues = signatures.map((signature) => signature.chromaU[cell])
    const vValues = signatures.map((signature) => signature.chromaV[cell])
    activity[cell] = robustSpread(lumaValues) +
      (robustSpread(uValues) + robustSpread(vValues)) * TEMPORAL_MASK.chromaActivityWeight
  }
  return activity
}

function validateFrame(frame: PixelFrame): void {
  const channels = frame.channels ?? 3
  if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width <= 0 || frame.height <= 0) {
    throw new Error('Frame dimensions must be positive integers.')
  }
  if (frame.data.length < frame.width * frame.height * channels) {
    throw new Error('Frame pixel buffer is smaller than its declared dimensions.')
  }
}

function normalizeRect(rect: NormalizedRect): NormalizedRect {
  const x = clamp01(rect.x)
  const y = clamp01(rect.y)
  return {
    x,
    y,
    width: Math.max(NORMALIZED_RECT_MINIMUM_SIZE, Math.min(1 - x, rect.width)),
    height: Math.max(NORMALIZED_RECT_MINIMUM_SIZE, Math.min(1 - y, rect.height))
  }
}

interface WeightedValue { value: number; weight: number }

function weightedTrimmedMean(values: WeightedValue[], keepFraction: number): number {
  const sorted = [...values].filter((item) => item.weight > 0).sort((a, b) => a.value - b.value)
  const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0)
  const targetWeight = Math.max(WEIGHT_EPSILON, totalWeight * keepFraction)
  let usedWeight = 0
  let sum = 0
  for (const item of sorted) {
    const weight = Math.min(item.weight, targetWeight - usedWeight)
    if (weight <= 0) break
    sum += item.value * weight
    usedWeight += weight
  }
  return sum / Math.max(WEIGHT_EPSILON, usedWeight)
}

function combinedWeights(a: FrameSignature, b: FrameSignature): Float32Array {
  const weights = new Float32Array(a.luma.length)
  for (let index = 0; index < weights.length; index += 1) {
    weights[index] = Math.min(a.cellWeights?.[index] ?? 1, b.cellWeights?.[index] ?? 1)
  }
  return weights
}

function weightedLumaStats(values: Float32Array, weights: Float32Array): { mean: number; contrast: number } {
  let weightSum = 0
  let sum = 0
  for (let index = 0; index < values.length; index += 1) {
    weightSum += weights[index]
    sum += values[index] * weights[index]
  }
  const meanValue = sum / Math.max(WEIGHT_EPSILON, weightSum)
  let variance = 0
  for (let index = 0; index < values.length; index += 1) variance += (values[index] - meanValue) ** 2 * weights[index]
  return { mean: meanValue, contrast: Math.sqrt(variance / Math.max(WEIGHT_EPSILON, weightSum)) }
}

function robustSpread(values: number[]): number {
  const center = median(values)
  return median(values.map((value) => Math.abs(value - center))) * 1.4826
}

function connectedStaticCells(seed: boolean[], eligible: boolean[], gridSize: number, minimumSize: number): Set<number> {
  const selected = new Set<number>()
  const visited = new Set<number>()
  for (let start = 0; start < eligible.length; start += 1) {
    if (!eligible[start] || visited.has(start)) continue
    const component: number[] = []
    const queue = [start]
    visited.add(start)
    let hasSeed = false
    while (queue.length) {
      const index = queue.pop()!
      component.push(index)
      hasSeed ||= seed[index]
      const x = index % gridSize
      const y = Math.floor(index / gridSize)
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize) continue
        const next = ny * gridSize + nx
        if (eligible[next] && !visited.has(next)) { visited.add(next); queue.push(next) }
      }
    }
    if (hasSeed && component.length >= minimumSize) for (const index of component) selected.add(index)
  }
  return selected
}

function resampleWeights(mask: SignatureCellMask, targetGridSize: number): Float32Array {
  const result = new Float32Array(targetGridSize * targetGridSize)
  for (let y = 0; y < targetGridSize; y += 1) for (let x = 0; x < targetGridSize; x += 1) {
    const sourceX = Math.min(mask.gridSize - 1, Math.floor((x + 0.5) / targetGridSize * mask.gridSize))
    const sourceY = Math.min(mask.gridSize - 1, Math.floor((y + 0.5) / targetGridSize * mask.gridSize))
    result[y * targetGridSize + x] = mask.weights[sourceY * mask.gridSize + sourceX]
  }
  return result
}

function medianArray(values: Float32Array): number {
  return median(Array.from(values))
}

function percentileArray(values: Float32Array, fraction: number): number {
  const sorted = Array.from(values).sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)))]
}

function mean(values: Float32Array): number {
  let sum = 0
  for (const value of values) sum += value
  return sum / Math.max(1, values.length)
}
