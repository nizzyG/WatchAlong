import { useEffect, useRef } from 'react'
import { clamp } from '@shared/numeric'
import type {
  LibrarySession,
  MediaRole,
  OverlayGeometry,
  PlaybackRate,
  ReactorSource,
  RemoteMediaState,
  SessionLibrary
} from '@shared/types'
import {
  MediaPlaybackErrorMonitor,
  mediaPlaybackErrorMessage,
  observeHtmlVideo,
  type MediaPlaybackObservation
} from '../playback/MediaPlaybackErrorMonitor'
import { TimelineMapping } from '../sync/timeline'
import type { VideoAdapter } from '../sync/SyncController'
import { isAutoSyncReady } from '../autoSyncReadiness'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'
import type { useAutoSync } from './useAutoSync'
import { calculateMovieRateCorrection, roundSeconds } from './playerTiming'

interface UsePlayerControlsOptions {
  playback: PlaybackHook
  sessionState: SessionHook
  activeSession: LibrarySession | null
  session: LibrarySession
  autoSync: ReturnType<typeof useAutoSync>
  autoSyncBusy: boolean
  canPlay: boolean
  reactionDuration: number
  getMovieAdapter: () => VideoAdapter | null
  persist: (patch: Partial<LibrarySession>) => Promise<LibrarySession | null>
  commitLibrary: (next: SessionLibrary) => LibrarySession | null
}

export function usePlayerControls({
  playback,
  sessionState,
  activeSession,
  session,
  autoSync,
  autoSyncBusy,
  canPlay,
  reactionDuration,
  getMovieAdapter,
  persist,
  commitLibrary
}: UsePlayerControlsOptions) {
  const {
    reactionVideoRef,
    movieVideoRef,
    controllerRef,
    positionRef,
    movieFrameRateDetectionKeyRef,
    durations,
    position,
    setPosition,
    moviePosition,
    setMoviePosition,
    setupMode,
    setSetupMode,
    setupPositions,
    setSetupPositions,
    setupPlayingRole,
    setSetupPlayingRole,
    setMetadataReady,
    setDurations,
    setError,
    setSyncState,
    setPendingSyncSetup
  } = playback
  const { sessionRef, activeSessionIdRef, setLibrary, appView } = sessionState
  const mediaRecoveryCleanupRef = useRef<Record<MediaRole, (() => void) | null>>({
    reaction: null,
    movie: null
  })
  const mediaErrorMonitorRef = useRef<MediaPlaybackErrorMonitor | null>(null)

  if (!mediaErrorMonitorRef.current) {
    mediaErrorMonitorRef.current = new MediaPlaybackErrorMonitor({
      onActionable: (role) => {
        setError(mediaPlaybackErrorMessage(role))
        setSyncState('error')
      },
      onRecovery: (role, wasDisplayed) => {
        mediaRecoveryCleanupRef.current[role]?.()
        mediaRecoveryCleanupRef.current[role] = null
        if (!wasDisplayed) return

        const message = mediaPlaybackErrorMessage(role)
        setError((current) => current === message ? null : current)
        setSyncState(controllerRef.current?.getState() ?? 'paused')
      }
    })
  }

  useEffect(() => () => {
    mediaErrorMonitorRef.current?.destroy()
    for (const role of ['reaction', 'movie'] as const) {
      mediaRecoveryCleanupRef.current[role]?.()
      mediaRecoveryCleanupRef.current[role] = null
    }
  }, [])

  const togglePlayPause = (): void => {
    if (!canPlay) return
    if (playback.syncState === 'playing') controllerRef.current?.pause()
    else controllerRef.current?.play()
  }

  const seekBy = (deltaSeconds: number): void => {
    if (!canPlay) return
    controllerRef.current?.seekReaction(Math.max(0, Math.min(reactionDuration, position + deltaSeconds)))
  }

  const seekTo = (value: number): void => {
    if (!canPlay) return
    setPosition(value)
    controllerRef.current?.seekReaction(value)
  }

  const setReactionVolume = (value: number): void => {
    if (!autoSyncBusy) void persist({ reactionVolume: clamp(value, 0, 1) })
  }

  const setMovieVolume = (value: number): void => {
    if (!autoSyncBusy) void persist({ movieVolume: clamp(value, 0, 1) })
  }

  const toggleReactionMute = (): void => {
    if (activeSession && !autoSyncBusy) void persist({ isReactionMuted: !session.isReactionMuted })
  }

  const toggleMovieMute = (): void => {
    if (activeSession && !autoSyncBusy) void persist({ isMovieMuted: !session.isMovieMuted })
  }

  const setPlaybackRate = (playbackRate: PlaybackRate): void => {
    if (!autoSyncBusy) void persist({ playbackRate })
  }

  const getCurrentReactionTime = (): number => {
    const reaction = reactionVideoRef.current
    return reaction && reaction.readyState > 0 && Number.isFinite(reaction.currentTime)
      ? reaction.currentTime
      : positionRef.current
  }

  const applyMovieRateCorrection = async (
    movieRateCorrection: number,
    patch: Partial<LibrarySession> = {}
  ): Promise<void> => {
    if (!activeSession || autoSyncBusy) return

    const reactionTime = getCurrentReactionTime()
    const currentMovieTime = new TimelineMapping({
      offsetSeconds: sessionRef.current.offsetSeconds,
      movieRateCorrection: sessionRef.current.movieRateCorrection
    }).rawReactionToMovie(reactionTime)
    const offsetSeconds = TimelineMapping.calculateOffset(reactionTime, currentMovieTime, movieRateCorrection)
    const nextSession = await persist({
      ...patch,
      movieRateCorrection,
      offsetSeconds: roundSeconds(offsetSeconds)
    })

    if (nextSession && canPlay) controllerRef.current?.seekReaction(reactionTime)
  }

  const setMovieRateCorrection = async (movieRateCorrection: number): Promise<void> => {
    await applyMovieRateCorrection(movieRateCorrection)
  }

  const setReactorSource = async (reactorSource: ReactorSource): Promise<void> => {
    if (!activeSession || autoSyncBusy) return

    const movieRateCorrection = calculateMovieRateCorrection(sessionRef.current.detectedMovieFps, reactorSource)
    if (movieRateCorrection === null) {
      await persist({ reactorSource })
      return
    }
    await applyMovieRateCorrection(movieRateCorrection, { reactorSource })
  }

  const detectSyncAgain = async (): Promise<void> => {
    const sessionId = activeSessionIdRef.current
    if (!sessionId || autoSync.runningSessionId) return
    controllerRef.current?.pause()
    const result = await autoSync.start(sessionId, 'recheck')
    const nextSession = commitLibrary(await window.watchAlong.getLibrary())
    if (nextSession?.id !== sessionId) return
    const readyToPlay = isAutoSyncReady(result)
    if (readyToPlay && nextSession && playback.canPlayRef.current) {
      controllerRef.current?.seekReaction(getCurrentReactionTime())
    } else if (!readyToPlay && result.outcome !== 'cancelled' && nextSession?.reactionPath && nextSession.moviePath) {
      setPendingSyncSetup(true)
    }
  }

  useEffect(() => {
    const moviePath = activeSession?.moviePath
    if (!activeSession || !moviePath || activeSession.detectedMovieFps !== null || autoSyncBusy) return

    const detectionKey = `${activeSession.id}|${moviePath}`
    if (movieFrameRateDetectionKeyRef.current === detectionKey) return

    movieFrameRateDetectionKeyRef.current = detectionKey
    const detectionSnapshot = frameRateDetectionSnapshot(activeSession)
    let cancelled = false
    void (async () => {
      let detectedMovieFps: number | null = null
      try {
        detectedMovieFps = await window.watchAlong.detectMovieFrameRate(activeSession.id)
      } catch {
        detectedMovieFps = null
      }
      if (cancelled) return

      const authoritativeLibrary = await window.watchAlong.getLibrary()
      if (cancelled) return
      const authoritativeSession = authoritativeLibrary.sessions.find((item) => item.id === activeSession.id) ?? null
      if (!isFrameRateDetectionSnapshotCurrent(authoritativeSession, detectionSnapshot)) return

      const currentSession = sessionRef.current
      if (!isFrameRateDetectionSnapshotCurrent(currentSession, detectionSnapshot)) return

      const movieRateCorrection = calculateMovieRateCorrection(detectedMovieFps, authoritativeSession.reactorSource)
      if (movieRateCorrection === null) {
        await persist({ detectedMovieFps: null })
        return
      }
      await applyMovieRateCorrection(movieRateCorrection, { detectedMovieFps })
    })()

    return () => {
      cancelled = true
      if (movieFrameRateDetectionKeyRef.current === detectionKey) {
        movieFrameRateDetectionKeyRef.current = null
      }
    }
  }, [activeSession?.detectedMovieFps, activeSession?.id, activeSession?.moviePath, autoSyncBusy])

  const togglePipVisibility = (): void => {
    if (activeSession) void persist({ isPipHidden: !session.isPipHidden })
  }

  const nudgeOffset = async (deltaSeconds: number): Promise<void> => {
    if (!activeSession || autoSyncBusy) return
    const nextOffset = Number((sessionRef.current.offsetSeconds + deltaSeconds).toFixed(3))
    const nextSession = await persist({ offsetSeconds: nextOffset })
    if (nextSession && canPlay) controllerRef.current?.seekReaction(position)
  }

  const handleMetadata = (role: MediaRole): void => {
    const element = role === 'reaction' ? reactionVideoRef.current : movieVideoRef.current
    const duration = element?.duration ?? Number.NaN
    setDurations((current) => ({ ...current, [role]: duration }))
    setMetadataReady((current) => ({ ...current, [role]: true }))
    setSetupPositions((current) => ({ ...current, [role]: element?.currentTime ?? 0 }))
    if (
      role === 'reaction' && activeSession && Number.isFinite(duration) &&
      Math.abs((activeSession.reactionDurationSeconds ?? 0) - duration) > 0.5
    ) {
      void persist({ reactionDurationSeconds: duration })
    }
    if (role === 'movie') setMoviePosition(element?.currentTime ?? 0)
    if (element) handleVideoRecovery(role, element)
  }

  const handleTimeUpdate = (role: MediaRole): void => {
    const element = role === 'reaction' ? reactionVideoRef.current : movieVideoRef.current
    if (!element || element.readyState === 0 || !Number.isFinite(element.currentTime)) return

    const currentTime = element.currentTime
    if (role === 'movie') {
      setMoviePosition(currentTime)
    } else {
      // Native media time is the fallback authority when the controller loop
      // is throttled or absent (for example during window lifecycle changes).
      positionRef.current = currentTime
      setPosition(currentTime)
    }
    handleVideoRecovery(role, element)
    if (!setupMode) return
    setSetupPositions((current) => ({ ...current, [role]: currentTime }))
  }

  const handleVideoError = (role: MediaRole, source: HTMLVideoElement | RemoteMediaState): void => {
    const monitor = mediaErrorMonitorRef.current
    if (!monitor) return

    if (!(source instanceof HTMLVideoElement)) {
      const observation = observeRemoteMedia(source, true)
      monitor.reportError(role, () => observation)
      return
    }

    mediaRecoveryCleanupRef.current[role]?.()
    const recoveryEvents = ['loadeddata', 'canplay', 'canplaythrough', 'playing'] as const
    const onRecovery = (): void => {
      handleVideoRecovery(role, source)
    }
    const cleanup = (): void => {
      for (const eventName of recoveryEvents) source.removeEventListener(eventName, onRecovery)
    }
    mediaRecoveryCleanupRef.current[role] = cleanup
    for (const eventName of recoveryEvents) source.addEventListener(eventName, onRecovery)

    monitor.reportError(role, () => {
      const current = role === 'reaction' ? reactionVideoRef.current : movieVideoRef.current
      return current === source ? observeHtmlVideo(source) : null
    })
  }

  const handleVideoRecovery = (role: MediaRole, source: HTMLVideoElement | RemoteMediaState): void => {
    const observation = source instanceof HTMLVideoElement
      ? observeHtmlVideo(source)
      : observeRemoteMedia(source, false)
    if (!mediaErrorMonitorRef.current?.reportRecovery(role, observation)) return

    mediaRecoveryCleanupRef.current[role]?.()
    mediaRecoveryCleanupRef.current[role] = null
  }

  const updateOverlay = (overlay: OverlayGeometry): void => {
    sessionRef.current = { ...sessionRef.current, overlay }
    setLibrary((current) => ({
      ...current,
      sessions: current.sessions.map((item) => item.id === sessionRef.current.id ? { ...item, overlay } : item)
    }))
  }

  const commitOverlay = (overlay: OverlayGeometry): void => {
    void persist({ overlay })
  }

  const toggleFullscreen = (): void => {
    if (appView !== 'library' && appView !== 'player') return
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
      return
    }
    void document.documentElement.requestFullscreen().catch(() => undefined)
  }

  const enterSyncSetup = (): void => {
    if (!canPlay) return
    controllerRef.current?.pause()
    reactionVideoRef.current?.pause()
    getMovieAdapter()?.pause()
    setSetupPlayingRole(null)
    setSetupPositions({
      reaction: reactionVideoRef.current?.currentTime ?? position,
      movie: getMovieAdapter()?.currentTime ?? moviePosition
    })
    setSetupMode(true)
  }

  const cancelSyncSetup = (): void => {
    reactionVideoRef.current?.pause()
    getMovieAdapter()?.pause()
    setSetupPlayingRole(null)
    setSetupMode(false)
    controllerRef.current?.setSetupMode(false)
    controllerRef.current?.loadSession(reactionVideoRef.current?.currentTime ?? position)
  }

  const saveSyncSetup = async (): Promise<void> => {
    const reaction = reactionVideoRef.current
    const movie = getMovieAdapter()
    if (!reaction || !movie) return
    reaction.pause()
    movie.pause()
    setSetupPlayingRole(null)
    const nextReactionTime = reaction.currentTime
    await persist({
      offsetSeconds: roundSeconds(TimelineMapping.calculateOffset(
        reaction.currentTime,
        movie.currentTime,
        session.movieRateCorrection
      )),
      lastReactionTimeSeconds: nextReactionTime
    })
    setPosition(nextReactionTime)
    setSetupMode(false)
    controllerRef.current?.setSetupMode(false)
    controllerRef.current?.loadSession(nextReactionTime)
  }

  const setIndependentSetupTime = (role: MediaRole, time: number): void => {
    const element = role === 'reaction' ? reactionVideoRef.current : getMovieAdapter()
    const duration = role === 'reaction' ? durations.reaction : durations.movie
    const nextTime = Math.max(0, Math.min(Number.isFinite(duration) ? duration : Number.MAX_SAFE_INTEGER, time))
    if (element) element.currentTime = nextTime
    setSetupPositions((current) => ({ ...current, [role]: nextTime }))
    if (role === 'reaction') setPosition(nextTime)
    else setMoviePosition(nextTime)
  }

  const nudgeSetupTime = (role: MediaRole, deltaSeconds: number): void => {
    setIndependentSetupTime(role, setupPositions[role] + deltaSeconds)
  }

  const toggleSetupPreview = async (role: MediaRole): Promise<void> => {
    if (!setupMode) return
    const active = role === 'reaction' ? reactionVideoRef.current : getMovieAdapter()
    const other = role === 'reaction' ? getMovieAdapter() : reactionVideoRef.current
    if (!active) return
    if (setupPlayingRole === role && !active.paused) {
      active.pause()
      setSetupPlayingRole(null)
      return
    }
    other?.pause()
    active.playbackRate = role === 'movie' ? session.playbackRate * session.movieRateCorrection : session.playbackRate
    await active.play()
    setSetupPlayingRole(role)
  }

  return {
    togglePlayPause,
    seekBy,
    seekTo,
    setReactionVolume,
    setMovieVolume,
    toggleReactionMute,
    toggleMovieMute,
    setPlaybackRate,
    setMovieRateCorrection,
    setReactorSource,
    detectSyncAgain,
    togglePipVisibility,
    nudgeOffset,
    handleMetadata,
    handleTimeUpdate,
    handleVideoError,
    handleVideoRecovery,
    updateOverlay,
    commitOverlay,
    toggleFullscreen,
    toggleReactionFullscreen: toggleFullscreen,
    enterSyncSetup,
    syncNow: enterSyncSetup,
    cancelSyncSetup,
    saveSyncSetup,
    setIndependentSetupTime,
    nudgeSetupTime,
    toggleSetupPreview
  }
}

type FrameRateDetectionSnapshot = Pick<LibrarySession,
  | 'id'
  | 'moviePath'
  | 'reactionPath'
  | 'offsetSeconds'
  | 'movieRateCorrection'
  | 'reactorSource'
  | 'detectedMovieFps'
  | 'timingOrigin'
  | 'autoSyncConfidence'
  | 'autoSyncAnalyzedAt'
  | 'autoSyncAlgorithmVersion'
>

function frameRateDetectionSnapshot(session: LibrarySession): FrameRateDetectionSnapshot {
  return {
    id: session.id,
    moviePath: session.moviePath,
    reactionPath: session.reactionPath,
    offsetSeconds: session.offsetSeconds,
    movieRateCorrection: session.movieRateCorrection,
    reactorSource: session.reactorSource,
    detectedMovieFps: session.detectedMovieFps,
    timingOrigin: session.timingOrigin,
    autoSyncConfidence: session.autoSyncConfidence,
    autoSyncAnalyzedAt: session.autoSyncAnalyzedAt,
    autoSyncAlgorithmVersion: session.autoSyncAlgorithmVersion
  }
}

function isFrameRateDetectionSnapshotCurrent(
  current: LibrarySession | null,
  snapshot: FrameRateDetectionSnapshot
): current is LibrarySession {
  return Boolean(
    current &&
    current.id === snapshot.id &&
    current.moviePath === snapshot.moviePath &&
    current.reactionPath === snapshot.reactionPath &&
    current.offsetSeconds === snapshot.offsetSeconds &&
    current.movieRateCorrection === snapshot.movieRateCorrection &&
    current.reactorSource === snapshot.reactorSource &&
    current.detectedMovieFps === snapshot.detectedMovieFps &&
    current.timingOrigin === snapshot.timingOrigin &&
    current.autoSyncConfidence === snapshot.autoSyncConfidence &&
    current.autoSyncAnalyzedAt === snapshot.autoSyncAnalyzedAt &&
    current.autoSyncAlgorithmVersion === snapshot.autoSyncAlgorithmVersion
  )
}

function observeRemoteMedia(state: RemoteMediaState, hasError: boolean): MediaPlaybackObservation {
  return {
    currentTime: Number.isFinite(state.currentTime) ? state.currentTime : 0,
    readyState: state.readyState,
    ended: state.ended,
    hasError,
    source: null
  }
}
