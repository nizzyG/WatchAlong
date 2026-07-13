import { describe, expect, it } from 'vitest'
import { fitAnchors, isConfidentFit } from './fitting'
import type { AutoSyncAnchor } from './matching'

describe('auto-sync robust fitting', () => {
  it.each([
    { rate: 1, offset: -49.25 },
    { rate: 24000 / 1001 / 24, offset: -32.5 },
    { rate: 24 / 25, offset: -203.3 },
    { rate: 25 / 24, offset: 8.4 }
  ])('recovers offset $offset and rate $rate across the runtime', ({ rate, offset }) => {
    const anchors = [100, 1300, 2700, 4300, 6000].map((reactionTime, index) => anchor(reactionTime, reactionTime * rate + offset + (index % 2 ? 0.04 : -0.03)))
    anchors.splice(2, 0, anchor(2200, 4400, 0.2))
    const fit = fitAnchors(anchors, { movieDuration: 7000 })
    expect(fit?.offsetSeconds).toBeCloseTo(offset, 1)
    expect(fit?.movieRateCorrection).toBeCloseTo(rate, 4)
    expect(fit?.residualStats.inlierCount).toBe(5)
    expect(fit && isConfidentFit(fit)).toBe(true)
  })

  it('refuses two anchors and anchors covering too little runtime', () => {
    expect(fitAnchors([anchor(0, 10), anchor(100, 110)], { movieDuration: 1000 })).toBeNull()
    expect(fitAnchors([anchor(0, 10), anchor(100, 110), anchor(200, 210)], { movieDuration: 1000 })).toBeNull()
  })

  it('refuses an implausible rate', () => {
    expect(fitAnchors([anchor(0, 0), anchor(500, 700), anchor(1000, 1400)], { movieDuration: 1000 })).toBeNull()
  })

  it('uses Hough seed anchors instead of asking cold WLS to find a minority consensus', () => {
    const rate = 24000 / 1001 / 25
    const offset = -203.3
    const seedAnchors = [100, 1200, 2600, 4100, 5600].map((reactionTime, index) =>
      anchor(reactionTime, reactionTime * rate + offset + (index % 2 ? 0.04 : -0.03))
    )
    const outliers = Array.from({ length: 12 }, (_, index) =>
      anchor(150 + index * 430, 5000 - index * 177, 0.8)
    )
    const fit = fitAnchors([...seedAnchors, ...outliers], {
      movieDuration: 6000,
      seedAnchors,
      consensusEvidence: consensusEvidence({ peakMargin: 0.4, supportFraction: 1, meanSimilarity: 0.9 })
    })
    expect(fit?.movieRateCorrection).toBeCloseTo(rate, 4)
    expect(fit?.offsetSeconds).toBeCloseTo(offset, 1)
    expect(fit?.residualStats.inlierCount).toBe(seedAnchors.length)
    expect(fit?.residualStats.totalCount).toBe(seedAnchors.length + outliers.length)
  })

  it('uses a genuinely distinct Hough runner-up as a confidence gate', () => {
    const anchors = [0, 1000, 2500, 4000].map((reactionTime) =>
      anchor(reactionTime, reactionTime - 40)
    )
    const accepted = fitAnchors(anchors, {
      movieDuration: 4000,
      consensusEvidence: consensusEvidence({ peakMargin: 0.08, supportFraction: 1, meanSimilarity: 0.9 })
    })
    const ambiguous = fitAnchors(anchors, {
      movieDuration: 4000,
      consensusEvidence: consensusEvidence({ peakMargin: 0.019, supportFraction: 1, meanSimilarity: 0.9 })
    })
    expect(accepted && isConfidentFit(accepted)).toBe(true)
    expect(ambiguous && isConfidentFit(ambiguous)).toBe(false)
    expect(accepted!.confidence).toBeGreaterThan(ambiguous!.confidence)
  })

  it('rejects visually weak consensus even when its anchors are perfectly collinear', () => {
    const anchors = [0, 1000, 2500, 4000].map((reactionTime) =>
      anchor(reactionTime, reactionTime - 40, 0.0001)
    )
    const fit = fitAnchors(anchors, {
      movieDuration: 4000,
      consensusEvidence: consensusEvidence({ peakMargin: 1, supportFraction: 1, meanSimilarity: 0.0001 })
    })
    expect(fit).not.toBeNull()
    expect(fit && isConfidentFit(fit)).toBe(false)
  })

  it('requires the aggregate confidence floor even when individual hard limits pass', () => {
    const anchors = [0, 1000, 2500, 4000].map((reactionTime) =>
      anchor(reactionTime, reactionTime - 40)
    )
    const fit = fitAnchors(anchors, { movieDuration: 4000 })
    expect(fit && isConfidentFit({ ...fit, confidence: 0.499 })).toBe(false)
  })

  it('snaps a noisy fit to a common rate only when robust residuals improve', () => {
    const rate = 24 / 25
    const offset = -203.3
    const noise = [-0.0655054, -0.2190638, 0.0697605, 0.1563476, 0.0753308, -0.0971308]
    const anchors = noise.map((error, index) => {
      const reactionTime = index * 1000
      return anchor(reactionTime, reactionTime * rate + offset + error)
    })
    const snapped = fitAnchors(anchors, { movieDuration: 5000 })
    expect(snapped?.rateSnapped).toBe(true)
    expect(snapped?.movieRateCorrection).toBe(rate)

    const measuredRate = 1.00002
    const exact = [0, 1000, 2500, 4000].map((reactionTime) =>
      anchor(reactionTime, reactionTime * measuredRate - 20)
    )
    const unsnapped = fitAnchors(exact, { movieDuration: 4000 })
    expect(unsnapped?.rateSnapped).toBe(false)
    expect(unsnapped?.movieRateCorrection).toBeCloseTo(measuredRate, 7)
  })
})

function anchor(reactionTime: number, movieTime: number, confidence = 0.92): AutoSyncAnchor {
  return { reactionTime, movieTime, confidence, score: 0.08, runnerUpScore: 0.4 }
}

function consensusEvidence(overrides: Partial<{
  peakMargin: number
  supportFraction: number
  meanSimilarity: number
  meanSeedResidual: number
  maximumSeedResidual: number
}> = {}) {
  return {
    peakMargin: 0.4,
    supportFraction: 0.8,
    meanSimilarity: 0.9,
    meanSeedResidual: 0.1,
    maximumSeedResidual: 0.2,
    ...overrides
  }
}
