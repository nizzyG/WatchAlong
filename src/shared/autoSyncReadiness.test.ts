import { describe, expect, it } from 'vitest'
import { isAutoSyncReady } from './autoSyncReadiness'
import type { AutoSyncCompleteEvent } from './types'

describe('isAutoSyncReady', () => {
  it.each([
    [{ sessionId: 's1', outcome: 'confident', message: 'Ready.' }, true],
    [{ sessionId: 's1', outcome: 'partial', readyToPlay: true, message: 'Ready.' }, true],
    [{ sessionId: 's1', outcome: 'partial', message: 'Review.' }, false],
    [{ sessionId: 's1', outcome: 'failed', message: 'Failed.' }, false]
  ] as const)('classifies %s as readiness %s', (result, expected) => {
    expect(isAutoSyncReady(result as AutoSyncCompleteEvent)).toBe(expected)
  })

  it('treats an absent result as not ready', () => {
    expect(isAutoSyncReady(null)).toBe(false)
    expect(isAutoSyncReady(undefined)).toBe(false)
  })
})
