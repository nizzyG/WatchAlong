import {
  Captions,
  Check,
  ExternalLink,
  Eye,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  SlidersHorizontal,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
  AudioTrackPreference,
  AppPreferences,
  DownloadProgressEvent,
  ImportWizardLaunchOptions,
  LibrarySession,
  MediaRole,
  OverlayGeometry,
  PlaybackRate,
  ReactorAssignmentRequest,
  ReactorSource
} from '@shared/types'
import { AutoSyncRollIn } from './AutoSyncRollIn'
import { AudioTrackSelector } from './AudioTrackSelector'
import { CommandPanel } from './CommandPanel'
import { LibraryHome } from './LibraryHome'
import { DownloadIndicator, SetupScrubber, StreamVolume } from './PlayerControls'
import { PipOverlay } from './PipOverlay'
import { DeleteSessionDialog, EditReactorDialog, RenameSessionDialog } from './SessionDialogs'
import type { RenameSessionFocus } from './SessionDialogs'
import { PatreonStorageOffer, SmartReactionInput } from './SmartReactionInput'
import type { DownloadedReactionMetadata } from './SmartReactionInput'
import { MissingMediaRecovery, StartupErrorState, WelcomeOverlay } from './StartupViews'
import { fileName, formatTime, signedSeconds } from './appFormat'
import type { DownloadsHook } from '../hooks/useDownloads'
import type { PlaybackHook } from '../hooks/usePlayback'
import { usePlayerOsd } from '../hooks/usePlayerOsd'
import type { SessionHook } from '../hooks/useSession'
import type { useAutoSync } from '../hooks/useAutoSync'
import { playbackRates } from '../hooks/playerTiming'
import type { MoviePosterActionResult } from '../moviePosterActions'
import type { LibrarySessionStartIntent } from './libraryPlayback'

const MOVIE_WINDOW_UNRESPONSIVE_MESSAGE =
  'The movie window stopped responding, so the movie has been brought back into the player.'

export interface WatchAlongViewActions {
  loadInitialState: () => Promise<void>
  revealLibraryRecoveryFile: () => Promise<void>
  startFreshLibraryAfterRecovery: () => Promise<void>
  openStartupLibrary: () => Promise<void>
  openImportWizard: (options?: ImportWizardLaunchOptions) => Promise<void>
  switchSession: (sessionId: string) => Promise<void>
  openLibrarySession: (sessionId: string, intent: LibrarySessionStartIntent) => Promise<void>
  chooseMoviePoster: (sessionId: string) => Promise<MoviePosterActionResult>
  clearMoviePoster: (sessionId: string) => Promise<MoviePosterActionResult>
  requestRenameSession: (sessionId: string, initialFocus?: RenameSessionFocus, returnFocusTarget?: HTMLElement | null) => void
  requestDeleteSession: (sessionId: string, returnToLibrary?: boolean, returnFocusTarget?: HTMLElement | null) => void
  openLocalReaction: () => Promise<void>
  handleDownloadedReaction: (filePath: string, metadata: DownloadedReactionMetadata) => Promise<void>
  navigateToLibrary: () => Promise<void>
  locateMissingMedia: (role: MediaRole) => Promise<void>
  updateOverlay: (overlay: OverlayGeometry) => void
  commitOverlay: (overlay: OverlayGeometry) => void
  persist: (patch: Partial<LibrarySession>) => Promise<LibrarySession | null>
  popOutMovie: () => Promise<void>
  popInMovie: () => Promise<void>
  togglePipVisibility: () => void
  handleMetadata: (role: MediaRole) => void
  handleTimeUpdate: (role: MediaRole) => void
  handleVideoError: (role: MediaRole, video: HTMLVideoElement) => void
  cancelSyncSetup: () => void
  saveSyncSetup: () => Promise<void>
  toggleSetupPreview: (role: MediaRole) => Promise<void>
  setIndependentSetupTime: (role: MediaRole, time: number) => void
  nudgeSetupTime: (role: MediaRole, deltaSeconds: number) => void
  togglePlayPause: () => void
  seekBy: (deltaSeconds: number) => void
  seekTo: (value: number) => void
  enterSyncSetup: () => void
  openSubtitle: () => Promise<void>
  toggleFullscreen: () => void
  toggleCommandPanel: (returnFocusTarget?: HTMLElement | null) => void
  setReactionVolume: (value: number) => void
  setMovieVolume: (value: number) => void
  toggleReactionMute: () => void
  toggleMovieMute: () => void
  selectMovieAudioTrack: (preference: AudioTrackPreference) => Promise<boolean>
  setPlaybackRate: (playbackRate: PlaybackRate) => void
  detectSyncAgain: () => Promise<void>
  nudgeOffset: (deltaSeconds: number) => Promise<void>
  setReactorSource: (reactorSource: ReactorSource) => Promise<void>
  setMovieRateCorrection: (movieRateCorrection: number) => Promise<void>
  clearSubtitle: () => Promise<void>
  toggleSubtitles: () => void
  closeCommandPanel: () => void
  attachDownloadedReaction: (event: DownloadProgressEvent) => Promise<void>
  updatePreference: <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => Promise<void>
  chooseDownloadDirectory: () => Promise<void>
  forgetPatreonSession: () => Promise<void>
  cancelRenameSession: () => void
  confirmRenameSession: () => Promise<void>
  confirmReactorAssignment: (assignment: ReactorAssignmentRequest) => Promise<void>
  cancelDeleteSession: () => void
  confirmDeleteSession: () => Promise<void>
  useManualSyncDuringRollIn: () => Promise<void>
  startWelcomeImport: () => void
}

interface WatchAlongViewProps {
  playback: PlaybackHook
  sessionState: SessionHook
  downloads: DownloadsHook
  autoSync: ReturnType<typeof useAutoSync>
  activeSession: LibrarySession | null
  session: LibrarySession
  activeSubtitleText: string | null
  subtitlesEnabled: boolean
  missingMediaRoles: MediaRole[]
  hasMedia: boolean
  movieReady: boolean
  showSmartInput: boolean
  hasMissingMedia: boolean
  canPlay: boolean
  isPlaying: boolean
  reactionDuration: number
  autoSyncBusy: boolean
  autoSyncRollInSessionId: string | null
  autoSyncRollInFinalizing: boolean
  appVersion: string | null
  actions: WatchAlongViewActions
}

export function WatchAlongView({
  playback,
  sessionState,
  downloads,
  autoSync,
  activeSession,
  session,
  activeSubtitleText,
  subtitlesEnabled,
  missingMediaRoles,
  hasMedia,
  movieReady,
  showSmartInput,
  hasMissingMedia,
  canPlay,
  isPlaying,
  reactionDuration,
  autoSyncBusy,
  autoSyncRollInSessionId,
  autoSyncRollInFinalizing,
  appVersion,
  actions
}: WatchAlongViewProps): JSX.Element {
  const {
    reactionVideoRef,
    movieVideoRef,
    durations,
    position,
    setupMode,
    setupPositions,
    setupPlayingRole,
    syncState,
    error,
    viewTransitioning,
    movieWindowActive,
    movieAudioTrackSnapshot,
    movieAudioTrackChanging
  } = playback
  const {
    appShellRef,
    commandPanelButtonRef,
    library,
    preferences,
    appView,
    startupError, startupRecoveryAvailable,
    showWelcome,
    setShowWelcome,
    wizardDimmed,
    commandPanelOpen,
    expandedPanelSection,
    setExpandedPanelSection,
    patreonStatus,
    renameTargetId,
    renameInitialFocus,
    renameDraft,
    setRenameDraft,
    deleteTarget
  } = sessionState
  const {
    patreonStorageJobId,
    setPatreonStorageJobId,
    downloadIndicator,
    downloadEvents
  } = downloads
  const [fullscreenActive, setFullscreenActive] = useState(Boolean(document.fullscreenElement))
  const [playbackSettingsOpen, setPlaybackSettingsOpen] = useState(false)
  const playbackSettingsRef = useRef<HTMLDetailsElement>(null)
  const playerOsd = usePlayerOsd({
    active: appView === 'player' && hasMedia,
    suspended: commandPanelOpen || wizardDimmed,
    forceVisible: setupMode || playbackSettingsOpen
  })
  const movieWindowControlLabel = movieWindowActive ? 'Bring movie back' : 'Pop out movie'
  const activeAutoSyncRunning = autoSync.runningSessionId === activeSession?.id

  const toggleMovieWindow = (): void => {
    if (movieAudioTrackChanging) return
    if (movieWindowActive) void actions.popInMovie()
    else void actions.popOutMovie()
  }

  const closePlaybackSettings = (restoreFocus = false): void => {
    setPlaybackSettingsOpen(false)
    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        playbackSettingsRef.current?.querySelector<HTMLElement>('summary')?.focus()
      })
    }
  }

  useEffect(() => {
    const updateFullscreenState = (): void => setFullscreenActive(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', updateFullscreenState)
    return () => document.removeEventListener('fullscreenchange', updateFullscreenState)
  }, [])

  useEffect(() => {
    if (!playbackSettingsOpen) return

    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && !playbackSettingsRef.current?.contains(event.target)) {
        closePlaybackSettings()
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [playbackSettingsOpen])

  useEffect(() => {
    if (playbackSettingsOpen && (appView !== 'player' || commandPanelOpen)) {
      setPlaybackSettingsOpen(false)
    }
  }, [appView, commandPanelOpen, playbackSettingsOpen])

  useEffect(() => {
    if (setupMode && commandPanelOpen) actions.closeCommandPanel()
  }, [commandPanelOpen, setupMode])

  return (
    <main
      ref={appShellRef}
      tabIndex={-1}
      className={`app-shell view-${appView} ${appView === 'player' && hasMedia && !playerOsd.visible && !commandPanelOpen && !wizardDimmed ? 'controls-idle' : ''} ${wizardDimmed ? 'wizard-dimmed' : ''} ${commandPanelOpen ? 'command-panel-active' : ''} ${viewTransitioning ? 'view-transitioning' : ''}`}
    >
      <video
        ref={reactionVideoRef}
        className="reaction-video"
        playsInline
        preload="metadata"
        onDoubleClick={actions.toggleFullscreen}
        onLoadedMetadata={() => actions.handleMetadata('reaction')}
        onTimeUpdate={() => actions.handleTimeUpdate('reaction')}
        onError={(event) => actions.handleVideoError('reaction', event.currentTarget)}
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
          recoveryAvailable={startupRecoveryAvailable}
          onRetry={() => void actions.loadInitialState()}
          onShowRecovery={() => void actions.revealLibraryRecoveryFile()}
          onStartFresh={() => void actions.startFreshLibraryAfterRecovery()}
        />
      )}

      {appView === 'library' && (
        <LibraryHome
          library={library}
          view={preferences.libraryView}
          onViewChange={(view) => void actions.updatePreference('libraryView', view)}
          fullscreenActive={fullscreenActive}
          onToggleFullscreen={actions.toggleFullscreen}
          onOpenCommandPanel={() => actions.toggleCommandPanel()}
          onNew={() => void actions.openImportWizard({ mode: 'new' })}
          onOpenSession={(sessionId, intent) => void actions.openLibrarySession(sessionId, intent)}
          onChoosePoster={actions.chooseMoviePoster}
          onClearPoster={actions.clearMoviePoster}
          onRename={(sessionId, returnFocusTarget) => actions.requestRenameSession(sessionId, 'title', returnFocusTarget)}
          onEditReactor={(sessionId, returnFocusTarget) => actions.requestRenameSession(sessionId, 'reactor', returnFocusTarget)}
          onDelete={(sessionId, returnFocusTarget) => actions.requestDeleteSession(sessionId, false, returnFocusTarget)}
        />
      )}

      {appView === 'player' && showSmartInput && (
        <div className="smart-input-overlay">
          <SmartReactionInput
            movieReady={movieReady}
            onSelectLocal={actions.openLocalReaction}
            onDownloaded={actions.handleDownloadedReaction}
          />
        </div>
      )}

      {appView === 'player' && hasMissingMedia && activeSession && (
        <MissingMediaRecovery
          session={activeSession}
          missingRoles={missingMediaRoles}
          onBackToLibrary={() => void actions.navigateToLibrary()}
          onLocate={(role) => void actions.locateMissingMedia(role)}
          onRemoveSession={() => actions.requestDeleteSession(activeSession.id, true)}
        />
      )}

      {hasMedia && !movieWindowActive && (
        <PipOverlay
          geometry={session.overlay}
          videoRef={movieVideoRef}
          hidden={session.isPipHidden}
          onChange={actions.updateOverlay}
          onCommit={actions.commitOverlay}
          onHide={() => void actions.persist({ isPipHidden: true })}
          onPopOut={toggleMovieWindow}
          onLoadedMetadata={() => actions.handleMetadata('movie')}
          onTimeUpdate={() => actions.handleTimeUpdate('movie')}
          onVideoError={(video) => actions.handleVideoError('movie', video)}
          subtitleText={activeSubtitleText ?? undefined}
          osdTop={playerOsd.osdTop}
        />
      )}

      {hasMedia && session.isPipHidden && !movieWindowActive && (
        <button
          className="floating-show-pip icon-button"
          type="button"
          title="Show movie"
          aria-label="Show movie"
          onClick={() => void actions.persist({ isPipHidden: false })}
        >
          <Eye size={18} aria-hidden />
        </button>
      )}

      {appView === 'player' && hasMedia && (
        <section
          ref={playerOsd.osdRef}
          className={`control-bar player-osd ${playerOsd.visible ? '' : 'control-bar-hidden'}`}
          aria-label="Playback controls"
          {...playerOsd.interactionProps}
        >
          {hasMedia && setupMode && (
            <div className="setup-panel" aria-label="Sync setup">
              <div className="setup-header">
                <div>
                  <strong>Sync setup</strong>
                  <span>Offset preview {signedSeconds(setupPositions.movie - setupPositions.reaction)}</span>
                </div>
                <div className="setup-actions">
                  <button className="secondary-button" type="button" onClick={actions.cancelSyncSetup}>
                    <X size={16} aria-hidden />
                    Cancel
                  </button>
                  <button className="primary-button setup-save" type="button" onClick={() => void actions.saveSyncSetup()}>
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
                onTogglePlay={() => void actions.toggleSetupPreview('reaction')}
                onSeek={(time) => actions.setIndependentSetupTime('reaction', time)}
                onNudge={(delta) => actions.nudgeSetupTime('reaction', delta)}
              />
              <SetupScrubber
                role="movie"
                label="Movie frame"
                time={setupPositions.movie}
                duration={Number.isFinite(durations.movie) ? durations.movie : 0}
                playing={setupPlayingRole === 'movie'}
                onTogglePlay={() => void actions.toggleSetupPreview('movie')}
                onSeek={(time) => actions.setIndependentSetupTime('movie', time)}
                onNudge={(delta) => actions.nudgeSetupTime('movie', delta)}
              />
            </div>
          )}

          <div className="osd-timeline-row">
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
              aria-valuetext={`${formatTime(position)} of ${formatTime(reactionDuration)}`}
              onChange={(event) => actions.seekTo(Number(event.currentTarget.value))}
            />
            <span className={`status-pill status-${syncState}`} aria-label={`Playback status: ${syncState}`}>
              {syncState}
            </span>
          </div>

          <div className="control-row">
            <div className="osd-control-group osd-transport-group" role="group" aria-label="Transport">
              <span className="osd-group-label">Transport</span>
              <button className="icon-button" type="button" title="Back 5 seconds" aria-label="Back 5 seconds" disabled={!canPlay} onClick={() => actions.seekBy(-5)}>
                <RotateCcw size={18} aria-hidden />
              </button>
              <button
                className="transport-button"
                type="button"
                title={isPlaying ? 'Pause' : 'Play'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                disabled={!canPlay}
                onClick={actions.togglePlayPause}
              >
                {isPlaying ? <Pause size={22} aria-hidden /> : <Play size={22} aria-hidden />}
              </button>
              <button className="icon-button" type="button" title="Forward 5 seconds" aria-label="Forward 5 seconds" disabled={!canPlay} onClick={() => actions.seekBy(5)}>
                <RotateCw size={18} aria-hidden />
              </button>
            </div>

            <div className="osd-control-group osd-stream-group osd-reaction-group" role="group" aria-label="Reaction audio">
              <StreamVolume
                label="Reaction"
                volume={session.reactionVolume}
                muted={session.isReactionMuted}
                disabled={autoSyncBusy}
                onVolume={actions.setReactionVolume}
                onMute={actions.toggleReactionMute}
              />
            </div>

            <div className="osd-control-group osd-stream-group osd-movie-group" role="group" aria-label="Movie audio and subtitles">
              <StreamVolume
                label="Movie"
                volume={session.movieVolume}
                muted={session.isMovieMuted}
                disabled={autoSyncBusy}
                onVolume={actions.setMovieVolume}
                onMute={actions.toggleMovieMute}
              />
              <button
                className={`icon-button subtitle-toggle ${session.subtitlePath && subtitlesEnabled ? 'subtitle-toggle-active' : ''}`}
                type="button"
                title={session.subtitlePath
                  ? subtitlesEnabled ? 'Turn off movie subtitles' : 'Turn on movie subtitles'
                  : 'Choose movie subtitles'}
                aria-label={session.subtitlePath
                  ? subtitlesEnabled ? 'Turn off movie subtitles' : 'Turn on movie subtitles'
                  : 'Choose movie subtitles'}
                aria-pressed={session.subtitlePath ? subtitlesEnabled : undefined}
                disabled={!activeSession}
                onClick={() => {
                  if (session.subtitlePath) actions.toggleSubtitles()
                  else void actions.openSubtitle()
                }}
              >
                <Captions size={18} aria-hidden />
              </button>
              <AudioTrackSelector
                tracks={movieAudioTrackSnapshot.tracks}
                selected={movieAudioTrackSnapshot.selected}
                changing={movieAudioTrackChanging}
                disabled={autoSyncBusy}
                onSelect={actions.selectMovieAudioTrack}
              />
            </div>

            <div className="osd-control-group osd-display-group" role="group" aria-label="Display">
              <span className="osd-group-label">Display</span>
              <button
                className={`icon-button movie-window-control ${movieWindowActive ? 'movie-window-control-active' : ''}`}
                type="button"
                title={movieWindowControlLabel}
                aria-label={movieWindowControlLabel}
                aria-pressed={movieWindowActive}
                disabled={!hasMedia || movieAudioTrackChanging}
                onClick={toggleMovieWindow}
              >
                {movieWindowActive
                  ? <PictureInPicture2 size={18} aria-hidden />
                  : <ExternalLink size={18} aria-hidden />}
              </button>
              <button
                className="icon-button"
                type="button"
                title={fullscreenActive ? 'Exit fullscreen' : 'Fullscreen'}
                aria-label={fullscreenActive ? 'Exit fullscreen' : 'Fullscreen'}
                aria-keyshortcuts="Alt+Enter"
                aria-pressed={fullscreenActive}
                onClick={actions.toggleFullscreen}
              >
                {fullscreenActive ? <Minimize size={18} aria-hidden /> : <Maximize size={18} aria-hidden />}
              </button>
            </div>

            <div className="osd-control-group osd-utility-group" role="group" aria-label="Player options">
            <details
              ref={playbackSettingsRef}
              className="playback-settings"
              open={playbackSettingsOpen}
              onToggle={(event) => setPlaybackSettingsOpen(event.currentTarget.open)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return
                event.preventDefault()
                event.stopPropagation()
                closePlaybackSettings(true)
              }}
            >
              <summary
                className="icon-button playback-settings-summary"
                title="Playback settings"
                aria-label="Playback settings"
                aria-expanded={playbackSettingsOpen}
              >
                <SlidersHorizontal size={18} aria-hidden />
              </summary>
              <div className="playback-settings-body">
                <header className="playback-settings-header">
                  <strong>Playback settings</strong>
                </header>

                <div className="playback-setting-row playback-subtitle-setting">
                  <span className="playback-setting-copy">
                    <strong>Movie subtitles</strong>
                    <small title={session.subtitlePath ?? undefined}>
                      {session.subtitlePath
                        ? `${fileName(session.subtitlePath)} · ${subtitlesEnabled ? 'On' : 'Off'}`
                        : 'No file selected'}
                    </small>
                  </span>
                  <div className="playback-setting-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={!activeSession}
                      onClick={() => {
                        closePlaybackSettings()
                        void actions.openSubtitle()
                      }}
                    >
                      <Captions size={16} aria-hidden />
                      {session.subtitlePath ? 'Change' : 'Choose file'}
                    </button>
                    {session.subtitlePath && (
                      <button
                        className="icon-button playback-subtitle-remove"
                        type="button"
                        title="Remove subtitle file"
                        aria-label={`Remove subtitle file ${fileName(session.subtitlePath)}`}
                        onClick={() => void actions.clearSubtitle()}
                      >
                        <X size={15} aria-hidden />
                      </button>
                    )}
                  </div>
                </div>

                <div className="playback-setting-row playback-speed-setting">
                  <span className="playback-setting-copy">
                    <strong id="playback-speed-label">Playback speed</strong>
                    <small>Reaction and movie together</small>
                  </span>
                  <div className="speed-control" role="group" aria-labelledby="playback-speed-label">
                    {playbackRates.map((rate) => (
                      <button
                        key={rate}
                        className={rate === session.playbackRate ? 'speed-active' : ''}
                        type="button"
                        aria-pressed={rate === session.playbackRate}
                        disabled={!activeSession || autoSyncBusy}
                        onClick={() => actions.setPlaybackRate(rate)}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </details>
            <button
              className="icon-button command-panel-gear"
              ref={commandPanelButtonRef}
              type="button"
              title="Control Panel"
              aria-label="Control Panel"
              aria-keyshortcuts="Control+Comma Meta+Comma"
              onClick={() => {
                closePlaybackSettings()
                actions.toggleCommandPanel(commandPanelButtonRef.current)
              }}
            >
              <Settings size={18} aria-hidden />
            </button>
            </div>
          </div>
        </section>
      )}

      {appView === 'player' && error && (
        <div className="error-banner player-error-banner" role="alert">
          {error === MOVIE_WINDOW_UNRESPONSIVE_MESSAGE && <ExternalLink size={15} aria-hidden />}
          <span>{error}</span>
        </div>
      )}

      {(appView === 'library' || appView === 'player') && commandPanelOpen && (
        <CommandPanel
          activeSession={appView === 'player' ? activeSession : null}
          library={library}
          position={position}
          reactionDuration={reactionDuration}
          downloads={downloadEvents}
          preferences={preferences}
          patreonStatus={patreonStatus}
          appVersion={appVersion}
          expandedSection={expandedPanelSection}
          onExpandedSection={setExpandedPanelSection}
          onClose={actions.closeCommandPanel}
          onSyncSetup={() => {
            actions.closeCommandPanel()
            actions.enterSyncSetup()
          }}
          onFindSyncAgain={() => void actions.detectSyncAgain()}
          onNudgeOffset={(deltaSeconds) => void actions.nudgeOffset(deltaSeconds)}
          onReactorSource={(source) => void actions.setReactorSource(source)}
          onMovieRateCorrection={(rate) => void actions.setMovieRateCorrection(rate)}
          autoSyncBusy={autoSyncBusy}
          autoSyncRunning={activeAutoSyncRunning}
          autoSyncProgressMessage={autoSync.progress.message}
          onCloseSession={() => void actions.navigateToLibrary()}
          onSwitchSession={(sessionId) => void actions.switchSession(sessionId)}
          onViewLibrary={() => void actions.navigateToLibrary()}
          onNewSession={() => void actions.openImportWizard({ mode: 'new' })}
          onCancelDownload={(jobId) => void window.watchAlong.cancelDownload(jobId)}
          onAttachDownload={actions.attachDownloadedReaction}
          onPreference={actions.updatePreference}
          onChooseDownloadDirectory={() => void actions.chooseDownloadDirectory()}
          onForgetPatreon={() => void actions.forgetPatreonSession()}
          onShowWizard={() => void actions.openImportWizard({ mode: 'show-again' })}
        />
      )}

      {renameTargetId && renameInitialFocus === 'title' && (
        <RenameSessionDialog
          title={renameDraft}
          onTitleChange={setRenameDraft}
          onCancel={actions.cancelRenameSession}
          onConfirm={() => void actions.confirmRenameSession()}
        />
      )}

      {renameTargetId && renameInitialFocus === 'reactor' && (() => {
        const targetSession = library.sessions.find((item) => item.id === renameTargetId)
        return targetSession ? (
          <EditReactorDialog
            library={library}
            session={targetSession}
            onCancel={actions.cancelRenameSession}
            onConfirm={(assignment) => void actions.confirmReactorAssignment(assignment)}
          />
        ) : null
      })()}

      {deleteTarget && (
        <DeleteSessionDialog
          sessionTitle={library.sessions.find((item) => item.id === deleteTarget.sessionId)?.title ?? 'this watchalong'}
          onCancel={actions.cancelDeleteSession}
          onConfirm={() => void actions.confirmDeleteSession()}
        />
      )}

      {patreonStorageJobId && (
        <PatreonStorageOffer jobId={patreonStorageJobId} onDismiss={() => setPatreonStorageJobId(null)} />
      )}

      {autoSyncRollInSessionId && appView === 'player' && (
        <AutoSyncRollIn
          progress={autoSync.progress}
          finalizing={autoSyncRollInFinalizing}
          onUseManual={() => void actions.useManualSyncDuringRollIn()}
        />
      )}

      {downloadIndicator && !autoSyncRollInSessionId && <DownloadIndicator event={downloadIndicator} />}

      {showWelcome && appView !== 'loading' && appView !== 'startup-error' && (
        <WelcomeOverlay onGetStarted={actions.startWelcomeImport} onDismiss={() => setShowWelcome(false)} />
      )}

      {wizardDimmed && <div className="main-window-dim" aria-hidden />}
    </main>
  )
}
