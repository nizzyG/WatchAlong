import { describe, expect, it } from 'vitest'
import {
  COARSE_RATE_BAND,
  CONSENSUS_FIT_CONFIDENCE_WEIGHTS,
  GEOMETRY_SCORE_WEIGHTS,
  HOUGH_LOCAL_SCORE_WEIGHTS,
  LEGACY_FIT_CONFIDENCE_WEIGHTS,
  MATCH_CONFIDENCE_WEIGHTS,
  PROBE_FRACTIONS,
  RATE_BAND,
  SEQUENCE_SCORE_WEIGHTS,
  SIGNATURE_DISTANCE_WEIGHTS
} from './constants'

describe('AutoSync tuning constants', () => {
  it('keeps every normalized score blend at unit weight', () => {
    for (const weights of [
      CONSENSUS_FIT_CONFIDENCE_WEIGHTS,
      LEGACY_FIT_CONFIDENCE_WEIGHTS,
      MATCH_CONFIDENCE_WEIGHTS,
      SEQUENCE_SCORE_WEIGHTS,
      HOUGH_LOCAL_SCORE_WEIGHTS,
      GEOMETRY_SCORE_WEIGHTS,
      SIGNATURE_DISTANCE_WEIGHTS
    ]) {
      expect(sumWeights(weights)).toBeCloseTo(1, 12)
    }
  })

  it('keeps the fit band inside the coarser discovery band', () => {
    expect(RATE_BAND.min).toBeLessThan(1)
    expect(RATE_BAND.max).toBeGreaterThan(1)
    expect(COARSE_RATE_BAND.min).toBeLessThanOrEqual(RATE_BAND.min)
    expect(COARSE_RATE_BAND.max).toBeGreaterThanOrEqual(RATE_BAND.max)
  })

  it('keeps whole-runtime probes ordered and inside the media timeline', () => {
    expect(PROBE_FRACTIONS.every((fraction) => fraction > 0 && fraction < 1)).toBe(true)
    expect(PROBE_FRACTIONS.every((fraction, index) =>
      index === 0 || fraction > PROBE_FRACTIONS[index - 1]
    )).toBe(true)
  })
})

function sumWeights(weights: Readonly<Record<string, number>>): number {
  return Object.values(weights).reduce((sum, value) => sum + value, 0)
}
