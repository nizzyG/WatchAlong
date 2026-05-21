import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WizardApp } from './WizardApp'
import type { MediaFile, WatchAlongApi } from '@shared/types'

const firstMovie: MediaFile = { path: 'C:\\Movies\\Movie.mp4', name: 'Movie.mp4' }
const secondMovie: MediaFile = { path: 'C:\\Movies\\Second Movie.mp4', name: 'Second Movie.mp4' }
const reaction: MediaFile = { path: 'C:\\Reactions\\Reaction.mp4', name: 'Reaction.mp4' }

describe('WizardApp', () => {
  beforeEach(() => {
    window.watchAlong = createApi()
  })

  it('renders the minimal title bar and protects the empty movie step', async () => {
    render(<WizardApp />)

    expect(screen.getAllByText('Choose Your Movie').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /minimi/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /maximi/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /Open Movie File/i }))

    await waitFor(() => expect(window.watchAlong.selectMovieFile).toHaveBeenCalled())
    expect(await screen.findByText('Movie.mp4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled()
  })

  it('loads a local reaction, shows the ready copy, and completes into sync setup', async () => {
    render(<WizardApp />)

    fireEvent.click(screen.getByRole('button', { name: /Open Movie File/i }))
    expect(await screen.findByText('Movie.mp4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(window.watchAlong.detectBrowsers).toHaveBeenCalled())

    fireEvent.click(await screen.findByRole('button', { name: /Local file/i }))

    await waitFor(() => expect(window.watchAlong.selectReactionFile).toHaveBeenCalled())
    expect(await screen.findByText('Reaction.mp4')).toBeInTheDocument()
    expect(await screen.findByText("Everything's loaded and safe. Now let's find the perfect sync point.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Start Sync Setup/i }))

    await waitFor(() =>
      expect(window.watchAlong.createOrSwitchSessionFromPaths).toHaveBeenCalledWith(reaction.path, firstMovie.path, 'local')
    )
    await waitFor(() => expect(window.watchAlong.completeOnboarding).toHaveBeenCalled())
    await waitFor(() => expect(window.watchAlong.finishOnboardingWizard).toHaveBeenCalledWith('completed'))
  })

  it('resets the reaction when the selected movie changes', async () => {
    window.watchAlong.selectMovieFile = vi.fn()
      .mockResolvedValueOnce(firstMovie)
      .mockResolvedValueOnce(secondMovie)

    render(<WizardApp />)

    fireEvent.click(screen.getByRole('button', { name: /Open Movie File/i }))
    expect(await screen.findByText('Movie.mp4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(window.watchAlong.detectBrowsers).toHaveBeenCalled())
    fireEvent.click(await screen.findByRole('button', { name: /Local file/i }))
    expect(await screen.findByText("Everything's loaded and safe. Now let's find the perfect sync point.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: /Open Movie File/i }))

    expect(await screen.findByText('Second Movie.mp4')).toBeInTheDocument()
    expect(screen.getByText('Movie changed. Choose a reaction that matches it.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('treats Escape as cancel', async () => {
    render(<WizardApp />)

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(window.watchAlong.finishOnboardingWizard).toHaveBeenCalledWith('cancelled'))
  })

  it('starts swap reaction with the current movie complete and replaces only the reaction', async () => {
    window.watchAlong.getImportWizardContext = vi.fn(async () => ({
      mode: 'swap-reaction' as const,
      sessionId: 's1',
      movie: firstMovie
    }))

    render(<WizardApp />)

    expect(await screen.findByText('Movie is already chosen for this session.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Add the Reaction')).toBeInTheDocument())
    expect(screen.getByLabelText('Selected movie')).toHaveTextContent('Movie.mp4')

    fireEvent.click(await screen.findByRole('button', { name: /Local file/i }))
    expect(await screen.findByText("Everything's loaded and safe. Now let's find the perfect sync point.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Start Sync Setup/i }))

    await waitFor(() =>
      expect(window.watchAlong.replaceSessionMedia).toHaveBeenCalledWith('s1', 'reaction', reaction.path, 'local')
    )
    expect(window.watchAlong.createOrSwitchSessionFromPaths).not.toHaveBeenCalled()
    await waitFor(() => expect(window.watchAlong.finishOnboardingWizard).toHaveBeenCalledWith('completed'))
  })
})

function createApi(): WatchAlongApi {
  return {
    openVideos: vi.fn(),
    selectMovieFile: vi.fn(async () => firstMovie),
    selectReactionFile: vi.fn(async () => reaction),
    createOrSwitchSessionFromPaths: vi.fn(async () => ({
      version: 3 as const,
      activeSessionId: 'session-1',
      sessions: []
    })),
    getLibrary: vi.fn(),
    saveActiveSession: vi.fn(),
    setSessionMedia: vi.fn(),
    replaceSessionMedia: vi.fn(async () => ({
      version: 3 as const,
      activeSessionId: 'session-1',
      sessions: []
    })),
    setActiveSession: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
    openSubtitle: vi.fn(),
    clearSubtitle: vi.fn(),
    getSubtitleText: vi.fn(),
    getMediaUrl: vi.fn(),
    openMovieWindow: vi.fn(async () => ({ opened: false, geometry: { x: 0, y: 0, width: 320, height: 180 }, state: null })),
    closeMovieWindow: vi.fn(async () => ({ geometry: null, overlay: null, state: null })),
    requestMovieWindowPopIn: vi.fn(async () => undefined),
    getMovieWindowInit: vi.fn(async () => null),
    movieWindowReady: vi.fn(async () => undefined),
    sendMovieMediaCommand: vi.fn(async (command) => ({ id: command.id, ok: true, state: remoteState() })),
    acknowledgeMovieMediaCommand: vi.fn(async () => undefined),
    reportMovieMediaEvent: vi.fn(async () => undefined),
    onMovieMediaCommand: vi.fn(() => vi.fn()),
    onMovieMediaEvent: vi.fn(() => vi.fn()),
    onMovieWindowGeometry: vi.fn(() => vi.fn()),
    onMovieWindowPopInRequest: vi.fn(() => vi.fn()),
    onMovieWindowClosed: vi.fn(() => vi.fn()),
    checkTools: vi.fn(),
    detectBrowsers: vi.fn(async () => []),
    extractPatreonSession: vi.fn(async () => ({ ok: false })),
    openPatreonLoginWindow: vi.fn(async () => ({ ok: false })),
    getSavedPatreonSessionStatus: vi.fn(async () => ({ available: false, canEncrypt: true })),
    saveLastPatreonSession: vi.fn(async () => ({ available: true, canEncrypt: true })),
    discardLastPatreonSession: vi.fn(async () => ({ available: false, canEncrypt: true })),
    forgetPatreonSession: vi.fn(async () => ({ available: false, canEncrypt: true })),
    startReactionDownload: vi.fn(async () => ({ jobId: 'job-1' })),
    cancelDownload: vi.fn(async () => undefined),
    onDownloadProgress: vi.fn(() => vi.fn()),
    openOnboardingWizard: vi.fn(async () => undefined),
    openImportWizard: vi.fn(async () => undefined),
    getImportWizardContext: vi.fn(async () => ({ mode: 'new' as const, sessionId: null, movie: null })),
    finishOnboardingWizard: vi.fn(async () => undefined),
    onWizardLifecycle: vi.fn(() => vi.fn()),
    getPreferences: vi.fn(),
    setPreference: vi.fn(),
    selectDownloadDirectory: vi.fn(),
    completeOnboarding: vi.fn(async () => ({
      hasCompletedOnboarding: true,
      openLibraryOnLaunch: true,
      libraryView: 'grid' as const,
      reactionDownloadDirectory: null
    }))
  }
}

function remoteState() {
  return {
    currentTime: 0,
    duration: 120,
    paused: true,
    playbackRate: 1,
    readyState: 4,
    seeking: false,
    ended: false,
    volume: 1,
    muted: false
  }
}
