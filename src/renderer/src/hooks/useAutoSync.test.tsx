import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AutoSyncCompleteCallback, AutoSyncProgressCallback, WatchAlongApi } from '@shared/types'
import { useAutoSync } from './useAutoSync'

describe('useAutoSync', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shares one pending scan instead of replacing its completion resolver', async () => {
    let complete: AutoSyncCompleteCallback | null = null
    const startSessionAutoSync = vi.fn(async () => ({ started: true as const }))
    window.watchAlong = {
      startSessionAutoSync,
      cancelSessionAutoSync: vi.fn(async () => undefined),
      onAutoSyncProgress: vi.fn((_callback: AutoSyncProgressCallback) => () => undefined),
      onAutoSyncComplete: vi.fn((callback: AutoSyncCompleteCallback) => {
        complete = callback
        return () => { complete = null }
      })
    } as unknown as WatchAlongApi

    const { result } = renderHook(() => useAutoSync())
    let first!: ReturnType<typeof result.current.start>
    let duplicate!: ReturnType<typeof result.current.start>
    await act(async () => {
      first = result.current.start('session-1', 'initial')
      duplicate = result.current.start('session-1', 'initial')
      await Promise.resolve()
    })

    expect(startSessionAutoSync).toHaveBeenCalledTimes(1)
    expect(startSessionAutoSync).toHaveBeenCalledWith('session-1', 'initial')
    act(() => complete?.({ sessionId: 'session-1', outcome: 'confident', message: 'Ready.' }))
    await expect(first).resolves.toMatchObject({ outcome: 'confident' })
    await expect(duplicate).resolves.toMatchObject({ outcome: 'confident' })
  })

  it('refuses a second session while another scan is pending', async () => {
    const startSessionAutoSync = vi.fn(async () => ({ started: true as const }))
    window.watchAlong = {
      startSessionAutoSync,
      cancelSessionAutoSync: vi.fn(async () => undefined),
      onAutoSyncProgress: vi.fn(() => () => undefined),
      onAutoSyncComplete: vi.fn(() => () => undefined)
    } as unknown as WatchAlongApi

    const { result } = renderHook(() => useAutoSync())
    let refused!: Awaited<ReturnType<typeof result.current.start>>
    await act(async () => {
      void result.current.start('session-1', 'initial')
      refused = await result.current.start('session-2', 'recheck')
    })
    expect(refused).toMatchObject({
      sessionId: 'session-2',
      outcome: 'cancelled'
    })
    expect(startSessionAutoSync).toHaveBeenCalledTimes(1)
  })

  it('does not merge an initial scan and a recheck for the same session', async () => {
    const startSessionAutoSync = vi.fn(async () => ({ started: true as const }))
    window.watchAlong = {
      startSessionAutoSync,
      cancelSessionAutoSync: vi.fn(async () => undefined),
      onAutoSyncProgress: vi.fn(() => () => undefined),
      onAutoSyncComplete: vi.fn(() => () => undefined)
    } as unknown as WatchAlongApi

    const { result } = renderHook(() => useAutoSync())
    let refused!: Awaited<ReturnType<typeof result.current.start>>
    await act(async () => {
      void result.current.start('session-1', 'initial')
      refused = await result.current.start('session-1', 'recheck')
    })

    expect(refused).toMatchObject({ sessionId: 'session-1', outcome: 'cancelled' })
    expect(startSessionAutoSync).toHaveBeenCalledTimes(1)
  })
})
