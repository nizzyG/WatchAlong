import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

    fireEvent.click(screen.getByRole('button', { name: /Find My Sync/i }))

    await waitFor(() =>
      expect(window.watchAlong.createOrSwitchSessionFromPaths).toHaveBeenCalledWith(reaction.path, firstMovie.path, 'local')
    )
    await waitFor(() => expect(window.watchAlong.completeOnboarding).toHaveBeenCalled())
    await waitFor(() => expect(window.watchAlong.finishOnboardingWizard).toHaveBeenCalledWith('completed'))
  })

  it('rolls a completed download straight into autosync with an atomic friendly title', async () => {
    let progress: Parameters<WatchAlongApi['onDownloadProgress']>[0] | null = null
    window.watchAlong.onDownloadProgress = vi.fn((callback) => {
      progress = callback
      return () => undefined
    })

    render(<WizardApp />)
    fireEvent.click(screen.getByRole('button', { name: /Open Movie File/i }))
    expect(await screen.findByText('Movie.mp4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(await screen.findByRole('button', { name: /YouTube link/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.youtube.com/watch?v=...'), {
      target: { value: 'https://www.youtube.com/watch?v=abc123' }
    })
    fireEvent.click(screen.getByRole('button', { name: /Download & Load/i }))
    await waitFor(() => expect(window.watchAlong.startReactionDownload).toHaveBeenCalled())

    const success = {
      jobId: 'job-1',
      source: 'youtube' as const,
      state: 'success' as const,
      message: 'Reaction video ready.',
      percent: 100,
      filePath: 'C:\\Reactions\\Downloaded.mp4',
      metadata: { reactionTitle: 'Movie reaction', reactorName: 'Addie Counts' }
    }
    await act(async () => {
      progress?.(success)
      progress?.(success)
    })

    expect(screen.queryByText('Ready to Sync')).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /Finding Your Sync|Your watchalong is ready/i })).toBeInTheDocument()
    await waitFor(() => expect(window.watchAlong.createOrSwitchSessionFromPaths).toHaveBeenCalledWith(
      success.filePath,
      firstMovie.path,
      'youtube',
      'Movie — Addie Counts'
    ))
    expect(window.watchAlong.createOrSwitchSessionFromPaths).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(window.watchAlong.startSessionAutoSync).toHaveBeenCalledWith('session-1', 'initial'))
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
    await act(async () => {
      await Promise.resolve()
    })
    fireEvent.click(await screen.findByRole('button', { name: /Local file/i }))
    expect(await screen.findByText("Everything's loaded and safe. Now let's find the perfect sync point.")).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: /Open Movie File/i }))

    expect(await screen.findByText('Second Movie.mp4')).toBeInTheDocument()
    expect(screen.getByText('Movie changed. Choose a reaction that matches it.')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    })
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

    fireEvent.click(screen.getByRole('button', { name: /Find My Sync/i }))

    await waitFor(() =>
      expect(window.watchAlong.replaceSessionMedia).toHaveBeenCalledWith('s1', 'reaction', reaction.path, 'local', undefined)
    )
    expect(window.watchAlong.createOrSwitchSessionFromPaths).not.toHaveBeenCalled()
    await waitFor(() => expect(window.watchAlong.finishOnboardingWizard).toHaveBeenCalledWith('completed'))
  })

  it('opens the existing pairing instead of overwriting either session on a swap conflict', async () => {
    window.watchAlong.getImportWizardContext = vi.fn(async () => ({
      mode: 'swap-reaction' as const,
      sessionId: 's1',
      movie: firstMovie
    }))
    window.watchAlong.replaceSessionMedia = vi.fn(async () => ({
      status: 'conflict' as const,
      library: { version: 4 as const, activeSessionId: 's1', sessions: [] },
      existingSessionId: 'existing'
    }))
    window.watchAlong.setActiveSession = vi.fn(async () => ({
      version: 4 as const,
      activeSessionId: 'existing',
      sessions: []
    }))

    render(<WizardApp />)
    fireEvent.click(await screen.findByRole('button', { name: /Local file/i }))
    expect(await screen.findByText("Everything's loaded and safe. Now let's find the perfect sync point.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Find My Sync/i }))

    await waitFor(() => expect(window.watchAlong.setActiveSession).toHaveBeenCalledWith('existing'))
    expect(window.watchAlong.saveSessionPosition).not.toHaveBeenCalled()
    expect(window.watchAlong.startSessionAutoSync).not.toHaveBeenCalled()
    await waitFor(
      () => expect(window.watchAlong.finishOnboardingWizard).toHaveBeenCalledWith('completed'),
      { timeout: 1500 }
    )
  })

  it('falls back to the simple manual setup when automatic sync is uncertain', async () => {
    let complete: Parameters<WatchAlongApi['onAutoSyncComplete']>[0] | null = null
    window.watchAlong.onAutoSyncComplete = vi.fn((callback) => {
      complete = callback
      return () => undefined
    })
    window.watchAlong.startSessionAutoSync = vi.fn(async (sessionId: string) => {
      queueMicrotask(() => complete?.({ sessionId, outcome: 'fallback', message: 'Please line it up manually.' }))
      return { started: true }
    })

    render(<WizardApp />)
    await reachReadyStep()
    fireEvent.click(screen.getByRole('button', { name: /Find My Sync/i }))

    expect(await screen.findByText('Please line it up manually.')).toBeInTheDocument()
    await waitFor(() => expect(window.watchAlong.finishOnboardingWizard).toHaveBeenCalledWith('completed-needs-review'))
  })

  it('lets the user skip the scan and line up manually without losing the saved files', async () => {
    window.watchAlong.startSessionAutoSync = vi.fn(async () => ({ started: true }))

    render(<WizardApp />)
    await reachReadyStep()
    fireEvent.click(screen.getByRole('button', { name: /Find My Sync/i }))

    fireEvent.click(await screen.findByRole('button', { name: /Line Up Manually Instead/i }))
    await waitFor(() => expect(window.watchAlong.cancelSessionAutoSync).toHaveBeenCalledWith('session-1'))
    await waitFor(() => expect(window.watchAlong.finishOnboardingWizard).toHaveBeenCalledWith('completed-needs-review'))
  })

  it('keeps manual setup unavailable until the session is safely saved', async () => {
    let finishSave: ((library: Awaited<ReturnType<WatchAlongApi['createOrSwitchSessionFromPaths']>>) => void) | null = null
    window.watchAlong.createOrSwitchSessionFromPaths = vi.fn(
      () => new Promise<Awaited<ReturnType<WatchAlongApi['createOrSwitchSessionFromPaths']>>>((resolve) => {
        finishSave = resolve
      })
    )
    window.watchAlong.startSessionAutoSync = vi.fn(async () => ({ started: true }))

    render(<WizardApp />)
    await reachReadyStep()
    fireEvent.click(screen.getByRole('button', { name: /Find My Sync/i }))
    expect(await screen.findByRole('button', { name: /Saving WatchAlong/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    expect(window.watchAlong.startSessionAutoSync).not.toHaveBeenCalled()
    expect(window.watchAlong.finishOnboardingWizard).not.toHaveBeenCalled()

    await act(async () => {
      finishSave?.({ version: 4, activeSessionId: 'session-1', sessions: [] })
    })

    await waitFor(() => expect(window.watchAlong.startSessionAutoSync).toHaveBeenCalledWith('session-1', 'initial'))
    fireEvent.click(screen.getByRole('button', { name: /Line Up Manually Instead/i }))
    await waitFor(() => expect(window.watchAlong.finishOnboardingWizard).toHaveBeenCalledWith('completed-needs-review'))
  })

  it('turns an OS close during saving into a safe manual-review handoff', async () => {
    let requestClose: (() => void) | null = null
    let finishSave: ((library: Awaited<ReturnType<WatchAlongApi['createOrSwitchSessionFromPaths']>>) => void) | null = null
    window.watchAlong.onWizardCloseRequest = vi.fn((callback) => {
      requestClose = callback
      return () => { requestClose = null }
    })
    window.watchAlong.createOrSwitchSessionFromPaths = vi.fn(
      () => new Promise<Awaited<ReturnType<WatchAlongApi['createOrSwitchSessionFromPaths']>>>((resolve) => {
        finishSave = resolve
      })
    )

    render(<WizardApp />)
    await reachReadyStep()
    fireEvent.click(screen.getByRole('button', { name: /Find My Sync/i }))
    expect(await screen.findByRole('button', { name: /Saving WatchAlong/i })).toBeDisabled()

    act(() => requestClose?.())
    expect(window.watchAlong.finishOnboardingWizard).not.toHaveBeenCalled()
    expect(window.watchAlong.startSessionAutoSync).not.toHaveBeenCalled()

    await act(async () => {
      finishSave?.({ version: 4, activeSessionId: 'session-1', sessions: [] })
    })
    await waitFor(() => expect(window.watchAlong.finishOnboardingWizard).toHaveBeenCalledWith('completed-needs-review'))
    expect(window.watchAlong.startSessionAutoSync).not.toHaveBeenCalled()
  })
})

async function reachReadyStep(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /Open Movie File/i }))
  expect(await screen.findByText('Movie.mp4')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.click(await screen.findByRole('button', { name: /Local file/i }))
  expect(await screen.findByText("Everything's loaded and safe. Now let's find the perfect sync point.")).toBeInTheDocument()
}

function createApi(): WatchAlongApi {
  let autoSyncComplete: Parameters<WatchAlongApi['onAutoSyncComplete']>[0] | null = null
  return {
    openVideos: vi.fn(),
    selectMovieFile: vi.fn(async () => firstMovie),
    selectReactionFile: vi.fn(async () => reaction),
    createOrSwitchSessionFromPaths: vi.fn(async () => ({
      version: 4 as const,
      activeSessionId: 'session-1',
      sessions: []
    })),
    getLibrary: vi.fn(),
    getLibraryRecoveryStatus: vi.fn(async () => ({ available: false })),
    revealLibraryRecoveryFile: vi.fn(async () => false),
    startFreshLibraryAfterRecovery: vi.fn(async () => ({ version: 4 as const, activeSessionId: null, sessions: [] })),
    saveActiveSession: vi.fn(),
    saveSessionPosition: vi.fn(async (sessionId: string, lastReactionTimeSeconds: number) => ({
      version: 4 as const,
      activeSessionId: sessionId,
      sessions: []
    })),
    setSessionMedia: vi.fn(),
    replaceSessionMedia: vi.fn(async () => ({
      status: 'replaced' as const,
      library: {
        version: 4 as const,
        activeSessionId: 'session-1',
        sessions: []
      }
    })),
    setActiveSession: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
    openSubtitle: vi.fn(),
    clearSubtitle: vi.fn(),
    getSubtitleText: vi.fn(),
    getMediaUrl: vi.fn(),
    saveMovieWindowState: vi.fn(),
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
    detectMovieFrameRate: vi.fn(async () => null),
    detectBrowsers: vi.fn(async () => []),
    extractPatreonSession: vi.fn(async () => ({ ok: false })),
    openPatreonLoginWindow: vi.fn(async () => ({ ok: false })),
    discardPatreonSessionToken: vi.fn(async () => undefined),
    getSavedPatreonSessionStatus: vi.fn(async () => ({ available: false, canEncrypt: true })),
    saveLastPatreonSession: vi.fn(async () => ({ available: true, canEncrypt: true })),
    discardLastPatreonSession: vi.fn(async () => ({ available: false, canEncrypt: true })),
    forgetPatreonSession: vi.fn(async () => ({ available: false, canEncrypt: true })),
    startReactionDownload: vi.fn(async () => ({ jobId: 'job-1' })),
    cancelDownload: vi.fn(async () => undefined),
    onDownloadProgress: vi.fn(() => vi.fn()),
    startSessionAutoSync: vi.fn(async (sessionId: string) => {
      queueMicrotask(() => autoSyncComplete?.({
        sessionId,
        outcome: 'confident',
        message: 'Ready — timing found.',
        offsetSeconds: -20,
        movieRateCorrection: 1,
        confidence: 0.94,
        anchorCount: 6
      }))
      return { started: true }
    }),
    cancelSessionAutoSync: vi.fn(async () => undefined),
    onAutoSyncProgress: vi.fn(() => vi.fn()),
    onAutoSyncComplete: vi.fn((callback) => {
      autoSyncComplete = callback
      return () => { if (autoSyncComplete === callback) autoSyncComplete = null }
    }),
    openOnboardingWizard: vi.fn(async () => undefined),
    openImportWizard: vi.fn(async () => undefined),
    getImportWizardContext: vi.fn(async () => ({ mode: 'new' as const, sessionId: null, movie: null })),
    finishOnboardingWizard: vi.fn(async () => undefined),
    onWizardLifecycle: vi.fn(() => vi.fn()),
    onWizardCloseRequest: vi.fn(() => vi.fn()),
    confirmMainWindowClose: vi.fn(async () => undefined),
    onMainWindowCloseRequest: vi.fn(() => vi.fn()),
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
