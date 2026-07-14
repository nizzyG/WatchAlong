import { describe, expect, it } from 'vitest'
import type { BurstWeightedSequenceMatchCandidate } from './matching'
import { voteForTemporalConsensus } from './houghVoting'

describe('auto-sync 2D Hough consensus', () => {
  it('recovers offset and drift when most candidates are false', () => {
    const rate = 24000 / 1001 / 25
    const offset = -203.3
    const times = [100, 900, 1800, 3000, 4300, 5600]
    const groups = times.map((reactionTime, probe) => [
      weightedCandidate(reactionTime, reactionTime * rate + offset + (probe % 2 ? 0.08 : -0.06), 0.92, 0.8),
      ...Array.from({ length: 5 }, (_, decoy) =>
        weightedCandidate(reactionTime, 300 + probe * 173 + decoy * 311, 0.72, 0.28)
      )
    ])

    const consensus = voteForTemporalConsensus(groups, {
      offsetBinSeconds: 0.25,
      inlierToleranceSeconds: 0.5
    })
    expect(consensus).not.toBeNull()
    expect(consensus!.anchors).toHaveLength(times.length)
    expect(consensus!.seedRate).toBeCloseTo(rate, 3)
    expect(consensus!.seedOffsetSeconds).toBeCloseTo(offset, 0)
    expect(consensus!.supportFraction).toBe(1)
  })

  it('allows one probe only one vote in a bin', () => {
    const dominantSingleProbe = Array.from({ length: 40 }, (_, index) =>
      weightedCandidate(100, 100 + index * 0.001, 0.99, 1)
    )
    const sharedLine = [200, 400, 600].map((reactionTime) => [
      weightedCandidate(reactionTime, reactionTime - 50, 0.8, 0.65)
    ])
    const consensus = voteForTemporalConsensus([dominantSingleProbe, ...sharedLine], {
      offsetBinSeconds: 0.25,
      inlierToleranceSeconds: 0.5
    })
    expect(consensus).not.toBeNull()
    expect(consensus!.seedOffsetSeconds).toBeCloseTo(-50, 0)
    expect(consensus!.supportCount).toBe(3)
  })

  it('reports a small peak margin for two genuinely competing lines', () => {
    const times = [100, 800, 1600, 2400]
    const groups = times.map((reactionTime) => [
      weightedCandidate(reactionTime, reactionTime - 40, 0.9, 0.7),
      weightedCandidate(reactionTime, reactionTime * 0.97 + 120, 0.9, 0.69)
    ])
    const consensus = voteForTemporalConsensus(groups, {
      offsetBinSeconds: 0.25,
      inlierToleranceSeconds: 0.5
    })
    expect(consensus).not.toBeNull()
    expect(consensus!.runnerUpPeakScore).toBeGreaterThan(0)
    expect(consensus!.peakMargin).toBeLessThan(0.08)
  })

  it('finds a materially weaker runner-up beyond the winning ridge', () => {
    const times = [0, 1200, 2400, 3600, 4800]
    const groups = times.map((reactionTime) => [
      weightedCandidate(reactionTime, reactionTime - 75, 0.95, 0.9),
      weightedCandidate(reactionTime, reactionTime * 0.94 + 210, 0.62, 0.35)
    ])
    const consensus = voteForTemporalConsensus(groups, {
      offsetBinSeconds: 0.25,
      inlierToleranceSeconds: 0.5
    })
    expect(consensus).not.toBeNull()
    expect(consensus!.runnerUpPeakScore).toBeGreaterThan(0)
    expect(consensus!.peakMargin).toBeLessThan(1)
  })

  it('uses the strongest local match for WLS precision inside the inlier band', () => {
    const times = [0, 1000, 2000, 3000]
    const groups = times.map((reactionTime) => [
      weightedCandidate(reactionTime, reactionTime - 49.3, 0.95, 0.4),
      weightedCandidate(reactionTime, reactionTime - 49, 0.8, 0.9)
    ])
    const consensus = voteForTemporalConsensus(groups, {
      offsetBinSeconds: 0.25,
      inlierToleranceSeconds: 0.5
    })
    expect(consensus).not.toBeNull()
    expect(consensus!.seedOffsetSeconds).toBeCloseTo(-49, 0)
    expect(consensus!.anchors.every((anchor) =>
      Math.abs(anchor.movieTime - anchor.reactionTime + 49.3) < 1e-9
    )).toBe(true)
  })

  it('never hands WLS a stronger parallel match outside the configured inlier band', () => {
    const times = [0, 1000, 2000, 3000]
    const groups = times.map((reactionTime) => [
      weightedCandidate(reactionTime, reactionTime - 50, 0.8, 0.95),
      weightedCandidate(reactionTime, reactionTime - 48, 0.99, 0.55)
    ])
    const consensus = voteForTemporalConsensus(groups, {
      offsetBinSeconds: 0.25,
      inlierToleranceSeconds: 0.5,
      runnerUpRidgeToleranceSeconds: 3
    })
    expect(consensus).not.toBeNull()
    expect(consensus!.seedOffsetSeconds).toBeCloseTo(-50, 0)
    expect(consensus!.anchors.every((anchor) => anchor.movieTime - anchor.reactionTime === -50)).toBe(true)
    expect(consensus!.maximumSeedResidual).toBeLessThanOrEqual(0.5)
  })

  it('does not treat nearby variants of one temporal ridge as independent peaks', () => {
    const times = [0, 1000, 2000, 3000]
    const groups = times.map((reactionTime) => [
      weightedCandidate(reactionTime, reactionTime - 50, 0.9, 0.7),
      weightedCandidate(reactionTime, reactionTime - 47.5, 0.89, 0.69)
    ])
    const broad = voteForTemporalConsensus(groups, {
      offsetBinSeconds: 0.25,
      inlierToleranceSeconds: 0.5,
      runnerUpRidgeToleranceSeconds: 3
    })
    const narrow = voteForTemporalConsensus(groups, {
      offsetBinSeconds: 0.25,
      inlierToleranceSeconds: 0.5,
      runnerUpRidgeToleranceSeconds: 1
    })
    expect(broad).not.toBeNull()
    expect(narrow).not.toBeNull()
    expect(broad!.peakMargin).toBeGreaterThan(narrow!.peakMargin)
  })

  it('rejects fewer than three distinct probes', () => {
    expect(voteForTemporalConsensus([
      [weightedCandidate(0, 10, 0.9, 0.8)],
      [weightedCandidate(100, 110, 0.9, 0.8)]
    ])).toBeNull()
  })

  it('does not count duplicate groups at one reaction time as separate probes', () => {
    const duplicate = [weightedCandidate(100, 50, 0.9, 0.8)]
    expect(voteForTemporalConsensus([
      duplicate,
      duplicate,
      [weightedCandidate(200, 150, 0.9, 0.8)]
    ])).toBeNull()
  })
})

function weightedCandidate(
  reactionTime: number,
  movieTime: number,
  rawSimilarity: number,
  burstSimilarity: number
): BurstWeightedSequenceMatchCandidate {
  return {
    reactionTime,
    movieTime,
    candidateIndex: Math.round(movieTime * 4),
    distance: 1 - rawSimilarity,
    rawSimilarity,
    movieNormalizedSimilarity: burstSimilarity,
    burstSimilarity
  }
}
