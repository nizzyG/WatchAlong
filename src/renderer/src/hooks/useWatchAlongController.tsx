import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createDefaultLibrary, getActiveSession } from '@shared/session'
import type {
  AudioTrackPreference,
  AppPreferences,
  LibrarySession,
  MediaRole,
  SessionLibrary
} from '@shared/types'
import { WatchAlongView, type WatchAlongViewActions } from '../components/WatchAlongView'
import { signedSeconds } from '../components/appFormat'
import { SyncController, createHtmlVideoAdapter, type VideoAdapter } from '../sync/SyncController'
import { TimelineMapping } from '../sync/timeline'
import { getActiveSubtitleCue, hasSubtitleContentBeyondHeader, parseSubtitleText } from '../subtitles'
import {
  hasPlaybackShortcutModifier,
  isCommandPanelShortcut,
  isFullscreenShortcut,
  isInteractiveShortcutTarget,
  isRepeatedToggleShortcut
} from '../keyboardShortcuts'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'
import type { SubtitlesHook } from './useSubtitles'
import type { DownloadsHook } from './useDownloads'
import { useAutoSync } from './useAutoSync'
import { calculateMovieRateCorrection, reactorSourceOptions, roundSeconds } from './playerTiming'
import { usePlayerControls } from './usePlayerControls'
import { useMovieWindow } from './useMovieWindow'
import { useMovieAudioTracks } from './useMovieAudioTracks'
import { useSessionActions } from './useSessionActions'
import { useSessionTransition } from './useSessionTransition'
import { useAppSubscriptions } from './useAppSubscriptions'
import { useCabinetTheme } from './useCabinetTheme'

type MediaUrls = Record<MediaRole, string | null>
type MetadataReady = Record<MediaRole, boolean>
type Durations = Record<MediaRole, number>
const emptyUrls: MediaUrls = { reaction: null, movie: null }
const emptyMetadata: MetadataReady = { reaction: false, movie: false }
const emptyDurations: Durations = { reaction: Number.NaN, movie: Number.NaN }
const defaultPreferences: AppPreferences = {
  hasCompletedOnboarding: false,
  openLibraryOnLaunch: true,
  libraryView: 'grid',
  reactionDownloadDirectory: null,
  cabinetTheme: 'system'
}
const CONTROL_IDLE_DELAY_MS = 2400
const UNSUPPORTED_SUBTITLE_FORMAT_ERROR = "This subtitle format isn't supported. Use SRT or VTT."

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
    reactionVideoRef, movieVideoRef, controllerRef, remoteMovieAdapterRef, setupModeRef,
    lastPositionSaveRef, positionRef, restoredPopOutSessionRef, pendingMovieWindowGeometryRef,
    movieWindowGeometryTimerRef, closingMovieWindowRef, canPlayRef, isPlayingRef,
    movieFrameRateDetectionKeyRef, mediaUrls, setMediaUrls, metadataReady, setMetadataReady,
    durations, setDurations, position, setPosition, moviePosition, setMoviePosition, setupMode,
    setSetupMode, setupPositions, setSetupPositions, setupPlayingRole, setSetupPlayingRole,
    controlsIdle, setControlsIdle, syncState, setSyncState, error, setError, restoreToken,
    setRestoreToken, pendingSyncSetup, setPendingSyncSetup, viewTransitioning,
    setViewTransitioning, movieWindowActive, setMovieWindowActive,
    setMovieAudioTrackSnapshot
  } = playback
  const {
    appShellRef, sessionRef, activeSessionIdRef, commandPanelButtonRef, commandPanelReturnFocusRef,
    resumeAfterRepairRef, emptySession, library, setLibrary, preferences, setPreferences, appView,
    setAppView, startupError, setStartupError, startupRecoveryAvailable, setStartupRecoveryAvailable,
    showWelcome, setShowWelcome, wizardDimmed,
    setWizardDimmed, commandPanelOpen, setCommandPanelOpen, expandedPanelSection,
    setExpandedPanelSection, patreonStatus, setPatreonStatus, renameTargetId, setRenameTargetId,
    renameDraft, setRenameDraft, deleteTarget, setDeleteTarget
  } = sessionState
  const { subtitleCues, setSubtitleCues } = subtitles
  const { setDownloadIndicator, setDownloadEvents } = downloads
  const autoSync = useAutoSync()
  const wizardSwapMovieMomentRef = useRef<number | null>(null)
  useCabinetTheme(preferences.cabinetTheme)

  const activeSession = useMemo(() => getActiveSession(library), [library])
  const session = activeSession ?? emptySession
  const activeSubtitle = useMemo(() => getActiveSubtitleCue(subtitleCues, moviePosition), [moviePosition, subtitleCues])
  const detectedMovieRateCorrection = calculateMovieRateCorrection(session.detectedMovieFps, session.reactorSource)
  const reactorSourceSummary = reactorSourceOptions.find((option) => option.source === session.reactorSource)?.summary ?? '23.976 fps'

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

  const consumeDownloadJob = useCallback((jobId: string): void => {
    setDownloadEvents((current) => current.filter((item) => item.jobId !== jobId))
    setDownloadIndicator((current) => current?.jobId === jobId ? null : current)
  }, [])

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

    const savedSession = next.sessions.find((session) => session.id === sessionId)
    if (!savedSession) {
      return
    }

    setLibrary((current) => ({
      ...current,
      sessions: current.sessions.map((session) => (session.id === sessionId ? savedSession : session))
    }))
  }, [commitLibrary])

  const saveSessionPosition = useCallback(async (sessionId: string, reactionTime: number): Promise<void> => {
    const next = await window.watchAlong.saveSessionPosition(sessionId, roundSeconds(Math.max(0, reactionTime)))
    mergeSavedSessionPosition(next, sessionId)
  }, [mergeSavedSessionPosition])

  const flushCurrentSessionPosition = useCallback(async (): Promise<void> => {
    if (appView !== 'player') {
      return
    }

    const sessionId = activeSessionIdRef.current
    if (!sessionId) {
      return
    }

    const reaction = reactionVideoRef.current
    const currentRestoreToken = `${sessionId}|${mediaUrls.reaction ?? ''}|${mediaUrls.movie ?? ''}`
    const mediaRestored = restoreToken === currentRestoreToken
    const nextReactionTime = mediaRestored
      ? reaction && reaction.readyState > 0 && Number.isFinite(reaction.currentTime)
        ? reaction.currentTime
        : positionRef.current
      : sessionRef.current.id === sessionId
        ? sessionRef.current.lastReactionTimeSeconds
        : positionRef.current
    await saveSessionPosition(sessionId, nextReactionTime)
  }, [appView, mediaUrls.movie, mediaUrls.reaction, restoreToken, saveSessionPosition])

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

  const loadInitialState = useCallback(async (): Promise<void> => {
    setStartupError(null)
    setStartupRecoveryAvailable(false)
    setAppView('loading')
    setError(null)

    const [libraryResult, preferencesResult] = await Promise.allSettled([
      window.watchAlong.getLibrary(),
      window.watchAlong.getPreferences()
    ])

    const loadedLibrary = libraryResult.status === 'fulfilled' ? libraryResult.value : createDefaultLibrary()
    const loadedPreferences = preferencesResult.status === 'fulfilled' ? preferencesResult.value : defaultPreferences
    const loadedSession = commitLibrary(loadedLibrary)
    setPreferences(loadedPreferences)
    setShowWelcome(!loadedPreferences.hasCompletedOnboarding)
    setPosition(loadedSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)

    if (libraryResult.status === 'rejected' || preferencesResult.status === 'rejected') {
      const damagedLibrary = libraryResult.status === 'rejected' &&
        libraryResult.reason instanceof Error &&
        (libraryResult.reason.message.includes('damaged library') ||
          libraryResult.reason.message.includes('recovery file'))
      const libraryMessage = damagedLibrary
        ? 'WatchAlong moved a damaged library to a recovery file so it cannot be overwritten.'
        : 'WatchAlong could not safely open your library. No files were changed.'
      if (damagedLibrary) {
        const recovery = await window.watchAlong.getLibraryRecoveryStatus().catch(() => ({ available: false }))
        setStartupRecoveryAvailable(recovery.available)
      }
      setStartupError(libraryMessage)
      setAppView('startup-error')
      await refreshMediaUrls(null)
      return
    }

    const shouldOpenPlayer = !loadedPreferences.openLibraryOnLaunch && Boolean(loadedSession)
    setAppView(shouldOpenPlayer ? 'player' : 'library')
    await refreshMediaUrls(shouldOpenPlayer ? loadedSession?.id ?? null : null)
  }, [commitLibrary, refreshMediaUrls])

  const revealLibraryRecoveryFile = useCallback(async (): Promise<void> => {
    try {
      const revealed = await window.watchAlong.revealLibraryRecoveryFile()
      if (!revealed) setStartupError('WatchAlong could not find the recovery file. Try Retry once more.')
    } catch {
      setStartupError('WatchAlong could not open the recovery folder. The recovery file is still safe.')
    }
  }, [])

  const startFreshLibraryAfterRecovery = useCallback(async (): Promise<void> => {
    try {
      await window.watchAlong.startFreshLibraryAfterRecovery()
      await loadInitialState()
    } catch {
      setStartupError('WatchAlong could not start a new library. The recovery file is still safe.')
    }
  }, [loadInitialState])

  useEffect(() => {
    let mounted = true

    void (async () => {
      if (!mounted) {
        return
      }
      await loadInitialState()
    })()

    return () => {
      mounted = false
    }
  }, [loadInitialState])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

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
    setupModeRef.current = setupMode
    controllerRef.current?.setSetupMode(setupMode)
  }, [setupMode])

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
    let mounted = true

    void (async () => {
      if (!activeSession?.subtitlePath) {
        setSubtitleCues([])
        return
      }

      const text = await window.watchAlong.getSubtitleText(activeSession.id)
      if (mounted) {
        const cues = text ? parseSubtitleText(text) : []
        setSubtitleCues(cues)
        if (text && cues.length === 0 && hasSubtitleContentBeyondHeader(text)) {
          setError(UNSUPPORTED_SUBTITLE_FORMAT_ERROR)
        }
      }
    })()

    return () => {
      mounted = false
    }
  }, [activeSession?.id, activeSession?.subtitlePath])

  useEffect(() => {
    if (!movieWindowActive) {
      return
    }

    void window.watchAlong.sendMovieMediaCommand({
      id: `subtitle-${Date.now()}`,
      type: 'setSubtitleText',
      value: activeSubtitle?.text ?? null
    })
  }, [activeSubtitle?.text, movieWindowActive])

  // Fullscreen belongs to the two primary application surfaces. Keep it while
  // moving between the library and player, but leave it for loading and
  // recovery screens, including when a delayed request settles after navigation.
  useEffect(() => {
    const exitFullscreenOutsidePrimaryView = (): void => {
      if (appView === 'library' || appView === 'player' || !document.fullscreenElement) return
      void document.exitFullscreen().catch(() => undefined)
    }

    exitFullscreenOutsidePrimaryView()
    document.addEventListener('fullscreenchange', exitFullscreenOutsidePrimaryView)
    return () => document.removeEventListener('fullscreenchange', exitFullscreenOutsidePrimaryView)
  }, [appView])




  // Effect intentionally omits a dependency array so the keydown handler always
  // captures the latest closure values (commandPanelOpen, appView, callbacks).
  // This means shortcuts like Space (play/pause) always reflect the current
  // syncState without delay. The tradeoff is listener re-registration on every
  // render, which is acceptable given addEventListener/removeEventListener churn
  // is cheap and the alternative (refs for every captured value) would add
  // significant complexity.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target instanceof HTMLElement ? event.target : null
      const targetOwnsValueKeys = Boolean(target?.closest([
        'input',
        'textarea',
        'select',
        '[contenteditable]:not([contenteditable="false"])',
        '[role="combobox"]',
        '[role="listbox"]',
        '[role="slider"]',
        '[role="spinbutton"]',
        '[role="textbox"]'
      ].join(', ')))

      if (autoSyncRollInSessionId || autoSync.runningSessionId) {
        if (target?.closest('.auto-sync-rollin-overlay')) {
          return
        }
        event.preventDefault()
        return
      }

      if (isCommandPanelShortcut(event) && (appView === 'library' || appView === 'player')) {
        event.preventDefault()
        if (event.repeat) return
        toggleCommandPanel(target)
        return
      }

      if (commandPanelOpen) {
        if (event.code === 'Escape') {
          event.preventDefault()
          closeCommandPanel()
          return
        }

        if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
          const panelContent = document.querySelector<HTMLElement>('.command-panel-content')
          if (panelContent && !targetOwnsValueKeys) {
            event.preventDefault()
            panelContent.scrollTop += event.code === 'ArrowDown' ? 64 : -64
          }
          return
        }

        if (event.code === 'Tab') {
          event.preventDefault()
          movePanelFocus(event.shiftKey ? -1 : 1)
          return
        }

        // Tab owns focus travel. Arrow keys scroll the panel unless the
        // focused control has its own arrow-key value or caret behavior.
        return
      }

      if (
        (appView === 'library' || appView === 'player')
        && !targetOwnsValueKeys
        && isFullscreenShortcut(event)
      ) {
        event.preventDefault()
        if (event.repeat) return
        toggleFullscreen()
        return
      }

      if (
        appView !== 'player'
        || isInteractiveShortcutTarget(event.target)
      ) {
        return
      }

      if (hasPlaybackShortcutModifier(event) || isRepeatedToggleShortcut(event)) return

      if (event.code === 'KeyR') {
        event.preventDefault()
        toggleReactionMute()
        return
      } else if (event.code === 'KeyM') {
        event.preventDefault()
        toggleMovieMute()
        return
      } else if (event.code === 'KeyP') {
        event.preventDefault()
        togglePipVisibility()
        return
      }

      // Sync Setup owns Space, seek, and timing-nudge keys because its two
      // timelines move independently. Window-level controls remain available.
      if (setupModeRef.current) return

      if (event.code === 'Space') {
        event.preventDefault()
        togglePlayPause()
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault()
        seekBy(-5)
      } else if (event.code === 'ArrowRight') {
        event.preventDefault()
        seekBy(5)
      } else if (event.code === 'BracketLeft') {
        event.preventDefault()
        void nudgeOffset(-0.1)
      } else if (event.code === 'BracketRight') {
        event.preventDefault()
        void nudgeOffset(0.1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useEffect(() => {
    if (!commandPanelOpen) {
      return
    }

    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-command-panel-close]')?.focus()
    })
  }, [commandPanelOpen])

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

  useEffect(() => {
    positionRef.current = position
  }, [position])

  useEffect(() => {
    let timer: number | undefined

    const clearIdleTimer = (): void => {
      if (timer !== undefined) {
        window.clearTimeout(timer)
        timer = undefined
      }
    }

    const markActive = (): void => {
      setControlsIdle(false)
      clearIdleTimer()
      if (shouldAutoHideControls) {
        timer = window.setTimeout(() => setControlsIdle(true), CONTROL_IDLE_DELAY_MS)
      }
    }

    markActive()
    if (!shouldAutoHideControls) {
      return clearIdleTimer
    }

    window.addEventListener('mousemove', markActive)
    window.addEventListener('mousedown', markActive)
    window.addEventListener('wheel', markActive, { passive: true })
    window.addEventListener('keydown', markActive)
    window.addEventListener('touchstart', markActive, { passive: true })

    return () => {
      clearIdleTimer()
      window.removeEventListener('mousemove', markActive)
      window.removeEventListener('mousedown', markActive)
      window.removeEventListener('wheel', markActive)
      window.removeEventListener('keydown', markActive)
      window.removeEventListener('touchstart', markActive)
    }
  }, [shouldAutoHideControls])


  const persist = async (patch: Partial<LibrarySession>): Promise<LibrarySession | null> => {
    const next = await window.watchAlong.saveActiveSession(patch)
    return commitLibrary(next)
  }

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
    playback, sessionState, activeSession, session, activeSubtitleText: activeSubtitle?.text ?? null,
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
    updateOverlay, commitOverlay, toggleFullscreen, toggleReactionFullscreen, enterSyncSetup,
    syncNow, cancelSyncSetup, saveSyncSetup, setIndependentSetupTime, nudgeSetupTime,
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
    syncNow, openSubtitle, toggleFullscreen, toggleReactionFullscreen, toggleCommandPanel,
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
      activeSubtitleText={activeSubtitle?.text ?? null}
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
