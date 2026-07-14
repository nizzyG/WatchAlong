import { Check, ChevronDown, Clapperboard, Clock3, Coffee, Download, ExternalLink, LayoutGrid, Library as LibraryIcon, List, Lock, Plus, RefreshCw, Settings, SlidersHorizontal, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { AppPreferences, DownloadProgressEvent, LibrarySession, SavedPatreonSessionStatus, SessionLibrary } from '@shared/types'
import { LibrarySessionCard } from './LibraryHome'
import { ReactionSourceIcon, reactionSourceLabel } from './ReactionSource'
import { fileName, formatTime } from './appFormat'
import { DownloadProgress } from './DownloadProgress'

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

