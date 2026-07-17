import { describe, expect, it } from 'vitest'
import { clamp, clamp01, median, round } from './numeric'

describe('shared numeric utilities', () => {
  it('clamps values to arbitrary and unit intervals', () => {
    expect(clamp(-2, -1, 4)).toBe(-1)
    expect(clamp(3, -1, 4)).toBe(3)
    expect(clamp(7, -1, 4)).toBe(4)
    expect(clamp01(-0.2)).toBe(0)
    expect(clamp01(0.4)).toBe(0.4)
    expect(clamp01(1.2)).toBe(1)
    expect(clamp(Number.NaN, 0, 1)).toBeNaN()
    expect(clamp(Number.NEGATIVE_INFINITY, 0, 1)).toBe(0)
    expect(clamp(Number.POSITIVE_INFINITY, 0, 1)).toBe(1)
    expect(clamp(3, 5, 1)).toBe(1)
  })

  it('finds odd and even medians without mutating the source', () => {
    const values = [8, 1, 4, 2]
    expect(median(values)).toBe(3)
    expect(values).toEqual([8, 1, 4, 2])
    expect(median([9, 2, 4])).toBe(4)
    expect(median([])).toBeNaN()
  })

  it('rounds to the requested decimal places', () => {
    expect(round(1.234567, 3)).toBe(1.235)
    expect(round(-4.87654, 2)).toBe(-4.88)
    expect(round(1.005, 2)).toBe(1)
    expect(round(Number.NaN, 2)).toBeNaN()
    expect(round(Number.POSITIVE_INFINITY, 2)).toBe(Number.POSITIVE_INFINITY)
    expect(Object.is(round(-0, 2), 0)).toBe(true)
    expect(() => round(1, 101)).toThrow(RangeError)
  })
})
