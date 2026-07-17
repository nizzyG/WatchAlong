import { fireEvent, render, screen, within, type RenderResult } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { LibrarySession } from '@shared/types'
import { CommandPanel } from './CommandPanel'

type CommandPanelProps = ComponentProps<typeof CommandPanel>

describe('CommandPanel session timing', () => {
  it('keeps the titlebar outside a dedicated scroll region that owns every panel command', () => {
    renderPanel(createSession(), { expandedSection: 'help' })

    const dialog = screen.getByRole('dialog', { name: 'Command Panel' })
    const content = screen.getByRole('region', { name: 'Command Panel content' })
    const title = within(dialog).getByText('Command Panel')

    expect(content).not.toContainElement(title)
    expect(dialog.firstElementChild).toContainElement(title)
    expect(content).toHaveAttribute('tabindex', '0')
    expect(content).toContainElement(screen.getByRole('heading', { name: 'Manual timing' }))
    expect(content).toContainElement(within(content).getByRole('button', { name: /^Now Playing/i }))
    expect(content).toContainElement(within(content).getByRole('button', { name: /^Library/i }))
    expect(content).toContainElement(within(content).getByRole('button', { name: /^Preferences/i }))
    expect(content).toContainElement(screen.getByRole('heading', { name: 'Keyboard shortcuts' }))
  })

  it('leads with automatic-sync status, confidence, analysis time, algorithm, and re-analysis', () => {
    const session = createSession({
      timingOrigin: 'automatic',
      autoSyncConfidence: 0.94,
      autoSyncAnalyzedAt: '2026-07-13T12:00:00.000Z',
      autoSyncAlgorithmVersion: 3
    })
    const { props, container } = renderPanel(session, { expandedSection: 'help' })

    expect(screen.getByRole('heading', { name: 'Automatically synced' })).toBeInTheDocument()
    expect(screen.getByText('WatchAlong measured this session locally and applied the result.')).toBeInTheDocument()
    expect(screen.getByText('94%')).toBeInTheDocument()
    expect(screen.getByText('High confidence')).toBeInTheDocument()
    expect(screen.getByText('Algorithm v3')).toBeInTheDocument()
    expect(screen.getByText('Local audio analysis')).toBeInTheDocument()
    expect(container.querySelector('time[datetime="2026-07-13T12:00:00.000Z"]')).toHaveTextContent(/\S/)

    const findSync = screen.getByRole('button', { name: /Find Sync Again/i })
    expect(findSync).toHaveClass('primary-button', 'panel-find-sync-button')
    expect(findSync).toHaveTextContent('Re-analyze this session locally')
    fireEvent.click(findSync)
    expect(props.onFindSyncAgain).toHaveBeenCalledTimes(1)
  })

  it('labels manual timing without relying on color and exposes the complete fallback controls', () => {
    const session = createSession({
      timingOrigin: 'manual',
      offsetSeconds: -1.25,
      reactorSource: 'ntsc',
      detectedMovieFps: null,
      movieRateCorrection: 1,
      autoSyncConfidence: null,
      autoSyncAnalyzedAt: null,
      autoSyncAlgorithmVersion: null
    })
    const { props } = renderPanel(session)

    expect(screen.getByRole('heading', { name: 'Manual timing' })).toBeInTheDocument()
    expect(screen.getByText('This session is using timing adjusted by hand.')).toBeInTheDocument()
    expect(screen.queryByText('Not scored')).not.toBeInTheDocument()
    expect(screen.queryByText('Not yet')).not.toBeInTheDocument()
    expect(screen.queryByText('No automatic analysis')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Manual timing fallback'))
    const manualControls = screen.getByText('Use these controls only when automatic sync needs a hand.').parentElement!
    expect(within(manualControls).getByText('-1.250s')).toBeInTheDocument()

    fireEvent.click(within(manualControls).getByRole('button', { name: 'Decrease timing offset by 0.1 seconds' }))
    fireEvent.click(within(manualControls).getByRole('button', { name: 'Increase timing offset by 0.1 seconds' }))
    expect(props.onNudgeOffset).toHaveBeenNthCalledWith(1, -0.1)
    expect(props.onNudgeOffset).toHaveBeenNthCalledWith(2, 0.1)

    const sourceRates = within(manualControls).getByRole('group', { name: 'Reaction frame rate' })
    expect(within(sourceRates).getByRole('button', { name: '23.976 fps' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(sourceRates).getByRole('button', { name: '25.000 fps' }))
    expect(props.onReactorSource).toHaveBeenCalledWith('pal')

    const movieRates = within(manualControls).getByRole('group', { name: 'Manual movie rate' })
    fireEvent.click(within(movieRates).getByRole('button', { name: 'Reverse' }))
    expect(props.onMovieRateCorrection).toHaveBeenCalledWith(0.999001)

    fireEvent.click(within(manualControls).getByRole('button', { name: 'Open full manual alignment' }))
    expect(props.onSyncSetup).toHaveBeenCalledTimes(1)
  })

  it('announces live analysis with icon and text while preventing conflicting timing edits', () => {
    renderPanel(createSession({
      timingOrigin: 'automatic',
      autoSyncConfidence: 0.72,
      autoSyncAnalyzedAt: '2026-07-13T12:00:00.000Z',
      autoSyncAlgorithmVersion: 2
    }), {
      autoSyncBusy: true,
      autoSyncRunning: true,
      autoSyncProgressMessage: 'Checking moments…'
    })

    expect(screen.getByRole('heading', { name: 'Analyzing sync' })).toBeInTheDocument()
    const progressAction = screen.getByRole('button', { name: 'Checking moments…' })
    expect(progressAction).toBeDisabled()

    fireEvent.click(screen.getByText('Manual timing fallback'))
    expect(screen.getByRole('button', { name: 'Decrease timing offset by 0.1 seconds' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Increase timing offset by 0.1 seconds' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Open full manual alignment' })).toBeDisabled()
  })

  it('keeps the current session status accurate while another session is being analyzed', () => {
    renderPanel(createSession({ timingOrigin: 'manual' }), {
      autoSyncBusy: true,
      autoSyncRunning: false,
      autoSyncProgressMessage: 'Checking another session…'
    })

    expect(screen.getByRole('heading', { name: 'Manual timing' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Analyzing sync' })).not.toBeInTheDocument()
    expect(screen.queryByText('Checking another session…')).not.toBeInTheDocument()

    const findSync = screen.getByRole('button', { name: /Find Sync Again/i })
    expect(findSync).toBeDisabled()
    expect(findSync).toHaveAttribute('title', 'Another sync analysis is already running')

    fireEvent.click(screen.getByText('Manual timing fallback'))
    expect(screen.getByRole('button', { name: 'Decrease timing offset by 0.1 seconds' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Increase timing offset by 0.1 seconds' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Open full manual alignment' })).toBeDisabled()
    for (const sourceRate of screen.getAllByRole('button').filter((button) => button.hasAttribute('aria-pressed'))) {
      expect(sourceRate).toBeDisabled()
    }
  })

  it('offers System, Mahogany, and Oak cabinet finishes in Preferences', () => {
    const { props } = renderPanel(createSession(), { expandedSection: 'preferences' })
    const cabinetChoices = screen.getByRole('group', { name: 'Cabinet finish' })

    expect(within(cabinetChoices).getByRole('button', { name: /System/i })).toHaveAttribute('aria-pressed', 'true')
    expect(within(cabinetChoices).getByRole('button', { name: /Mahogany/i })).toHaveAttribute('aria-pressed', 'false')
    expect(within(cabinetChoices).getByRole('button', { name: /Oak/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Follows your system appearance')).toBeInTheDocument()

    fireEvent.click(within(cabinetChoices).getByRole('button', { name: /Oak/i }))
    expect(props.onPreference).toHaveBeenCalledWith('cabinetTheme', 'oak')
  })
})

function renderPanel(
  activeSession: LibrarySession,
  patch: Partial<CommandPanelProps> = {}
): RenderResult & { props: CommandPanelProps } {
  const props: CommandPanelProps = {
    activeSession,
    library: { version: 7, activeSessionId: activeSession.id, sessions: [], reactors: [] },
    position: 25,
    reactionDuration: 120,
    downloads: [],
    preferences: {
      hasCompletedOnboarding: true,
      openLibraryOnLaunch: true,
      libraryView: 'grid',
      reactionDownloadDirectory: null,
      cabinetTheme: 'system'
    },
    patreonStatus: { available: false, canEncrypt: true },
    expandedSection: 'now-playing',
    onExpandedSection: vi.fn(),
    onClose: vi.fn(),
    onSyncSetup: vi.fn(),
    onFindSyncAgain: vi.fn(),
    onNudgeOffset: vi.fn(),
    onReactorSource: vi.fn(),
    onMovieRateCorrection: vi.fn(),
    onSwapReaction: vi.fn(),
    onCloseSession: vi.fn(),
    onSwitchSession: vi.fn(),
    onViewLibrary: vi.fn(),
    onNewSession: vi.fn(),
    onCancelDownload: vi.fn(),
    onAttachDownload: vi.fn(),
    onPreference: vi.fn(),
    onChooseDownloadDirectory: vi.fn(),
    onForgetPatreon: vi.fn(),
    onShowWizard: vi.fn(),
    autoSyncBusy: false,
    autoSyncRunning: false,
    autoSyncProgressMessage: 'Getting ready…',
    ...patch
  }

  return { ...render(<CommandPanel {...props} />), props }
}

function createSession(patch: Partial<LibrarySession> = {}): LibrarySession {
  return {
    id: 'session-1',
    title: 'Tombstone',
    titleOrigin: 'custom',
    reactorId: null,
    reactorName: 'Movie Night',
    reactorNameOrigin: 'custom',
    reactionPath: 'C:\\Videos\\tombstone-reaction.mp4',
    reactionSource: 'local',
    reactionDurationSeconds: 120,
    moviePath: 'C:\\Videos\\tombstone.mkv',
    moviePosterPath: null,
    movieAudioTrackPreference: null,
    subtitlePath: null,
    offsetSeconds: 0,
    lastReactionTimeSeconds: 25,
    overlay: { x: 24, y: 24, width: 420, height: 236 },
    isPipHidden: false,
    isMoviePoppedOut: false,
    movieWindowGeometry: { x: 24, y: 24, width: 420, height: 236 },
    reactionVolume: 1,
    movieVolume: 1,
    isReactionMuted: false,
    isMovieMuted: false,
    playbackRate: 1,
    reactorSource: 'ntsc',
    detectedMovieFps: 24000 / 1001,
    movieRateCorrection: 1,
    timingOrigin: 'manual',
    autoSyncConfidence: null,
    autoSyncAnalyzedAt: null,
    autoSyncAlgorithmVersion: null,
    createdAt: '2026-07-12T12:00:00.000Z',
    updatedAt: '2026-07-13T12:00:00.000Z',
    ...patch
  }
}
