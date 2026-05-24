import { describe, expect, it } from 'vitest'
import { TimelineMapping, clampToDuration, movieTimelineCorrectionFromPlaybackMultiplier } from './timeline'

describe('TimelineMapping', () => {
  it('maps reaction time to movie time with the stored offset', () => {
    const mapping = new TimelineMapping({ offsetSeconds: 12.5, reactionDuration: 100, movieDuration: 140 })

    expect(mapping.reactionToMovie(20)).toBe(32.5)
    expect(mapping.movieToReaction(32.5)).toBe(20)
  })

  it('clamps mapped positions to known media durations', () => {
    const mapping = new TimelineMapping({ offsetSeconds: -10, reactionDuration: 90, movieDuration: 80 })

    expect(mapping.reactionToMovie(5)).toBe(0)
    expect(mapping.reactionToMovie(120)).toBe(80)
    expect(mapping.movieToReaction(120)).toBe(90)
  })

  it('calculates offset from matching frames', () => {
    expect(TimelineMapping.calculateOffset(123.25, 151.75)).toBe(28.5)
  })

  it('maps reaction time to movie time with a source rate correction', () => {
    const mapping = new TimelineMapping({ offsetSeconds: 4.9, movieRateCorrection: 1.001 })

    expect(mapping.reactionToMovie(100)).toBe(105)
    expect(mapping.movieToReaction(105)).toBeCloseTo(100)
    expect(mapping.effectiveOffsetAt(100)).toBeCloseTo(5)
  })

  it('calculates offset from matching frames with a source rate correction', () => {
    expect(TimelineMapping.calculateOffset(100, 105, 1.001)).toBeCloseTo(4.9)
  })

  it('clamps invalid values to zero', () => {
    expect(clampToDuration(Number.NaN, 20)).toBe(0)
    expect(clampToDuration(-4, 20)).toBe(0)
  })

  it('derives timeline correction from the selected playback multiplier', () => {
    expect(movieTimelineCorrectionFromPlaybackMultiplier(1)).toBe(1)
    expect(movieTimelineCorrectionFromPlaybackMultiplier(1.001)).toBeCloseTo(0.999001)
    expect(movieTimelineCorrectionFromPlaybackMultiplier(0.999001)).toBeCloseTo(1.001)
  })
})
