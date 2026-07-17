import { describe, expect, it } from 'vitest'
import { calculateMovieRateCorrection, roundSeconds } from './playerTiming'

describe('player timing utilities', () => {
  it('rounds persisted timeline seconds to six decimal places', () => {
    expect(roundSeconds(12.3456789)).toBe(12.345679)
    expect(roundSeconds(-12.3456789)).toBe(-12.345679)
  })

  it('retains the established movie-rate correction bounds', () => {
    expect(calculateMovieRateCorrection(1, 'pal')).toBe(1.1)
    expect(calculateMovieRateCorrection(120, 'ntsc')).toBe(0.9)
  })
})
