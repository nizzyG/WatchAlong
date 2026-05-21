import {
  AlertTriangle,
  Captions,
  Check,
  ChevronDown,
  Clapperboard,
  Clock3,
  Coffee,
  Download,
  ExternalLink,
  Eye,
  FileVideo,
  Film,
  Heart,
  LayoutGrid,
  Library as LibraryIcon,
  List,
  Loader2,
  Lock,
  Maximize,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Settings,
  SlidersHorizontal,
  Trash2,
  Volume2,
  VolumeX,
  Youtube,
  X
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createDefaultLibrary, createDefaultSession, getActiveSession } from '@shared/session'
import type {
  AppPreferences,
  DownloadProgressEvent,
  ImportWizardLaunchOptions,
  LibrarySession,
  LibraryViewPreference,
  MediaRole,
  MovieWindowGeometryEvent,
  OverlayGeometry,
  PlaybackRate,
  ReactionDownloadSource,
  ReactionSource,
  RemoteMediaState,
  SavedPatreonSessionStatus,
  SessionLibrary,
  SyncState,
  WizardLifecycleEvent
} from '@shared/types'
import { PipOverlay } from './components/PipOverlay'
import { constrainOverlay } from './components/pipGeometry'
import { PatreonStorageOffer, SmartReactionInput } from './components/SmartReactionInput'
import { SyncController, createHtmlVideoAdapter, type VideoAdapter } from './sync/SyncController'
import { RemoteVideoAdapter } from './sync/RemoteVideoAdapter'
import { TimelineMapping } from './sync/timeline'
import { getActiveSubtitleCue, parseSubtitleText, type SubtitleCue } from './subtitles'

type MediaUrls = Record<MediaRole, string | null>
type MetadataReady = Record<MediaRole, boolean>
type Durations = Record<MediaRole, number>
type AppView = 'loading' | 'startup-error' | 'library' | 'player'
type CommandPanelSection = 'now-playing' | 'library' | 'downloads' | 'preferences' | 'help'

const emptyUrls: MediaUrls = { reaction: null, movie: null }
const emptyMetadata: MetadataReady = { reaction: false, movie: false }
const emptyDurations: Durations = { reaction: Number.NaN, movie: Number.NaN }
const defaultPreferences: AppPreferences = {
  hasCompletedOnboarding: false,
  openLibraryOnLaunch: true,
  libraryView: 'grid',
  reactionDownloadDirectory: null
}
const playbackRates: PlaybackRate[] = [1, 1.25, 1.5, 2]
const movieSourceRates = [
  { label: 'Matched', rate: 1 },
  { label: 'Stream 24 -> Blu-ray 23.976', rate: 1.001 },
  { label: 'Reverse', rate: 0.999001 }
]
const CONTROL_IDLE_DELAY_MS = 2400
const VIEW_FADE_MS = 300
const MOVIE_WINDOW_TRANSITION_MS = 220
const MOVIE_WINDOW_GEOMETRY_SAVE_MS = 600
const MOVIE_WINDOW_COMMAND_TIMEOUT_ERROR = 'Movie window stopped responding.'
const MOVIE_WINDOW_UNRESPONSIVE_MESSAGE =
  'The movie window stopped responding. It has been moved back to the main window. You can pop it out again from the PiP toolbar.'
const APP_VERSION = '0.1.0'
const ONLINE_HELP_URL = 'https://github.com/nizzyG/WatchAlong#readme'
const DONATION_URL: string | null = null

export function App(): JSX.Element {
  const appShellRef = useRef<HTMLElement>(null)
  const reactionVideoRef = useRef<HTMLVideoElement>(null)
  const movieVideoRef = useRef<HTMLVideoElement>(null)
  const controllerRef = useRef<SyncController | null>(null)
  const remoteMovieAdapterRef = useRef<RemoteVideoAdapter | null>(null)
  const sessionRef = useRef<LibrarySession>(createDefaultSession())
  const setupModeRef = useRef(false)
  const lastPositionSaveRef = useRef(0)
  const restoredPopOutSessionRef = useRef<string | null>(null)
  const pendingMovieWindowGeometryRef = useRef<OverlayGeometry | null>(null)
  const movieWindowGeometryTimerRef = useRef<number | null>(null)
  const closingMovieWindowRef = useRef(false)
  const pausedForWizardRef = useRef(false)
  const downloadIndicatorTimerRef = useRef<number | null>(null)
  const commandPanelButtonRef = useRef<HTMLButtonElement>(null)
  const commandPanelReturnFocusRef = useRef<HTMLElement | null>(null)
  const resumeAfterRepairRef = useRef(false)
  const canPlayRef = useRef(false)
  const isPlayingRef = useRef(false)
  const persistRef = useRef<typeof persist>(null as unknown as typeof persist)

  const [emptySession] = useState(() => createDefaultSession())
  const [library, setLibrary] = useState<SessionLibrary>(() => createDefaultLibrary())
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences)
  const [appView, setAppView] = useState<AppView>('loading')
  const [mediaUrls, setMediaUrls] = useState<MediaUrls>(emptyUrls)
  const [metadataReady, setMetadataReady] = useState<MetadataReady>(emptyMetadata)
  const [durations, setDurations] = useState<Durations>(emptyDurations)
  const [position, setPosition] = useState(0)
  const [moviePosition, setMoviePosition] = useState(0)
  const [setupMode, setSetupMode] = useState(false)
  const [setupPositions, setSetupPositions] = useState<Record<MediaRole, number>>({ reaction: 0, movie: 0 })
  const [setupPlayingRole, setSetupPlayingRole] = useState<MediaRole | null>(null)
  const [controlsIdle, setControlsIdle] = useState(false)
  const [syncState, setSyncState] = useState<SyncState>('empty')
  const [error, setError] = useState<string | null>(null)
  const [startupError, setStartupError] = useState<string | null>(null)
  const [showWelcome, setShowWelcome] = useState(false)
  const [restoreToken, setRestoreToken] = useState<string | null>(null)
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([])
  const [patreonStorageJobId, setPatreonStorageJobId] = useState<string | null>(null)
  const [pendingSyncSetup, setPendingSyncSetup] = useState(false)
  const [wizardDimmed, setWizardDimmed] = useState(false)
  const [downloadIndicator, setDownloadIndicator] = useState<DownloadProgressEvent | null>(null)
  const [downloadEvents, setDownloadEvents] = useState<DownloadProgressEvent[]>([])
  const [commandPanelOpen, setCommandPanelOpen] = useState(false)
  const [expandedPanelSection, setExpandedPanelSection] = useState<CommandPanelSection>('now-playing')
  const [patreonStatus, setPatreonStatus] = useState<SavedPatreonSessionStatus>({ available: false, canEncrypt: false })
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ sessionId: string; returnToLibrary: boolean } | null>(null)
  const [viewTransitioning, setViewTransitioning] = useState(false)
  const [movieWindowActive, setMovieWindowActive] = useState(false)

  const activeSession = useMemo(() => getActiveSession(library), [library])
  const session = activeSession ?? emptySession
  const activeSubtitle = useMemo(() => getActiveSubtitleCue(subtitleCues, moviePosition), [moviePosition, subtitleCues])

  const commitLibrary = useCallback((next: SessionLibrary): LibrarySession | null => {
    const nextSession = getActiveSession(next)
    if (nextSession) {
      sessionRef.current = nextSession
    } else {
      sessionRef.current = emptySession
    }
    setLibrary(next)
    return nextSession
  }, [emptySession])

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
      getMovieRateCorrection: () => sessionRef.current.movieRateCorrection,
      setOffset: async (offsetSeconds) => {
        const next = await window.watchAlong.saveActiveSession({ offsetSeconds })
        commitLibrary(next)
      },
      onState: setSyncState,
      onPosition: (reactionTime) => {
        if (!Number.isFinite(reactionTime)) {
          return
        }

        setPosition(reactionTime)
        if (setupModeRef.current) {
          setSetupPositions((current) => ({ ...current, reaction: reactionTime }))
          return
        }

        const currentSession = sessionRef.current
        const now = Date.now()
        if (now - lastPositionSaveRef.current > 1500 && currentSession.reactionPath && currentSession.moviePath) {
          lastPositionSaveRef.current = now
          void window.watchAlong
            .saveActiveSession({ lastReactionTimeSeconds: reactionTime })
            .then(commitLibrary)
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
  }, [commitLibrary])

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
      setStartupError('Something went wrong while loading your library.')
      setAppView('startup-error')
      await refreshMediaUrls(null)
      return
    }

    const shouldOpenPlayer = !loadedPreferences.openLibraryOnLaunch && Boolean(loadedSession)
    setAppView(shouldOpenPlayer ? 'player' : 'library')
    await refreshMediaUrls(shouldOpenPlayer ? loadedSession?.id ?? null : null)
  }, [commitLibrary, refreshMediaUrls])

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
        handleVideoError('movie')
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
    const token = `${session.id}|${mediaUrls.reaction ?? ''}|${mediaUrls.movie ?? ''}`
    if (
      !activeSession ||
      !mediaUrls.reaction ||
      !mediaUrls.movie ||
      !metadataReady.reaction ||
      !metadataReady.movie ||
      restoreToken === token
    ) {
      return
    }

    controllerRef.current?.setAudio(audioState(session))
    controllerRef.current?.setPlaybackRate(session.playbackRate)
    controllerRef.current?.loadSession(session.lastReactionTimeSeconds)
    setPosition(session.lastReactionTimeSeconds)
    setMoviePosition(getMovieAdapter()?.currentTime ?? 0)
    setRestoreToken(token)
  }, [activeSession, getMovieAdapter, mediaUrls, metadataReady, restoreToken, session])

  useEffect(() => {
    let mounted = true

    void (async () => {
      if (!activeSession?.subtitlePath) {
        setSubtitleCues([])
        return
      }

      const text = await window.watchAlong.getSubtitleText(activeSession.id)
      if (mounted) {
        setSubtitleCues(text ? parseSubtitleText(text) : [])
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



  useEffect(() => {
    const onResize = (): void => {
      const current = sessionRef.current
      const nextOverlay = constrainOverlay(current.overlay)
      if (
        nextOverlay.x !== current.overlay.x ||
        nextOverlay.y !== current.overlay.y ||
        nextOverlay.width !== current.overlay.width ||
        nextOverlay.height !== current.overlay.height
      ) {
        void persistRef.current({ overlay: nextOverlay })
      }
    }

    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])

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

      if (event.code === 'KeyP' && event.ctrlKey && event.shiftKey && appView === 'player' && !setupModeRef.current) {
        event.preventDefault()
        toggleCommandPanel(target)
        return
      }

      if (commandPanelOpen) {
        if (event.code === 'Escape') {
          event.preventDefault()
          closeCommandPanel()
          return
        }

        if (event.code === 'ArrowDown') {
          event.preventDefault()
          movePanelFocus(1)
          return
        }

        if (event.code === 'ArrowUp') {
          event.preventDefault()
          movePanelFocus(-1)
          return
        }

        return
      }

      if (target?.closest('input, textarea, select, button') || appView !== 'player') {
        return
      }

      if (setupModeRef.current) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        togglePlayPause()
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault()
        seekBy(-5)
      } else if (event.code === 'ArrowRight') {
        event.preventDefault()
        seekBy(5)
      } else if (event.code === 'KeyR') {
        event.preventDefault()
        toggleReactionMute()
      } else if (event.code === 'KeyM') {
        event.preventDefault()
        toggleMovieMute()
      } else if (event.code === 'KeyP') {
        event.preventDefault()
        togglePipVisibility()
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
  const canPlay = hasMedia && metadataReady.reaction && metadataReady.movie
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

  useEffect(() => {
    const handleWizardLifecycle = async (event: WizardLifecycleEvent): Promise<void> => {
      if (event.type === 'opened') {
        setWizardDimmed(true)
        pausedForWizardRef.current = canPlayRef.current && isPlayingRef.current
        if (pausedForWizardRef.current) {
          controllerRef.current?.pause()
        }
        return
      }

      setWizardDimmed(false)
      if (event.outcome === 'cancelled') {
        const shouldResume = pausedForWizardRef.current
        pausedForWizardRef.current = false
        if (shouldResume && canPlayRef.current) {
          controllerRef.current?.play()
        }
        return
      }

      pausedForWizardRef.current = false
      if (movieWindowActive) {
        await closeMovieWindowForModeChange()
        destroyRemoteMovieAdapter()
        restoredPopOutSessionRef.current = sessionRef.current.id
        setMovieWindowActive(false)
      }
      const [nextLibrary, nextPreferences] = await Promise.all([
        window.watchAlong.getLibrary(),
        window.watchAlong.getPreferences()
      ])
      let nextSession = commitLibrary(nextLibrary)
      if (nextSession?.isMoviePoppedOut) {
        nextSession = commitLibrary(await window.watchAlong.saveActiveSession({ isMoviePoppedOut: false }))
      }
      setPreferences(nextPreferences)
      setShowWelcome(false)
      setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
      setMoviePosition(0)
      setPendingSyncSetup(Boolean(nextSession?.reactionPath && nextSession.moviePath))
      setAppView(nextSession ? 'player' : 'library')
      setCommandPanelOpen(false)
      await refreshMediaUrls(nextSession?.id ?? null)
    }

    return window.watchAlong.onWizardLifecycle((event) => {
      void handleWizardLifecycle(event)
    })
  }, [commitLibrary, movieWindowActive, refreshMediaUrls])

  useEffect(() => {
    return window.watchAlong.onDownloadProgress((event) => {
      if (downloadIndicatorTimerRef.current !== null) {
        window.clearTimeout(downloadIndicatorTimerRef.current)
        downloadIndicatorTimerRef.current = null
      }

      if (event.state === 'cancelled') {
        setDownloadIndicator(null)
        setDownloadEvents((current) => current.filter((item) => item.jobId !== event.jobId))
        return
      }

      setDownloadIndicator(event)
      setDownloadEvents((current) => {
        const next = [event, ...current.filter((item) => item.jobId !== event.jobId)]
        return next.slice(0, 8)
      })
      if (event.state === 'success' || event.state === 'failed') {
        downloadIndicatorTimerRef.current = window.setTimeout(() => {
          setDownloadIndicator(null)
          downloadIndicatorTimerRef.current = null
        }, 5000)
      }
    })
  }, [])

  useEffect(() => {
    return () => {
      if (downloadIndicatorTimerRef.current !== null) {
        window.clearTimeout(downloadIndicatorTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (pendingSyncSetup && canPlay) {
      setPendingSyncSetup(false)
      enterSyncSetup()
    }
  }, [canPlay, pendingSyncSetup])

  useEffect(() => {
    if (!canPlay || !resumeAfterRepairRef.current) {
      return
    }

    resumeAfterRepairRef.current = false
    controllerRef.current?.play()
  }, [canPlay])

  const persist = async (patch: Partial<LibrarySession>): Promise<LibrarySession | null> => {
    const next = await window.watchAlong.saveActiveSession(patch)
    return commitLibrary(next)
  }
  persistRef.current = persist

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
    closingMovieWindowRef.current = true
    try {
      await window.watchAlong.closeMovieWindow({ notifyMainWindow: false })
    } finally {
      closingMovieWindowRef.current = false
    }
  }

  const stopDetachedMovie = async (): Promise<void> => {
    if (!movieWindowActive) {
      return
    }

    await closeMovieWindowForModeChange()
    destroyRemoteMovieAdapter()
    restoredPopOutSessionRef.current = sessionRef.current.id
    setMovieWindowActive(false)
    await persist({ isMoviePoppedOut: false })
  }

  const scheduleMovieWindowGeometryPersist = (geometry: OverlayGeometry): void => {
    pendingMovieWindowGeometryRef.current = geometry
    if (movieWindowGeometryTimerRef.current !== null) {
      return
    }

    movieWindowGeometryTimerRef.current = window.setTimeout(() => {
      movieWindowGeometryTimerRef.current = null
      const pending = pendingMovieWindowGeometryRef.current
      pendingMovieWindowGeometryRef.current = null
      const current = sessionRef.current
      if (pending && current.id && current.isMoviePoppedOut) {
        void window.watchAlong.saveActiveSession({ movieWindowGeometry: pending }).then(commitLibrary)
      }
    }, MOVIE_WINDOW_GEOMETRY_SAVE_MS)
  }

  const handleMovieWindowGeometry = (event: MovieWindowGeometryEvent): void => {
    scheduleMovieWindowGeometryPersist(event.geometry)
  }

  const popOutMovie = async (geometryMode: 'overlay' | 'screen' = 'overlay'): Promise<void> => {
    if (!activeSession || !mediaUrls.movie) {
      return
    }

    const movieAdapter = getMovieAdapter()
    const reactionTime = reactionVideoRef.current?.currentTime ?? position
    const movieTime = movieAdapter?.currentTime ?? moviePosition
    const wasPlaying = syncState === 'playing'
    const initialGeometry = geometryMode === 'screen' ? session.movieWindowGeometry : session.overlay
    controllerRef.current?.pause()
    movieAdapter?.pause()

    const result = await window.watchAlong.openMovieWindow({
      sessionId: activeSession.id,
      title: activeSession.title,
      mediaUrl: mediaUrls.movie,
      subtitleText: activeSubtitle?.text ?? null,
      currentTime: movieTime,
      playbackRate: session.playbackRate * session.movieRateCorrection,
      volume: session.movieVolume,
      muted: session.isMovieMuted,
      geometry: initialGeometry,
      geometryMode
    })

    if (!result.opened) {
      if (wasPlaying && canPlay) {
        controllerRef.current?.play()
      }
      return
    }

    const remoteAdapter = createRemoteMovieAdapter({
      ...result.state,
      currentTime: result.state?.currentTime ?? movieTime,
      duration: Number.isFinite(durations.movie) ? durations.movie : result.state?.duration ?? Number.NaN,
      paused: true,
      playbackRate: session.playbackRate * session.movieRateCorrection,
      volume: session.movieVolume,
      muted: session.isMovieMuted
    })
    setMovieWindowActive(true)
    await persist({
      isMoviePoppedOut: true,
      movieWindowGeometry: result.geometry
    })
    buildController(remoteAdapter)?.loadSession(reactionTime)
    if (wasPlaying && canPlay) {
      window.setTimeout(() => controllerRef.current?.play(), MOVIE_WINDOW_TRANSITION_MS)
    }
  }

  const popInMovie = async (): Promise<void> => {
    if (!remoteMovieAdapterRef.current) {
      restoredPopOutSessionRef.current = sessionRef.current.id
      await persist({ isMoviePoppedOut: false })
      setMovieWindowActive(false)
      return
    }

    const wasPlaying = syncState === 'playing'
    const reactionTime = reactionVideoRef.current?.currentTime ?? position
    controllerRef.current?.pause()
    const fadeResult = await window.watchAlong.sendMovieMediaCommand({ id: `fade-${Date.now()}`, type: 'fadeOut' })
    if (!fadeResult.ok && fadeResult.error === MOVIE_WINDOW_COMMAND_TIMEOUT_ERROR) {
      setError(MOVIE_WINDOW_UNRESPONSIVE_MESSAGE)
    }
    closingMovieWindowRef.current = true
    const result = await window.watchAlong.closeMovieWindow({ notifyMainWindow: false })
    closingMovieWindowRef.current = false
    const nextOverlay = constrainOverlay(result.overlay ?? session.overlay)
    const movieState = result.state ?? remoteMovieAdapterRef.current.snapshot()
    destroyRemoteMovieAdapter()
    restoredPopOutSessionRef.current = sessionRef.current.id
    setMovieWindowActive(false)

    window.requestAnimationFrame(() => {
      const movie = movieVideoRef.current
      if (!movie) {
        return
      }

      if (movie.src !== (mediaUrls.movie ?? '')) {
        movie.src = mediaUrls.movie ?? ''
      }
      movie.currentTime = movieState.currentTime
      movie.playbackRate = session.playbackRate * session.movieRateCorrection
      movie.volume = session.movieVolume
      movie.muted = session.isMovieMuted
      const controller = buildController(createHtmlVideoAdapter('movie', movie))
      controller?.loadSession(reactionTime)
      if (wasPlaying && canPlay) {
        window.setTimeout(() => controllerRef.current?.play(), MOVIE_WINDOW_TRANSITION_MS)
      }
    })

    await persist({
      isMoviePoppedOut: false,
      overlay: nextOverlay,
      movieWindowGeometry: result.geometry ?? session.movieWindowGeometry
    })
  }

  const popInMovieRef = useRef(popInMovie)
  popInMovieRef.current = popInMovie
  const handleMovieWindowGeometryRef = useRef(handleMovieWindowGeometry)
  handleMovieWindowGeometryRef.current = handleMovieWindowGeometry

  useEffect(() => {
    const unsubscribeGeometry = window.watchAlong.onMovieWindowGeometry((event) => {
      handleMovieWindowGeometryRef.current(event)
    })
    const unsubscribePopIn = window.watchAlong.onMovieWindowPopInRequest(() => {
      void popInMovieRef.current()
    })
    const unsubscribeClosed = window.watchAlong.onMovieWindowClosed((event) => {
      if (event?.reason === 'unresponsive') {
        setError(MOVIE_WINDOW_UNRESPONSIVE_MESSAGE)
      }
      if (closingMovieWindowRef.current) {
        return
      }

      destroyRemoteMovieAdapter()
      restoredPopOutSessionRef.current = sessionRef.current.id
      setMovieWindowActive(false)
      void persistRef.current({ isMoviePoppedOut: false })
      window.requestAnimationFrame(() => {
        if (movieVideoRef.current) {
          buildController(createHtmlVideoAdapter('movie', movieVideoRef.current))
        }
      })
    })

    return () => {
      unsubscribeGeometry()
      unsubscribePopIn()
      unsubscribeClosed()
    }
  }, [buildController, destroyRemoteMovieAdapter])

  useEffect(() => {
    return () => {
      if (movieWindowGeometryTimerRef.current !== null) {
        window.clearTimeout(movieWindowGeometryTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (
      appView !== 'player' ||
      !activeSession?.isMoviePoppedOut ||
      movieWindowActive ||
      !mediaUrls.movie ||
      hasMissingMedia ||
      restoredPopOutSessionRef.current === activeSession.id
    ) {
      return
    }

    restoredPopOutSessionRef.current = activeSession.id
    void popOutMovie('screen')
  }) // Effect intentionally omits a dependency array. The ref guard
  // (restoredPopOutSessionRef) ensures pop-out only runs once per session.

  const openImportWizard = (options?: ImportWizardLaunchOptions): void => {
    setCommandPanelOpen(false)
    setControlsIdle(false)
    controllerRef.current?.pause()
    void window.watchAlong.openImportWizard(options)
  }

  const navigateToLibrary = async (): Promise<void> => {
    controllerRef.current?.pause()
    reactionVideoRef.current?.pause()
    getMovieAdapter()?.pause()
    if (movieWindowActive) {
      await closeMovieWindowForModeChange()
      destroyRemoteMovieAdapter()
      setMovieWindowActive(false)
      await persist({ isMoviePoppedOut: false })
    }
    setSetupMode(false)
    setSetupPlayingRole(null)
    setCommandPanelOpen(false)
    setSyncState('paused')
    setAppView('library')
    await refreshMediaUrls(null)
  }

  const openStartupLibrary = async (): Promise<void> => {
    setStartupError(null)
    setAppView('library')
    setShowWelcome(false)
    await refreshMediaUrls(null)
  }

  const startWelcomeImport = (): void => {
    setShowWelcome(false)
    openImportWizard({ mode: 'new' })
  }

  const locateMissingMedia = async (role: MediaRole): Promise<void> => {
    if (!activeSession) {
      return
    }

    setError(null)
    const shouldResume = syncState === 'playing'
    controllerRef.current?.pause()
    const media = role === 'movie'
      ? await window.watchAlong.selectMovieFile()
      : await window.watchAlong.selectReactionFile()
    if (!media) {
      return
    }

    await stopDetachedMovie()
    const next = await window.watchAlong.replaceSessionMedia(
      activeSession.id,
      role,
      media.path,
      role === 'reaction' ? activeSession?.reactionSource ?? 'local' : undefined
    )
    const nextSession = commitLibrary(next)
    setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)
    resumeAfterRepairRef.current = shouldResume
    setAppView(nextSession ? 'player' : 'library')
    await refreshMediaUrls(nextSession?.id ?? null)
  }

  const updatePreference = async <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]): Promise<void> => {
    const next = await window.watchAlong.setPreference(key, value)
    setPreferences(next)
  }

  const chooseDownloadDirectory = async (): Promise<void> => {
    const directory = await window.watchAlong.selectDownloadDirectory()
    if (directory) {
      await updatePreference('reactionDownloadDirectory', directory)
    }
  }

  const forgetPatreonSession = async (): Promise<void> => {
    setPatreonStatus(await window.watchAlong.forgetPatreonSession())
  }

  const attachDownloadedReaction = async (event: DownloadProgressEvent): Promise<void> => {
    if (!event.filePath) {
      return
    }

    controllerRef.current?.pause()
    await stopDetachedMovie()
    if (activeSession?.moviePath) {
      const next = await window.watchAlong.replaceSessionMedia(activeSession.id, 'reaction', event.filePath, event.source)
      const nextSession = commitLibrary(next)
      setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
      setMoviePosition(0)
      setPendingSyncSetup(true)
      setAppView('player')
      setCommandPanelOpen(false)
      await refreshMediaUrls(nextSession?.id ?? null)
      return
    }

    const movie = await window.watchAlong.selectMovieFile()
    if (!movie) {
      return
    }

    const next = await window.watchAlong.createOrSwitchSessionFromPaths(event.filePath, movie.path, event.source)
    const nextSession = commitLibrary(next)
    setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)
    setPendingSyncSetup(Boolean(nextSession?.reactionPath && nextSession.moviePath))
    setAppView(nextSession ? 'player' : 'library')
    setCommandPanelOpen(false)
    await refreshMediaUrls(nextSession?.id ?? null)
  }

  const finishViewTransition = (): void => {
    setViewTransitioning(true)
    window.setTimeout(() => setViewTransitioning(false), VIEW_FADE_MS)
  }

  const focusPlayerFallback = (): void => {
    if (commandPanelButtonRef.current && !controlsIdle) {
      commandPanelButtonRef.current.focus()
      return
    }

    appShellRef.current?.focus()
  }

  const openCommandPanel = (returnFocusTarget?: HTMLElement | null): void => {
    commandPanelReturnFocusRef.current = returnFocusTarget ?? (
      document.activeElement instanceof HTMLElement ? document.activeElement : commandPanelButtonRef.current
    )
    setControlsIdle(false)
    setCommandPanelOpen(true)
  }

  const closeCommandPanel = (): void => {
    setCommandPanelOpen(false)
    window.requestAnimationFrame(() => {
      const target = commandPanelReturnFocusRef.current
      commandPanelReturnFocusRef.current = null
      if (target && target.isConnected && !target.closest('.command-panel')) {
        target.focus()
        return
      }

      focusPlayerFallback()
    })
  }

  const toggleCommandPanel = (returnFocusTarget?: HTMLElement | null): void => {
    if (commandPanelOpen) {
      closeCommandPanel()
      return
    }

    openCommandPanel(returnFocusTarget)
  }

  const movePanelFocus = (delta: number): void => {
    const focusable = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.command-panel button:not(:disabled), .command-panel input:not(:disabled), .command-panel [tabindex="0"]'
      )
    )
    if (focusable.length === 0) {
      return
    }

    const currentIndex = document.activeElement instanceof HTMLElement ? focusable.indexOf(document.activeElement) : -1
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + delta + focusable.length) % focusable.length
    focusable[nextIndex]?.focus()
  }

  const openVideos = async (): Promise<void> => {
    setError(null)
    const result = await window.watchAlong.openVideos()
    if (!result) {
      return
    }

    await stopDetachedMovie()
    const nextSession = commitLibrary(result.library)
    setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)
    setAppView(nextSession ? 'player' : 'library')
    await refreshMediaUrls(nextSession?.id ?? null)
  }

  const openMovie = async (): Promise<void> => {
    setError(null)
    const movie = await window.watchAlong.selectMovieFile()
    if (!movie) {
      return
    }

    controllerRef.current?.pause()
    await stopDetachedMovie()
    const next = await window.watchAlong.setSessionMedia('movie', movie.path)
    const nextSession = commitLibrary(next)
    setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)
    setAppView(nextSession ? 'player' : 'library')
    await refreshMediaUrls(nextSession?.id ?? null)
  }

  const openLocalReaction = async (): Promise<void> => {
    setError(null)
    const reaction = await window.watchAlong.selectReactionFile()
    if (!reaction) {
      return
    }

    await stopDetachedMovie()
    const next = await window.watchAlong.setSessionMedia('reaction', reaction.path, 'local')
    const nextSession = commitLibrary(next)
    setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)
    setPendingSyncSetup(true)
    setAppView(nextSession ? 'player' : 'library')
    await refreshMediaUrls(nextSession?.id ?? null)
  }

  const handleDownloadedReaction = async (
    filePath: string,
    metadata: { jobId: string; source: ReactionDownloadSource }
  ): Promise<void> => {
    await stopDetachedMovie()
    const next = await window.watchAlong.setSessionMedia('reaction', filePath, metadata.source)
    const nextSession = commitLibrary(next)
    setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)
    if (metadata.source === 'patreon') {
      setPatreonStorageJobId(metadata.jobId)
    }
    setPendingSyncSetup(true)
    setAppView(nextSession ? 'player' : 'library')
    await refreshMediaUrls(nextSession?.id ?? null)
  }

  const switchSession = async (sessionId: string): Promise<void> => {
    if (sessionId === activeSession?.id && appView === 'player') {
      return
    }

    controllerRef.current?.pause()
    if (movieWindowActive) {
      await closeMovieWindowForModeChange()
      destroyRemoteMovieAdapter()
      setMovieWindowActive(false)
      await persist({ isMoviePoppedOut: false })
    }
    setSyncState('paused')
    const next = await window.watchAlong.setActiveSession(sessionId)
    let nextSession = commitLibrary(next)
    if (nextSession?.isMoviePoppedOut) {
      nextSession = commitLibrary(await window.watchAlong.saveActiveSession({ isMoviePoppedOut: false }))
    }
    setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)
    setSetupMode(false)
    setCommandPanelOpen(false)
    setAppView(nextSession ? 'player' : 'library')
    if (nextSession) {
      finishViewTransition()
    }
    await refreshMediaUrls(nextSession?.id ?? null)
  }

  const requestRenameSession = (sessionId: string): void => {
    const current = library.sessions.find((item) => item.id === sessionId)
    setRenameTargetId(sessionId)
    setRenameDraft(current?.title ?? '')
  }

  const cancelRenameSession = (): void => {
    setRenameTargetId(null)
    setRenameDraft('')
  }

  const confirmRenameSession = async (): Promise<void> => {
    if (!renameTargetId || !renameDraft.trim()) {
      return
    }

    commitLibrary(await window.watchAlong.renameSession(renameTargetId, renameDraft.trim()))
    cancelRenameSession()
  }

  const requestDeleteSession = (sessionId: string, returnToLibrary = false): void => {
    setDeleteTarget({ sessionId, returnToLibrary })
  }

  const cancelDeleteSession = (): void => {
    setDeleteTarget(null)
  }

  const confirmDeleteSession = async (): Promise<void> => {
    if (!deleteTarget) {
      return
    }

    const shouldReturnToLibrary = deleteTarget.returnToLibrary
    if (movieWindowActive && deleteTarget.sessionId === activeSession?.id) {
      await stopDetachedMovie()
    }
    const next = await window.watchAlong.deleteSession(deleteTarget.sessionId)
    const nextSession = commitLibrary(next)
    setDeleteTarget(null)
    setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)
    if (!nextSession || shouldReturnToLibrary) {
      setAppView('library')
      await refreshMediaUrls(null)
      return
    }

    if (appView === 'player') {
      await refreshMediaUrls(nextSession.id)
    }
  }

  const openSubtitle = async (): Promise<void> => {
    setError(null)
    const next = await window.watchAlong.openSubtitle()
    if (next) {
      commitLibrary(next)
    }
  }

  const clearSubtitle = async (): Promise<void> => {
    commitLibrary(await window.watchAlong.clearSubtitle())
    setSubtitleCues([])
  }

  const togglePlayPause = (): void => {
    if (!canPlay) {
      return
    }

    if (isPlaying) {
      controllerRef.current?.pause()
    } else {
      controllerRef.current?.play()
    }
  }

  const seekBy = (deltaSeconds: number): void => {
    if (!canPlay) {
      return
    }

    controllerRef.current?.seekReaction(Math.max(0, Math.min(reactionDuration, position + deltaSeconds)))
  }

  const seekTo = (value: number): void => {
    setPosition(value)
    controllerRef.current?.seekReaction(value)
  }

  const setReactionVolume = (value: number): void => {
    void persist({ reactionVolume: clamp(value, 0, 1) })
  }

  const setMovieVolume = (value: number): void => {
    void persist({ movieVolume: clamp(value, 0, 1) })
  }

  const toggleReactionMute = (): void => {
    if (!activeSession) {
      return
    }

    void persist({ isReactionMuted: !session.isReactionMuted })
  }

  const toggleMovieMute = (): void => {
    if (!activeSession) {
      return
    }

    void persist({ isMovieMuted: !session.isMovieMuted })
  }

  const setPlaybackRate = (playbackRate: PlaybackRate): void => {
    void persist({ playbackRate })
  }

  const setMovieRateCorrection = async (movieRateCorrection: number): Promise<void> => {
    if (!activeSession) {
      return
    }

    const reactionTime = reactionVideoRef.current?.currentTime ?? position
    const currentMovieTime = new TimelineMapping({
      offsetSeconds: sessionRef.current.offsetSeconds,
      movieRateCorrection: sessionRef.current.movieRateCorrection
    }).rawReactionToMovie(reactionTime)
    const offsetSeconds = TimelineMapping.calculateOffset(reactionTime, currentMovieTime, movieRateCorrection)
    const nextSession = await persist({
      movieRateCorrection,
      offsetSeconds: roundSeconds(offsetSeconds)
    })

    if (nextSession && canPlay) {
      controllerRef.current?.seekReaction(reactionTime)
    }
  }

  const togglePipVisibility = (): void => {
    if (!activeSession) {
      return
    }

    void persist({ isPipHidden: !session.isPipHidden })
  }

  const nudgeOffset = async (deltaSeconds: number): Promise<void> => {
    if (!activeSession) {
      return
    }

    const nextOffset = Number((sessionRef.current.offsetSeconds + deltaSeconds).toFixed(3))
    const nextSession = await persist({ offsetSeconds: nextOffset })
    if (nextSession && canPlay) {
      controllerRef.current?.seekReaction(position)
    }
  }

  const syncNow = (): void => {
    enterSyncSetup()
  }

  const handleMetadata = (role: MediaRole): void => {
    const element = role === 'reaction' ? reactionVideoRef.current : movieVideoRef.current
    const duration = element?.duration ?? Number.NaN
    setDurations((current) => ({ ...current, [role]: duration }))
    setMetadataReady((current) => ({ ...current, [role]: true }))
    setSetupPositions((current) => ({ ...current, [role]: element?.currentTime ?? 0 }))
    if (
      role === 'reaction' &&
      activeSession &&
      Number.isFinite(duration) &&
      Math.abs((activeSession.reactionDurationSeconds ?? 0) - duration) > 0.5
    ) {
      void persist({ reactionDurationSeconds: duration })
    }
    if (role === 'movie') {
      setMoviePosition(element?.currentTime ?? 0)
    }
  }

  const handleTimeUpdate = (role: MediaRole): void => {
    const element = role === 'reaction' ? reactionVideoRef.current : movieVideoRef.current
    const currentTime = element?.currentTime ?? 0

    if (role === 'movie') {
      setMoviePosition(currentTime)
    }

    if (!setupMode) {
      return
    }

    setSetupPositions((current) => ({ ...current, [role]: currentTime }))
    if (role === 'reaction') {
      setPosition(currentTime)
    }
  }

  const handleVideoError = (role: MediaRole): void => {
    setError(
      `The ${role} video could not be played by Electron's HTML5 video engine. Use an MP4/WebM file with browser-supported codecs.`
    )
    setSyncState('error')
  }

  const updateOverlay = (overlay: OverlayGeometry): void => {
    sessionRef.current = { ...sessionRef.current, overlay }
    setLibrary((current) => ({
      ...current,
      sessions: current.sessions.map((item) => (item.id === sessionRef.current.id ? { ...item, overlay } : item))
    }))
  }

  const commitOverlay = (overlay: OverlayGeometry): void => {
    void persist({ overlay })
  }

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void document.documentElement.requestFullscreen()
    }
  }

  const toggleReactionFullscreen = (): void => {
    toggleFullscreen()
  }

  const enterSyncSetup = (): void => {
    if (!canPlay) {
      return
    }

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
    if (!reaction || !movie) {
      return
    }

    reaction.pause()
    movie.pause()
    setSetupPlayingRole(null)

    const nextReactionTime = reaction.currentTime
    await persist({
      offsetSeconds: roundSeconds(
        TimelineMapping.calculateOffset(reaction.currentTime, movie.currentTime, session.movieRateCorrection)
      ),
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
    if (element) {
      element.currentTime = nextTime
    }

    setSetupPositions((current) => ({ ...current, [role]: nextTime }))
    if (role === 'reaction') {
      setPosition(nextTime)
    } else {
      setMoviePosition(nextTime)
    }
  }

  const nudgeSetupTime = (role: MediaRole, deltaSeconds: number): void => {
    setIndependentSetupTime(role, setupPositions[role] + deltaSeconds)
  }

  const toggleSetupPreview = async (role: MediaRole): Promise<void> => {
    if (!setupMode) {
      return
    }

    const active = role === 'reaction' ? reactionVideoRef.current : getMovieAdapter()
    const other = role === 'reaction' ? getMovieAdapter() : reactionVideoRef.current
    if (!active) {
      return
    }

    if (setupPlayingRole === role && !active.paused) {
      active.pause()
      setSetupPlayingRole(null)
      return
    }

    other?.pause()
    active.playbackRate = session.playbackRate
    await active.play()
    setSetupPlayingRole(role)
  }

  return (
    <main
      ref={appShellRef}
      tabIndex={-1}
      className={`app-shell view-${appView} ${controlsIdle ? 'controls-idle' : ''} ${wizardDimmed ? 'wizard-dimmed' : ''} ${commandPanelOpen ? 'command-panel-active' : ''} ${viewTransitioning ? 'view-transitioning' : ''}`}
    >
      <video
        ref={reactionVideoRef}
        className="reaction-video"
        playsInline
        preload="metadata"
        onDoubleClick={toggleReactionFullscreen}
        onLoadedMetadata={() => handleMetadata('reaction')}
        onTimeUpdate={() => handleTimeUpdate('reaction')}
        onError={() => handleVideoError('reaction')}
      />

      {appView === 'loading' && (
        <section className="empty-state" aria-label="Loading">
          <Loader2 size={28} aria-hidden className="spin" />
          <h1>WatchAlong</h1>
        </section>
      )}

      {appView === 'startup-error' && (
        <StartupErrorState
          message={startupError ?? 'Something went wrong while loading your library.'}
          onRetry={() => void loadInitialState()}
          onOpenLibrary={() => void openStartupLibrary()}
        />
      )}

      {appView === 'library' && (
        <LibraryHome
          library={library}
          view={preferences.libraryView}
          onNew={() => openImportWizard({ mode: 'new' })}
          onOpenSession={(sessionId) => void switchSession(sessionId)}
          onRename={requestRenameSession}
          onDelete={(sessionId) => requestDeleteSession(sessionId)}
        />
      )}

      {appView === 'player' && showSmartInput && (
        <div className="smart-input-overlay">
          <SmartReactionInput
            movieReady={movieReady}
            onSelectLocal={openLocalReaction}
            onDownloaded={(filePath, metadata) => void handleDownloadedReaction(filePath, metadata)}
          />
        </div>
      )}

      {appView === 'player' && hasMissingMedia && activeSession && (
        <MissingMediaRecovery
          session={activeSession}
          missingRoles={missingMediaRoles}
          onBackToLibrary={() => void navigateToLibrary()}
          onLocate={(role) => void locateMissingMedia(role)}
          onRemoveSession={() => requestDeleteSession(activeSession.id, true)}
        />
      )}

      {hasMedia && !movieWindowActive && (
        <PipOverlay
          geometry={session.overlay}
          videoRef={movieVideoRef}
          hidden={session.isPipHidden}
          poppedOut={false}
          onChange={updateOverlay}
          onCommit={commitOverlay}
          onHide={() => void persist({ isPipHidden: true })}
          onPopOut={() => void popOutMovie('overlay')}
          onPopIn={() => void popInMovie()}
          onLoadedMetadata={() => handleMetadata('movie')}
          onTimeUpdate={() => handleTimeUpdate('movie')}
          onVideoError={() => handleVideoError('movie')}
          subtitleText={activeSubtitle?.text}
        />
      )}

      {hasMedia && session.isPipHidden && !movieWindowActive && (
        <button
          className="floating-show-pip icon-button"
          type="button"
          title="Show movie"
          aria-label="Show movie"
          onClick={() => void persist({ isPipHidden: false })}
        >
          <Eye size={18} aria-hidden />
        </button>
      )}

      {appView === 'player' && (
      <section className={`control-bar ${controlsIdle ? 'control-bar-hidden' : ''}`} aria-label="Playback controls">
        {hasMedia && setupMode && (
          <div className="setup-panel" aria-label="Sync setup">
            <div className="setup-header">
              <div>
                <strong>Sync setup</strong>
                <span>Offset preview {signedSeconds(setupPositions.movie - setupPositions.reaction)}</span>
              </div>
              <div className="setup-actions">
                <button className="secondary-button" type="button" onClick={cancelSyncSetup}>
                  <X size={16} aria-hidden />
                  Cancel
                </button>
                <button className="primary-button setup-save" type="button" onClick={() => void saveSyncSetup()}>
                  <Check size={16} aria-hidden />
                  Save Sync
                </button>
              </div>
            </div>
            <SetupScrubber
              role="reaction"
              label="Reaction frame"
              time={setupPositions.reaction}
              duration={reactionDuration}
              playing={setupPlayingRole === 'reaction'}
              onTogglePlay={() => void toggleSetupPreview('reaction')}
              onSeek={(time) => setIndependentSetupTime('reaction', time)}
              onNudge={(delta) => nudgeSetupTime('reaction', delta)}
            />
            <SetupScrubber
              role="movie"
              label="Movie frame"
              time={setupPositions.movie}
              duration={Number.isFinite(durations.movie) ? durations.movie : 0}
              playing={setupPlayingRole === 'movie'}
              onTogglePlay={() => void toggleSetupPreview('movie')}
              onSeek={(time) => setIndependentSetupTime('movie', time)}
              onNudge={(delta) => nudgeSetupTime('movie', delta)}
            />
          </div>
        )}

        <div className="control-row">
          <button
            className="transport-button"
            type="button"
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            disabled={!canPlay}
            onClick={togglePlayPause}
          >
            {isPlaying ? <Pause size={22} aria-hidden /> : <Play size={22} aria-hidden />}
          </button>
          <button className="icon-button" type="button" title="Back 5 seconds" aria-label="Back 5 seconds" disabled={!canPlay} onClick={() => seekBy(-5)}>
            <RotateCcw size={18} aria-hidden />
          </button>
          <button className="icon-button" type="button" title="Forward 5 seconds" aria-label="Forward 5 seconds" disabled={!canPlay} onClick={() => seekBy(5)}>
            <RotateCw size={18} aria-hidden />
          </button>
          <div className="timeline-readout">
            <span>{formatTime(position)}</span>
            <span>{formatTime(reactionDuration)}</span>
          </div>
          <input
            className="timeline"
            type="range"
            min={0}
            max={Math.max(0, reactionDuration)}
            step={0.05}
            value={Math.min(position, reactionDuration || 0)}
            disabled={!canPlay}
            aria-label="Reaction timeline"
            onChange={(event) => seekTo(Number(event.currentTarget.value))}
          />
          <button className="secondary-button" type="button" disabled={!canPlay} onClick={syncNow}>
            {setupMode ? <RefreshCw size={16} aria-hidden /> : <SlidersHorizontal size={16} aria-hidden />}
            Sync Setup
          </button>
          <button className="secondary-button" type="button" disabled={!activeSession} onClick={() => void openSubtitle()}>
            <Captions size={16} aria-hidden />
            Subtitles
          </button>
          <button className="icon-button" type="button" title="Fullscreen" aria-label="Fullscreen" onClick={toggleFullscreen}>
            <Maximize size={18} aria-hidden />
          </button>
          <button
            className="icon-button command-panel-gear"
            ref={commandPanelButtonRef}
            type="button"
            title="Command Panel"
            aria-label="Command Panel"
            onClick={() => toggleCommandPanel(commandPanelButtonRef.current)}
          >
            <Settings size={18} aria-hidden />
          </button>
        </div>

        <div className="control-meta">
          <span className={`status-pill status-${syncState}`}>{syncState}</span>
          <span className="file-label">{session.reactionPath ? fileName(session.reactionPath) : 'No reaction file'}</span>
          <span className="file-label">{session.moviePath ? fileName(session.moviePath) : 'No movie file'}</span>
          <span className="offset-label">
            Offset {displayOffset} / effective {signedSeconds(effectiveOffset)} / movie at {formatTime(movieStartsAtReaction)}
          </span>
          <div className="speed-control" role="group" aria-label="Playback speed">
            {playbackRates.map((rate) => (
              <button
                key={rate}
                className={rate === session.playbackRate ? 'speed-active' : ''}
                type="button"
                disabled={!activeSession}
                onClick={() => setPlaybackRate(rate)}
              >
                {rate}x
              </button>
            ))}
          </div>
          <div className="source-rate-control" role="group" aria-label="Movie source">
            <span>
              Movie source {formatRatePercent(session.movieRateCorrection)} / {formatRateDriftPerHour(session.movieRateCorrection)}
            </span>
            {movieSourceRates.map((option) => (
              <button
                key={option.rate}
                className={Math.abs(option.rate - session.movieRateCorrection) < 0.000001 ? 'speed-active' : ''}
                type="button"
                disabled={!activeSession}
                onClick={() => void setMovieRateCorrection(option.rate)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <StreamVolume
            label="Reaction"
            volume={session.reactionVolume}
            muted={session.isReactionMuted}
            onVolume={setReactionVolume}
            onMute={toggleReactionMute}
          />
          <StreamVolume
            label="Movie"
            volume={session.movieVolume}
            muted={session.isMovieMuted}
            onVolume={setMovieVolume}
            onMute={toggleMovieMute}
          />
          {session.subtitlePath && (
            <button className="mini-button subtitle-clear" type="button" onClick={() => void clearSubtitle()}>
              <X size={14} aria-hidden />
              {fileName(session.subtitlePath)}
            </button>
          )}
        </div>
        {error && (
          <div className="error-banner">
            {error === MOVIE_WINDOW_UNRESPONSIVE_MESSAGE && <ExternalLink size={15} aria-hidden />}
            <span>{error}</span>
          </div>
        )}
      </section>
      )}

      {appView === 'player' && commandPanelOpen && (
        <CommandPanel
          activeSession={activeSession}
          library={library}
          position={position}
          reactionDuration={reactionDuration}
          downloads={downloadEvents}
          preferences={preferences}
          patreonStatus={patreonStatus}
          expandedSection={expandedPanelSection}
          onExpandedSection={setExpandedPanelSection}
          onClose={closeCommandPanel}
          onSyncSetup={syncNow}
          onSwapReaction={() => openImportWizard({ mode: 'swap-reaction', sessionId: activeSession?.id ?? null })}
          onCloseSession={() => void navigateToLibrary()}
          onSwitchSession={(sessionId) => void switchSession(sessionId)}
          onViewLibrary={() => void navigateToLibrary()}
          onNewSession={() => openImportWizard({ mode: 'new' })}
          onCancelDownload={(jobId) => void window.watchAlong.cancelDownload(jobId)}
          onAttachDownload={(event) => void attachDownloadedReaction(event)}
          onPreference={updatePreference}
          onChooseDownloadDirectory={() => void chooseDownloadDirectory()}
          onForgetPatreon={() => void forgetPatreonSession()}
          onShowWizard={() => openImportWizard({ mode: 'show-again' })}
        />
      )}

      {renameTargetId && (
        <RenameSessionDialog
          title={renameDraft}
          onTitleChange={setRenameDraft}
          onCancel={cancelRenameSession}
          onConfirm={() => void confirmRenameSession()}
        />
      )}

      {deleteTarget && (
        <DeleteSessionDialog
          sessionTitle={library.sessions.find((item) => item.id === deleteTarget.sessionId)?.title ?? 'this watchalong'}
          onCancel={cancelDeleteSession}
          onConfirm={() => void confirmDeleteSession()}
        />
      )}

      {patreonStorageJobId && (
        <PatreonStorageOffer jobId={patreonStorageJobId} onDismiss={() => setPatreonStorageJobId(null)} />
      )}

      {downloadIndicator && <DownloadIndicator event={downloadIndicator} />}

      {showWelcome && appView !== 'loading' && appView !== 'startup-error' && (
        <WelcomeOverlay onGetStarted={startWelcomeImport} onDismiss={() => setShowWelcome(false)} />
      )}

      {wizardDimmed && <div className="main-window-dim" aria-hidden />}
    </main>
  )
}

function RenameSessionDialog({
  title,
  onTitleChange,
  onCancel,
  onConfirm
}: {
  title: string
  onTitleChange(value: string): void
  onCancel(): void
  onConfirm(): void
}): JSX.Element {
  return (
    <section className="session-dialog-backdrop" aria-label="Rename watchalong">
      <form
        className="session-dialog"
        onSubmit={(event) => {
          event.preventDefault()
          onConfirm()
        }}
      >
        <h1>Rename watchalong</h1>
        <p>Give this session a name that is easy to find in your local library.</p>
        <label>
          <span>Title</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => onTitleChange(event.currentTarget.value)}
          />
        </label>
        <div className="session-dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={!title.trim()}>
            Save
          </button>
        </div>
      </form>
    </section>
  )
}

function DeleteSessionDialog({
  sessionTitle,
  onCancel,
  onConfirm
}: {
  sessionTitle: string
  onCancel(): void
  onConfirm(): void
}): JSX.Element {
  return (
    <section className="session-dialog-backdrop" aria-label="Delete watchalong">
      <div className="session-dialog">
        <h1>Delete this watchalong?</h1>
        <p>
          {sessionTitle} will be removed from your WatchAlong library. Your movie and reaction files stay on this device.
        </p>
        <div className="session-dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="secondary-button danger-button" type="button" onClick={onConfirm}>
            <Trash2 size={16} aria-hidden />
            Delete
          </button>
        </div>
      </div>
    </section>
  )
}

function StartupErrorState({
  message,
  onRetry,
  onOpenLibrary
}: {
  message: string
  onRetry(): void
  onOpenLibrary(): void
}): JSX.Element {
  return (
    <section className="startup-error-state" aria-label="Startup error">
      <div className="startup-error-card">
        <div className="startup-error-icon">
          <RefreshCw size={32} aria-hidden />
        </div>
        <h1>{message}</h1>
        <p>You can try again, or open the Library with anything WatchAlong could load.</p>
        <div className="startup-error-actions">
          <button className="primary-button" type="button" onClick={onRetry}>
            <RefreshCw size={17} aria-hidden />
            Retry
          </button>
          <button className="secondary-button" type="button" onClick={onOpenLibrary}>
            <LibraryIcon size={16} aria-hidden />
            Open Library
          </button>
        </div>
      </div>
    </section>
  )
}

function WelcomeOverlay({
  onGetStarted,
  onDismiss
}: {
  onGetStarted(): void
  onDismiss(): void
}): JSX.Element {
  return (
    <section className="welcome-backdrop" aria-label="Welcome to WatchAlong">
      <div className="welcome-card">
        <div className="welcome-mark">
          <Film size={38} aria-hidden />
        </div>
        <div className="welcome-copy">
          <h1>Watch reactions alongside your own movies.</h1>
          <p>
            WatchAlong keeps everything local. Load a movie file you own, add a full-length reaction, and sync them in one private desktop session.
          </p>
        </div>
        <div className="welcome-actions">
          <button className="primary-button" type="button" onClick={onGetStarted}>
            <Plus size={18} aria-hidden />
            Get Started
          </button>
          <button className="secondary-button" type="button" onClick={onDismiss}>
            Not now
          </button>
        </div>
      </div>
    </section>
  )
}

function MissingMediaRecovery({
  session,
  missingRoles,
  onBackToLibrary,
  onLocate,
  onRemoveSession
}: {
  session: LibrarySession
  missingRoles: MediaRole[]
  onBackToLibrary(): void
  onLocate(role: MediaRole): void
  onRemoveSession(): void
}): JSX.Element {
  return (
    <section className="missing-media-backdrop" aria-label="Missing media recovery">
      <div className="missing-media-card">
        <div className="missing-media-icon">
          <FileVideo size={34} aria-hidden />
        </div>
        <div className="missing-media-copy">
          <h1>A file for this session can&apos;t be found.</h1>
          <p>Point WatchAlong to the moved file and this session can continue from where you left off.</p>
        </div>
        <div className="missing-media-list">
          {missingRoles.map((role) => (
            <div key={role}>
              <AlertTriangle size={17} aria-hidden />
              <strong>{role === 'movie' ? 'Movie file' : 'Reaction file'}</strong>
              <span>{fileName((role === 'movie' ? session.moviePath : session.reactionPath) ?? 'Unknown')}</span>
            </div>
          ))}
        </div>
        <p className="media-format-hint">MP4 and WebM work best. MKV/AVI may not play in all cases.</p>
        <div className="missing-media-actions">
          {missingRoles.includes('movie') && (
            <button className="primary-button" type="button" onClick={() => onLocate('movie')}>
              <Film size={17} aria-hidden />
              Locate movie
            </button>
          )}
          {missingRoles.includes('reaction') && (
            <button className="primary-button" type="button" onClick={() => onLocate('reaction')}>
              <FileVideo size={17} aria-hidden />
              Locate reaction
            </button>
          )}
          <button className="secondary-button danger-button" type="button" onClick={onRemoveSession}>
            <Trash2 size={16} aria-hidden />
            Remove session
          </button>
        </div>
        <button className="link-button missing-media-library-link" type="button" onClick={onBackToLibrary}>
          Back to Library
        </button>
      </div>
    </section>
  )
}

interface LibraryHomeProps {
  library: SessionLibrary
  view: LibraryViewPreference
  onNew(): void
  onOpenSession(sessionId: string): void
  onRename(sessionId: string): void
  onDelete(sessionId: string): void
}

function LibraryHome({ library, view, onNew, onOpenSession, onRename, onDelete }: LibraryHomeProps): JSX.Element {
  const hasSessions = library.sessions.length > 0
  const sessions = [...library.sessions].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))

  return (
    <section className={`library-home library-home-${view}`} aria-label="WatchAlong Library">
      <header className="library-home-header">
        <div className="library-home-brand">
          <span className="library-home-mark" aria-hidden>
            <Film size={18} />
          </span>
          <h1>WatchAlong</h1>
          {hasSessions && <p>{library.sessions.length} saved watchalong{library.sessions.length === 1 ? '' : 's'}</p>}
        </div>
        {hasSessions && (
          <button className="primary-button" type="button" onClick={onNew}>
            <Plus size={18} aria-hidden />
            New WatchAlong
          </button>
        )}
      </header>

      {!hasSessions && (
        <div className="library-empty-state">
          <div className="library-empty-icon">
            <LibraryIcon size={42} aria-hidden />
          </div>
          <h2>Your watchalong collection is empty</h2>
          <p>Start your first watchalong - it only takes a minute.</p>
          <button className="primary-button" type="button" onClick={onNew}>
            <Plus size={18} aria-hidden />
            New WatchAlong
          </button>
          <p className="library-ownership-line">WatchAlong works with your own media files. Nothing leaves this device.</p>
        </div>
      )}

      {hasSessions && (
        <div className="library-session-grid">
          {sessions.map((session) => (
            <LibrarySessionCard
              key={session.id}
              session={session}
              compact={view === 'list'}
              onOpen={() => onOpenSession(session.id)}
              onRename={() => onRename(session.id)}
              onDelete={() => onDelete(session.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function LibrarySessionCard({
  session,
  compact,
  onOpen,
  onRename,
  onDelete
}: {
  session: LibrarySession
  compact?: boolean
  onOpen(): void
  onRename?(): void
  onDelete?(): void
}): JSX.Element {
  const [actionsOpen, setActionsOpen] = useState(false)
  const duration = session.reactionDurationSeconds ?? 0
  const progress = duration > 0 ? Math.min(100, Math.max(0, (session.lastReactionTimeSeconds / duration) * 100)) : 0
  const showActions = Boolean(onRename || onDelete)

  return (
    <article className={`library-card ${compact ? 'library-card-compact' : ''}`}>
      <button className="library-card-main" type="button" onClick={onOpen}>
        <span className="library-card-thumbnail" aria-hidden>
          <Film size={compact ? 24 : 38} />
        </span>
        <span className="library-card-copy">
          <strong>{session.title || fileName(session.moviePath ?? session.reactionPath ?? 'Untitled watchalong')}</strong>
          <small>
            <ReactionSourceIcon source={session.reactionSource} />
            {reactionSourceLabel(session.reactionSource)} / {formatRelativeTime(session.updatedAt)}
          </small>
        </span>
      </button>
      {showActions && (
        <div className="library-card-actions">
          <button
            className="icon-button library-card-menu-button"
            type="button"
            aria-label="More actions"
            title="More actions"
            aria-expanded={actionsOpen}
            onClick={() => setActionsOpen((current) => !current)}
            onBlur={(event) => {
              if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) {
                setActionsOpen(false)
              }
            }}
          >
            <MoreHorizontal size={16} aria-hidden />
          </button>
          {actionsOpen && (
            <div
              className="library-card-menu"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setActionsOpen(false)
                }
              }}
            >
              {onRename && (
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false)
                    onRename()
                  }}
                >
                  <Pencil size={14} aria-hidden />
                  Rename
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false)
                    onDelete()
                  }}
                >
                  <Trash2 size={14} aria-hidden />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <span className="library-card-progress" aria-hidden>
        <span style={{ width: `${progress}%` }} />
      </span>
    </article>
  )
}

interface CommandPanelProps {
  activeSession: LibrarySession | null
  library: SessionLibrary
  position: number
  reactionDuration: number
  downloads: DownloadProgressEvent[]
  preferences: AppPreferences
  patreonStatus: SavedPatreonSessionStatus
  expandedSection: CommandPanelSection
  onExpandedSection(section: CommandPanelSection): void
  onClose(): void
  onSyncSetup(): void
  onSwapReaction(): void
  onCloseSession(): void
  onSwitchSession(sessionId: string): void
  onViewLibrary(): void
  onNewSession(): void
  onCancelDownload(jobId: string): void
  onAttachDownload(event: DownloadProgressEvent): void
  onPreference<K extends keyof AppPreferences>(key: K, value: AppPreferences[K]): void | Promise<void>
  onChooseDownloadDirectory(): void
  onForgetPatreon(): void
  onShowWizard(): void
}

function CommandPanel({
  activeSession,
  library,
  position,
  reactionDuration,
  downloads,
  preferences,
  patreonStatus,
  expandedSection,
  onExpandedSection,
  onClose,
  onSyncSetup,
  onSwapReaction,
  onCloseSession,
  onSwitchSession,
  onViewLibrary,
  onNewSession,
  onCancelDownload,
  onAttachDownload,
  onPreference,
  onChooseDownloadDirectory,
  onForgetPatreon,
  onShowWizard
}: CommandPanelProps): JSX.Element {
  const progress = reactionDuration > 0 ? Math.min(100, Math.max(0, (position / reactionDuration) * 100)) : 0
  const [showPatreonLearnMore, setShowPatreonLearnMore] = useState(false)
  const recentSessions = [...library.sessions]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 10)
  const showDownloads = downloads.length > 0

  return (
    <div className="command-panel-scrim" onMouseDown={onClose}>
      <aside className="command-panel" aria-label="WatchAlong Command Panel" onMouseDown={(event) => event.stopPropagation()}>
        <header className="command-panel-titlebar">
          <strong>WatchAlong</strong>
          <button
            className="icon-button"
            type="button"
            title="Close"
            aria-label="Close Command Panel"
            data-command-panel-close
            onClick={onClose}
          >
            <X size={17} aria-hidden />
          </button>
        </header>

        {activeSession && (
          <CommandPanelSection
            id="now-playing"
            icon={<Clapperboard size={17} aria-hidden />}
            label="Now Playing"
            summary={activeSession.title}
            expanded={expandedSection === 'now-playing'}
            onToggle={() => onExpandedSection('now-playing')}
          >
            <div className="panel-session-summary">
              <strong>{activeSession.title}</strong>
              <small>
                <ReactionSourceIcon source={activeSession.reactionSource} />
                {reactionSourceLabel(activeSession.reactionSource)}
              </small>
              <ReadOnlyProgress value={progress} label={`${formatTime(position)} of ${formatTime(reactionDuration)}`} />
            </div>
            <div className="panel-action-grid">
              <button className="secondary-button" type="button" onClick={onSyncSetup}>
                <SlidersHorizontal size={16} aria-hidden />
                Sync Setup
              </button>
              <button className="secondary-button" type="button" onClick={onSwapReaction}>
                <RefreshCw size={16} aria-hidden />
                Swap Reaction
              </button>
              <button className="secondary-button" type="button" onClick={onCloseSession}>
                <LibraryIcon size={16} aria-hidden />
                Close Session
              </button>
            </div>
          </CommandPanelSection>
        )}

        <CommandPanelSection
          id="library"
          icon={<LibraryIcon size={17} aria-hidden />}
          label="Library"
          summary={`${library.sessions.length} saved`}
          expanded={expandedSection === 'library'}
          onToggle={() => onExpandedSection('library')}
        >
          <div className="panel-library-list">
            {recentSessions.map((session) => (
              <LibrarySessionCard
                key={session.id}
                compact
                session={session}
                onOpen={() => onSwitchSession(session.id)}
              />
            ))}
            {recentSessions.length === 0 && <p className="panel-muted">No sessions yet.</p>}
          </div>
          <div className="panel-action-grid">
            <button className="secondary-button" type="button" onClick={onViewLibrary}>
              <LayoutGrid size={16} aria-hidden />
              View Full Library
            </button>
            <button className="secondary-button" type="button" onClick={onNewSession}>
              <Plus size={16} aria-hidden />
              New Session
            </button>
          </div>
        </CommandPanelSection>

        {showDownloads && (
          <CommandPanelSection
            id="downloads"
            icon={<Download size={17} aria-hidden />}
            label="Downloads"
            summary={`${downloads.length} recent`}
            expanded={expandedSection === 'downloads'}
            onToggle={() => onExpandedSection('downloads')}
          >
            <div className="panel-download-list">
              {downloads.map((download) => (
                <DownloadPanelItem
                  key={download.jobId}
                  event={download}
                  onCancel={() => onCancelDownload(download.jobId)}
                  onAttach={() => onAttachDownload(download)}
                />
              ))}
            </div>
          </CommandPanelSection>
        )}

        <CommandPanelSection
          id="preferences"
          icon={<Settings size={17} aria-hidden />}
          label="Preferences"
          summary={preferences.openLibraryOnLaunch ? 'Library on launch' : 'Resume on launch'}
          expanded={expandedSection === 'preferences'}
          onToggle={() => onExpandedSection('preferences')}
        >
          <div className="panel-preferences">
            <label className="panel-setting-row">
              <span>
                <strong>Reaction download location</strong>
                <small>{preferences.reactionDownloadDirectory ?? 'Default: Videos\\WatchAlong\\Reactions'}</small>
              </span>
              <button className="secondary-button" type="button" onClick={onChooseDownloadDirectory}>
                Change
              </button>
            </label>

            <div className="panel-toggle-row panel-patreon-storage">
              <span>
                <strong>
                  <Lock size={14} aria-hidden />
                  Patreon saved session
                </strong>
                <small>{patreonStatus.available ? 'Saved' : 'Not saved'} / {patreonStatus.canEncrypt ? 'encrypted storage available' : 'encryption unavailable'}</small>
                {showPatreonLearnMore && (
                  <small className="panel-learn-more">
                    Your Patreon session is used only to authenticate downloads directly with Patreon. It's never sent to WatchAlong or any third party, and it's stored on your device only if you choose to save it.
                  </small>
                )}
              </span>
              <div className="panel-setting-actions">
                <button className="link-button" type="button" onClick={() => setShowPatreonLearnMore((current) => !current)}>
                  Learn more
                </button>
                <button className="secondary-button" type="button" disabled={!patreonStatus.available} onClick={onForgetPatreon}>
                  Forget
                </button>
              </div>
            </div>

            <label className="panel-toggle-row">
              <span>Open Library on launch</span>
              <input
                type="checkbox"
                checked={preferences.openLibraryOnLaunch}
                onChange={(event) => void onPreference('openLibraryOnLaunch', event.currentTarget.checked)}
              />
            </label>

            <div className="panel-segmented" role="group" aria-label="Library view">
              <button
                type="button"
                className={preferences.libraryView === 'grid' ? 'segment-active' : ''}
                onClick={() => void onPreference('libraryView', 'grid')}
              >
                <LayoutGrid size={15} aria-hidden />
                Grid
              </button>
              <button
                type="button"
                className={preferences.libraryView === 'list' ? 'segment-active' : ''}
                onClick={() => void onPreference('libraryView', 'list')}
              >
                <List size={15} aria-hidden />
                List
              </button>
            </div>

            <div className="panel-setting-row panel-setting-disabled">
              <span>
                <strong>Subtitle defaults</strong>
                <small>Coming later</small>
              </span>
            </div>

            <button className="secondary-button" type="button" onClick={onShowWizard}>
              <Plus size={16} aria-hidden />
              Show import wizard again
            </button>
          </div>
        </CommandPanelSection>

        <CommandPanelSection
          id="help"
          icon={<Clock3 size={17} aria-hidden />}
          label="Help & About"
          summary={`Version ${APP_VERSION}`}
          expanded={expandedSection === 'help'}
          onToggle={() => onExpandedSection('help')}
        >
          <div className="panel-about">
            <p>Watch reactions alongside your own movies, perfectly in sync.</p>
            <p>All data stays local. Patreon cookies are encrypted with OS storage when saved. WatchAlong has no telemetry.</p>
            {ONLINE_HELP_URL && (
              <button className="secondary-button" type="button" onClick={() => window.open(ONLINE_HELP_URL, '_blank')}>
                <ExternalLink size={16} aria-hidden />
                Online Help
              </button>
            )}
            <button
              className="secondary-button"
              type="button"
              disabled={!DONATION_URL}
              title={DONATION_URL ? 'Open donation page' : 'Donation link coming soon.'}
              aria-describedby="donation-help"
              onClick={() => {
                if (DONATION_URL) {
                  window.open(DONATION_URL, '_blank')
                }
              }}
            >
              <Coffee size={16} aria-hidden />
              Buy the developer a coffee
            </button>
            {!DONATION_URL && <small id="donation-help">Donation link coming soon.</small>}
          </div>
        </CommandPanelSection>
      </aside>
    </div>
  )
}

function CommandPanelSection({
  id,
  icon,
  label,
  summary,
  expanded,
  children,
  onToggle
}: {
  id: CommandPanelSection
  icon: JSX.Element
  label: string
  summary: string
  expanded: boolean
  children: ReactNode
  onToggle(): void
}): JSX.Element {
  return (
    <section className={`command-section ${expanded ? 'command-section-expanded' : ''}`} aria-labelledby={`panel-${id}`}>
      <button
        id={`panel-${id}`}
        className="command-section-header"
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        {icon}
        <span>
          <strong>{label}</strong>
          <small>{summary}</small>
        </span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {expanded && <div className="command-section-body">{children}</div>}
    </section>
  )
}

function DownloadPanelItem({
  event,
  onCancel,
  onAttach
}: {
  event: DownloadProgressEvent
  onCancel(): void
  onAttach(): void
}): JSX.Element {
  const working = event.state === 'checking' || event.state === 'downloading'
  const ready = event.state === 'success' && Boolean(event.filePath)

  return (
    <div className={`panel-download-item panel-download-${event.state}`}>
      <div>
        <strong>{event.filePath ? fileName(event.filePath) : reactionSourceLabel(event.source)}</strong>
        <small>{ready ? 'Ready' : event.message}</small>
      </div>
      {working && (
        <button className="icon-button" type="button" title="Cancel download" aria-label="Cancel download" onClick={onCancel}>
          <X size={15} aria-hidden />
        </button>
      )}
      {ready && (
        <button className="secondary-button" type="button" onClick={onAttach}>
          <Check size={16} aria-hidden />
          Attach
        </button>
      )}
      <ReadOnlyProgress value={event.percent ?? (working ? 42 : ready ? 100 : 0)} />
    </div>
  )
}

function ReadOnlyProgress({ value, label }: { value: number; label?: string }): JSX.Element {
  return (
    <div className="read-only-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      {label && <small>{label}</small>}
      <span aria-hidden>
        <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </span>
    </div>
  )
}

function DownloadIndicator({ event }: { event: DownloadProgressEvent }): JSX.Element {
  const working = event.state === 'checking' || event.state === 'downloading'
  const label = event.source === 'youtube' ? 'YouTube reaction' : 'Patreon reaction'

  return (
    <aside className={`download-indicator download-indicator-${event.state}`} aria-live="polite">
      <div>
        <strong>{label}</strong>
        <span>{event.message}</span>
      </div>
      {working && <Loader2 size={17} aria-hidden className="spin" />}
      {event.percent !== null && (
        <div className="download-indicator-track" aria-hidden>
          <span style={{ width: `${event.percent}%` }} />
        </div>
      )}
    </aside>
  )
}

interface LibraryPanelProps {
  library: SessionLibrary
  activeSessionId: string | null
  onSwitch(sessionId: string): void
  onRename(sessionId: string): void
  onDelete(sessionId: string): void
}

function LibraryPanel({ library, activeSessionId, onSwitch, onRename, onDelete }: LibraryPanelProps): JSX.Element {
  const active = library.sessions.find((session) => session.id === activeSessionId)

  return (
    <details className="library-panel">
      <summary>
        <LibraryIcon size={16} aria-hidden />
        <span>{active?.title ?? 'Library'}</span>
        <span>{library.sessions.length}</span>
      </summary>
      <div className="library-list">
        {library.sessions.map((session) => (
          <div key={session.id} className={`library-item ${session.id === activeSessionId ? 'library-item-active' : ''}`}>
            <button type="button" className="library-session-button" onClick={() => onSwitch(session.id)}>
              <span>{session.title}</span>
              <small>
                {formatTime(session.lastReactionTimeSeconds)} / {session.moviePath ? fileName(session.moviePath) : 'No movie file'}
              </small>
            </button>
            <button className="icon-button" type="button" title="Rename" aria-label="Rename" onClick={() => onRename(session.id)}>
              <Pencil size={15} aria-hidden />
            </button>
            <button className="icon-button" type="button" title="Remove" aria-label="Remove" onClick={() => onDelete(session.id)}>
              <Trash2 size={15} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </details>
  )
}

interface StreamVolumeProps {
  label: string
  volume: number
  muted: boolean
  onVolume(value: number): void
  onMute(): void
}

function StreamVolume({ label, volume, muted, onVolume, onMute }: StreamVolumeProps): JSX.Element {
  return (
    <label className="volume-control">
      <button className="icon-button volume-mute" type="button" title={`Mute ${label}`} aria-label={`Mute ${label}`} onClick={onMute}>
        {muted ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}
      </button>
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        aria-label={`${label} volume`}
        onChange={(event) => onVolume(Number(event.currentTarget.value))}
      />
    </label>
  )
}

function ReactionSourceIcon({ source }: { source: ReactionSource }): JSX.Element {
  if (source === 'youtube') {
    return <Youtube size={14} aria-hidden />
  }

  if (source === 'patreon') {
    return <Heart size={14} aria-hidden />
  }

  return <FileVideo size={14} aria-hidden />
}

function reactionSourceLabel(source: ReactionSource): string {
  if (source === 'youtube') {
    return 'YouTube'
  }

  if (source === 'patreon') {
    return 'Patreon'
  }

  return 'Local file'
}

interface SetupScrubberProps {
  role: MediaRole
  label: string
  time: number
  duration: number
  playing: boolean
  onTogglePlay(): void
  onSeek(time: number): void
  onNudge(deltaSeconds: number): void
}

function SetupScrubber({
  role,
  label,
  time,
  duration,
  playing,
  onTogglePlay,
  onSeek,
  onNudge
}: SetupScrubberProps): JSX.Element {
  return (
    <div className="setup-row" data-role={role}>
      <span className="setup-label">{label}</span>
      <button
        className="icon-button"
        type="button"
        title={playing ? `Pause ${role}` : `Play ${role}`}
        aria-label={playing ? `Pause ${role}` : `Play ${role}`}
        onClick={onTogglePlay}
      >
        {playing ? <Pause size={17} aria-hidden /> : <Play size={17} aria-hidden />}
      </button>
      <button className="mini-button" type="button" onClick={() => onNudge(-5)}>
        -5s
      </button>
      <button className="mini-button" type="button" onClick={() => onNudge(-0.25)}>
        -0.25s
      </button>
      <input
        className="timeline"
        type="range"
        min={0}
        max={Math.max(0, duration)}
        step={0.05}
        value={Math.min(time, duration || 0)}
        aria-label={`${label} time`}
        onChange={(event) => onSeek(Number(event.currentTarget.value))}
      />
      <button className="mini-button" type="button" onClick={() => onNudge(0.25)}>
        +0.25s
      </button>
      <button className="mini-button" type="button" onClick={() => onNudge(5)}>
        +5s
      </button>
      <span className="setup-time">{formatTime(time)}</span>
    </div>
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

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00'
  }

  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainingSeconds = total % 60
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(remainingSeconds)}`
  }

  return `${pad(minutes)}:${pad(remainingSeconds)}`
}

function formatRelativeTime(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return 'Unknown'
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (elapsedSeconds < 60) {
    return 'Just now'
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60)
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} minute${elapsedMinutes === 1 ? '' : 's'} ago`
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) {
    return `${elapsedHours} hour${elapsedHours === 1 ? '' : 's'} ago`
  }

  const elapsedDays = Math.floor(elapsedHours / 24)
  if (elapsedDays < 30) {
    return `${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`
  }

  const elapsedMonths = Math.floor(elapsedDays / 30)
  if (elapsedMonths < 12) {
    return `${elapsedMonths} month${elapsedMonths === 1 ? '' : 's'} ago`
  }

  const elapsedYears = Math.floor(elapsedMonths / 12)
  return `${elapsedYears} year${elapsedYears === 1 ? '' : 's'} ago`
}

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

function fileName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path
}

function signedSeconds(value: number): string {
  const sign = value >= 0 ? '+' : '-'
  return `${sign}${Math.abs(value).toFixed(3)}s`
}

function formatRatePercent(rate: number): string {
  const percent = (rate - 1) * 100
  const sign = percent >= 0 ? '+' : ''
  return `${sign}${percent.toFixed(3)}%`
}

function formatRateDriftPerHour(rate: number): string {
  const secondsPerHour = (rate - 1) * 3600
  const sign = secondsPerHour >= 0 ? '+' : ''
  return `${sign}${secondsPerHour.toFixed(1)}s/hr`
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(6))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
