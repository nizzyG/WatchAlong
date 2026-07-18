import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultLibrary, createDefaultSession, getActiveSession } from '@shared/session'
import type {
  LibrarySession,
  MovieWindowSessionPatch,
  OverlayGeometry,
  SessionLibrary,
  WatchAlongApi
} from '@shared/types'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'
import {
  useMovieWindow,
  type DetachedMovieTransitionPolicy
} from './useMovieWindow'

const ACTIVE_SESSION_ID = 'active-id'
const RENDER_SESSION_ID = 'render-session'
const PREVIOUS_RESTORED_ID = 'previous-restored-id'
const EMPTY_AUDIO_TRACK_SNAPSHOT = { tracks: [], selected: null }

describe('useMovieWindow detached transition policies', () => {
  it('keeps the detached movie and all related state untouched', async () => {
    const harness = renderPolicyHarness()

    await act(async () => {
      await harness.result.current.closeDetachedMovieForTransition('keep')
    })

    expect(harness.calls).toEqual([])
    expect(harness.restoredPopOutSessionRef.current).toBe(PREVIOUS_RESTORED_ID)
    expect(harness.setMovieAudioTrackSnapshot).not.toHaveBeenCalled()
    expect(harness.setMovieWindowActive).not.toHaveBeenCalled()
    expect(harness.persist).not.toHaveBeenCalled()
    expect(harness.saveMovieWindowState).not.toHaveBeenCalled()
  })

  it('uses session-scoped replacement cleanup and clears detached audio state', async () => {
    const harness = renderPolicyHarness()

    await act(async () => {
      await harness.result.current.closeDetachedMovieForTransition('replace-media')
    })

    expect(harness.calls).toEqual([
      'audio-reset',
      'close',
      'destroy',
      `deactivate:false:marker:${ACTIVE_SESSION_ID}`,
      'save-pop-out-false',
      `commit:${ACTIVE_SESSION_ID}`
    ])
    expect(harness.setMovieAudioTrackSnapshot).toHaveBeenCalledWith(EMPTY_AUDIO_TRACK_SNAPSHOT)
    expect(harness.restoredPopOutSessionRef.current).toBe(ACTIVE_SESSION_ID)
    expect(harness.saveMovieWindowState).toHaveBeenCalledWith(
      ACTIVE_SESSION_ID,
      { isMoviePoppedOut: false }
    )
    expect(harness.persist).not.toHaveBeenCalled()
  })

  it('leaves the current session through an owner-targeted save without changing restoration state', async () => {
    const harness = renderPolicyHarness()

    await act(async () => {
      await harness.result.current.closeDetachedMovieForTransition('leave-session')
    })

    expect(harness.calls).toEqual([
      'close',
      'destroy',
      `deactivate:false:marker:${PREVIOUS_RESTORED_ID}`,
      'save-pop-out-false',
      `commit:${ACTIVE_SESSION_ID}`
    ])
    expect(harness.setMovieAudioTrackSnapshot).not.toHaveBeenCalled()
    expect(harness.restoredPopOutSessionRef.current).toBe(PREVIOUS_RESTORED_ID)
    expect(harness.persist).not.toHaveBeenCalled()
    expect(harness.saveMovieWindowState).toHaveBeenCalledWith(
      ACTIVE_SESSION_ID,
      { isMoviePoppedOut: false }
    )
  })

  it('marks the detached owner as restored and clears its persisted pop-out flag after the wizard', async () => {
    const harness = renderPolicyHarness()

    await act(async () => {
      await harness.result.current.closeDetachedMovieForTransition('wizard-completed')
    })

    expect(harness.calls).toEqual([
      'close',
      'destroy',
      `deactivate:false:marker:${ACTIVE_SESSION_ID}`,
      'save-pop-out-false',
      `commit:${ACTIVE_SESSION_ID}`
    ])
    expect(harness.setMovieAudioTrackSnapshot).not.toHaveBeenCalled()
    expect(harness.restoredPopOutSessionRef.current).toBe(ACTIVE_SESSION_ID)
    expect(harness.persist).not.toHaveBeenCalled()
    expect(harness.saveMovieWindowState).toHaveBeenCalledWith(
      ACTIVE_SESSION_ID,
      { isMoviePoppedOut: false }
    )
  })

  it('tears down a remote adapter even before React reports the movie window as active', async () => {
    const harness = renderPolicyHarness({
      movieWindowActive: false,
      remoteAdapterPresent: true
    })

    await act(async () => {
      await harness.result.current.closeDetachedMovieForTransition('leave-session')
    })

    expect(harness.calls).toEqual([
      'close',
      'destroy',
      `deactivate:false:marker:${PREVIOUS_RESTORED_ID}`,
      'save-pop-out-false',
      `commit:${ACTIVE_SESSION_ID}`
    ])
    expect(harness.destroyRemoteMovieAdapter).toHaveBeenCalledOnce()
    expect(harness.saveMovieWindowState).toHaveBeenCalledWith(
      ACTIVE_SESSION_ID,
      { isMoviePoppedOut: false }
    )
  })

  it('does not commit wizard cleanup when the targeted save returns another active session', async () => {
    const otherSession = createSession('other-active-id')
    const harness = renderPolicyHarness({
      saveMovieWindowStateResult: createLibrary(otherSession)
    })

    await act(async () => {
      await harness.result.current.closeDetachedMovieForTransition('wizard-completed')
    })

    expect(harness.calls).toEqual([
      'close',
      'destroy',
      `deactivate:false:marker:${ACTIVE_SESSION_ID}`,
      'save-pop-out-false'
    ])
    expect(harness.restoredPopOutSessionRef.current).toBe(ACTIVE_SESSION_ID)
    expect(harness.saveMovieWindowState).toHaveBeenCalledWith(
      ACTIVE_SESSION_ID,
      { isMoviePoppedOut: false }
    )
    expect(harness.commitLibrary).not.toHaveBeenCalled()
  })

  it.each<DetachedMovieTransitionPolicy>([
    'keep',
    'replace-media',
    'leave-session',
    'wizard-completed'
  ])('makes %s a complete no-op when no detached movie is active', async (policy) => {
    const harness = renderPolicyHarness({ movieWindowActive: false })

    await act(async () => {
      await harness.result.current.closeDetachedMovieForTransition(policy)
    })

    expect(harness.calls).toEqual([])
    expect(harness.restoredPopOutSessionRef.current).toBe(PREVIOUS_RESTORED_ID)
    expect(harness.setMovieAudioTrackSnapshot).not.toHaveBeenCalled()
    expect(harness.setMovieWindowActive).not.toHaveBeenCalled()
    expect(harness.persist).not.toHaveBeenCalled()
    expect(harness.saveMovieWindowState).not.toHaveBeenCalled()
  })

  it.each<DetachedMovieTransitionPolicy>([
    'replace-media',
    'leave-session',
    'wizard-completed'
  ])('invalidates a queued pop-out before the inactive-state check for %s', async (policy) => {
    const harness = renderPolicyHarness({ movieWindowActive: false })

    await act(async () => {
      const pendingPopOut = harness.result.current.popOutMovie()
      await harness.result.current.closeDetachedMovieForTransition(policy)
      await pendingPopOut
    })

    expect(harness.openMovieWindow).not.toHaveBeenCalled()
    expect(harness.calls).toEqual([])
  })

  it.each<DetachedMovieTransitionPolicy>([
    'replace-media',
    'leave-session',
    'wizard-completed'
  ])('flushes pending geometry before closing for %s', async (policy) => {
    const geometry = { x: 75, y: 85, width: 480, height: 270 }
    const harness = renderPolicyHarness({ pendingGeometry: geometry })

    await act(async () => {
      await harness.result.current.closeDetachedMovieForTransition(policy)
    })

    expect(harness.saveMovieWindowState).toHaveBeenCalledWith(
      ACTIVE_SESSION_ID,
      { movieWindowGeometry: geometry }
    )
    expect(harness.calls.indexOf('save-geometry')).toBeLessThan(harness.calls.indexOf('close'))
    expect(harness.pendingMovieWindowGeometryRef.current).toBeNull()
  })

  it('leaves pending geometry untouched when the detached movie is kept', async () => {
    const geometry = { x: 75, y: 85, width: 480, height: 270 }
    const harness = renderPolicyHarness({ pendingGeometry: geometry })

    await act(async () => {
      await harness.result.current.closeDetachedMovieForTransition('keep')
    })

    expect(harness.saveMovieWindowState).not.toHaveBeenCalled()
    expect(harness.pendingMovieWindowGeometryRef.current).toEqual({
      sessionId: ACTIVE_SESSION_ID,
      geometry
    })
  })
})

interface PolicyHarnessOptions {
  movieWindowActive?: boolean
  pendingGeometry?: OverlayGeometry | null
  remoteAdapterPresent?: boolean
  saveMovieWindowStateResult?: SessionLibrary
}

function renderPolicyHarness({
  movieWindowActive = true,
  pendingGeometry = null,
  remoteAdapterPresent = false,
  saveMovieWindowStateResult
}: PolicyHarnessOptions = {}) {
  const calls: string[] = []
  const activeSession = createSession(ACTIVE_SESSION_ID)
  const renderedSession = createSession(RENDER_SESSION_ID)
  const activeLibrary = createLibrary(activeSession)
  const restoredPopOutSessionRef = { current: PREVIOUS_RESTORED_ID as string | null }
  const pendingMovieWindowGeometryRef = {
    current: pendingGeometry
      ? { sessionId: ACTIVE_SESSION_ID, geometry: pendingGeometry }
      : null
  }

  const closeMovieWindow = vi.fn(async () => {
    calls.push('close')
    return { geometry: null, overlay: null, state: null }
  })
  const openMovieWindow = vi.fn()
  const saveMovieWindowState = vi.fn(async (
    _sessionId: string,
    patch: MovieWindowSessionPatch
  ) => {
    if (patch.movieWindowGeometry) calls.push('save-geometry')
    if (patch.isMoviePoppedOut === false) calls.push('save-pop-out-false')
    return saveMovieWindowStateResult ?? activeLibrary
  })
  window.watchAlong = {
    closeMovieWindow,
    openMovieWindow,
    saveMovieWindowState,
    onMovieWindowGeometry: vi.fn(() => vi.fn()),
    onMovieWindowPopInRequest: vi.fn(() => vi.fn()),
    onMovieWindowClosed: vi.fn(() => vi.fn())
  } as unknown as WatchAlongApi

  const setMovieAudioTrackSnapshot = vi.fn(() => {
    calls.push('audio-reset')
  })
  const setMovieWindowActive = vi.fn((active: boolean) => {
    calls.push(`deactivate:${active}:marker:${restoredPopOutSessionRef.current ?? 'none'}`)
  })
  const persist = vi.fn(async (patch: Partial<LibrarySession>) => {
    if (patch.isMoviePoppedOut === false) calls.push('persist-pop-out-false')
    return renderedSession
  })
  const commitLibrary = vi.fn((library: SessionLibrary) => {
    const session = getActiveSession(library)
    calls.push(`commit:${session?.id ?? 'none'}`)
    return session
  })
  const remoteMovieAdapterRef = {
    current: remoteAdapterPresent ? {} : null
  }
  const destroyRemoteMovieAdapter = vi.fn(() => {
    calls.push('destroy')
    remoteMovieAdapterRef.current = null
  })

  const playback = {
    reactionVideoRef: { current: null },
    movieVideoRef: { current: null },
    controllerRef: { current: null },
    remoteMovieAdapterRef,
    restoredPopOutSessionRef,
    pendingMovieWindowGeometryRef,
    movieWindowGeometryTimerRef: { current: null },
    closingMovieWindowRef: { current: false },
    mediaUrls: { reaction: 'watchalong://reaction', movie: 'watchalong://movie' },
    durations: { reaction: 100, movie: 100 },
    position: 0,
    moviePosition: 0,
    syncState: 'paused',
    setError: vi.fn(),
    movieWindowActive,
    setMovieWindowActive,
    movieAudioTrackChanging: false,
    setMovieAudioTrackSnapshot
  } as unknown as PlaybackHook
  const sessionState = {
    sessionRef: { current: renderedSession },
    activeSessionIdRef: { current: ACTIVE_SESSION_ID },
    appView: 'player'
  } as unknown as SessionHook

  const rendered = renderHook(() => useMovieWindow({
    playback,
    sessionState,
    activeSession: renderedSession,
    session: renderedSession,
    activeSubtitleText: null,
    canPlay: false,
    hasMissingMedia: false,
    getMovieAdapter: () => null,
    buildController: () => null,
    destroyRemoteMovieAdapter,
    persist,
    commitLibrary
  }))

  return {
    ...rendered,
    calls,
    restoredPopOutSessionRef,
    pendingMovieWindowGeometryRef,
    setMovieAudioTrackSnapshot,
    setMovieWindowActive,
    persist,
    commitLibrary,
    closeMovieWindow,
    openMovieWindow,
    saveMovieWindowState,
    destroyRemoteMovieAdapter
  }
}

function createSession(id: string): LibrarySession {
  return createDefaultSession(new Date('2026-07-17T00:00:00.000Z'), {
    id,
    title: id,
    reactionPath: `C:\\Reactions\\${id}.mp4`,
    moviePath: `C:\\Movies\\${id}.mp4`,
    isMoviePoppedOut: false
  })
}

function createLibrary(session: LibrarySession): SessionLibrary {
  return {
    ...createDefaultLibrary(),
    activeSessionId: session.id,
    sessions: [session]
  }
}
