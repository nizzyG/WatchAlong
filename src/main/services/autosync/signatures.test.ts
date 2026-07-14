import { describe, expect, it } from 'vitest'
import {
  applySignatureMask,
  createFrameSignature,
  createTemporalOrdinalSignature,
  createTemporalVarianceMask,
  signatureDistance,
  temporalOrdinalDistance,
  type FrameSignature,
  type PixelFrame
} from './signatures'

describe('auto-sync frame signatures', () => {
  it('stays close after blur, scaling, and a small overlay', () => {
    const clear = patternedFrame(64, 64)
    const blurred = boxBlur(clear, 4)
    const scaled = scaleNearest(blurred, 40, 40)
    paintRect(scaled, 0, 0, 10, 5, [255, 255, 255])

    const clearSignature = createFrameSignature(clear)
    const distortedSignature = createFrameSignature(scaled)

    expect(signatureDistance(clearSignature, distortedSignature)).toBeLessThan(0.22)
  })

  it('separates unrelated broad frame structures', () => {
    const first = patternedFrame(64, 64)
    const second = patternedFrame(64, 64, true)
    expect(signatureDistance(createFrameSignature(first), createFrameSignature(second))).toBeGreaterThan(0.24)
  })

  it('reads a normalized crop and can unmirror it', () => {
    const movie = patternedFrame(32, 32)
    const reaction = solidFrame(80, 48, [12, 20, 28])
    blitScaled(movie, reaction, 40, 8, 32, 32, true)
    const movieSignature = createFrameSignature(movie)
    const insetSignature = createFrameSignature(reaction, {
      crop: { x: 0.5, y: 8 / 48, width: 0.4, height: 32 / 48 },
      flipHorizontal: true
    })
    expect(signatureDistance(movieSignature, insetSignature)).toBeLessThan(0.08)
  })

  it('discovers a persistent overlay from temporal variance and excludes it adaptively', () => {
    const movieFrames = Array.from({ length: 24 }, (_, index) => animatedFrame(64, 64, index))
    const reactionFrames = movieFrames.map((movie) => {
      const reaction = { ...movie, data: new Uint8Array(movie.data) }
      paintRect(reaction, 16, 16, 32, 24, [250, 250, 250])
      return reaction
    })
    const reactionSignatures = reactionFrames.map((frame) => createFrameSignature(frame, { gridSize: 8 }))
    const mask = createTemporalVarianceMask(reactionSignatures)

    expect(mask).not.toBeNull()
    expect(mask!.maskedFraction).toBeGreaterThan(0.15)
    expect(mask!.weights[3 * 8 + 3]).toBeLessThan(0.1)
    expect(mask!.weights[0]).toBe(1)

    const movieSignature = createFrameSignature(movieFrames[12], { gridSize: 8 })
    const unmasked = signatureDistance(reactionSignatures[12], movieSignature)
    const masked = signatureDistance(applySignatureMask(reactionSignatures[12], mask!), movieSignature)
    expect(masked).toBeLessThan(0.1)
    expect(masked).toBeLessThan(unmasked * 0.6)
  })

  it('does not invent a mask when the whole inset is changing', () => {
    const signatures = Array.from({ length: 24 }, (_, index) =>
      createFrameSignature(animatedFrame(64, 64, index), { gridSize: 8 })
    )
    expect(createTemporalVarianceMask(signatures)).toBeNull()
  })

  it('keeps temporal ordinal ranks invariant under monotonic luma changes', () => {
    const original = ordinalSequence([0.08, 0.31, 0.17, 0.82, 0.55])
    const gammaAdjusted = original.map((signature) => ({
      ...signature,
      luma: Float32Array.from(signature.luma, (value) => value ** 2.2)
    }))

    expect(temporalOrdinalDistance(
      createTemporalOrdinalSignature(original),
      createTemporalOrdinalSignature(gammaAdjusted)
    )).toBe(0)
  })

  it('normalizes a reversed odd-length temporal order to maximum distance', () => {
    const original = ordinalSequence([0, 0.25, 0.5, 0.75, 1])
    const reversed = ordinalSequence([1, 0.75, 0.5, 0.25, 0])
    expect(temporalOrdinalDistance(
      createTemporalOrdinalSignature(original),
      createTemporalOrdinalSignature(reversed)
    )).toBe(1)
  })

  it('uses signature cell weights to prevent a localized overlay from dominating TOM', () => {
    const original = ordinalSequence([0.1, 0.3, 0.2, 0.7, 0.5])
    const overlaid = original.map((signature, frame) => {
      const luma = new Float32Array(signature.luma)
      luma[0] = 1 - frame * 0.2
      const cellWeights = new Float32Array(signature.luma.length).fill(1)
      cellWeights[0] = 0.06
      return { ...signature, luma, cellWeights }
    })
    expect(temporalOrdinalDistance(
      createTemporalOrdinalSignature(original),
      createTemporalOrdinalSignature(overlaid)
    )).toBeLessThan(0.01)
  })
})

function ordinalSequence(values: number[]): FrameSignature[] {
  return values.map((value, frame) => {
    const luma = Float32Array.from({ length: 16 }, (_, cell) => value + cell * 0.01 + frame * cell * 0.001)
    return {
      gridSize: 4,
      luma,
      chromaU: new Float32Array(16),
      chromaV: new Float32Array(16),
      meanLuma: value,
      contrast: 0.05,
      edgeEnergy: 0.1
    }
  })
}

function patternedFrame(width: number, height: number, inverse = false): PixelFrame {
  const frame = solidFrame(width, height, [0, 0, 0])
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const region = (x < width / 2 ? 30 : 190) + (y < height / 2 ? 20 : -10)
      const value = inverse ? 255 - region : region
      setPixel(frame, x, y, [value, (value * 0.65) % 255, (value * 1.25) % 255])
    }
  }
  return frame
}

function animatedFrame(width: number, height: number, time: number): PixelFrame {
  const frame = solidFrame(width, height, [0, 0, 0])
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const cellX = Math.floor(x / 8)
    const cellY = Math.floor(y / 8)
    let hash = Math.imul(time + 11, 0x45d9f3b) ^ Math.imul(cellX + 7, 0x119de1f3) ^ Math.imul(cellY + 13, 0x3449f5)
    hash ^= hash >>> 16
    const value = hash & 255
    setPixel(frame, x, y, [value, (hash >>> 8) & 255, (hash >>> 16) & 255])
  }
  return frame
}

function solidFrame(width: number, height: number, color: [number, number, number]): PixelFrame {
  const frame: PixelFrame = { width, height, channels: 3, data: new Uint8Array(width * height * 3) }
  paintRect(frame, 0, 0, width, height, color)
  return frame
}

function boxBlur(frame: PixelFrame, radius: number): PixelFrame {
  const result = solidFrame(frame.width, frame.height, [0, 0, 0])
  for (let y = 0; y < frame.height; y += 1) for (let x = 0; x < frame.width; x += 1) {
    const color: [number, number, number] = [0, 0, 0]
    let count = 0
    for (let yy = Math.max(0, y - radius); yy <= Math.min(frame.height - 1, y + radius); yy += 1) {
      for (let xx = Math.max(0, x - radius); xx <= Math.min(frame.width - 1, x + radius); xx += 1) {
        const index = (yy * frame.width + xx) * 3
        color[0] += frame.data[index]; color[1] += frame.data[index + 1]; color[2] += frame.data[index + 2]; count += 1
      }
    }
    setPixel(result, x, y, color.map((value) => value / count) as [number, number, number])
  }
  return result
}

function scaleNearest(source: PixelFrame, width: number, height: number): PixelFrame {
  const result = solidFrame(width, height, [0, 0, 0])
  blitScaled(source, result, 0, 0, width, height, false)
  return result
}

function blitScaled(source: PixelFrame, target: PixelFrame, x0: number, y0: number, width: number, height: number, mirrored: boolean): void {
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sx0 = Math.min(source.width - 1, Math.floor(x / width * source.width))
    const sx = mirrored ? source.width - 1 - sx0 : sx0
    const sy = Math.min(source.height - 1, Math.floor(y / height * source.height))
    const index = (sy * source.width + sx) * 3
    setPixel(target, x0 + x, y0 + y, [source.data[index], source.data[index + 1], source.data[index + 2]])
  }
}

function paintRect(frame: PixelFrame, x0: number, y0: number, width: number, height: number, color: [number, number, number]): void {
  for (let y = y0; y < y0 + height; y += 1) for (let x = x0; x < x0 + width; x += 1) setPixel(frame, x, y, color)
}

function setPixel(frame: PixelFrame, x: number, y: number, color: [number, number, number]): void {
  const index = (y * frame.width + x) * 3
  frame.data[index] = color[0]; frame.data[index + 1] = color[1]; frame.data[index + 2] = color[2]
}
