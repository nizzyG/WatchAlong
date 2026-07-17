import { describe, expect, it } from 'vitest'
import type { AutoSyncAnchor } from './matching'
import { generateOpeningInsetCandidates, openingEvidenceStats } from './openingFallback'

describe('opening fallback evidence', () => {
  it('accepts three distinct tightly agreeing visual probes', () => {
    const result = openingEvidenceStats([
      anchor(111, -105.625),
      anchor(120, -105.5),
      anchor(128, -105.625)
    ], 1)

    expect(result).toEqual({
      offsetSeconds: -105.625,
      maximumDeviation: 0.125,
      count: 3,
      spanSeconds: 17
    })
  })

  it('does not count the same visual moment twice', () => {
    expect(openingEvidenceStats([
      anchor(64, -56),
      anchor(64.25, -56.125),
      anchor(144, -56)
    ], 1)).toBeNull()
  })

  it('rejects visual probes that do not form a tight offset cluster', () => {
    expect(openingEvidenceStats([
      anchor(60, -56),
      anchor(68, -53),
      anchor(76, -58)
    ], 1)).toBeNull()
  })

  it('keeps the dense shallow-player search inside the reaction frame', () => {
    const candidates = generateOpeningInsetCandidates()
    expect(candidates.length).toBeGreaterThan(50)
    expect(candidates.every((candidate) =>
      candidate.x >= 0 && candidate.y >= 0 &&
      candidate.x + candidate.width <= 1 && candidate.y + candidate.height <= 1
    )).toBe(true)
  })
})

function anchor(reactionTime: number, offset: number): AutoSyncAnchor {
  return {
    reactionTime,
    movieTime: reactionTime + offset,
    confidence: 0.7,
    score: 0.1,
    runnerUpScore: 0.4,
    rawSimilarity: 0.82
  }
}
