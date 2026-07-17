import { describe, expect, it, vi } from 'vitest'
import type { AutoSyncFit } from './fitting'
import { createAutoSyncEvents, fallback, friendlyError, stale } from './autoSyncEvents'

const fit: AutoSyncFit = {
  offsetSeconds: -42.25,
  movieRateCorrection: 0.999,
  confidence: 0.94,
  residualStats: {
    medianSeconds: 0.08,
    maximumSeconds: 0.2,
    rmsSeconds: 0.11,
    inlierCount: 2,
    totalCount: 2,
    spanSeconds: 120,
    spanFraction: 0.5
  },
  anchors: [
    { reactionTime: 60, movieTime: 17.69, confidence: 0.9, score: 0.1, runnerUpScore: 0.6 },
    { reactionTime: 180, movieTime: 137.57, confidence: 0.88, score: 0.12, runnerUpScore: 0.58 }
  ],
  rateSnapped: false
}

describe('autoSyncEvents', () => {
  it('commits a confident fit synchronously before returning its event', () => {
    const order: string[] = []
    const commit = vi.fn(() => { order.push('commit') })
    const events = createAutoSyncEvents(commit)

    const result = events.completeFromFit('session-1', fit, 23.976)
    order.push('returned')

    expect(order).toEqual(['commit', 'returned'])
    expect(commit).toHaveBeenCalledWith('session-1', -42.25, 0.999, 0.94, 23.976)
    expect(result).toEqual({
      sessionId: 'session-1',
      outcome: 'confident',
      message: 'Ready — WatchAlong found the timing and will keep both videos together.',
      offsetSeconds: -42.25,
      movieRateCorrection: 0.999,
      confidence: 0.94,
      anchorCount: 2
    })
    expect('readyToPlay' in result).toBe(false)
  })

  it('commits an initial partial result and returns the review message', () => {
    const commit = vi.fn()
    const events = createAutoSyncEvents(commit)

    const result = events.completePartial('session-1', 'initial', -30, 1.001, 0.69, 3, 25)

    expect(commit).toHaveBeenCalledWith('session-1', -30, 1.001, 0.69, 25)
    expect(result).toEqual({
      sessionId: 'session-1',
      outcome: 'partial',
      message: 'WatchAlong found the starting point. Please give the timing a quick check before you begin.',
      offsetSeconds: -30,
      movieRateCorrection: 1.001,
      confidence: 0.69,
      anchorCount: 3
    })
    expect('readyToPlay' in result).toBe(false)
  })

  it('returns but does not commit a partial recheck candidate', () => {
    const commit = vi.fn()
    const events = createAutoSyncEvents(commit)

    const result = events.completePartial('session-1', 'recheck', -30, 1.001, 0.69, 3, 25)

    expect(commit).not.toHaveBeenCalled()
    expect(result).toEqual({
      sessionId: 'session-1',
      outcome: 'partial',
      message: 'WatchAlong found a possible starting point, but kept your existing timing because the new result was not certain enough.',
      offsetSeconds: -30,
      movieRateCorrection: 1.001,
      confidence: 0.69,
      anchorCount: 3
    })
    expect('readyToPlay' in result).toBe(false)
  })

  it('commits an opening partial and marks it ready to play', () => {
    const commit = vi.fn()
    const events = createAutoSyncEvents(commit)

    const result = events.completeReadyOpeningPartial('session-1', -56, 1, 0.69, 4, 24)

    expect(commit).toHaveBeenCalledWith('session-1', -56, 1, 0.69, 24)
    expect(result).toEqual({
      sessionId: 'session-1',
      outcome: 'partial',
      readyToPlay: true,
      message: 'Ready — WatchAlong found the starting point from the visible opening.',
      offsetSeconds: -56,
      movieRateCorrection: 1,
      confidence: 0.69,
      anchorCount: 4
    })
  })

  it('constructs fallback and stale events without optional timing fields', () => {
    expect(fallback('session-1', 'Try manual timing.')).toEqual({
      sessionId: 'session-1',
      outcome: 'fallback',
      message: 'Try manual timing.'
    })
    expect(stale('session-1')).toEqual({
      sessionId: 'session-1',
      outcome: 'stale',
      message: 'The files or timing changed while WatchAlong was checking, so the old result was safely ignored.'
    })
  })

  it('uses the readable-file message only for recognized Error details', () => {
    expect(friendlyError(new Error('Invalid data found while processing input'))).toBe(
      'One of these files could not be read clearly. Your existing timing was left unchanged.'
    )
    expect(friendlyError(new Error('Unexpected process failure'))).toBe(
      'Automatic sync couldn’t finish this time. Your existing timing was left unchanged.'
    )
    expect(friendlyError('invalid data')).toBe(
      'Automatic sync couldn’t finish this time. Your existing timing was left unchanged.'
    )
  })

  it('does not swallow synchronous commit failures', () => {
    const events = createAutoSyncEvents(() => { throw new Error('save failed') })

    expect(() => events.completeFromFit('session-1', fit, 24)).toThrow('save failed')
    expect(() => events.completePartial('session-1', 'initial', -30, 1, 0.6, 3, 24)).toThrow('save failed')
    expect(() => events.completeReadyOpeningPartial('session-1', -30, 1, 0.6, 3, 24)).toThrow('save failed')
  })
})
