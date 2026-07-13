import { describe, expect, it } from 'vitest'
import { createFrameSignature, type PixelFrame } from './signatures'
import {
  applyBurstinessReweighting,
  findSequenceAnchors,
  matchSequence,
  type SequenceMatchCandidate,
  type TimedSignature
} from './matching'

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

  it('applies movie-first then reaction-side burstiness normalization', () => {
    const weighted = applyBurstinessReweighting([
      [candidate(0, 0, 0.81), candidate(0, 1, 0.36)],
      [candidate(1, 0, 0.49), candidate(1, 1, 0.16)]
    ], { referenceTimeBinSeconds: 1 })

    expect(weighted[0][0].movieNormalizedSimilarity).toBeCloseTo(0.81 / Math.sqrt(1.3), 6)
    expect(weighted[0][0].burstSimilarity).toBeCloseTo(0.646, 3)
    expect(weighted[1][1].burstSimilarity).toBeCloseTo(0.275, 3)
  })

  it('suppresses a generic probe with many matches while preserving a unique one', () => {
    const weighted = applyBurstinessReweighting([
      [0, 1, 2, 3].map((movieTime) => candidate(0, movieTime, 0.8)),
      [candidate(1, 4, 0.8)]
    ], { referenceTimeBinSeconds: 1 })
    expect(Math.max(...weighted[0].map((item) => item.burstSimilarity)))
      .toBeLessThan(weighted[1][0].burstSimilarity * 0.6)
  })

  it('normalizes positive similarity rather than lower-is-better distance', () => {
    const weighted = applyBurstinessReweighting([[
      candidate(0, 0, 0.9),
      candidate(0, 1, 0.2)
    ]], { referenceTimeBinSeconds: 1 })
    expect(weighted[0][0].burstSimilarity).toBeGreaterThan(weighted[0][1].burstSimilarity)
  })
})

function candidate(reactionTime: number, movieTime: number, rawSimilarity: number): SequenceMatchCandidate {
  return {
    reactionTime,
    movieTime,
    candidateIndex: movieTime,
    distance: 1 - rawSimilarity,
    rawSimilarity
  }
}

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
