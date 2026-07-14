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
  RefreshCw,
  RotateCcw,
  RotateCw,
  Settings,
  SlidersHorizontal,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
  AppPreferences,
  DownloadProgressEvent,
  ImportWizardLaunchOptions,
  LibrarySession,
  MediaRole,
  OverlayGeometry,
  PlaybackRate,
  ReactorSource
} from '@shared/types'
import { AutoSyncRollIn } from './AutoSyncRollIn'
import { CommandPanel } from './CommandPanel'
import { LibraryHome } from './LibraryHome'
import { DownloadIndicator, SetupScrubber, StreamVolume } from './PlayerControls'
import { PipOverlay } from './PipOverlay'
import { DeleteSessionDialog, existingReactorNames, RenameSessionDialog } from './SessionDialogs'
import type { RenameSessionFocus } from './SessionDialogs'
import { PatreonStorageOffer, SmartReactionInput } from './SmartReactionInput'
import type { DownloadedReactionMetadata } from './SmartReactionInput'
import { MissingMediaRecovery, StartupErrorState, WelcomeOverlay } from './StartupViews'
import { fileName, formatFps, formatRateDriftPerHour, formatRatePercent, formatTime, signedSeconds } from './appFormat'
import type { DownloadsHook } from '../hooks/useDownloads'
import type { PlaybackHook } from '../hooks/usePlayback'
import type { SessionHook } from '../hooks/useSession'
import type { useAutoSync } from '../hooks/useAutoSync'
import { manualMovieSourceRates, playbackRates, reactorSourceOptions } from '../hooks/playerTiming'
import type { MoviePosterActionResult } from '../moviePosterActions'

const MOVIE_WINDOW_UNRESPONSIVE_MESSAGE =
  'The movie window stopped responding. It has been moved back to the main window. You can pop it out again from the PiP toolbar.'

export interface WatchAlongViewActions {
  loadInitialState: () => Promise<void>
  revealLibraryRecoveryFile: () => Promise<void>
  startFreshLibraryAfterRecovery: () => Promise<void>
  openStartupLibrary: () => Promise<void>
  openImportWizard: (options?: ImportWizardLaunchOptions) => Promise<void>
  switchSession: (sessionId: string) => Promise<void>
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
  popOutMovie: (geometryMode?: 'overlay' | 'screen') => Promise<void>
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
  syncNow: () => void
  openSubtitle: () => Promise<void>
  toggleFullscreen: () => void
  toggleReactionFullscreen: () => void
  toggleCommandPanel: (returnFocusTarget?: HTMLElement | null) => void
  setReactionVolume: (value: number) => void
  setMovieVolume: (value: number) => void
  toggleReactionMute: () => void
  toggleMovieMute: () => void
  setPlaybackRate: (playbackRate: PlaybackRate) => void
  detectSyncAgain: () => Promise<void>
  setReactorSource: (reactorSource: ReactorSource) => Promise<void>
  setMovieRateCorrection: (movieRateCorrection: number) => Promise<void>
  clearSubtitle: () => Promise<void>
  closeCommandPanel: () => void
  attachDownloadedReaction: (event: DownloadProgressEvent) => Promise<void>
  updatePreference: <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => Promise<void>
  chooseDownloadDirectory: () => Promise<void>
  forgetPatreonSession: () => Promise<void>
  cancelRenameSession: () => void
  confirmRenameSession: () => Promise<void>
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
  missingMediaRoles: MediaRole[]
  hasMedia: boolean
  movieReady: boolean
  showSmartInput: boolean
  hasMissingMedia: boolean
  canPlay: boolean
  isPlaying: boolean
  reactionDuration: number
  autoSyncBusy: boolean
  displayOffset: string
  effectiveOffset: number
  movieStartsAtReaction: number
  reactorSourceSummary: string
  detectedMovieRateCorrection: number | null
  autoSyncRollInSessionId: string | null
  autoSyncRollInFinalizing: boolean
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
  missingMediaRoles,
  hasMedia,
  movieReady,
  showSmartInput,
  hasMissingMedia,
  canPlay,
  isPlaying,
  reactionDuration,
  autoSyncBusy,
  displayOffset,
  effectiveOffset,
  movieStartsAtReaction,
  reactorSourceSummary,
  detectedMovieRateCorrection,
  autoSyncRollInSessionId,
  autoSyncRollInFinalizing,
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
    controlsIdle,
    syncState,
    error,
    viewTransitioning,
    movieWindowActive
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
    renameReactorDraft,
    setRenameReactorDraft,
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
  const pipControlLabel = movieWindowActive
    ? 'Return movie to player'
    : session.isPipHidden ? 'Show movie' : 'Hide movie'

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
        onDoubleClick={actions.toggleReactionFullscreen}
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
          onOpenCommandPanel={() => actions.toggleCommandPanel()}
          onNew={() => void actions.openImportWizard({ mode: 'new' })}
          onOpenSession={(sessionId) => void actions.switchSession(sessionId)}
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

      {hasMedia && (
        <PipOverlay
          geometry={session.overlay}
          videoRef={movieVideoRef}
          hidden={movieWindowActive ? false : session.isPipHidden}
          poppedOut={movieWindowActive}
          onChange={actions.updateOverlay}
          onCommit={actions.commitOverlay}
          onHide={() => void actions.persist({ isPipHidden: true })}
          onPopOut={() => void actions.popOutMovie('overlay')}
          onPopIn={() => void actions.popInMovie()}
          onLoadedMetadata={() => actions.handleMetadata('movie')}
          onTimeUpdate={() => actions.handleTimeUpdate('movie')}
          onVideoError={(video) => actions.handleVideoError('movie', video)}
          subtitleText={activeSubtitleText ?? undefined}
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

      {appView === 'player' && (
        <section className={`control-bar ${controlsIdle && !playbackSettingsOpen ? 'control-bar-hidden' : ''}`} aria-label="Playback controls">
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

          <div className="control-row">
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
            <button className="icon-button" type="button" title="Back 5 seconds" aria-label="Back 5 seconds" disabled={!canPlay} onClick={() => actions.seekBy(-5)}>
              <RotateCcw size={18} aria-hidden />
            </button>
            <button className="icon-button" type="button" title="Forward 5 seconds" aria-label="Forward 5 seconds" disabled={!canPlay} onClick={() => actions.seekBy(5)}>
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
              onChange={(event) => actions.seekTo(Number(event.currentTarget.value))}
            />
            <span className={`status-pill status-${syncState}`} aria-label={`Playback status: ${syncState}`}>
              {syncState}
            </span>
            <button
              className="icon-button"
              type="button"
              title={pipControlLabel}
              aria-label={pipControlLabel}
              disabled={!hasMedia}
              onClick={() => {
                if (movieWindowActive) void actions.popInMovie()
                else actions.togglePipVisibility()
              }}
            >
              <PictureInPicture2 size={18} aria-hidden />
            </button>
            <button
              className="icon-button"
              type="button"
              title={fullscreenActive ? 'Exit fullscreen' : 'Fullscreen'}
              aria-label={fullscreenActive ? 'Exit fullscreen' : 'Fullscreen'}
              aria-pressed={fullscreenActive}
              onClick={actions.toggleFullscreen}
            >
              {fullscreenActive ? <Minimize size={18} aria-hidden /> : <Maximize size={18} aria-hidden />}
            </button>
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
                  <span>Auto-sync handles timing for most sessions.</span>
                </header>
                <div className="playback-settings-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!canPlay}
                    onClick={() => {
                      closePlaybackSettings()
                      actions.syncNow()
                    }}
                  >
                    {setupMode ? <RefreshCw size={16} aria-hidden /> : <SlidersHorizontal size={16} aria-hidden />}
                    Sync Setup
                  </button>
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
                    Subtitles
                  </button>
                  {session.subtitlePath && (
                    <button className="mini-button subtitle-clear" type="button" onClick={() => void actions.clearSubtitle()}>
                      <X size={14} aria-hidden />
                      {fileName(session.subtitlePath)}
                    </button>
                  )}
                </div>

                <div className="playback-options">
                  <div className="speed-control" role="group" aria-label="Playback speed">
                    {playbackRates.map((rate) => (
                      <button
                        key={rate}
                        className={rate === session.playbackRate ? 'speed-active' : ''}
                        type="button"
                        disabled={!activeSession || autoSyncBusy}
                        onClick={() => actions.setPlaybackRate(rate)}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                  <details className="timing-settings">
                    <summary className="timing-summary">
                      <span className="timing-summary-label">Timing</span>
                      <span className="timing-summary-value">
                        {session.timingOrigin === 'automatic' ? 'Automatically measured' : reactorSourceSummary}
                      </span>
                      <span className="timing-summary-detail">
                        {session.timingOrigin === 'automatic'
                          ? `${Math.round((session.autoSyncConfidence ?? 0) * 100)}% confidence / ${formatRatePercent(session.movieRateCorrection)}`
                          : detectedMovieRateCorrection !== null
                            ? `Detected movie ${formatFps(session.detectedMovieFps)} fps / ${formatRatePercent(detectedMovieRateCorrection)}`
                            : 'Manual movie rate'}
                      </span>
                    </summary>
                    <div className="timing-settings-body">
                      <div className="timing-session-details" aria-label="Session timing details">
                        {session.timingOrigin === 'automatic' && (
                          <span className="automatic-timing-detail">
                            Automatically measured locally · {Math.round((session.autoSyncConfidence ?? 0) * 100)}% confidence
                          </span>
                        )}
                        <span>{session.reactionPath ? fileName(session.reactionPath) : 'No reaction file'}</span>
                        <span>{session.moviePath ? fileName(session.moviePath) : 'No movie file'}</span>
                        <span>
                          Offset {displayOffset} / effective {signedSeconds(effectiveOffset)} / movie at {formatTime(movieStartsAtReaction)}
                        </span>
                      </div>
                      <button
                        className="secondary-button detect-sync-button"
                        type="button"
                        disabled={!activeSession?.moviePath || !activeSession.reactionPath || Boolean(autoSync.runningSessionId)}
                        onClick={() => void actions.detectSyncAgain()}
                      >
                        {autoSync.runningSessionId ? <Loader2 size={14} aria-hidden className="spin" /> : <RefreshCw size={14} aria-hidden />}
                        {autoSync.runningSessionId ? autoSync.progress.message : 'Find Sync Again'}
                      </button>
                      <div className="source-rate-control" role="group" aria-label="Reactor source">
                        <span>Reactor source</span>
                        {reactorSourceOptions.map((option) => (
                          <button
                            key={option.source}
                            className={option.source === session.reactorSource ? 'speed-active' : ''}
                            type="button"
                            disabled={!activeSession || autoSyncBusy}
                            onClick={() => void actions.setReactorSource(option.source)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      {detectedMovieRateCorrection !== null ? (
                        <span className="source-rate-detail">
                          Detected movie {formatFps(session.detectedMovieFps)} fps / correction{' '}
                          {formatRatePercent(detectedMovieRateCorrection)} / {formatRateDriftPerHour(detectedMovieRateCorrection)}
                        </span>
                      ) : (
                        <div className="source-rate-control manual-rate-control" role="group" aria-label="Manual movie rate">
                          <span>Manual movie rate</span>
                          {manualMovieSourceRates.map((option) => (
                            <button
                              key={option.rate}
                              className={Math.abs(option.rate - session.movieRateCorrection) < 0.000001 ? 'speed-active' : ''}
                              type="button"
                              disabled={!activeSession || autoSyncBusy}
                              onClick={() => void actions.setMovieRateCorrection(option.rate)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              </div>
            </details>
            <button
              className="icon-button command-panel-gear"
              ref={commandPanelButtonRef}
              type="button"
              title="Command Panel"
              aria-label="Command Panel"
              onClick={() => {
                closePlaybackSettings()
                actions.toggleCommandPanel(commandPanelButtonRef.current)
              }}
            >
              <Settings size={18} aria-hidden />
            </button>
          </div>

          <div className="control-meta" aria-label="Volume controls">
            <div className="volume-bank">
              <StreamVolume
                label="Reaction"
                volume={session.reactionVolume}
                muted={session.isReactionMuted}
                disabled={autoSyncBusy}
                onVolume={actions.setReactionVolume}
                onMute={actions.toggleReactionMute}
              />
              <StreamVolume
                label="Movie"
                volume={session.movieVolume}
                muted={session.isMovieMuted}
                disabled={autoSyncBusy}
                onVolume={actions.setMovieVolume}
                onMute={actions.toggleMovieMute}
              />
            </div>
          </div>
          {error && (
            <div className="error-banner">
              {error === MOVIE_WINDOW_UNRESPONSIVE_MESSAGE && <ExternalLink size={15} aria-hidden />}
              <span>{error}</span>
            </div>
          )}
        </section>
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
          expandedSection={expandedPanelSection}
          onExpandedSection={setExpandedPanelSection}
          onClose={actions.closeCommandPanel}
          onSyncSetup={actions.syncNow}
          onSwapReaction={() => void actions.openImportWizard({ mode: 'swap-reaction', sessionId: activeSession?.id ?? null })}
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

      {renameTargetId && (
        <RenameSessionDialog
          title={renameDraft}
          onTitleChange={setRenameDraft}
          reactorName={renameReactorDraft}
          onReactorNameChange={setRenameReactorDraft}
          reactorOptions={existingReactorNames(library.sessions)}
          initialFocus={renameInitialFocus}
          onCancel={actions.cancelRenameSession}
          onConfirm={() => void actions.confirmRenameSession()}
        />
      )}

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
