import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type {
  AppPreferences,
  LibrarySession,
  MovieWindowClosedEvent,
  MovieWindowLifecycleCallback,
  SessionLibrary,
  WatchAlongApi,
  WizardLifecycleCallback
} from '@shared/types'

const firstSession = createSession('s1', 'First', 0)
const secondSession = createSession('s2', 'Second', 20)

function createLibrary(activeSessionId: string | null = 's1', sessions: LibrarySession[] = [firstSession, secondSession]): SessionLibrary {
  return {
    version: 3,
    activeSessionId,
    sessions
  }
}

const defaultPreferences: AppPreferences = {
  hasCompletedOnboarding: true,
  openLibraryOnLaunch: true,
  libraryView: 'grid',
  reactionDownloadDirectory: null
}

function createApi(
  library = createLibrary(),
  preferences: AppPreferences = defaultPreferences
): WatchAlongApi & {
  emitWizardLifecycle(event: Parameters<WizardLifecycleCallback>[0]): void
  emitMovieWindowPopInRequest(): void
  emitMovieWindowClosed(event?: MovieWindowClosedEvent): void
} {
  let currentLibrary = library
  let currentPreferences = preferences
  let wizardLifecycleCallback: WizardLifecycleCallback | null = null
  let movieWindowPopInCallback: MovieWindowLifecycleCallback | null = null
  let movieWindowClosedCallback: MovieWindowLifecycleCallback | null = null

  const api = {
    openVideos: vi.fn(),
    selectMovieFile: vi.fn(async () => ({ path: 'C:\\Movies\\Located movie.mp4', name: 'Located movie.mp4' })),
    selectReactionFile: vi.fn(async () => ({ path: 'C:\\Reactions\\Located reaction.mp4', name: 'Located reaction.mp4' })),
    createOrSwitchSessionFromPaths: vi.fn(async (reactionPath: string, moviePath: string) => {
      currentLibrary = createLibrary('wizard-session', [
        createSession('wizard-session', 'Wizard', 0, { reactionPath, moviePath })
      ])
      return currentLibrary
    }),
    getLibrary: vi.fn(async () => currentLibrary),
    getPreferences: vi.fn(async () => currentPreferences),
    setPreference: vi.fn(async (key: keyof AppPreferences, value: AppPreferences[keyof AppPreferences]) => {
      currentPreferences = { ...currentPreferences, [key]: value }
      return currentPreferences
    }),
    selectDownloadDirectory: vi.fn(async () => 'C:\\Downloads\\WatchAlong'),
    completeOnboarding: vi.fn(async () => {
      currentPreferences = { ...currentPreferences, hasCompletedOnboarding: true }
      return currentPreferences
    }),
    saveActiveSession: vi.fn(async (patch) => {
      currentLibrary = {
        ...currentLibrary,
        sessions: currentLibrary.sessions.map((session) =>
          session.id === currentLibrary.activeSessionId ? { ...session, ...patch } : session
        )
      }
      return currentLibrary
    }),
    replaceSessionMedia: vi.fn(async (sessionId, role, path, reactionSource) => {
      currentLibrary = {
        ...currentLibrary,
        activeSessionId: sessionId,
        sessions: currentLibrary.sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                ...(role === 'movie' ? { moviePath: path } : { reactionPath: path, reactionSource: reactionSource ?? session.reactionSource })
              }
            : session
        )
      }
      return currentLibrary
    }),
    setSessionMedia: vi.fn(async (role, path, reactionSource) => {
      currentLibrary = {
        ...currentLibrary,
        sessions: currentLibrary.sessions.map((session) =>
          session.id === currentLibrary.activeSessionId
            ? {
                ...session,
                ...(role === 'movie' ? { moviePath: path } : { reactionPath: path, reactionSource: reactionSource ?? session.reactionSource })
              }
            : session
        )
      }
      return currentLibrary
    }),
    setActiveSession: vi.fn(async (sessionId: string) => {
      currentLibrary = { ...currentLibrary, activeSessionId: sessionId }
      return currentLibrary
    }),
    deleteSession: vi.fn(async (sessionId: string) => {
      const sessions = currentLibrary.sessions.filter((session) => session.id !== sessionId)
      currentLibrary = {
        ...currentLibrary,
        sessions,
        activeSessionId: currentLibrary.activeSessionId === sessionId ? sessions[0]?.id ?? null : currentLibrary.activeSessionId
      }
      return currentLibrary
    }),
    renameSession: vi.fn(async (sessionId: string, title: string) => {
      currentLibrary = {
        ...currentLibrary,
        sessions: currentLibrary.sessions.map((session) => (session.id === sessionId ? { ...session, title } : session))
      }
      return currentLibrary
    }),
    openSubtitle: vi.fn(),
    clearSubtitle: vi.fn(async () => currentLibrary),
    getSubtitleText: vi.fn(),
    getMediaUrl: vi.fn(async (role, sessionId) => `watchalong://media/${sessionId}/${role}`),
    openMovieWindow: vi.fn(async (request) => ({
      opened: true,
      geometry: request.geometry,
      state: remoteState()
    })),
    closeMovieWindow: vi.fn(async () => ({ geometry: null, overlay: null, state: remoteState() })),
    requestMovieWindowPopIn: vi.fn(async () => undefined),
    getMovieWindowInit: vi.fn(async () => null),
    movieWindowReady: vi.fn(async () => undefined),
    sendMovieMediaCommand: vi.fn(async (command) => ({ id: command.id, ok: true, state: remoteState() })),
    acknowledgeMovieMediaCommand: vi.fn(async () => undefined),
    reportMovieMediaEvent: vi.fn(async () => undefined),
    onMovieMediaCommand: vi.fn(() => vi.fn()),
    onMovieMediaEvent: vi.fn(() => vi.fn()),
    onMovieWindowGeometry: vi.fn(() => vi.fn()),
    onMovieWindowPopInRequest: vi.fn((callback: MovieWindowLifecycleCallback) => {
      movieWindowPopInCallback = callback
      return vi.fn()
    }),
    onMovieWindowClosed: vi.fn((callback: MovieWindowLifecycleCallback) => {
      movieWindowClosedCallback = callback
      return vi.fn()
    }),
    checkTools: vi.fn(async () => ({ ready: true, tools: [] })),
    detectBrowsers: vi.fn(async () => []),
    extractPatreonSession: vi.fn(async () => ({ ok: false })),
    openPatreonLoginWindow: vi.fn(async () => ({ ok: false })),
    getSavedPatreonSessionStatus: vi.fn(async () => ({ available: false, canEncrypt: true })),
    saveLastPatreonSession: vi.fn(async () => ({ available: true, canEncrypt: true })),
    forgetPatreonSession: vi.fn(async () => ({ available: false, canEncrypt: true })),
    startReactionDownload: vi.fn(async () => ({ jobId: 'job-1' })),
    cancelDownload: vi.fn(async () => undefined),
    onDownloadProgress: vi.fn(() => vi.fn()),
    openOnboardingWizard: vi.fn(async () => undefined),
    openImportWizard: vi.fn(async () => undefined),
    getImportWizardContext: vi.fn(async () => ({ mode: 'new' as const, sessionId: null, movie: null })),
    finishOnboardingWizard: vi.fn(async () => undefined),
    onWizardLifecycle: vi.fn((callback: WizardLifecycleCallback) => {
      wizardLifecycleCallback = callback
      return vi.fn()
    })
  }

  return Object.assign(api, {
    emitWizardLifecycle(event: Parameters<WizardLifecycleCallback>[0]) {
      wizardLifecycleCallback?.(event)
    },
    emitMovieWindowPopInRequest() {
      movieWindowPopInCallback?.()
    },
    emitMovieWindowClosed(event?: MovieWindowClosedEvent) {
      movieWindowClosedCallback?.(event)
    }
  }) as unknown as WatchAlongApi & {
    emitWizardLifecycle(event: Parameters<WizardLifecycleCallback>[0]): void
    emitMovieWindowPopInRequest(): void
    emitMovieWindowClosed(event?: MovieWindowClosedEvent): void
  }
}

describe('App', () => {
  let playMock: ReturnType<typeof vi.fn>
  let pauseMock: ReturnType<typeof vi.fn>
  let fullscreenTargets: Element[]

  beforeEach(() => {
    playMock = vi.fn(async () => undefined)
    pauseMock = vi.fn()
    fullscreenTargets = []
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: playMock
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: pauseMock
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
      configurable: true,
      get: () => 120
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      configurable: true,
      get: () => 4
    })
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: vi.fn(function requestFullscreen(this: Element) {
        fullscreenTargets.push(this)
        return Promise.resolve()
      })
    })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: vi.fn(async () => undefined)
    })
  })

  it('renders the populated library by default and opens a session from a card', async () => {
    const api = createApi()
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
    expect(api.getMediaUrl).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /First/ }))

    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    expect(api.getMediaUrl).toHaveBeenCalledWith('movie', 's1')
  })

  it('resumes the active session on launch when the launch preference is off', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    render(<App />)

    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    expect(screen.queryByLabelText('WatchAlong Library')).not.toBeInTheDocument()
  })

  it('falls back to the empty library when resume on launch is enabled but no sessions exist', async () => {
    const api = createApi(createLibrary(null, []), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByText('Your watchalong collection is empty')).toBeInTheDocument()
    expect(api.getMediaUrl).not.toHaveBeenCalled()
  })

  it('renders a startup recovery screen when initial library loading fails and retries', async () => {
    const api = createApi()
    api.getLibrary = vi.fn()
      .mockRejectedValueOnce(new Error('Library file could not be read'))
      .mockResolvedValueOnce(createLibrary(null, []))
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByLabelText('Startup error')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong while loading your library.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }))

    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
    expect(api.getLibrary).toHaveBeenCalledTimes(2)
  })

  it('handles mute and offset keyboard shortcuts', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))

    fireEvent.keyDown(window, { code: 'KeyR' })
    await waitFor(() => expect(api.saveActiveSession).toHaveBeenCalledWith({ isReactionMuted: true }))

    fireEvent.keyDown(window, { code: 'BracketRight' })
    await waitFor(() => expect(api.saveActiveSession).toHaveBeenCalledWith({ offsetSeconds: 0.1 }))
  })

  it('shows missing-media recovery and locates a missing movie file', async () => {
    const api = createApi(createLibrary('s1', [firstSession]), { ...defaultPreferences, openLibraryOnLaunch: false })
    api.getMediaUrl = vi.fn(async (role, sessionId) => role === 'movie' ? null : `watchalong://media/${sessionId}/${role}`)
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByLabelText('Missing media recovery')).toBeInTheDocument()
    expect(screen.getByText('Movie file')).toBeInTheDocument()
    expect(screen.getAllByText('s1-movie.mp4').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /Locate movie/i }))

    await waitFor(() =>
      expect(api.replaceSessionMedia).toHaveBeenCalledWith('s1', 'movie', 'C:\\Movies\\Located movie.mp4', undefined)
    )
  })

  it('removes a missing-media session and returns to the library', async () => {
    const api = createApi(createLibrary('s1', [firstSession]), { ...defaultPreferences, openLibraryOnLaunch: false })
    api.getMediaUrl = vi.fn(async (role, sessionId) => role === 'movie' ? null : `watchalong://media/${sessionId}/${role}`)
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByLabelText('Missing media recovery')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Remove session/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }))

    await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith('s1'))
    expect(await screen.findByText('Your watchalong collection is empty')).toBeInTheDocument()
  })

  it('attaches sync playback after media elements render', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))

    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    fireEvent.click(screen.getByLabelText('Play'))

    await waitFor(() => expect(playMock).toHaveBeenCalledTimes(2))
  })

  it('hides the PiP overlay while popped out and pops back in from the movie window', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    api.closeMovieWindow = vi.fn(async () => ({
      geometry: { x: 40, y: 50, width: 360, height: 210 },
      overlay: { x: 12, y: 18, width: 360, height: 210 },
      state: remoteState({ currentTime: 33 })
    }))
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)

    fireEvent.click(screen.getByLabelText('Pop out movie to separate window'))

    await waitFor(() =>
      expect(api.openMovieWindow).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: 's1',
        geometryMode: 'overlay'
      }))
    )
    await waitFor(() => expect(document.querySelector('video.pip-video')).not.toBeInTheDocument())
    expect(screen.queryByLabelText('Movie picture in picture')).not.toBeInTheDocument()
    expect(api.saveActiveSession).toHaveBeenCalledWith(expect.objectContaining({ isMoviePoppedOut: true }))

    act(() => api.emitMovieWindowPopInRequest())

    await waitFor(() =>
      expect(api.saveActiveSession).toHaveBeenCalledWith(expect.objectContaining({
        isMoviePoppedOut: false,
        overlay: { x: 12, y: 18, width: 360, height: 210 }
      }))
    )
  })

  it('double-clicking the reaction fullscreens the whole player so PiP remains visible', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))

    fireEvent.doubleClick(container.querySelector('video.reaction-video')!)

    expect(fullscreenTargets).toEqual([document.documentElement])
  })

  it('preserves the current sync point when changing movie source rate', async () => {
    const session = createSession('s1', 'First', 0, { offsetSeconds: 5 })
    const api = createApi(createLibrary('s1', [session]), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    const reaction = container.querySelector('video.reaction-video') as HTMLVideoElement
    reaction.currentTime = 100

    fireEvent.click(screen.getByRole('button', { name: 'Stream 24 -> Blu-ray 23.976' }))

    await waitFor(() =>
      expect(api.saveActiveSession).toHaveBeenCalledWith({
        movieRateCorrection: 1.001,
        offsetSeconds: 4.9
      })
    )
  })

  it('shows the first-run welcome and opens the import wizard from Get Started', async () => {
    const api = createApi(createLibrary(null, []))
    api.getPreferences = vi.fn(async () => ({ ...defaultPreferences, hasCompletedOnboarding: false }))
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByText('Your watchalong collection is empty')).toBeInTheDocument()
    expect(screen.getByLabelText('Welcome to WatchAlong')).toBeInTheDocument()
    expect(api.openOnboardingWizard).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Get Started/i }))
    expect(api.openImportWizard).toHaveBeenCalledWith({ mode: 'new' })
  })

  it('dims, pauses, and resumes playback around a cancelled wizard', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    fireEvent.click(screen.getByLabelText('Play'))
    await waitFor(() => expect(playMock).toHaveBeenCalledTimes(2))

    act(() => api.emitWizardLifecycle({ type: 'opened' }))
    expect(container.querySelector('.main-window-dim')).toBeInTheDocument()
    expect(pauseMock).toHaveBeenCalled()

    const playCallsBeforeResume = playMock.mock.calls.length
    act(() => api.emitWizardLifecycle({ type: 'closed', outcome: 'cancelled' }))
    await waitFor(() => expect(container.querySelector('.main-window-dim')).not.toBeInTheDocument())
    await waitFor(() => expect(playMock.mock.calls.length).toBeGreaterThan(playCallsBeforeResume))
  })

  it('refreshes media and enters sync setup after wizard completion without resuming playback', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    fireEvent.click(screen.getByLabelText('Play'))
    await waitFor(() => expect(playMock).toHaveBeenCalledTimes(2))

    act(() => api.emitWizardLifecycle({ type: 'opened' }))
    const playCallsBeforeCompletion = playMock.mock.calls.length
    act(() => api.emitWizardLifecycle({ type: 'closed', outcome: 'completed' }))

    await waitFor(() => expect(api.getLibrary).toHaveBeenCalledTimes(2))
    expect(playMock.mock.calls.length).toBe(playCallsBeforeCompletion)

    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    expect(await screen.findByText('Sync setup')).toBeInTheDocument()
  })

  it('closes a popped-out movie before loading completed wizard media', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    fireEvent.click(screen.getByLabelText('Pop out movie to separate window'))
    await waitFor(() => expect(api.openMovieWindow).toHaveBeenCalled())
    await waitFor(() => expect(document.querySelector('video.pip-video')).not.toBeInTheDocument())

    await api.createOrSwitchSessionFromPaths('C:\\Reactions\\Wizard.mp4', 'C:\\Movies\\Wizard.mp4', 'local')
    vi.mocked(api.closeMovieWindow).mockClear()
    vi.mocked(api.getMediaUrl).mockClear()

    act(() => api.emitWizardLifecycle({ type: 'closed', outcome: 'completed' }))

    await waitFor(() => expect(api.closeMovieWindow).toHaveBeenCalledWith({ notifyMainWindow: false }))
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 'wizard-session'))
    expect(vi.mocked(api.closeMovieWindow).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.getMediaUrl).mock.invocationCallOrder[0]
    )
    expect(await screen.findByLabelText('Movie picture in picture')).toBeInTheDocument()
  })

  it('keeps a popped-out movie active when the wizard is cancelled', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    fireEvent.click(screen.getByLabelText('Pop out movie to separate window'))
    await waitFor(() => expect(api.openMovieWindow).toHaveBeenCalled())
    await waitFor(() => expect(document.querySelector('video.pip-video')).not.toBeInTheDocument())
    vi.mocked(api.closeMovieWindow).mockClear()

    act(() => api.emitWizardLifecycle({ type: 'opened' }))
    act(() => api.emitWizardLifecycle({ type: 'closed', outcome: 'cancelled' }))

    await waitFor(() => expect(container.querySelector('.main-window-dim')).not.toBeInTheDocument())
    expect(api.closeMovieWindow).not.toHaveBeenCalled()
    expect(document.querySelector('video.pip-video')).not.toBeInTheDocument()
  })

  it('returns an unresponsive movie window to PiP with a helpful message', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    fireEvent.click(screen.getByLabelText('Pop out movie to separate window'))
    await waitFor(() => expect(document.querySelector('video.pip-video')).not.toBeInTheDocument())

    act(() => api.emitMovieWindowClosed({ reason: 'unresponsive' }))

    expect(
      await screen.findByText(
        'The movie window stopped responding. It has been moved back to the main window. You can pop it out again from the PiP toolbar.'
      )
    ).toBeInTheDocument()
    expect(await screen.findByLabelText('Movie picture in picture')).toBeInTheDocument()
  })

  it('opens and closes the command panel with Ctrl+Shift+P, manages focus, and persists preferences', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))

    screen.getByLabelText('Command Panel').focus()
    fireEvent.keyDown(window, { code: 'KeyP', ctrlKey: true, shiftKey: true })
    expect(await screen.findByLabelText('WatchAlong Command Panel')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Close Command Panel')).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: /Preferences/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Open Library on launch/i }))

    await waitFor(() => expect(api.setPreference).toHaveBeenCalledWith('openLibraryOnLaunch', true))

    fireEvent.click(screen.getByRole('button', { name: /Help & About/i }))
    expect(screen.getByRole('button', { name: /Buy the developer a coffee/i })).toBeDisabled()
    expect(screen.getByText('Donation link coming soon.')).toBeInTheDocument()

    fireEvent.keyDown(window, { code: 'Escape' })
    await waitFor(() => expect(screen.queryByLabelText('WatchAlong Command Panel')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByLabelText('Command Panel')).toHaveFocus())
  })

  it('renames and deletes sessions from library card actions', async () => {
    const api = createApi()
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'More actions' })[0])
    fireEvent.click(screen.getByRole('button', { name: /Rename/i }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renamed session' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))

    await waitFor(() => expect(api.renameSession).toHaveBeenCalledWith('s1', 'Renamed session'))

    fireEvent.click(screen.getAllByRole('button', { name: 'More actions' })[0])
    fireEvent.click(screen.getByRole('button', { name: /Delete/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }))

    await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith('s1'))
  })

  it('renders unknown for invalid session timestamps', async () => {
    const session = createSession('s1', 'First', 0, { updatedAt: 'not-a-date' })
    const api = createApi(createLibrary('s1', [session]))
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByText(/Local file \/ Unknown/i)).toBeInTheDocument()
  })
})

function createSession(
  id: string,
  title: string,
  lastReactionTimeSeconds: number,
  patch: Partial<LibrarySession> = {}
): LibrarySession {
  const base: LibrarySession = {
    id,
    title,
    reactionPath: `C:\\Videos\\${id}-reaction.mp4`,
    reactionSource: 'local',
    reactionDurationSeconds: 120,
    moviePath: `C:\\Videos\\${id}-movie.mp4`,
    subtitlePath: null,
    offsetSeconds: 0,
    lastReactionTimeSeconds,
    overlay: { x: 24, y: 24, width: 420, height: 236 },
    isPipHidden: false,
    isMoviePoppedOut: false,
    movieWindowGeometry: { x: 24, y: 24, width: 420, height: 236 },
    reactionVolume: 1,
    movieVolume: 1,
    isReactionMuted: false,
    isMovieMuted: false,
    playbackRate: 1,
    movieRateCorrection: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }

  return {
    ...base,
    ...patch,
    reactionSource: patch.reactionSource ?? base.reactionSource,
    reactionDurationSeconds: patch.reactionDurationSeconds ?? base.reactionDurationSeconds
  }
}

function remoteState(patch = {}) {
  return {
    currentTime: 0,
    duration: 120,
    paused: true,
    playbackRate: 1,
    readyState: 4,
    seeking: false,
    ended: false,
    volume: 1,
    muted: false,
    ...patch
  }
}
