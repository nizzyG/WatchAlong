import {
  Activity,
  Check,
  ChevronDown,
  Clapperboard,
  Clock3,
  Coffee,
  Download,
  ExternalLink,
  Gauge,
  LayoutGrid,
  Library as LibraryIcon,
  List,
  Loader2,
  Lock,
  Minus,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  X
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type {
  AppPreferences,
  DownloadProgressEvent,
  LibrarySession,
  ReactorSource,
  SavedPatreonSessionStatus,
  SessionLibrary
} from '@shared/types'
import { LibrarySessionCard } from './LibraryHome'
import { ReactionSourceIcon, reactionSourceLabel } from './ReactionSource'
import { fileName, formatFps, formatRatePercent, formatTime, signedSeconds } from './appFormat'
import { DownloadProgress } from './DownloadProgress'
import { keyboardShortcutHelpGroups } from '../keyboardShortcuts'
import { manualMovieSourceRates, reactorSourceOptions } from '../hooks/playerTiming'

export type CommandPanelSection = 'now-playing' | 'library' | 'downloads' | 'preferences' | 'help'

const APP_VERSION = '1.0.1'
const ONLINE_HELP_URL = 'https://github.com/nizzyG/WatchAlong#readme'
const DONATION_URL = 'https://ko-fi.com/watchalong'

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
  onFindSyncAgain(): void
  onNudgeOffset(deltaSeconds: number): void
  onReactorSource(source: ReactorSource): void
  onMovieRateCorrection(rate: number): void
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
  autoSyncBusy: boolean
  autoSyncRunning: boolean
  autoSyncProgressMessage: string
}

export function CommandPanel({
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
  onFindSyncAgain,
  onNudgeOffset,
  onReactorSource,
  onMovieRateCorrection,
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
  onShowWizard,
  autoSyncBusy,
  autoSyncRunning,
  autoSyncProgressMessage
}: CommandPanelProps): JSX.Element {
  const progress = reactionDuration > 0 ? Math.min(100, Math.max(0, (position / reactionDuration) * 100)) : 0
  const [showPatreonLearnMore, setShowPatreonLearnMore] = useState(false)
  const recentSessions = [...library.sessions]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 10)
  const showDownloads = downloads.length > 0

  return (
    <div className="command-panel-scrim" onMouseDown={onClose}>
      <aside
        className="command-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-panel-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="command-panel-titlebar">
          <strong id="command-panel-title">Command Panel</strong>
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

        <div className="command-panel-content" role="region" aria-label="Command Panel content" tabIndex={0}>
          {activeSession && (
            <SessionTimingPanel
              session={activeSession}
              autoSyncBusy={autoSyncBusy}
              autoSyncRunning={autoSyncRunning}
              autoSyncProgressMessage={autoSyncProgressMessage}
              onFindSyncAgain={onFindSyncAgain}
              onSyncSetup={onSyncSetup}
              onNudgeOffset={onNudgeOffset}
              onReactorSource={onReactorSource}
              onMovieRateCorrection={onMovieRateCorrection}
            />
          )}

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
              <div className="panel-cabinet-setting">
                <span className="panel-cabinet-copy">
                  <strong>Cabinet finish</strong>
                  <small>
                    {preferences.cabinetTheme === 'system'
                      ? 'Follows your system appearance'
                      : `Always use ${preferences.cabinetTheme === 'mahogany' ? 'Mahogany' : 'Oak'}`}
                  </small>
                </span>
                <div className="panel-cabinet-choices" role="group" aria-label="Cabinet finish">
                  <button
                    type="button"
                    aria-pressed={preferences.cabinetTheme === 'system'}
                    onClick={() => void onPreference('cabinetTheme', 'system')}
                  >
                    <span className="cabinet-swatch cabinet-swatch-system" aria-hidden />
                    <span>
                      <strong>System</strong>
                      <small>Follows computer</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={preferences.cabinetTheme === 'mahogany'}
                    onClick={() => void onPreference('cabinetTheme', 'mahogany')}
                  >
                    <span className="cabinet-swatch cabinet-swatch-mahogany" aria-hidden />
                    <span>
                      <strong>Mahogany</strong>
                      <small>Dim and rich</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={preferences.cabinetTheme === 'oak'}
                    onClick={() => void onPreference('cabinetTheme', 'oak')}
                  >
                    <span className="cabinet-swatch cabinet-swatch-oak" aria-hidden />
                    <span>
                      <strong>Oak</strong>
                      <small>Bright and natural</small>
                    </span>
                  </button>
                </div>
              </div>

              <div className="panel-setting-row">
                <span>
                  <strong>Reaction download location</strong>
                  <small>{preferences.reactionDownloadDirectory ?? 'Default: Videos\\WatchAlong\\Reactions'}</small>
                </span>
                <button className="secondary-button" type="button" onClick={onChooseDownloadDirectory}>
                  Change
                </button>
              </div>

              <div className="panel-toggle-row panel-patreon-storage">
                <span>
                  <strong>
                    <Lock size={14} aria-hidden />
                    Patreon saved session
                  </strong>
                  <small>{patreonStatus.available ? 'Saved' : 'Not saved'} / {patreonStatus.canEncrypt ? 'encrypted storage available' : 'encryption unavailable'}</small>
                  {showPatreonLearnMore && (
                    <small className="panel-learn-more">
                      Your Patreon session is used only for Patreon downloads. It never goes to a WatchAlong server or anyone besides Patreon, and it is saved on this device only if you choose.
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
              <section className="panel-shortcuts" aria-labelledby="keyboard-shortcuts-heading">
                <h3 id="keyboard-shortcuts-heading">Keyboard shortcuts</h3>
                {keyboardShortcutHelpGroups.map((group) => (
                  <div className="panel-shortcut-group" key={group.id}>
                    <h4>{group.label}</h4>
                    <dl>
                      {group.items.map((shortcut) => (
                        <div className="panel-shortcut-row" key={`${group.id}-${shortcut.label}`}>
                          <dt aria-label={shortcut.keys.join(shortcut.separator === 'or' ? ' or ' : ' plus ')}>
                            {shortcut.keys.map((key, index) => (
                              <span key={`${key}-${index}`}>
                                {index > 0 && (
                                  <span className="panel-shortcut-join" aria-hidden>
                                    {shortcut.separator === 'or' ? '/' : '+'}
                                  </span>
                                )}
                                <kbd>{key}</kbd>
                              </span>
                            ))}
                          </dt>
                          <dd>{shortcut.label}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
                <p>Playback shortcuts pause while you’re typing or using a control.</p>
              </section>
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
                title="Open https://ko-fi.com/watchalong"
                onClick={() => window.open(DONATION_URL, '_blank')}
              >
                <Coffee size={16} aria-hidden />
                Support the developer on Ko-fi
              </button>
            </div>
          </CommandPanelSection>
        </div>
      </aside>
    </div>
  )
}

function SessionTimingPanel({
  session,
  autoSyncBusy,
  autoSyncRunning,
  autoSyncProgressMessage,
  onFindSyncAgain,
  onSyncSetup,
  onNudgeOffset,
  onReactorSource,
  onMovieRateCorrection
}: {
  session: LibrarySession
  autoSyncBusy: boolean
  autoSyncRunning: boolean
  autoSyncProgressMessage: string
  onFindSyncAgain(): void
  onSyncSetup(): void
  onNudgeOffset(deltaSeconds: number): void
  onReactorSource(source: ReactorSource): void
  onMovieRateCorrection(rate: number): void
}): JSX.Element {
  const automatic = session.timingOrigin === 'automatic'
  const confidence = formatConfidence(session.autoSyncConfidence, automatic)
  const analyzedAt = formatAnalyzedAt(session.autoSyncAnalyzedAt)
  const canAnalyze = Boolean(session.moviePath && session.reactionPath)
  const timingLabel = autoSyncRunning ? 'Analyzing sync' : automatic ? 'Automatically synced' : 'Manual timing'
  const timingDescription = autoSyncRunning
    ? autoSyncProgressMessage
    : automatic
      ? 'WatchAlong measured this session locally and applied the result.'
      : 'This session is using timing adjusted by hand.'

  return (
    <section
      className={`panel-sync-overview panel-sync-${autoSyncRunning ? 'running' : session.timingOrigin}`}
      aria-labelledby="command-panel-timing-heading"
      data-timing-origin={session.timingOrigin}
    >
      <header className="panel-sync-status" aria-live="polite">
        <span className="panel-sync-status-icon" aria-hidden>
          {autoSyncRunning
            ? <Loader2 size={22} className="spin" />
            : automatic
              ? <ShieldCheck size={22} />
              : <SlidersHorizontal size={22} />}
        </span>
        <div>
          <small>Session timing</small>
          <h3 id="command-panel-timing-heading">{timingLabel}</h3>
          <span>{timingDescription}</span>
        </div>
      </header>

      {automatic && !autoSyncRunning && (
        <dl className="panel-sync-facts">
          <div>
            <Gauge size={17} aria-hidden />
            <dt>Confidence</dt>
            <dd>
              <strong>{confidence.value}</strong>
              <small>{confidence.label}</small>
            </dd>
          </div>
          <div>
            <Clock3 size={17} aria-hidden />
            <dt>Last analyzed</dt>
            <dd>
              {session.autoSyncAnalyzedAt
                ? <time dateTime={session.autoSyncAnalyzedAt} title={session.autoSyncAnalyzedAt}>{analyzedAt}</time>
                : <strong>Not yet</strong>}
              <small>{session.autoSyncAnalyzedAt ? 'On this device' : 'No automatic analysis'}</small>
            </dd>
          </div>
          <div>
            <Activity size={17} aria-hidden />
            <dt>Sync engine</dt>
            <dd>
              <strong>
                {session.autoSyncAlgorithmVersion !== null
                  ? `Algorithm v${session.autoSyncAlgorithmVersion}`
                  : 'Automatic'}
              </strong>
              <small>Local audio analysis</small>
            </dd>
          </div>
        </dl>
      )}

      <button
        className="primary-button panel-find-sync-button"
        type="button"
        disabled={!canAnalyze || autoSyncBusy}
        title={!canAnalyze
          ? 'Add both a movie and reaction before finding sync'
          : autoSyncBusy && !autoSyncRunning ? 'Another sync analysis is already running' : undefined}
        onClick={onFindSyncAgain}
      >
        {autoSyncRunning ? <Loader2 size={17} aria-hidden className="spin" /> : <RefreshCw size={17} aria-hidden />}
        <span>
          <strong>{autoSyncRunning ? autoSyncProgressMessage : 'Find Sync Again'}</strong>
          {!autoSyncRunning && <small>Re-analyze this session locally</small>}
        </span>
      </button>

      <details className="panel-manual-timing">
        <summary>
          <SlidersHorizontal size={17} aria-hidden />
          <span>
            <strong>Manual timing fallback</strong>
            <small>Fine offset and frame-rate controls</small>
          </span>
          <ChevronDown size={16} aria-hidden />
        </summary>
        <div className="panel-manual-timing-body">
          <p>Use these controls only when automatic sync needs a hand.</p>

          <div className="panel-offset-control" role="group" aria-label="Manual timing offset">
            <span>
              <strong>Timing offset</strong>
              <small>Fine-tune in 0.1 second steps</small>
            </span>
            <button
              className="mini-button"
              type="button"
              aria-label="Decrease timing offset by 0.1 seconds"
              disabled={autoSyncBusy}
              onClick={() => onNudgeOffset(-0.1)}
            >
              <Minus size={14} aria-hidden />
            </button>
            <output aria-live="polite">{signedSeconds(session.offsetSeconds)}</output>
            <button
              className="mini-button"
              type="button"
              aria-label="Increase timing offset by 0.1 seconds"
              disabled={autoSyncBusy}
              onClick={() => onNudgeOffset(0.1)}
            >
              <Plus size={14} aria-hidden />
            </button>
          </div>

          <div className="panel-frame-rate-control" role="group" aria-label="Reaction frame rate">
            <span>
              <strong>Reaction frame rate</strong>
              <small>Choose the format used by the reactor’s copy</small>
            </span>
            <div>
              {reactorSourceOptions.map((option) => (
                <button
                  key={option.source}
                  className={option.source === session.reactorSource ? 'segment-active' : ''}
                  type="button"
                  aria-pressed={option.source === session.reactorSource}
                  disabled={autoSyncBusy}
                  title={option.label}
                  onClick={() => onReactorSource(option.source)}
                >
                  {option.summary}
                </button>
              ))}
            </div>
          </div>

          {session.detectedMovieFps === null ? (
            <div className="panel-frame-rate-control" role="group" aria-label="Manual movie rate">
              <span>
                <strong>Movie timing correction</strong>
                <small>Fallback when the movie frame rate cannot be detected</small>
              </span>
              <div>
                {manualMovieSourceRates.map((option) => (
                  <button
                    key={option.label}
                    className={Math.abs(session.movieRateCorrection - option.rate) < 0.00001 ? 'segment-active' : ''}
                    type="button"
                    aria-pressed={Math.abs(session.movieRateCorrection - option.rate) < 0.00001}
                    disabled={autoSyncBusy}
                    onClick={() => onMovieRateCorrection(option.rate)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="panel-detected-rate">
              Movie detected at <strong>{formatFps(session.detectedMovieFps)} fps</strong>
              <span>Timing correction {formatRatePercent(session.movieRateCorrection)}</span>
            </p>
          )}

          <button className="secondary-button panel-open-manual-sync" type="button" disabled={autoSyncBusy} onClick={onSyncSetup}>
            <SlidersHorizontal size={16} aria-hidden />
            Open full manual alignment
          </button>
        </div>
      </details>
    </section>
  )
}

function formatConfidence(confidence: number | null, automatic: boolean): { value: string; label: string } {
  if (!automatic) return { value: 'Not scored', label: 'Manual timing' }
  if (confidence === null || !Number.isFinite(confidence)) {
    return { value: 'Not reported', label: 'Confidence unavailable' }
  }

  const percent = Math.round(Math.min(1, Math.max(0, confidence)) * 100)
  if (percent >= 85) return { value: `${percent}%`, label: 'High confidence' }
  if (percent >= 65) return { value: `${percent}%`, label: 'Moderate confidence' }
  return { value: `${percent}%`, label: 'Low confidence — check timing' }
}

function formatAnalyzedAt(value: string | null): string {
  if (!value) return 'Not yet'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
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
      {working && <DownloadProgress event={event} compact />}
      {ready && <ReadOnlyProgress value={100} />}
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

