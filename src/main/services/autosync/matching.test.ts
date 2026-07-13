import { describe, expect, it } from 'vitest'
import { createFrameSignature, type PixelFrame } from './signatures'
import { findSequenceAnchors, matchSequence, type TimedSignature } from './matching'

describe('auto-sync sequence matching', () => {
  it('finds the same sequence at a different timeline position', () => {
    const movie = timeline(80, 1)
    const reaction = movie.slice(20, 45).map((item, index) => ({ ...item, time: index + 50 }))
    const match = matchSequence(reaction.slice(8, 15), movie)
    expect(match?.reactionTime).toBe(61)
    expect(match?.movieTime).toBe(31)
    expect(match?.confidence).toBeGreaterThan(0.6)
  })

  it('matches multiple probes with positive drift and rejects a repeated static logo', () => {
    const movie = timeline(140, 1)
    const reaction = movie.slice(10, 120).map((item, index) => ({ ...item, time: (index + 20) / 1.001 }))
    const anchors = findSequenceAnchors(reaction, movie, [30, 60, 90], { windowSize: 7, minimumConfidence: 0.35 })
    expect(anchors).toHaveLength(3)
    expect(anchors[0].movieTime).toBeCloseTo(20, 0)

    const logo = Array.from({ length: 20 }, (_, index) => ({ time: index, signature: movie[0].signature }))
    expect(findSequenceAnchors(logo, movie, [8, 12])).toEqual([])
  })

  it('uses the surrounding sequence to disambiguate a repeated single frame', () => {
    const movie = timeline(50, 1)
    movie[30] = movie[10]
    const reactionWindow = movie.slice(7, 14).map((item, index) => ({ ...item, time: 100 + index }))
    const match = matchSequence(reactionWindow, movie)
    expect(match?.movieTime).toBe(10)
  })
})

function timeline(count: number, step: number): TimedSignature[] {
  return Array.from({ length: count }, (_, index) => ({
    time: index * step,
    signature: createFrameSignature(frameFor(index))
  }))
}

function frameFor(seed: number): PixelFrame {
  const width = 24
  const height = 24
  const data = new Uint8Array(width * height * 3)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 3
    const value = (seed * 37 + x * (seed % 7 + 3) + y * (seed % 11 + 5) + (x > (seed % width) ? 80 : 0)) % 256
    data[index] = value; data[index + 1] = (value * 3 + seed * 11) % 256; data[index + 2] = (255 - value + seed * 5) % 256
  }
  return { data, width, height, channels: 3 }
}
