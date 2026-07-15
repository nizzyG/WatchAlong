import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MovieMediaCommandRequest, RemoteMediaCommandResult, RemoteMediaState } from '@shared/types'
import {
  bindTrustedMovieSource,
  ensureVisibleWindowBounds,
  MOVIE_MEDIA_COMMAND_TIMEOUT_ERROR,
  normalizeMovieAudioTrackSnapshot,
  normalizeRemoteMediaCommandResult,
  normalizeRemoteMediaEvent,
  PendingMovieCommandTracker,
  SerialTaskQueue
} from './movieWindowHelpers'

const primaryDisplay = {
  workArea: { x: 0, y: 0, width: 1920, height: 1080 }
}

const secondaryDisplay = {
  workArea: { x: 1920, y: 0, width: 1280, height: 900 }
}

describe('movie window geometry helpers', () => {
  it('keeps visible restored bounds unchanged', () => {
    const bounds = { x: 100, y: 120, width: 420, height: 236 }

    expect(ensureVisibleWindowBounds(bounds, [primaryDisplay], primaryDisplay)).toEqual(bounds)
  })

  it('keeps partially visible restored bounds unchanged', () => {
    const bounds = { x: 1900, y: 120, width: 420, height: 236 }

    expect(ensureVisibleWindowBounds(bounds, [primaryDisplay], primaryDisplay)).toEqual(bounds)
  })

  it('accepts bounds visible on a secondary display', () => {
    const bounds = { x: 2200, y: 120, width: 420, height: 236 }

    expect(ensureVisibleWindowBounds(bounds, [primaryDisplay, secondaryDisplay], primaryDisplay)).toEqual(bounds)
  })

  it('centers fully off-screen restored bounds on the primary display', () => {
    expect(
      ensureVisibleWindowBounds(
        { x: -2000, y: 120, width: 420, height: 236 },
        [primaryDisplay, secondaryDisplay],
        primaryDisplay
      )
    ).toEqual({ x: 750, y: 422, width: 420, height: 236 })
  })
})

describe('PendingMovieCommandTracker', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves acknowledged commands before timeout', () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const resolve = vi.fn()
    const tracker = new PendingMovieCommandTracker({
      getState: () => remoteState(),
      onTimeout
    })

    tracker.add('command-1', resolve)
    const result: RemoteMediaCommandResult = { id: 'command-1', ok: true, state: remoteState({ currentTime: 12 }) }

    expect(tracker.resolve(result)).toBe(true)
    vi.advanceTimersByTime(5000)

    expect(resolve).toHaveBeenCalledWith(result)
    expect(onTimeout).not.toHaveBeenCalled()
    expect(tracker.size).toBe(0)
  })

  it('fails timed-out commands and invokes timeout cleanup', () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const resolve = vi.fn()
    const tracker = new PendingMovieCommandTracker({
      getState: () => remoteState({ currentTime: 42 }),
      onTimeout
    })

    tracker.add('command-1', resolve)
    vi.advanceTimersByTime(5000)

    expect(resolve).toHaveBeenCalledWith({
      id: 'command-1',
      ok: false,
      state: remoteState({ currentTime: 42 }),
      error: MOVIE_MEDIA_COMMAND_TIMEOUT_ERROR
    })
    expect(onTimeout).toHaveBeenCalledWith('command-1')
    expect(tracker.size).toBe(0)
  })

  it('cleans up pending commands when the movie window closes', () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const firstResolve = vi.fn()
    const secondResolve = vi.fn()
    const tracker = new PendingMovieCommandTracker({
      getState: () => remoteState(),
      onTimeout
    })

    tracker.add('command-1', firstResolve)
    tracker.add('command-2', secondResolve)
    tracker.resolveAll('Movie window closed.')
    vi.advanceTimersByTime(5000)

    expect(firstResolve).toHaveBeenCalledWith({
      id: 'command-1',
      ok: false,
      state: remoteState(),
      error: 'Movie window closed.'
    })
    expect(secondResolve).toHaveBeenCalledWith({
      id: 'command-2',
      ok: false,
      state: remoteState(),
      error: 'Movie window closed.'
    })
    expect(onTimeout).not.toHaveBeenCalled()
    expect(tracker.size).toBe(0)
  })
})

describe('movie window operation boundary', () => {
  it('serializes window tasks and continues after a failed task', async () => {
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
    const starts: string[] = []
    const queue = new SerialTaskQueue()

    const first = queue.run(async () => {
      starts.push('first')
      await firstGate
      throw new Error('first failed')
    })
    const second = queue.run(async () => {
      starts.push('second')
      return 'opened'
    })

    await Promise.resolve()
    expect(starts).toEqual(['first'])
    releaseFirst()
    await expect(first).rejects.toThrow('first failed')
    await expect(second).resolves.toBe('opened')
    expect(starts).toEqual(['first', 'second'])
  })

  it('overwrites any injected source fields with the stored session source', () => {
    const untrusted = {
      id: 'source-1',
      type: 'setSource',
      currentTime: 12,
      playbackRate: 1,
      volume: 0.8,
      muted: false,
      subtitleText: null,
      mediaUrl: 'file:///C:/Users/user/private.txt',
      title: 'Injected title',
      audioTrackPreference: { label: 'Injected', language: 'xx', ordinal: 99 }
    } as unknown as MovieMediaCommandRequest

    expect(bindTrustedMovieSource(untrusted, {
      mediaUrl: 'watchalong://media/session-1/movie?updated=trusted',
      title: 'Stored session',
      audioTrackPreference: { label: 'Indonesian', language: 'ind', ordinal: 1 }
    })).toEqual({
      ...untrusted,
      mediaUrl: 'watchalong://media/session-1/movie?updated=trusted',
      title: 'Stored session',
      audioTrackPreference: { label: 'Indonesian', language: 'ind', ordinal: 1 }
    })
  })
})

describe('detached renderer payload normalization', () => {
  it('reconstructs audio snapshots and derives selection from the sole enabled track', () => {
    expect(normalizeMovieAudioTrackSnapshot({
      tracks: [
        {
          id: 'native-1',
          label: 'English',
          language: 'eng',
          ordinal: 0,
          displayLabel: 'Injected presentation',
          enabled: false
        },
        {
          id: 'native-2',
          label: 'Indonesian',
          language: 'ind',
          ordinal: 1,
          displayLabel: '<script>',
          enabled: true
        }
      ],
      selected: { label: 'Forged', language: 'xx', ordinal: 99 }
    })).toEqual({
      tracks: [
        { label: 'English', language: 'eng', ordinal: 0, displayLabel: 'English', enabled: false },
        { label: 'Indonesian', language: 'ind', ordinal: 1, displayLabel: 'Indonesian', enabled: true }
      ],
      selected: { label: 'Indonesian', language: 'ind', ordinal: 1 }
    })
  })

  it('drops malformed snapshots while retaining a valid media event or command result', () => {
    const malformedSnapshot = {
      tracks: [
        { label: 'English', language: 'eng', ordinal: 0, enabled: true },
        { label: 'Commentary', language: 'eng', ordinal: 0, enabled: false }
      ],
      selected: null
    }
    const event = normalizeRemoteMediaEvent({
      type: 'audiotrackchange',
      state: remoteState(),
      audioTrackSnapshot: malformedSnapshot
    })
    const result = normalizeRemoteMediaCommandResult({
      id: 'audio-1',
      ok: true,
      state: remoteState(),
      audioTrackSnapshot: { tracks: 'not-an-array' }
    })

    expect(normalizeMovieAudioTrackSnapshot(malformedSnapshot)).toBeUndefined()
    expect(event).toEqual({ type: 'audiotrackchange', state: remoteState() })
    expect(result).toEqual({ id: 'audio-1', ok: true, state: remoteState() })
  })

  it('rejects malformed outer media reports before application state can consume them', () => {
    expect(normalizeRemoteMediaEvent({ type: 'audiotrackchange', state: null })).toBeNull()
    expect(normalizeRemoteMediaCommandResult({
      id: 'audio-1',
      ok: true,
      state: remoteState({ readyState: 99 })
    })).toBeNull()
  })
})

function remoteState(patch: Partial<RemoteMediaState> = {}): RemoteMediaState {
  return {
    currentTime: 0,
    duration: 120,
    paused: true,
    playbackRate: 1,
    readyState: 4,
    seeking: false,
    ended: false,
    volume: 1,
    muted: false,
    ...patch
  }
}
