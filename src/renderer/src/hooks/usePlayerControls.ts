import { useEffect } from 'react'
import type { LibrarySession, MediaRole, OverlayGeometry, PlaybackRate, ReactorSource, SessionLibrary } from '@shared/types'
import { TimelineMapping } from '../sync/timeline'
import type { VideoAdapter } from '../sync/SyncController'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'
import type { useAutoSync } from './useAutoSync'
import { calculateMovieRateCorrection, clamp } from './playerTiming'

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
  const { sessionRef, activeSessionIdRef, setLibrary } = sessionState

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
    if (result.outcome === 'confident' && nextSession && playback.canPlayRef.current) {
      controllerRef.current?.seekReaction(getCurrentReactionTime())
    } else if (result.outcome !== 'cancelled' && nextSession?.reactionPath && nextSession.moviePath) {
      setPendingSyncSetup(true)
    }
  }

  useEffect(() => {
    const moviePath = activeSession?.moviePath
    if (!activeSession || !moviePath || activeSession.detectedMovieFps !== null) return

    const detectionKey = `${activeSession.id}|${moviePath}`
    if (movieFrameRateDetectionKeyRef.current === detectionKey) return

    movieFrameRateDetectionKeyRef.current = detectionKey
    let cancelled = false
    void (async () => {
      let detectedMovieFps: number | null = null
      try {
        detectedMovieFps = await window.watchAlong.detectMovieFrameRate(activeSession.id)
      } catch {
        detectedMovieFps = null
      }
      if (cancelled) return

      const currentSession = sessionRef.current
      if (currentSession.id !== activeSession.id || currentSession.moviePath !== moviePath) return

      const movieRateCorrection = calculateMovieRateCorrection(detectedMovieFps, currentSession.reactorSource)
      if (movieRateCorrection === null) {
        await persist({ detectedMovieFps: null })
        return
      }
      await applyMovieRateCorrection(movieRateCorrection, { detectedMovieFps })
    })()

    return () => {
      cancelled = true
    }
  }, [activeSession?.detectedMovieFps, activeSession?.id, activeSession?.moviePath])

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
  }

  const handleTimeUpdate = (role: MediaRole): void => {
    const element = role === 'reaction' ? reactionVideoRef.current : movieVideoRef.current
    const currentTime = element?.currentTime ?? 0
    if (role === 'movie') setMoviePosition(currentTime)
    if (!setupMode) return
    setSetupPositions((current) => ({ ...current, [role]: currentTime }))
    if (role === 'reaction') setPosition(currentTime)
  }

  const handleVideoError = (role: MediaRole): void => {
    setError(`The ${role} video could not be played by Electron's HTML5 video engine. Use an MP4/WebM file with browser-supported codecs.`)
    setSyncState('error')
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
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()
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

function roundSeconds(value: number): number {
  return Number(value.toFixed(6))
}
