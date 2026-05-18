import {
  Captions,
  Check,
  Eye,
  FolderOpen,
  Library as LibraryIcon,
  Maximize,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Trash2,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createDefaultLibrary, createDefaultSession, getActiveSession } from '@shared/session'
import type {
  LibrarySession,
  MediaRole,
  OverlayGeometry,
  PlaybackRate,
  SessionLibrary,
  SyncState
} from '@shared/types'
import { PipOverlay } from './components/PipOverlay'
import { constrainOverlay } from './components/pipGeometry'
import { SyncController, createHtmlVideoAdapter } from './sync/SyncController'
import { TimelineMapping } from './sync/timeline'
import { getActiveSubtitleCue, parseSubtitleText, type SubtitleCue } from './subtitles'

type MediaUrls = Record<MediaRole, string | null>
type MetadataReady = Record<MediaRole, boolean>
type Durations = Record<MediaRole, number>

const emptyUrls: MediaUrls = { reaction: null, movie: null }
const emptyMetadata: MetadataReady = { reaction: false, movie: false }
const emptyDurations: Durations = { reaction: Number.NaN, movie: Number.NaN }
const playbackRates: PlaybackRate[] = [1, 1.25, 1.5, 2]
const movieSourceRates = [
  { label: 'Matched', rate: 1 },
  { label: 'Stream 24 -> Blu-ray 23.976', rate: 1.001 },
  { label: 'Reverse', rate: 0.999001 }
]
const CONTROL_IDLE_DELAY_MS = 2400

export function App(): JSX.Element {
  const reactionVideoRef = useRef<HTMLVideoElement>(null)
  const movieVideoRef = useRef<HTMLVideoElement>(null)
  const controllerRef = useRef<SyncController | null>(null)
  const sessionRef = useRef<LibrarySession>(createDefaultSession())
  const setupModeRef = useRef(false)
  const lastPositionSaveRef = useRef(0)

  const [emptySession] = useState(() => createDefaultSession())
  const [library, setLibrary] = useState<SessionLibrary>(() => createDefaultLibrary())
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
  const [restoreToken, setRestoreToken] = useState<string | null>(null)
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([])

  const activeSession = useMemo(() => getActiveSession(library), [library])
  const session = activeSession ?? emptySession
  const activeSubtitle = useMemo(() => getActiveSubtitleCue(subtitleCues, moviePosition), [moviePosition, subtitleCues])

  const commitLibrary = useCallback((next: SessionLibrary): LibrarySession | null => {
    const nextSession = getActiveSession(next)
    if (nextSession) {
      sessionRef.current = nextSession
    }
    setLibrary(next)
    return nextSession
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

  useEffect(() => {
    let mounted = true

    void (async () => {
      const loadedLibrary = await window.watchAlong.getLibrary()
      if (!mounted) {
        return
      }

      const loadedSession = commitLibrary(loadedLibrary)
      setPosition(loadedSession?.lastReactionTimeSeconds ?? 0)
      setMoviePosition(0)
      await refreshMediaUrls(loadedSession?.id ?? null)
    })()

    return () => {
      mounted = false
    }
  }, [commitLibrary, refreshMediaUrls])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    setupModeRef.current = setupMode
    controllerRef.current?.setSetupMode(setupMode)
  }, [setupMode])

  useEffect(() => {
    const reaction = reactionVideoRef.current
    const movie = movieVideoRef.current
    if (!reaction || !movie || controllerRef.current) {
      return
    }

    const controller = new SyncController({
      reaction: createHtmlVideoAdapter('reaction', reaction),
      movie: createHtmlVideoAdapter('movie', movie),
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
    controllerRef.current = controller

    return () => {
      controller.destroy()
      controllerRef.current = null
    }
  }, [commitLibrary, mediaUrls.movie, mediaUrls.reaction])

  useEffect(() => {
    const reaction = reactionVideoRef.current
    const movie = movieVideoRef.current
    if (reaction && reaction.src !== (mediaUrls.reaction ?? '')) {
      reaction.src = mediaUrls.reaction ?? ''
    }

    if (movie && movie.src !== (mediaUrls.movie ?? '')) {
      movie.src = mediaUrls.movie ?? ''
    }
  }, [mediaUrls])

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
    setMoviePosition(movieVideoRef.current?.currentTime ?? 0)
    setRestoreToken(token)
  }, [activeSession, mediaUrls, metadataReady, restoreToken, session])

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
    const onResize = (): void => {
      const current = sessionRef.current
      const nextOverlay = constrainOverlay(current.overlay)
      if (
        nextOverlay.x !== current.overlay.x ||
        nextOverlay.y !== current.overlay.y ||
        nextOverlay.width !== current.overlay.width ||
        nextOverlay.height !== current.overlay.height
      ) {
        void persist({ overlay: nextOverlay })
      }
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest('input, textarea, select, button')) {
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

  const hasMedia = Boolean(activeSession && mediaUrls.reaction && mediaUrls.movie)
  const canPlay = hasMedia && metadataReady.reaction && metadataReady.movie
  const isPlaying = syncState === 'playing'
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
  const shouldAutoHideControls = isPlaying && !setupMode

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

  const openVideos = async (): Promise<void> => {
    setError(null)
    const result = await window.watchAlong.openVideos()
    if (!result) {
      return
    }

    const nextSession = commitLibrary(result.library)
    setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)
    await refreshMediaUrls(nextSession?.id ?? null)
  }

  const switchSession = async (sessionId: string): Promise<void> => {
    if (sessionId === activeSession?.id) {
      return
    }

    controllerRef.current?.pause()
    setSyncState('paused')
    const next = await window.watchAlong.setActiveSession(sessionId)
    const nextSession = commitLibrary(next)
    setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)
    await refreshMediaUrls(nextSession?.id ?? null)
  }

  const renameSession = async (sessionId: string): Promise<void> => {
    const current = library.sessions.find((item) => item.id === sessionId)
    const title = window.prompt('Rename watch history item', current?.title ?? '')
    if (!title?.trim()) {
      return
    }

    commitLibrary(await window.watchAlong.renameSession(sessionId, title.trim()))
  }

  const deleteSession = async (sessionId: string): Promise<void> => {
    if (!window.confirm('Remove this watch history item? Local video files will not be deleted.')) {
      return
    }

    const next = await window.watchAlong.deleteSession(sessionId)
    const nextSession = commitLibrary(next)
    setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
    setMoviePosition(0)
    await refreshMediaUrls(nextSession?.id ?? null)
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
    setDurations((current) => ({ ...current, [role]: element?.duration ?? Number.NaN }))
    setMetadataReady((current) => ({ ...current, [role]: true }))
    setSetupPositions((current) => ({ ...current, [role]: element?.currentTime ?? 0 }))
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

  const enterSyncSetup = (): void => {
    if (!canPlay) {
      return
    }

    controllerRef.current?.pause()
    reactionVideoRef.current?.pause()
    movieVideoRef.current?.pause()
    setSetupPlayingRole(null)
    setSetupPositions({
      reaction: reactionVideoRef.current?.currentTime ?? position,
      movie: movieVideoRef.current?.currentTime ?? 0
    })
    setSetupMode(true)
  }

  const cancelSyncSetup = (): void => {
    reactionVideoRef.current?.pause()
    movieVideoRef.current?.pause()
    setSetupPlayingRole(null)
    setSetupMode(false)
    controllerRef.current?.setSetupMode(false)
    controllerRef.current?.loadSession(reactionVideoRef.current?.currentTime ?? position)
  }

  const saveSyncSetup = async (): Promise<void> => {
    const reaction = reactionVideoRef.current
    const movie = movieVideoRef.current
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
    const element = role === 'reaction' ? reactionVideoRef.current : movieVideoRef.current
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

    const active = role === 'reaction' ? reactionVideoRef.current : movieVideoRef.current
    const other = role === 'reaction' ? movieVideoRef.current : reactionVideoRef.current
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
    <main className={`app-shell ${controlsIdle ? 'controls-idle' : ''}`}>
      <video
        ref={reactionVideoRef}
        className="reaction-video"
        playsInline
        preload="metadata"
        onLoadedMetadata={() => handleMetadata('reaction')}
        onTimeUpdate={() => handleTimeUpdate('reaction')}
        onError={() => handleVideoError('reaction')}
      />

      {!hasMedia && (
        <section className="empty-state" aria-label="Open videos">
          <h1>WatchAlong</h1>
          <button className="primary-button" type="button" onClick={openVideos}>
            <FolderOpen size={18} aria-hidden />
            Open videos
          </button>
        </section>
      )}

      {hasMedia && (
        <PipOverlay
          geometry={session.overlay}
          videoRef={movieVideoRef}
          hidden={session.isPipHidden}
          onChange={updateOverlay}
          onCommit={commitOverlay}
          onHide={() => void persist({ isPipHidden: true })}
          onLoadedMetadata={() => handleMetadata('movie')}
          onTimeUpdate={() => handleTimeUpdate('movie')}
          onVideoError={() => handleVideoError('movie')}
          subtitleText={activeSubtitle?.text}
        />
      )}

      {hasMedia && session.isPipHidden && (
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

      <section className={`control-bar ${controlsIdle ? 'control-bar-hidden' : ''}`} aria-label="Playback controls">
        {library.sessions.length > 0 && (
          <LibraryPanel
            library={library}
            activeSessionId={activeSession?.id ?? null}
            onSwitch={(sessionId) => void switchSession(sessionId)}
            onRename={(sessionId) => void renameSession(sessionId)}
            onDelete={(sessionId) => void deleteSession(sessionId)}
          />
        )}

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
          <button className="icon-button" type="button" title="Open videos" aria-label="Open videos" onClick={openVideos}>
            <FolderOpen size={19} aria-hidden />
          </button>
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
        {error && <div className="error-banner">{error}</div>}
      </section>
    </main>
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
