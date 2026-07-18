import { useEffect, useRef } from 'react'
import type {
  LibrarySession,
  MovieWindowGeometryEvent,
  MovieWindowSessionPatch,
  OverlayGeometry,
  RemoteMediaState,
  SessionLibrary
} from '@shared/types'
import { constrainOverlay } from '../components/pipGeometry'
import { EMPTY_AUDIO_TRACK_SNAPSHOT } from '../playback/movieAudioTrackSnapshot'
import { RemoteVideoAdapter } from '../sync/RemoteVideoAdapter'
import { createHtmlVideoAdapter, type SyncController, type VideoAdapter } from '../sync/SyncController'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'

const MOVIE_WINDOW_TRANSITION_MS = 220
const MOVIE_WINDOW_GEOMETRY_SAVE_MS = 600
const MOVIE_WINDOW_COMMAND_TIMEOUT_ERROR = 'Movie window stopped responding.'
const MOVIE_WINDOW_UNRESPONSIVE_MESSAGE =
  'The movie window stopped responding, so the movie has been brought back into the player.'

export type DetachedMovieTransitionPolicy =
  | 'keep'
  | 'replace-media'
  | 'leave-session'
  | 'wizard-completed'

interface UseMovieWindowOptions {
  playback: PlaybackHook
  sessionState: SessionHook
  activeSession: LibrarySession | null
  session: LibrarySession
  activeSubtitleText: string | null
  canPlay: boolean
  hasMissingMedia: boolean
  getMovieAdapter: () => VideoAdapter | null
  buildController: (movieAdapter: VideoAdapter) => SyncController | null
  destroyRemoteMovieAdapter: () => void
  persist: (patch: Partial<LibrarySession>) => Promise<LibrarySession | null>
  commitLibrary: (next: SessionLibrary) => LibrarySession | null
}

export function useMovieWindow({
  playback,
  sessionState,
  activeSession,
  session,
  activeSubtitleText,
  canPlay,
  hasMissingMedia,
  getMovieAdapter,
  buildController,
  destroyRemoteMovieAdapter,
  persist,
  commitLibrary
}: UseMovieWindowOptions) {
  const {
    reactionVideoRef,
    movieVideoRef,
    controllerRef,
    remoteMovieAdapterRef,
    restoredPopOutSessionRef,
    pendingMovieWindowGeometryRef,
    movieWindowGeometryTimerRef,
    closingMovieWindowRef,
    mediaUrls,
    durations,
    position,
    moviePosition,
    syncState,
    setError,
    movieWindowActive,
    setMovieWindowActive,
    movieAudioTrackChanging,
    setMovieAudioTrackSnapshot
  } = playback
  const { sessionRef, activeSessionIdRef } = sessionState
  const persistRef = useRef(persist)
  persistRef.current = persist
  const appViewRef = useRef(sessionState.appView)
  appViewRef.current = sessionState.appView
  const movieWindowSessionIdRef = useRef<string | null>(null)
  const popOutQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingPopOutRef = useRef<{ sessionId: string; promise: Promise<void> } | null>(null)
  const popOutGenerationRef = useRef(0)
  const movieAudioTrackChangingRef = useRef(movieAudioTrackChanging)
  const pendingPopInRequestRef = useRef(false)
  movieAudioTrackChangingRef.current = movieAudioTrackChanging

  const persistMovieWindowState = async (
    sessionId: string,
    patch: MovieWindowSessionPatch
  ): Promise<LibrarySession | null> => {
    let next: SessionLibrary
    try {
      next = await window.watchAlong.saveMovieWindowState(sessionId, patch)
    } catch {
      setError('WatchAlong could not save the detached movie layout. Your media files were not changed.')
      return null
    }
    if (activeSessionIdRef.current !== sessionId || next.activeSessionId !== sessionId) return null
    return commitLibrary(next)
  }

  useEffect(() => {
    const onResize = (): void => {
      const current = sessionRef.current
      const nextOverlay = constrainOverlay(current.overlay)
      if (
        nextOverlay.x !== current.overlay.x || nextOverlay.y !== current.overlay.y ||
        nextOverlay.width !== current.overlay.width || nextOverlay.height !== current.overlay.height
      ) {
        void persistRef.current({ overlay: nextOverlay })
      }
    }
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const createRemoteMovieAdapter = (initialState: Partial<RemoteMediaState>): RemoteVideoAdapter => {
    destroyRemoteMovieAdapter()
    const adapter = new RemoteVideoAdapter(
      'movie',
      {
        sendCommand: (command) => window.watchAlong.sendMovieMediaCommand(command),
        onEvent: (callback) => window.watchAlong.onMovieMediaEvent(callback)
      },
      initialState
    )
    remoteMovieAdapterRef.current = adapter
    return adapter
  }

  const closeMovieWindowForModeChange = async (): Promise<void> => {
    popOutGenerationRef.current += 1
    await flushMovieWindowGeometry()
    const closingSessionId = movieWindowSessionIdRef.current
    closingMovieWindowRef.current = true
    try {
      await window.watchAlong.closeMovieWindow({ notifyMainWindow: false })
    } finally {
      closingMovieWindowRef.current = false
      if (movieWindowSessionIdRef.current === closingSessionId) {
        movieWindowSessionIdRef.current = null
      }
    }
  }

  const stopDetachedMovie = async (): Promise<void> => {
    if (!hasDetachedMovie()) return
    setMovieAudioTrackSnapshot(EMPTY_AUDIO_TRACK_SNAPSHOT)
    const detachedSessionId = movieWindowSessionIdRef.current ?? activeSessionIdRef.current
    await closeMovieWindowForModeChange()
    destroyRemoteMovieAdapter()
    restoredPopOutSessionRef.current = detachedSessionId
    setMovieWindowActive(false)
    if (detachedSessionId) {
      await persistMovieWindowState(detachedSessionId, { isMoviePoppedOut: false })
    }
  }

  const closeDetachedMovieForTransition = async (
    policy: DetachedMovieTransitionPolicy
  ): Promise<void> => {
    switch (policy) {
      case 'keep':
        return
      case 'replace-media':
        // A pop-out may still be awaiting the main process even though React
        // has not rendered it as active yet. Invalidate that generation before
        // checking the visible state so it cannot finish into the next session.
        popOutGenerationRef.current += 1
        await stopDetachedMovie()
        return
      case 'leave-session':
      case 'wizard-completed': {
        popOutGenerationRef.current += 1
        if (!hasDetachedMovie()) return
        const detachedSessionId = movieWindowSessionIdRef.current ?? activeSessionIdRef.current
        await closeMovieWindowForModeChange()
        destroyRemoteMovieAdapter()
        if (policy === 'wizard-completed') {
          restoredPopOutSessionRef.current = detachedSessionId
        }
        setMovieWindowActive(false)
        // Persist by the captured owner, not whichever session happens to be
        // active after the asynchronous close. This also prevents a wizard
        // switch from leaving the old session set to re-pop on next launch.
        if (detachedSessionId) {
          await persistMovieWindowState(detachedSessionId, { isMoviePoppedOut: false })
        }
        return
      }
      default:
        return assertNever(policy)
    }
  }

  const hasDetachedMovie = (): boolean =>
    movieWindowActive || remoteMovieAdapterRef.current !== null || movieWindowSessionIdRef.current !== null

  async function flushMovieWindowGeometry(): Promise<void> {
    if (movieWindowGeometryTimerRef.current !== null) {
      window.clearTimeout(movieWindowGeometryTimerRef.current)
      movieWindowGeometryTimerRef.current = null
    }
    const pending = pendingMovieWindowGeometryRef.current
    pendingMovieWindowGeometryRef.current = null
    if (!pending) return
    await persistMovieWindowState(pending.sessionId, { movieWindowGeometry: pending.geometry })
  }

  const scheduleMovieWindowGeometryPersist = (event: MovieWindowGeometryEvent): void => {
    if (event.sessionId !== movieWindowSessionIdRef.current) return
    pendingMovieWindowGeometryRef.current = { sessionId: event.sessionId, geometry: event.geometry }
    if (movieWindowGeometryTimerRef.current !== null) return
    movieWindowGeometryTimerRef.current = window.setTimeout(() => {
      movieWindowGeometryTimerRef.current = null
      void flushMovieWindowGeometry()
    }, MOVIE_WINDOW_GEOMETRY_SAVE_MS)
  }

  const popOutMovie = (geometryMode: 'overlay' | 'screen' = 'overlay'): Promise<void> => {
    if (!activeSession || !mediaUrls.movie || movieAudioTrackChangingRef.current) return Promise.resolve()
    const initiatingSession = activeSession
    const initiatingSessionId = initiatingSession.id
    const initiatingMoviePath = initiatingSession.moviePath
    const existing = pendingPopOutRef.current
    if (existing?.sessionId === initiatingSessionId) return existing.promise

    const generation = popOutGenerationRef.current
    const operation = popOutQueueRef.current.catch(() => undefined).then(async () => {
      if (
        generation !== popOutGenerationRef.current ||
        !initiatingMoviePath ||
        appViewRef.current !== 'player' ||
        activeSessionIdRef.current !== initiatingSessionId ||
        sessionRef.current.moviePath !== initiatingMoviePath
      ) return

      const movieAdapter = getMovieAdapter()
      const reactionTime = reactionVideoRef.current?.currentTime ?? position
      const movieTime = movieAdapter?.currentTime ?? moviePosition
      const wasPlaying = syncState === 'playing'
      const initialGeometry = geometryMode === 'screen'
        ? initiatingSession.movieWindowGeometry
        : initiatingSession.overlay
      setMovieAudioTrackSnapshot(EMPTY_AUDIO_TRACK_SNAPSHOT)
      controllerRef.current?.pause()
      movieAdapter?.pause()

      const result = await window.watchAlong.openMovieWindow({
        sessionId: initiatingSessionId,
        subtitleText: activeSubtitleText,
        currentTime: movieTime,
        playbackRate: initiatingSession.playbackRate * initiatingSession.movieRateCorrection,
        volume: initiatingSession.movieVolume,
        muted: initiatingSession.isMovieMuted,
        geometry: initialGeometry,
        geometryMode
      })
      const isCurrent = (): boolean =>
        generation === popOutGenerationRef.current &&
        appViewRef.current === 'player' &&
        activeSessionIdRef.current === initiatingSessionId &&
        sessionRef.current.moviePath === initiatingMoviePath

      if (!result.opened) {
        if (wasPlaying && canPlay && isCurrent()) controllerRef.current?.play()
        return
      }
      if (!isCurrent()) {
        await window.watchAlong.closeMovieWindow({ notifyMainWindow: false })
        return
      }

      const remoteAdapter = createRemoteMovieAdapter({
        ...result.state,
        currentTime: result.state?.currentTime ?? movieTime,
        duration: Number.isFinite(durations.movie) ? durations.movie : result.state?.duration ?? Number.NaN,
        paused: true,
        playbackRate: initiatingSession.playbackRate * initiatingSession.movieRateCorrection,
        volume: initiatingSession.movieVolume,
        muted: initiatingSession.isMovieMuted
      })
      movieWindowSessionIdRef.current = initiatingSessionId
      setMovieWindowActive(true)
      const savedSession = await persistMovieWindowState(initiatingSessionId, {
        isMoviePoppedOut: true,
        movieWindowGeometry: result.geometry
      })
      if (!savedSession || !isCurrent()) {
        closingMovieWindowRef.current = true
        try {
          await window.watchAlong.closeMovieWindow({ notifyMainWindow: false })
        } finally {
          closingMovieWindowRef.current = false
        }
        destroyRemoteMovieAdapter()
        movieWindowSessionIdRef.current = null
        setMovieWindowActive(false)
        await persistMovieWindowState(initiatingSessionId, { isMoviePoppedOut: false })
        return
      }

      if (initiatingSession.isPipHidden) {
        await persistRef.current({ isPipHidden: false })
      }

      buildController(remoteAdapter)?.loadSession(reactionTime)
      if (wasPlaying && canPlay) {
        window.setTimeout(() => {
          if (isCurrent()) controllerRef.current?.play()
        }, MOVIE_WINDOW_TRANSITION_MS)
      }
    })
    popOutQueueRef.current = operation
    pendingPopOutRef.current = { sessionId: initiatingSessionId, promise: operation }
    const clearPending = (): void => {
      if (pendingPopOutRef.current?.promise === operation) pendingPopOutRef.current = null
    }
    void operation.then(clearPending, clearPending)
    return operation
  }

  const popInMovie = async (): Promise<void> => {
    if (movieAudioTrackChangingRef.current) {
      pendingPopInRequestRef.current = true
      return
    }
    pendingPopInRequestRef.current = false
    setMovieAudioTrackSnapshot(EMPTY_AUDIO_TRACK_SNAPSHOT)
    const detachedSessionId = movieWindowSessionIdRef.current ?? activeSessionIdRef.current
    const detachedSession = sessionRef.current
    if (!remoteMovieAdapterRef.current) {
      restoredPopOutSessionRef.current = detachedSessionId
      movieWindowSessionIdRef.current = null
      if (detachedSessionId) {
        await persistMovieWindowState(detachedSessionId, { isMoviePoppedOut: false })
      }
      setMovieWindowActive(false)
      return
    }

    popOutGenerationRef.current += 1
    await flushMovieWindowGeometry()
    const remoteAdapter = remoteMovieAdapterRef.current
    const wasPlaying = syncState === 'playing'
    const reactionTime = reactionVideoRef.current?.currentTime ?? position
    controllerRef.current?.pause()
    if (detachedSessionId && activeSessionIdRef.current === detachedSessionId) {
      const fadeResult = await window.watchAlong.sendMovieMediaCommand({ id: `fade-${Date.now()}`, type: 'fadeOut' })
      if (!fadeResult.ok && fadeResult.error === MOVIE_WINDOW_COMMAND_TIMEOUT_ERROR) {
        setError(MOVIE_WINDOW_UNRESPONSIVE_MESSAGE)
      }
    }
    closingMovieWindowRef.current = true
    const result = await window.watchAlong.closeMovieWindow({ notifyMainWindow: false }).finally(() => {
      closingMovieWindowRef.current = false
    })
    const nextOverlay = constrainOverlay(result.overlay ?? detachedSession.overlay)
    const movieState = result.state ?? remoteAdapter.snapshot()
    destroyRemoteMovieAdapter()
    restoredPopOutSessionRef.current = detachedSessionId
    movieWindowSessionIdRef.current = null
    setMovieWindowActive(false)

    const remainsCurrent = detachedSessionId !== null &&
      activeSessionIdRef.current === detachedSessionId &&
      appViewRef.current === 'player'
    if (remainsCurrent) {
      window.requestAnimationFrame(() => {
        if (activeSessionIdRef.current !== detachedSessionId || appViewRef.current !== 'player') return
        const movie = movieVideoRef.current
        if (!movie) return
        if (movie.src !== (mediaUrls.movie ?? '')) movie.src = mediaUrls.movie ?? ''
        movie.currentTime = movieState.currentTime
        movie.playbackRate = detachedSession.playbackRate * detachedSession.movieRateCorrection
        movie.volume = detachedSession.movieVolume
        movie.muted = detachedSession.isMovieMuted
        const controller = buildController(createHtmlVideoAdapter('movie', movie))
        controller?.loadSession(reactionTime)
        if (wasPlaying && canPlay) {
          window.setTimeout(() => {
            if (activeSessionIdRef.current === detachedSessionId) controllerRef.current?.play()
          }, MOVIE_WINDOW_TRANSITION_MS)
        }
      })
    }

    if (detachedSessionId) {
      await persistMovieWindowState(detachedSessionId, {
        isMoviePoppedOut: false,
        overlay: nextOverlay,
        movieWindowGeometry: result.geometry ?? detachedSession.movieWindowGeometry
      })
    }
  }

  const popInMovieRef = useRef(popInMovie)
  popInMovieRef.current = popInMovie
  const handleGeometryRef = useRef(scheduleMovieWindowGeometryPersist)
  handleGeometryRef.current = scheduleMovieWindowGeometryPersist

  useEffect(() => {
    if (!movieAudioTrackChanging && pendingPopInRequestRef.current) {
      pendingPopInRequestRef.current = false
      void popInMovieRef.current()
    }
  }, [movieAudioTrackChanging])

  useEffect(() => {
    const unsubscribeGeometry = window.watchAlong.onMovieWindowGeometry((event) => {
      handleGeometryRef.current(event)
    })
    const unsubscribePopIn = window.watchAlong.onMovieWindowPopInRequest((event) => {
      if (event?.sessionId && event.sessionId !== movieWindowSessionIdRef.current) return
      if (movieAudioTrackChangingRef.current) {
        pendingPopInRequestRef.current = true
        return
      }
      void popInMovieRef.current()
    })
    const unsubscribeClosed = window.watchAlong.onMovieWindowClosed((event) => {
      if (closingMovieWindowRef.current) return
      const closedSessionId = event?.sessionId ?? movieWindowSessionIdRef.current
      if (
        closedSessionId && movieWindowSessionIdRef.current &&
        closedSessionId !== movieWindowSessionIdRef.current
      ) {
        void persistMovieWindowState(closedSessionId, { isMoviePoppedOut: false })
        return
      }
      if (event?.reason === 'unresponsive') setError(MOVIE_WINDOW_UNRESPONSIVE_MESSAGE)
      popOutGenerationRef.current += 1
      movieWindowSessionIdRef.current = null
      destroyRemoteMovieAdapter()
      restoredPopOutSessionRef.current = closedSessionId
      setMovieAudioTrackSnapshot(EMPTY_AUDIO_TRACK_SNAPSHOT)
      setMovieWindowActive(false)
      if (closedSessionId) {
        void persistMovieWindowState(closedSessionId, { isMoviePoppedOut: false })
      }
      if (closedSessionId && activeSessionIdRef.current === closedSessionId) {
        window.requestAnimationFrame(() => {
          if (activeSessionIdRef.current === closedSessionId && movieVideoRef.current) {
            buildController(createHtmlVideoAdapter('movie', movieVideoRef.current))
          }
        })
      }
    })
    return () => {
      unsubscribeGeometry()
      unsubscribePopIn()
      unsubscribeClosed()
    }
  }, [buildController, destroyRemoteMovieAdapter])

  useEffect(() => () => {
    popOutGenerationRef.current += 1
    if (movieWindowGeometryTimerRef.current !== null) window.clearTimeout(movieWindowGeometryTimerRef.current)
    pendingMovieWindowGeometryRef.current = null
    pendingPopInRequestRef.current = false
  }, [])

  useEffect(() => {
    if (
      sessionState.appView !== 'player' || !activeSession?.isMoviePoppedOut || movieWindowActive ||
      !mediaUrls.movie || hasMissingMedia || restoredPopOutSessionRef.current === activeSession.id
    ) return
    restoredPopOutSessionRef.current = activeSession.id
    void popOutMovie('screen')
  })

  return {
    closeMovieWindowForModeChange,
    stopDetachedMovie,
    closeDetachedMovieForTransition,
    popOutMovie,
    popInMovie
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled detached movie transition policy: ${String(value)}`)
}
