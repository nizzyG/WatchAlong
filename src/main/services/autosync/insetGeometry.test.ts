import { describe, expect, it } from 'vitest'
import {
  findInsetGeometry,
  generateCompactCornerCandidates,
  generateGeometryCandidates,
  refineGeometryCandidates,
  type TimedPixelFrame
} from './insetGeometry'
import { createFrameSignature, type PixelFrame } from './signatures'

describe('auto-sync inset geometry', () => {
  it('finds a consistent mirrored corner inset across a sequence', () => {
    const movies = Array.from({ length: 35 }, (_, index) => movieFrame(index))
    const movieTimeline = movies.map((frame, index) => ({ time: index, signature: createFrameSignature(frame, { gridSize: 8 }) }))
    const reactions: TimedPixelFrame[] = Array.from({ length: 25 }, (_, index) => {
      const reaction = solidFrame(96, 54, [18 + index % 3, 20, 28]) as TimedPixelFrame
      reaction.time = index + 8
      blit(movies[index], reaction, 58, 2, 36, 27, true)
      return reaction
    })
    const result = findInsetGeometry(reactions, movieTimeline, {
      movieAspectRatio: 4 / 3,
      candidates: [
        { x: 0, y: 0, width: 1, height: 1 },
        { x: 58 / 96, y: 2 / 54, width: 36 / 96, height: 27 / 54 },
        { x: 0, y: 0.5, width: 0.4, height: 0.5 }
      ],
      minimumAnchors: 2,
      minimumConfidence: 0.35
    })
    expect(result?.geometry.flipHorizontal).toBe(true)
    expect(result?.geometry.x).toBeCloseTo(58 / 96, 3)
    expect(result?.initialOffsetSeconds).toBeCloseTo(-8, 0)
  })

  it('returns null when no candidate is consistent', () => {
    const movies = Array.from({ length: 20 }, (_, index) => movieFrame(index))
    const movieTimeline = movies.map((frame, index) => ({ time: index, signature: createFrameSignature(frame, { gridSize: 8 }) }))
    const reactions = Array.from({ length: 15 }, (_, index) => ({ ...movieFrame(index + 100), time: index }))
    expect(findInsetGeometry(reactions, movieTimeline, {
      movieAspectRatio: 4 / 3,
      candidates: [{ x: 0, y: 0, width: 1, height: 1 }],
      minimumConfidence: 0.8
    })).toBeNull()
  })

  it('finds a compact blurred corner inset beneath a static overlay', () => {
    const movies = Array.from({ length: 50 }, (_, index) => movieFrame(index, 64, 36))
    const movieTimeline = movies.map((frame, index) => ({
      time: index * 4,
      signature: createFrameSignature(frame, { gridSize: 6 })
    }))
    const reactions: TimedPixelFrame[] = movies.map((movie, index) => {
      const reaction = noiseFrame(10_000 + index, 96, 54) as TimedPixelFrame
      reaction.time = (index + 10) * 4
      blurredBlit(movie, reaction, 0, 41, 23, 13, 2)
      // A persistent timecode/title treatment obscures part of the reference.
      fillRect(reaction, 2, 43, 19, 3, [238, 235, 220])
      fillRect(reaction, 5, 44, 2, 2, [22, 20, 18])
      fillRect(reaction, 11, 44, 2, 2, [22, 20, 18])
      return reaction
    })

    const result = findInsetGeometry(reactions, movieTimeline, {
      movieAspectRatio: 16 / 9,
      gridSize: 6,
      minimumConfidence: 0.4,
      candidates: generateCompactCornerCandidates(16 / 9, 16 / 9)
    })

    expect(result?.geometry.x).toBe(0)
    expect(result?.geometry.y).toBeGreaterThan(0.7)
    expect(result?.geometry.width).toBeGreaterThanOrEqual(0.2)
    expect(result?.geometry.width).toBeLessThan(0.32)
    expect(result?.initialOffsetSeconds).toBeCloseTo(-40, 0)
  })

  it('rejects an unrelated video with a static corner logo', () => {
    const movies = Array.from({ length: 35 }, (_, index) => noiseFrame(index, 64, 36))
    const movieTimeline = movies.map((frame, index) => ({
      time: index * 4,
      signature: createFrameSignature(frame, { gridSize: 6 })
    }))
    const reactions: TimedPixelFrame[] = Array.from({ length: 35 }, (_, index) => {
      const reaction = solidFrame(96, 54, [42, 38, 34]) as TimedPixelFrame
      reaction.time = index * 4
      fillRect(reaction, 0, 43, 20, 11, [226, 220, 198])
      fillRect(reaction, 3, 46, 14, 2, [35, 31, 27])
      return reaction
    })

    expect(findInsetGeometry(reactions, movieTimeline, {
      movieAspectRatio: 16 / 9,
      gridSize: 6,
      minimumConfidence: 0.4,
      candidates: generateCompactCornerCandidates(16 / 9, 16 / 9)
    })).toBeNull()
  })

  it('considers player-container aspect ratios and preserves the detected shape during refinement', () => {
    const candidates = generateGeometryCandidates(16 / 9, 2.35)
    expect(candidates.every((candidate) => candidate.width >= 0.32)).toBe(true)
    expect(candidates.some((candidate) =>
      candidate.x === 0 && candidate.y === 0.55 && candidate.width === 0.45 && candidate.height === 0.45
    )).toBe(true)
    expect(candidates.some((candidate) =>
      candidate.width === 0.45 && candidate.height < 0.36
    )).toBe(true)
    const compactCandidates = generateCompactCornerCandidates(16 / 9, 2.35)
    expect(compactCandidates.some((candidate) =>
      candidate.x === 0 && candidate.width === 0.2 && candidate.y > 0.7
    )).toBe(true)
    expect(compactCandidates.some((candidate) =>
      candidate.x === 0 && candidate.width === 0.24 && candidate.y > 0.7
    )).toBe(true)
    const squareCompactCorners = new Set(compactCandidates
      .filter((candidate) => candidate.width === 0.24 && candidate.height === 0.24)
      .map((candidate) => `${candidate.x.toFixed(2)}:${candidate.y.toFixed(2)}`))
    expect(squareCompactCorners).toEqual(new Set(['0.00:0.00', '0.00:0.76', '0.76:0.00', '0.76:0.76']))

    const refined = refineGeometryCandidates(
      { x: 0, y: 0.55, width: 0.45, height: 0.45, flipHorizontal: false },
      16 / 9,
      2.35
    )
    expect(refined.some((candidate) => candidate.width === 0.45 && candidate.height === 0.45)).toBe(true)
    const standardEdgeRefined = refineGeometryCandidates(
      { x: 0, y: 0.68, width: 0.32, height: 0.32, flipHorizontal: false },
      16 / 9,
      16 / 9
    )
    expect(standardEdgeRefined.every((candidate) => candidate.width >= 0.32)).toBe(true)

    const compactRefined = refineGeometryCandidates(
      { x: 0, y: 0.76, width: 0.24, height: 0.24, flipHorizontal: false },
      16 / 9,
      16 / 9
    )
    expect(compactRefined.some((candidate) =>
      candidate.x === 0 && candidate.width === 0.24 && candidate.height === 0.24
    )).toBe(true)
  })
})

function movieFrame(seed: number, width = 48, height = 36): PixelFrame {
  const frame = solidFrame(width, height, [0, 0, 0])
  for (let y = 0; y < frame.height; y += 1) for (let x = 0; x < frame.width; x += 1) {
    const value = (seed * 43 + x * (seed % 5 + 2) + y * 9 + (x > seed % 40 ? 90 : 0)) % 255
    setPixel(frame, x, y, [value, (value + seed * 17) % 255, (255 - value + y * 3) % 255])
  }
  return frame
}

function noiseFrame(seed: number, width: number, height: number): PixelFrame {
  const frame = solidFrame(width, height, [0, 0, 0])
  let state = (seed + 1) >>> 0
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5
    const value = state & 0xff
    setPixel(frame, x, y, [value, (value * 3 + x) & 0xff, (255 - value + y) & 0xff])
  }
  return frame
}

function solidFrame(width: number, height: number, color: [number, number, number]): PixelFrame {
  const frame: PixelFrame = { width, height, channels: 3, data: new Uint8Array(width * height * 3) }
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) setPixel(frame, x, y, color)
  return frame
}

function blit(source: PixelFrame, target: PixelFrame, x0: number, y0: number, width: number, height: number, mirrored: boolean): void {
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sx0 = Math.floor(x / width * source.width)
    const sx = mirrored ? source.width - 1 - sx0 : sx0
    const sy = Math.floor(y / height * source.height)
    const index = (sy * source.width + sx) * 3
    setPixel(target, x0 + x, y0 + y, [source.data[index], source.data[index + 1], source.data[index + 2]])
  }
}

function blurredBlit(source: PixelFrame, target: PixelFrame, x0: number, y0: number, width: number, height: number, radius: number): void {
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const centerX = Math.floor(x / width * source.width)
    const centerY = Math.floor(y / height * source.height)
    const color: [number, number, number] = [0, 0, 0]
    let count = 0
    for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      const sx = Math.min(source.width - 1, Math.max(0, centerX + dx))
      const sy = Math.min(source.height - 1, Math.max(0, centerY + dy))
      const index = (sy * source.width + sx) * 3
      color[0] += source.data[index]; color[1] += source.data[index + 1]; color[2] += source.data[index + 2]
      count += 1
    }
    setPixel(target, x0 + x, y0 + y, color.map((value) => Math.round(value / count)) as [number, number, number])
  }
}

function fillRect(frame: PixelFrame, x0: number, y0: number, width: number, height: number, color: [number, number, number]): void {
  for (let y = y0; y < y0 + height; y += 1) for (let x = x0; x < x0 + width; x += 1) setPixel(frame, x, y, color)
}

function setPixel(frame: PixelFrame, x: number, y: number, color: [number, number, number]): void {
  const index = (y * frame.width + x) * 3
  frame.data[index] = color[0]; frame.data[index + 1] = color[1]; frame.data[index + 2] = color[2]
}
