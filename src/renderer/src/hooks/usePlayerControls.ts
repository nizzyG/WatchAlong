import type {
  LibrarySession,
  OverlayGeometry,
  ReactorSource,
  SessionLibrary
} from '@shared/types'
import { TimelineMapping } from '../sync/timeline'
import type { VideoAdapter } from '../sync/SyncController'
import { isAutoSyncReady } from '../autoSyncReadiness'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'
import type { useAutoSync } from './useAutoSync'
import { calculateMovieRateCorrection, roundSeconds } from './playerTiming'
import { useMediaLifecycleMonitor } from './useMediaLifecycleMonitor'
import { useMovieFrameRateDetection } from './useMovieFrameRateDetection'
import { useSyncSetup } from './useSyncSetup'
import { useTransport } from './useTransport'

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
    controllerRef,
    position,
    setPendingSyncSetup
  } = playback
  const { sessionRef, activeSessionIdRef, setLibrary } = sessionState

  const {
    handleMetadata,
    handleTimeUpdate,
    handleVideoError,
    handleVideoRecovery
  } = useMediaLifecycleMonitor({ playback, activeSession, persist })
  const {
    togglePlayPause,
    seekBy,
    seekTo,
    setReactionVolume,
    setMovieVolume,
    toggleReactionMute,
    toggleMovieMute,
    setPlaybackRate,
    getCurrentReactionTime
  } = useTransport({
    playback,
    activeSession,
    session,
    autoSyncBusy,
    canPlay,
    reactionDuration,
    persist
  })

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

  useMovieFrameRateDetection({
    playback,
    sessionState,
    activeSession,
    autoSyncBusy,
    persist,
    applyMovieRateCorrection
  })

  const {
    enterSyncSetup,
    cancelSyncSetup,
    saveSyncSetup,
    setIndependentSetupTime,
    nudgeSetupTime,
    toggleSetupPreview
  } = useSyncSetup({ playback, session, canPlay, getMovieAdapter, persist })

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

  const togglePipVisibility = (): void => {
    if (activeSession) void persist({ isPipHidden: !session.isPipHidden })
  }

  const nudgeOffset = async (deltaSeconds: number): Promise<void> => {
    if (!activeSession || autoSyncBusy) return
    const nextOffset = Number((sessionRef.current.offsetSeconds + deltaSeconds).toFixed(3))
    const nextSession = await persist({ offsetSeconds: nextOffset })
    if (nextSession && canPlay) controllerRef.current?.seekReaction(position)
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
    enterSyncSetup,
    cancelSyncSetup,
    saveSyncSetup,
    setIndependentSetupTime,
    nudgeSetupTime,
    toggleSetupPreview
  }
}
