import { describe, expect, it } from 'vitest'
import type { AutoSyncFit, ResidualStats } from './fitting'
import {
  choosePreferredFit,
  consensusEvidence,
  fitMatchSet,
  resolveCandidateGroups
} from './fitResolution'
import type { HoughConsensus } from './houghVoting'
import type { AutoSyncAnchor, SequenceMatchCandidate } from './matching'

describe('auto-sync fit resolution', () => {
  it('uses a reliable temporal consensus as the resolved match set', () => {
    const candidateGroups = [0, 1000, 2000, 3000].map((reactionTime) => [
      candidate(reactionTime, reactionTime + 50, 0.94)
    ])

    const resolved = resolveCandidateGroups(candidateGroups, {
      minimumRate: 0.99,
      maximumRate: 1.01,
      offsetBinSeconds: 0.25,
      inlierToleranceSeconds: 0.5
    }, 8, 0.42)

    expect(resolved.consensus).not.toBeNull()
    expect(resolved.anchors).toHaveLength(candidateGroups.length)
    expect(resolved.anchors.every((anchor) => anchor.movieTime - anchor.reactionTime === 50)).toBe(true)
  })

  it('discards an ambiguous consensus and filters fallback matches at an inclusive confidence floor', () => {
    const candidateGroups = [0, 1000, 2000, 3000].map((reactionTime) => [
      candidate(reactionTime, reactionTime + 50, 0.92),
      candidate(reactionTime, reactionTime + 250, 0.92)
    ])
    const houghOptions = {
      minimumRate: 0.99,
      maximumRate: 1.01,
      offsetBinSeconds: 0.25,
      inlierToleranceSeconds: 0.5
    }

    const fallback = resolveCandidateGroups(candidateGroups, houghOptions, 0, 0)

    expect(fallback.consensus).toBeNull()
    expect(fallback.anchors).toHaveLength(candidateGroups.length)
    expect(fallback.anchors.every((anchor) => anchor.movieTime - anchor.reactionTime === 50)).toBe(true)

    const confidence = fallback.anchors[0].confidence
    expect(resolveCandidateGroups(candidateGroups, houghOptions, 0, confidence).anchors)
      .toHaveLength(candidateGroups.length)
    expect(resolveCandidateGroups(candidateGroups, houghOptions, 0, confidence + 1e-9).anchors)
      .toHaveLength(0)
  })

  it('requires consensus and enough anchors before fitting', () => {
    const anchors = [500, 1800, 3100, 4400].map((reactionTime) =>
      anchor(reactionTime, reactionTime * 0.96 - 203.3)
    )

    expect(fitMatchSet({ anchors, consensus: null }, 5000)).toBeNull()
    expect(fitMatchSet({
      anchors: anchors.slice(0, 2),
      consensus: consensus(anchors.slice(0, 2))
    }, 5000)).toBeNull()
  })

  it('passes consensus anchors as fit seeds while retaining the complete match count', () => {
    const seedAnchors = [500, 1800, 3100, 4400].map((reactionTime) =>
      anchor(reactionTime, reactionTime * 0.96 - 203.3)
    )
    const outliers = Array.from({ length: 10 }, (_, index) =>
      anchor(600 + index * 350, 4300 - index * 173, 0.8)
    )
    const anchors = [...seedAnchors, ...outliers]

    const fit = fitMatchSet({
      anchors,
      consensus: consensus(seedAnchors, { seedRate: 0.96, seedOffsetSeconds: -203.3 })
    }, 5000)

    expect(fit?.movieRateCorrection).toBeCloseTo(0.96, 7)
    expect(fit?.offsetSeconds).toBeCloseTo(-203.3, 5)
    expect(fit?.residualStats.inlierCount).toBe(seedAnchors.length)
    expect(fit?.residualStats.totalCount).toBe(anchors.length)
  })

  it('projects only the consensus evidence consumed by fitting', () => {
    const source = consensus([anchor(0, 10), anchor(100, 110), anchor(200, 210)], {
      peakMargin: 0.37,
      supportFraction: 0.75,
      meanSimilarity: 0.88,
      meanSeedResidual: 0.12,
      maximumSeedResidual: 0.31
    })

    expect(consensusEvidence(source)).toEqual({
      peakMargin: 0.37,
      supportFraction: 0.75,
      meanSimilarity: 0.88,
      meanSeedResidual: 0.12,
      maximumSeedResidual: 0.31
    })
  })

  it('prefers confidence class, then score, while preserving refined-first ties', () => {
    const refined = syntheticFit({ confidence: 0.72 })
    const coarseTie = syntheticFit({ confidence: 0.72 })
    const higherConfidence = syntheticFit({ confidence: 0.86 })
    const uncertain = syntheticFit({
      confidence: 0.99,
      residualStats: { ...GOOD_RESIDUALS, maximumSeconds: 1 }
    })

    expect(choosePreferredFit(uncertain, refined)).toBe(refined)
    expect(choosePreferredFit(refined, higherConfidence)).toBe(higherConfidence)
    expect(choosePreferredFit(refined, coarseTie)).toBe(refined)
    expect(choosePreferredFit(null, refined)).toBe(refined)
    expect(choosePreferredFit(null, null)).toBeNull()
  })
})

function candidate(
  reactionTime: number,
  movieTime: number,
  rawSimilarity: number
): SequenceMatchCandidate {
  return {
    reactionTime,
    movieTime,
    candidateIndex: Math.round(movieTime * 4),
    distance: 1 - rawSimilarity,
    rawSimilarity
  }
}

function anchor(reactionTime: number, movieTime: number, confidence = 0.92): AutoSyncAnchor {
  return { reactionTime, movieTime, confidence, score: 0.08, runnerUpScore: 0.4 }
}

function consensus(
  anchors: AutoSyncAnchor[],
  overrides: Partial<HoughConsensus> = {}
): HoughConsensus {
  return {
    anchors,
    seedOffsetSeconds: 10,
    seedRate: 1,
    peakScore: 4,
    runnerUpPeakScore: 1,
    peakMargin: 0.75,
    supportCount: anchors.length,
    totalProbeCount: anchors.length,
    supportFraction: 1,
    meanSimilarity: 0.9,
    meanSeedResidual: 0.1,
    maximumSeedResidual: 0.2,
    ...overrides
  }
}

const GOOD_RESIDUALS: ResidualStats = {
  medianSeconds: 0.1,
  maximumSeconds: 0.2,
  rmsSeconds: 0.12,
  inlierCount: 3,
  totalCount: 3,
  spanSeconds: 2000,
  spanFraction: 1
}

function syntheticFit(overrides: Partial<AutoSyncFit> = {}): AutoSyncFit {
  return {
    offsetSeconds: 0,
    movieRateCorrection: 1,
    confidence: 0.7,
    residualStats: GOOD_RESIDUALS,
    anchors: [anchor(0, 0), anchor(1000, 1000), anchor(2000, 2000)],
    rateSnapped: false,
    ...overrides
  }
}
