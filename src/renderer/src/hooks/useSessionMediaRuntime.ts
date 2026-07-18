import { useCallback, useEffect, useRef } from 'react'
import { getActiveSession } from '@shared/session'
import type { LibrarySession, MediaRole, SessionLibrary } from '@shared/types'
import { SyncController, createHtmlVideoAdapter, type VideoAdapter } from '../sync/SyncController'
import { TimelineMapping } from '../sync/timeline'
import type { PlaybackHook } from './usePlayback'
import { roundSeconds } from './playerTiming'
import type { SessionHook } from './useSession'

type MediaUrls = Record<MediaRole, string | null>
type MetadataReady = Record<MediaRole, boolean>
type Durations = Record<MediaRole, number>

const emptyUrls: MediaUrls = { reaction: null, movie: null }
const emptyMetadata: MetadataReady = { reaction: false, movie: false }
const emptyDurations: Durations = { reaction: Number.NaN, movie: Number.NaN }

interface UseSessionMediaRuntimeOptions {
  playback: PlaybackHook
  sessionState: SessionHook
  activeSession: LibrarySession | null
  session: LibrarySession
}

export function useSessionMediaRuntime({
  playback,
  sessionState,
  activeSession,
  session
}: UseSessionMediaRuntimeOptions) {
  const {
    reactionVideoRef,
    movieVideoRef,
    controllerRef,
    remoteMovieAdapterRef,
    setupModeRef,
    lastPositionSaveRef,
    positionRef,
    mediaUrls,
    setMediaUrls,
    metadataReady,
    setMetadataReady,
    setDurations,
    position,
    setPosition,
    setMoviePosition,
    setupMode,
    setSetupPositions,
    setSyncState,
    setError,
    restoreToken,
    setRestoreToken,
    movieWindowActive
  } = playback
  const {
    sessionRef,
    activeSessionIdRef,
    emptySession,
    setLibrary,
    appView
  } = sessionState

  const commitLibrary = useCallback((next: SessionLibrary): LibrarySession | null => {
    const nextSession = getActiveSession(next)
    if (nextSession) {
      if (activeSessionIdRef.current !== nextSession.id) {
        // Establish the disk-backed fallback synchronously when session
        // identity changes. Media elements can emit initial zero-valued events
        // before metadata and restoration have completed.
        positionRef.current = nextSession.lastReactionTimeSeconds
      }
      sessionRef.current = nextSession
      activeSessionIdRef.current = nextSession.id
    } else {
      sessionRef.current = emptySession
      activeSessionIdRef.current = null
      positionRef.current = 0
    }
    setLibrary(next)
    return nextSession
  }, [emptySession])

  const currentMovieMoment = useCallback((source: LibrarySession | null): number | null => {
    if (!source?.moviePath || !source.reactionPath) return null
    const reaction = reactionVideoRef.current
    const reactionTime = reaction && reaction.readyState > 0 && Number.isFinite(reaction.currentTime)
      ? reaction.currentTime
      : positionRef.current
    return new TimelineMapping({
      offsetSeconds: source.offsetSeconds,
      movieRateCorrection: source.movieRateCorrection
    }).reactionToMovie(reactionTime)
  }, [])

  const mergeSavedSessionPosition = useCallback((next: SessionLibrary, sessionId: string): void => {
    if (activeSessionIdRef.current === sessionId) {
      commitLibrary(next)
      return
    }

    const savedSession = next.sessions.find((candidate) => candidate.id === sessionId)
    if (!savedSession) {
      return
    }

    setLibrary((current) => ({
      ...current,
      sessions: current.sessions.map((candidate) => (candidate.id === sessionId ? savedSession : candidate))
    }))
  }, [commitLibrary])

  const saveSessionPosition = useCallback(async (sessionId: string, reactionTime: number): Promise<void> => {
    const next = await window.watchAlong.saveSessionPosition(sessionId, roundSeconds(Math.max(0, reactionTime)))
    mergeSavedSessionPosition(next, sessionId)
  }, [mergeSavedSessionPosition])

  const flushStateRef = useRef({ appView, mediaUrls, restoreToken })
  flushStateRef.current = { appView, mediaUrls, restoreToken }

  const flushCurrentSessionPosition = useCallback(async (): Promise<void> => {
    const current = flushStateRef.current
    if (current.appView !== 'player') {
      return
    }

    const sessionId = activeSessionIdRef.current
    if (!sessionId) {
      return
    }

    const reaction = reactionVideoRef.current
    const currentRestoreToken = `${sessionId}|${current.mediaUrls.reaction ?? ''}|${current.mediaUrls.movie ?? ''}`
    const mediaRestored = current.restoreToken === currentRestoreToken
    const nextReactionTime = mediaRestored
      ? reaction && reaction.readyState > 0 && Number.isFinite(reaction.currentTime)
        ? reaction.currentTime
        : positionRef.current
      : sessionRef.current.id === sessionId
        ? sessionRef.current.lastReactionTimeSeconds
        : positionRef.current
    await saveSessionPosition(sessionId, nextReactionTime)
  }, [saveSessionPosition])

  const getMovieAdapter = useCallback((): VideoAdapter | null => {
    if (remoteMovieAdapterRef.current) {
      return remoteMovieAdapterRef.current
    }

    return movieVideoRef.current ? createHtmlVideoAdapter('movie', movieVideoRef.current) : null
  }, [])

  const buildController = useCallback((movieAdapter: VideoAdapter): SyncController | null => {
    const reaction = reactionVideoRef.current
    if (!reaction) {
      return null
    }

    controllerRef.current?.destroy()

    const controller = new SyncController({
      reaction: createHtmlVideoAdapter('reaction', reaction),
      movie: movieAdapter,
      getOffset: () => sessionRef.current.offsetSeconds,
      getMovieRate: () => sessionRef.current.movieRateCorrection,
      setOffset: async (offsetSeconds) => {
        const next = await window.watchAlong.saveActiveSession({ offsetSeconds })
        commitLibrary(next)
      },
      onState: setSyncState,
      onPosition: (reactionTime) => {
        if (!Number.isFinite(reactionTime)) {
          return
        }

        if (setupModeRef.current) {
          positionRef.current = reactionTime
          setPosition(reactionTime)
          setSetupPositions((current) => ({ ...current, reaction: reactionTime }))
          return
        }

        // attach() starts the controller's animation loop before the stored
        // position has been restored. Persisting those initial zero-valued
        // frames can overwrite the disk value that loadSession is about to
        // read. Paused/seeking positions are still saved by explicit flushes;
        // only genuinely playing media needs periodic persistence.
        if (controllerRef.current?.getState() !== 'playing') {
          return
        }

        positionRef.current = reactionTime
        setPosition(reactionTime)
        const currentSession = sessionRef.current
        const now = Date.now()
        if (now - lastPositionSaveRef.current > 1500 && currentSession.reactionPath && currentSession.moviePath) {
          lastPositionSaveRef.current = now
          void saveSessionPosition(currentSession.id, reactionTime)
        }
      },
      onError: setError
    })

    controller.attach()
    controller.setAudio(audioState(sessionRef.current))
    controller.setPlaybackRate(sessionRef.current.playbackRate)
    controller.setSetupMode(setupModeRef.current)
    controllerRef.current = controller
    return controller
  }, [commitLibrary, saveSessionPosition])

  const destroyRemoteMovieAdapter = useCallback((): void => {
    remoteMovieAdapterRef.current?.destroy()
    remoteMovieAdapterRef.current = null
  }, [])

  const refreshMediaUrls = useCallback(async (sessionId: string | null): Promise<void> => {
    if (!sessionId) {
      setMediaUrls(emptyUrls)
      setMetadataReady(emptyMetadata)
      setDurations(emptyDurations)
      setRestoreToken(null)
      return
    }

    const [reaction, movie] = await Promise.all([
      window.watchAlong.getMediaUrl('reaction', sessionId),
      window.watchAlong.getMediaUrl('movie', sessionId)
    ])
    setMediaUrls({ reaction, movie })
    setMetadataReady(emptyMetadata)
    setDurations(emptyDurations)
    setRestoreToken(null)
  }, [])

  const persist = useCallback(async (
    patch: Partial<LibrarySession>
  ): Promise<LibrarySession | null> => {
    const next = await window.watchAlong.saveActiveSession(patch)
    return commitLibrary(next)
  }, [commitLibrary])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    setupModeRef.current = setupMode
    controllerRef.current?.setSetupMode(setupMode)
  }, [setupMode])

  useEffect(() => {
    const movie = movieVideoRef.current
    if (!movie || controllerRef.current) {
      return
    }

    const controller = buildController(createHtmlVideoAdapter('movie', movie))

    return () => {
      controller?.destroy()
      if (controllerRef.current === controller) {
        controllerRef.current = null
      }
    }
  }, [appView, buildController, mediaUrls.movie, mediaUrls.reaction, movieWindowActive])

  useEffect(() => {
    const reaction = reactionVideoRef.current
    const movie = movieVideoRef.current
    if (reaction && reaction.src !== (mediaUrls.reaction ?? '')) {
      reaction.src = mediaUrls.reaction ?? ''
    }

    if (movie && movie.src !== (mediaUrls.movie ?? '')) {
      movie.src = mediaUrls.movie ?? ''
    }
  }, [mediaUrls, movieWindowActive])

  useEffect(() => {
    controllerRef.current?.setAudio(audioState(session))
    controllerRef.current?.setPlaybackRate(session.playbackRate)
  }, [
    session.isMovieMuted,
    session.isReactionMuted,
    session.movieVolume,
    session.movieRateCorrection,
    session.playbackRate,
    session.reactionVolume,
    session
  ])

  useEffect(() => {
    // Library IPC commits update sessionRef synchronously, while the `session`
    // render value can still be one React commit behind. This matters when the
    // user closes and immediately reopens the same pairing after its position
    // was flushed: the old render still contains the pre-flush position.
    const restoreSession = sessionRef.current
    const token = `${restoreSession.id}|${mediaUrls.reaction ?? ''}|${mediaUrls.movie ?? ''}`
    if (
      !activeSession ||
      restoreSession.id !== activeSessionIdRef.current ||
      !mediaUrls.reaction ||
      !mediaUrls.movie ||
      !metadataReady.reaction ||
      !metadataReady.movie ||
      restoreToken === token
    ) {
      return
    }

    controllerRef.current?.setAudio(audioState(restoreSession))
    controllerRef.current?.setPlaybackRate(restoreSession.playbackRate)
    positionRef.current = restoreSession.lastReactionTimeSeconds
    controllerRef.current?.loadSession(restoreSession.lastReactionTimeSeconds)
    setPosition(restoreSession.lastReactionTimeSeconds)
    setMoviePosition(getMovieAdapter()?.currentTime ?? 0)
    setRestoreToken(token)
  }, [activeSession, activeSessionIdRef, getMovieAdapter, mediaUrls, metadataReady, restoreToken, sessionRef])

  useEffect(() => {
    positionRef.current = position
  }, [position])

  return {
    commitLibrary,
    currentMovieMoment,
    persist,
    flushCurrentSessionPosition,
    getMovieAdapter,
    buildController,
    destroyRemoteMovieAdapter,
    refreshMediaUrls
  }
}

function audioState(session: LibrarySession): {
  reactionVolume: number
  movieVolume: number
  isReactionMuted: boolean
  isMovieMuted: boolean
} {
  return {
    reactionVolume: session.reactionVolume,
    movieVolume: session.movieVolume,
    isReactionMuted: session.isReactionMuted,
    isMovieMuted: session.isMovieMuted
  }
}
