import { useCallback, useEffect, useMemo, useRef } from 'react'
import { getActiveSession } from '@shared/session'
import type { MediaRole } from '@shared/types'
import { WatchAlongView, type WatchAlongViewActions } from '../components/WatchAlongView'
import { signedSeconds } from '../components/appFormat'
import { TimelineMapping } from '../sync/timeline'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'
import type { SubtitlesHook } from './useSubtitles'
import type { DownloadsHook } from './useDownloads'
import { useAutoSync } from './useAutoSync'
import { calculateMovieRateCorrection, reactorSourceOptions } from './playerTiming'
import { usePlayerControls } from './usePlayerControls'
import { useMovieWindow } from './useMovieWindow'
import { useMovieAudioTracks } from './useMovieAudioTracks'
import { useSessionActions } from './useSessionActions'
import { useSessionTransition } from './useSessionTransition'
import { useAppSubscriptions } from './useAppSubscriptions'
import { useCabinetTheme } from './useCabinetTheme'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { useAppBootstrap } from './useAppBootstrap'
import { useSessionMediaRuntime } from './useSessionMediaRuntime'
import { usePlayerSurfaceLifecycle } from './usePlayerSurfaceLifecycle'

export function useWatchAlongController({
  playback,
  sessionState,
  subtitles,
  downloads
}: {
  playback: PlaybackHook
  sessionState: SessionHook
  subtitles: SubtitlesHook
  downloads: DownloadsHook
}): JSX.Element {
  const {
    setupModeRef, canPlayRef, isPlayingRef, mediaUrls, metadataReady, setMetadataReady,
    durations, setDurations, position, setMoviePosition, setupMode,
    setSetupPositions, syncState,
    setMovieAudioTrackSnapshot
  } = playback
  const {
    emptySession, library, preferences, appView, commandPanelOpen, setPatreonStatus
  } = sessionState
  const { setDownloadIndicator, setDownloadEvents } = downloads
  const autoSync = useAutoSync()
  const wizardSwapMovieMomentRef = useRef<number | null>(null)
  useCabinetTheme(preferences.cabinetTheme)

  const activeSession = useMemo(() => getActiveSession(library), [library])
  const session = activeSession ?? emptySession
  const detectedMovieRateCorrection = calculateMovieRateCorrection(session.detectedMovieFps, session.reactorSource)
  const reactorSourceSummary = reactorSourceOptions.find((option) => option.source === session.reactorSource)?.summary ?? '23.976 fps'

  const {
    commitLibrary,
    currentMovieMoment,
    persist,
    flushCurrentSessionPosition,
    getMovieAdapter,
    buildController,
    destroyRemoteMovieAdapter,
    refreshMediaUrls
  } = useSessionMediaRuntime({ playback, sessionState, activeSession, session })

  const consumeDownloadJob = useCallback((jobId: string): void => {
    setDownloadEvents((current) => current.filter((item) => item.jobId !== jobId))
    setDownloadIndicator((current) => current?.jobId === jobId ? null : current)
  }, [])

  const {
    loadInitialState,
    revealLibraryRecoveryFile,
    startFreshLibraryAfterRecovery
  } = useAppBootstrap({
    playback,
    sessionState,
    commitLibrary,
    refreshMediaUrls
  })

  useEffect(() => {
    let mounted = true
    void window.watchAlong.getSavedPatreonSessionStatus().then((status) => {
      if (mounted) {
        setPatreonStatus(status)
      }
    })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    return window.watchAlong.onMovieMediaEvent((event) => {
      const state = event.state
      if (event.audioTrackSnapshot) setMovieAudioTrackSnapshot(event.audioTrackSnapshot)
      if (event.type === 'loadedmetadata' || event.type === 'durationchange') {
        setDurations((current) => ({ ...current, movie: state.duration }))
        setMetadataReady((current) => ({ ...current, movie: true }))
      }

      if (event.type === 'timeupdate' || event.type === 'seeked' || event.type === 'loadedmetadata') {
        setMoviePosition(state.currentTime)
        if (setupModeRef.current) {
          setSetupPositions((current) => ({ ...current, movie: state.currentTime }))
        }
      }

      if (event.type === 'error') {
        handleVideoError('movie', state)
      } else if (
        event.type === 'play' || event.type === 'loadeddata' || event.type === 'canplay' ||
        event.type === 'canplaythrough' || event.type === 'timeupdate'
      ) {
        handleVideoRecovery('movie', state)
      }
    })
  }, [])

  useKeyboardShortcuts(() => ({
    autoSyncRollInSessionId,
    autoSyncRunningSessionId: autoSync.runningSessionId,
    appView,
    commandPanelOpen,
    setupModeRef,
    toggleCommandPanel,
    closeCommandPanel,
    movePanelFocus,
    toggleFullscreen,
    toggleReactionMute,
    toggleMovieMute,
    togglePipVisibility,
    togglePlayPause,
    seekBy,
    nudgeOffset
  }))

  const hasMedia = appView === 'player' && Boolean(activeSession && mediaUrls.reaction && mediaUrls.movie)
  const movieReady = Boolean(activeSession?.moviePath)
  const reactionReady = Boolean(activeSession?.reactionPath)
  const missingMediaRoles = useMemo<MediaRole[]>(() => {
    if (appView !== 'player' || !activeSession) {
      return []
    }

    return (['movie', 'reaction'] as MediaRole[]).filter((role) => {
      const path = role === 'movie' ? activeSession.moviePath : activeSession.reactionPath
      return Boolean(path && !mediaUrls[role])
    })
  }, [activeSession, appView, mediaUrls])
  const hasMissingMedia = missingMediaRoles.length > 0
  const showSmartInput = !hasMissingMedia && !hasMedia && movieReady && !reactionReady
  const autoSyncBusy = Boolean(autoSync.runningSessionId)
  const canPlay = hasMedia && metadataReady.reaction && metadataReady.movie && !autoSyncBusy
  const isPlaying = syncState === 'playing'
  canPlayRef.current = canPlay
  isPlayingRef.current = isPlaying
  const reactionDuration = Number.isFinite(durations.reaction) ? durations.reaction : 0
  const displayOffset = useMemo(() => signedSeconds(session.offsetSeconds), [session.offsetSeconds])
  const effectiveOffset = useMemo(
    () => new TimelineMapping({
      offsetSeconds: session.offsetSeconds,
      movieRateCorrection: session.movieRateCorrection
    }).effectiveOffsetAt(position),
    [position, session.movieRateCorrection, session.offsetSeconds]
  )
  const movieStartsAtReaction = Math.max(0, -session.offsetSeconds / session.movieRateCorrection)
  const shouldAutoHideControls = appView === 'player' && isPlaying && !setupMode && !commandPanelOpen

  const { activeSubtitleText, toggleFullscreen } = usePlayerSurfaceLifecycle({
    playback,
    sessionState,
    subtitles,
    activeSession,
    shouldAutoHideControls
  })

  const { selectMovieAudioTrack } = useMovieAudioTracks({
    playback,
    sessionState,
    activeSession,
    persist
  })

  const {
    closeDetachedMovieForTransition,
    popOutMovie,
    popInMovie
  } = useMovieWindow({
    playback, sessionState, activeSession, session, activeSubtitleText,
    canPlay, hasMissingMedia, getMovieAdapter, buildController, destroyRemoteMovieAdapter,
    persist, commitLibrary
  })

  const { transitionToSession } = useSessionTransition({
    playback,
    sessionState,
    flushCurrentSessionPosition,
    refreshMediaUrls,
    getMovieAdapter,
    commitLibrary,
    closeDetachedMovieForTransition
  })


  const {
    autoSyncRollInSessionId, autoSyncRollInFinalizing, openImportWizard, navigateToLibrary,
    openStartupLibrary, startWelcomeImport, locateMissingMedia, updatePreference,
    chooseDownloadDirectory, forgetPatreonSession, useManualSyncDuringRollIn,
    attachDownloadedReaction, closeCommandPanel, toggleCommandPanel, movePanelFocus,
    openLocalReaction, handleDownloadedReaction, switchSession, chooseMoviePoster, clearMoviePoster,
    requestRenameSession,
    cancelRenameSession, confirmRenameSession, confirmReactorAssignment, requestDeleteSession, cancelDeleteSession,
    confirmDeleteSession, openSubtitle, clearSubtitle
  } = useSessionActions({
    playback, sessionState, subtitles, downloads, autoSync, activeSession, wizardSwapMovieMomentRef,
    currentMovieMoment, flushCurrentSessionPosition, refreshMediaUrls, commitLibrary,
    consumeDownloadJob, closeDetachedMovieForTransition, transitionToSession
  })


  const {
    togglePlayPause, seekBy, seekTo, setReactionVolume, setMovieVolume, toggleReactionMute,
    toggleMovieMute, setPlaybackRate, setMovieRateCorrection, setReactorSource, detectSyncAgain,
    togglePipVisibility, nudgeOffset, handleMetadata, handleTimeUpdate, handleVideoError,
    handleVideoRecovery,
    updateOverlay, commitOverlay, enterSyncSetup,
    cancelSyncSetup, saveSyncSetup, setIndependentSetupTime, nudgeSetupTime,
    toggleSetupPreview
  } = usePlayerControls({
    playback, sessionState, activeSession, session, autoSync, autoSyncBusy, canPlay,
    reactionDuration, getMovieAdapter, persist, commitLibrary
  })

  useAppSubscriptions({
    playback, sessionState, downloads, canPlay, wizardSwapMovieMomentRef,
    flushCurrentSessionPosition, enterSyncSetup, transitionToSession
  })

  const actions: WatchAlongViewActions = {
    loadInitialState, revealLibraryRecoveryFile, startFreshLibraryAfterRecovery,
    openStartupLibrary, openImportWizard, switchSession, chooseMoviePoster, clearMoviePoster,
    requestRenameSession,
    requestDeleteSession, openLocalReaction, handleDownloadedReaction, navigateToLibrary,
    locateMissingMedia, updateOverlay, commitOverlay, persist, popOutMovie, popInMovie, togglePipVisibility,
    handleMetadata, handleTimeUpdate, handleVideoError, cancelSyncSetup, saveSyncSetup,
    toggleSetupPreview, setIndependentSetupTime, nudgeSetupTime, togglePlayPause, seekBy, seekTo,
    enterSyncSetup, openSubtitle, toggleFullscreen, toggleCommandPanel,
    setReactionVolume, setMovieVolume, toggleReactionMute, toggleMovieMute, setPlaybackRate,
    selectMovieAudioTrack,
    detectSyncAgain, nudgeOffset, setReactorSource, setMovieRateCorrection, clearSubtitle, closeCommandPanel,
    attachDownloadedReaction, updatePreference, chooseDownloadDirectory, forgetPatreonSession,
    cancelRenameSession, confirmRenameSession, confirmReactorAssignment, cancelDeleteSession, confirmDeleteSession,
    useManualSyncDuringRollIn, startWelcomeImport
  }

  return (
    <WatchAlongView
      playback={playback}
      sessionState={sessionState}
      downloads={downloads}
      autoSync={autoSync}
      activeSession={activeSession}
      session={session}
      activeSubtitleText={activeSubtitleText}
      missingMediaRoles={missingMediaRoles}
      hasMedia={hasMedia}
      movieReady={movieReady}
      showSmartInput={showSmartInput}
      hasMissingMedia={hasMissingMedia}
      canPlay={canPlay}
      isPlaying={isPlaying}
      reactionDuration={reactionDuration}
      autoSyncBusy={autoSyncBusy}
      displayOffset={displayOffset}
      effectiveOffset={effectiveOffset}
      movieStartsAtReaction={movieStartsAtReaction}
      reactorSourceSummary={reactorSourceSummary}
      detectedMovieRateCorrection={detectedMovieRateCorrection}
      autoSyncRollInSessionId={autoSyncRollInSessionId}
      autoSyncRollInFinalizing={autoSyncRollInFinalizing}
      actions={actions}
    />
  )
}
