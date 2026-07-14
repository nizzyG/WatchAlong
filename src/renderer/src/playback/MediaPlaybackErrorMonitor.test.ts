import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MEDIA_ERROR_RECOVERY_GRACE_MS,
  MediaPlaybackErrorMonitor,
  mediaPlaybackErrorMessage,
  type MediaPlaybackObservation
} from './MediaPlaybackErrorMonitor'

describe('MediaPlaybackErrorMonitor', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('attributes a genuine failure to the movie that emitted it', () => {
    const onActionable = vi.fn()
    const monitor = new MediaPlaybackErrorMonitor({ onActionable })
    const current = observation({ readyState: 0, hasError: true })

    monitor.reportError('movie', () => current)
    vi.advanceTimersByTime(MEDIA_ERROR_RECOVERY_GRACE_MS)

    expect(onActionable).toHaveBeenCalledWith('movie')
    expect(mediaPlaybackErrorMessage('movie')).toMatch(/^The movie video/)
    expect(mediaPlaybackErrorMessage('reaction')).toMatch(/^The reaction video/)
  })

  it('suppresses an MKV-like warning when the movie still has playable frames', () => {
    const onActionable = vi.fn()
    const onRecovery = vi.fn()
    const monitor = new MediaPlaybackErrorMonitor({ onActionable, onRecovery })
    let current = observation({ readyState: 1, hasError: true })

    monitor.reportError('movie', () => current)
    current = observation({ readyState: 3, hasError: true })
    vi.advanceTimersByTime(MEDIA_ERROR_RECOVERY_GRACE_MS)

    expect(onActionable).not.toHaveBeenCalled()
    expect(onRecovery).toHaveBeenCalledWith('movie', false)
  })

  it('suppresses a warning when playback advances during the recovery grace period', () => {
    const onActionable = vi.fn()
    const monitor = new MediaPlaybackErrorMonitor({ onActionable })
    let current = observation({ currentTime: 12, readyState: 2, hasError: true })

    monitor.reportError('movie', () => current)
    current = observation({ currentTime: 12.2, readyState: 2, hasError: true })
    vi.advanceTimersByTime(MEDIA_ERROR_RECOVERY_GRACE_MS)

    expect(onActionable).not.toHaveBeenCalled()
  })

  it('cancels a pending warning when a canplay-like recovery is observed', () => {
    const onActionable = vi.fn()
    const onRecovery = vi.fn()
    const monitor = new MediaPlaybackErrorMonitor({ onActionable, onRecovery })

    monitor.reportError('movie', () => observation({ readyState: 0, hasError: true }))
    expect(monitor.reportRecovery('movie', observation({ readyState: 3, hasError: true }))).toBe(true)
    vi.advanceTimersByTime(MEDIA_ERROR_RECOVERY_GRACE_MS)

    expect(onActionable).not.toHaveBeenCalled()
    expect(onRecovery).toHaveBeenCalledWith('movie', false)
  })

  it('keeps a pending warning when only the current stalled frame remains available', () => {
    const onActionable = vi.fn()
    const onRecovery = vi.fn()
    const monitor = new MediaPlaybackErrorMonitor({ onActionable, onRecovery })

    monitor.reportError('movie', () => observation({ currentTime: 12, readyState: 2, hasError: true }))
    expect(monitor.reportRecovery('movie', observation({ currentTime: 12, readyState: 2, hasError: true }))).toBe(false)
    vi.advanceTimersByTime(MEDIA_ERROR_RECOVERY_GRACE_MS)

    expect(onActionable).toHaveBeenCalledWith('movie')
    expect(onRecovery).not.toHaveBeenCalled()
  })

  it('cancels a pending warning when playback advances despite a persistent error flag', () => {
    const onActionable = vi.fn()
    const monitor = new MediaPlaybackErrorMonitor({ onActionable })

    monitor.reportError('movie', () => observation({ currentTime: 12, readyState: 2, hasError: true }))
    expect(monitor.reportRecovery('movie', observation({ currentTime: 12.2, readyState: 2, hasError: true }))).toBe(true)
    vi.advanceTimersByTime(MEDIA_ERROR_RECOVERY_GRACE_MS)

    expect(onActionable).not.toHaveBeenCalled()
  })

  it('removes a displayed media error if playback later recovers', () => {
    const onActionable = vi.fn()
    const onRecovery = vi.fn()
    const monitor = new MediaPlaybackErrorMonitor({ onActionable, onRecovery })

    monitor.reportError('reaction', () => observation({ readyState: 0, hasError: true }))
    vi.advanceTimersByTime(MEDIA_ERROR_RECOVERY_GRACE_MS)
    expect(onActionable).toHaveBeenCalledWith('reaction')

    expect(monitor.reportRecovery('reaction', observation({ readyState: 2, hasError: false }))).toBe(true)
    expect(onRecovery).toHaveBeenLastCalledWith('reaction', true)
  })

  it('clears an earlier displayed warning when a later probe confirms recovery', () => {
    const onActionable = vi.fn()
    const onRecovery = vi.fn()
    const monitor = new MediaPlaybackErrorMonitor({ onActionable, onRecovery })
    let current = observation({ readyState: 0, hasError: true })

    monitor.reportError('movie', () => current)
    vi.advanceTimersByTime(MEDIA_ERROR_RECOVERY_GRACE_MS)
    expect(onActionable).toHaveBeenCalledWith('movie')

    current = observation({ readyState: 1, hasError: true })
    monitor.reportError('movie', () => current)
    current = observation({ readyState: 3, hasError: true })
    vi.advanceTimersByTime(MEDIA_ERROR_RECOVERY_GRACE_MS)

    expect(onRecovery).toHaveBeenLastCalledWith('movie', true)
  })

  it('ignores an error from a media element that was replaced before confirmation', () => {
    const onActionable = vi.fn()
    const monitor = new MediaPlaybackErrorMonitor({ onActionable })
    let mounted = true

    monitor.reportError('movie', () => mounted ? observation({ readyState: 0, hasError: true }) : null)
    mounted = false
    vi.advanceTimersByTime(MEDIA_ERROR_RECOVERY_GRACE_MS)

    expect(onActionable).not.toHaveBeenCalled()
  })
})

function observation(patch: Partial<MediaPlaybackObservation> = {}): MediaPlaybackObservation {
  return {
    currentTime: 0,
    readyState: 0,
    ended: false,
    hasError: false,
    source: 'watchalong://media/session/movie',
    ...patch
  }
}
