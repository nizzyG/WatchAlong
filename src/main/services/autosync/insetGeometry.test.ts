import { describe, expect, it } from 'vitest'
import { findInsetGeometry, generateGeometryCandidates, refineGeometryCandidates, type TimedPixelFrame } from './insetGeometry'
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

  it('considers player-container aspect ratios and preserves the detected shape during refinement', () => {
    const candidates = generateGeometryCandidates(16 / 9, 2.35)
    expect(candidates.some((candidate) =>
      candidate.x === 0 && candidate.y === 0.55 && candidate.width === 0.45 && candidate.height === 0.45
    )).toBe(true)
    expect(candidates.some((candidate) =>
      candidate.width === 0.45 && candidate.height < 0.36
    )).toBe(true)

    const refined = refineGeometryCandidates(
      { x: 0, y: 0.55, width: 0.45, height: 0.45, flipHorizontal: false },
      16 / 9,
      2.35
    )
    expect(refined.some((candidate) => candidate.width === 0.45 && candidate.height === 0.45)).toBe(true)
  })
})

function movieFrame(seed: number): PixelFrame {
  const frame = solidFrame(48, 36, [0, 0, 0])
  for (let y = 0; y < frame.height; y += 1) for (let x = 0; x < frame.width; x += 1) {
    const value = (seed * 43 + x * (seed % 5 + 2) + y * 9 + (x > seed % 40 ? 90 : 0)) % 255
    setPixel(frame, x, y, [value, (value + seed * 17) % 255, (255 - value + y * 3) % 255])
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

function setPixel(frame: PixelFrame, x: number, y: number, color: [number, number, number]): void {
  const index = (y * frame.width + x) * 3
  frame.data[index] = color[0]; frame.data[index + 1] = color[1]; frame.data[index + 2] = color[2]
}
