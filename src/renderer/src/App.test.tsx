import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { SyncController } from './sync/SyncController'
import { keyboardShortcutHelpGroups } from './keyboardShortcuts'
import { normalizeLibrary } from '@shared/session'
import type { BrowserAudioTrack, BrowserAudioTrackList } from './playback/audioTrackCapability'
import type {
  AppPreferences,
  AutoSyncCompleteCallback,
  AutoSyncProgressCallback,
  DownloadProgressCallback,
  LibrarySession,
  MovieWindowClosedEvent,
  MovieWindowGeometryCallback,
  MovieWindowLifecycleCallback,
  RemoteMediaEventCallback,
  SessionLibrary,
  WatchAlongApi,
  WizardLifecycleCallback
} from '@shared/types'

const firstSession = createSession('s1', 'First', 0)
const secondSession = createSession('s2', 'Second', 20)

function createLibrary(activeSessionId: string | null = 's1', sessions: LibrarySession[] = [firstSession, secondSession]): SessionLibrary {
  return normalizeLibrary({
    version: 7,
    activeSessionId,
    sessions,
    reactors: []
  })
}

const defaultPreferences: AppPreferences = {
  hasCompletedOnboarding: true,
  openLibraryOnLaunch: true,
  libraryView: 'grid',
  reactionDownloadDirectory: null,
  cabinetTheme: 'system'
}

function createApi(
  library = createLibrary(),
  preferences: AppPreferences = defaultPreferences
): WatchAlongApi & {
  emitWizardLifecycle(event: Parameters<WizardLifecycleCallback>[0]): void
  emitMovieWindowPopInRequest(): void
  emitMovieWindowGeometry(event: Parameters<MovieWindowGeometryCallback>[0]): void
  emitMovieWindowClosed(event?: MovieWindowClosedEvent): void
  emitMainWindowCloseRequest(): void
  emitMediaPlayPause(): void
  emitAutoSyncProgress(event: Parameters<AutoSyncProgressCallback>[0]): void
  emitAutoSyncComplete(event: Parameters<AutoSyncCompleteCallback>[0]): void
  emitDownloadProgress(event: Parameters<DownloadProgressCallback>[0]): void
} {
  let currentLibrary = library
  let currentPreferences = preferences
  let wizardLifecycleCallback: WizardLifecycleCallback | null = null
  let movieWindowPopInCallback: MovieWindowLifecycleCallback | null = null
  let movieWindowGeometryCallback: MovieWindowGeometryCallback | null = null
  let movieWindowClosedCallback: MovieWindowLifecycleCallback | null = null
  let mainWindowCloseCallback: (() => void) | null = null
  let mediaPlayPauseCallback: (() => void) | null = null
  let autoSyncProgressCallback: AutoSyncProgressCallback | null = null
  let autoSyncCompleteCallback: AutoSyncCompleteCallback | null = null
  const downloadProgressCallbacks = new Set<DownloadProgressCallback>()

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
    getLibraryRecoveryStatus: vi.fn(async () => ({ available: false })),
    revealLibraryRecoveryFile: vi.fn(async () => false),
    startFreshLibraryAfterRecovery: vi.fn(async () => createLibrary(null, [])),
    getPreferences: vi.fn(async () => currentPreferences),
    getCabinetThemePreference: vi.fn(async () => currentPreferences.cabinetTheme),
    onCabinetThemePreference: vi.fn(() => vi.fn()),
    setPreference: vi.fn(async (key: keyof AppPreferences, value: AppPreferences[keyof AppPreferences]) => {
      currentPreferences = { ...currentPreferences, [key]: value }
      return currentPreferences
    }),
    selectDownloadDirectory: vi.fn(async () => ({
      ...currentPreferences,
      reactionDownloadDirectory: 'C:\\Downloads\\WatchAlong'
    })),
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
    saveMovieWindowState: vi.fn(async (sessionId, patch) => {
      currentLibrary = {
        ...currentLibrary,
        sessions: currentLibrary.sessions.map((session) =>
          session.id === sessionId ? { ...session, ...patch } : session
        )
      }
      return currentLibrary
    }),
    saveSessionPosition: vi.fn(async (sessionId: string, lastReactionTimeSeconds: number) => {
      currentLibrary = {
        ...currentLibrary,
        sessions: currentLibrary.sessions.map((session) =>
          session.id === sessionId ? { ...session, lastReactionTimeSeconds } : session
        )
      }
      return currentLibrary
    }),
    replaceSessionMedia: vi.fn(async (sessionId, role, path, reactionSource, suggestedTitle) => {
      currentLibrary = {
        ...currentLibrary,
        activeSessionId: sessionId,
        sessions: currentLibrary.sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                ...(role === 'movie' ? { moviePath: path } : { reactionPath: path, reactionSource: reactionSource ?? session.reactionSource }),
                ...(suggestedTitle ? { title: suggestedTitle } : {})
              }
            : session
        )
      }
      return { status: 'replaced' as const, library: currentLibrary }
    }),
    setSessionMedia: vi.fn(async (role, path, reactionSource, suggestedTitle) => {
      currentLibrary = {
        ...currentLibrary,
        sessions: currentLibrary.sessions.map((session) =>
          session.id === currentLibrary.activeSessionId
            ? {
                ...session,
                ...(role === 'movie'
                  ? { moviePath: path }
                  : { reactionPath: path, reactionSource: reactionSource ?? session.reactionSource }),
                ...(suggestedTitle ? { title: suggestedTitle } : {})
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
    renameSession: vi.fn(async (sessionId: string, title: string, reactorName?: string) => {
      currentLibrary = {
        ...currentLibrary,
        sessions: currentLibrary.sessions.map((session) => (session.id === sessionId
          ? { ...session, title, reactorName: reactorName?.trim() || null, reactorNameOrigin: 'custom' as const }
          : session))
      }
      return currentLibrary
    }),
    assignSessionReactor: vi.fn(async (sessionId, assignment) => {
      const targetProfile = assignment.target.type === 'existing'
        ? currentLibrary.reactors.find((profile) => profile.id === assignment.target.reactorId) ?? null
        : {
            id: `reactor-test-${currentLibrary.reactors.length + 1}`,
            name: assignment.target.name.trim(),
            avatarPath: null,
            externalIdentityKeys: [],
            createdAt: '2026-07-17T00:00:00.000Z',
            updatedAt: '2026-07-17T00:00:00.000Z'
          }
      if (!targetProfile) return currentLibrary
      const source = currentLibrary.sessions.find((session) => session.id === sessionId)
      const movingIds = new Set(assignment.scope === 'reactor' && source?.reactorId
        ? currentLibrary.sessions.filter((session) => session.reactorId === source.reactorId).map((session) => session.id)
        : [sessionId])
      currentLibrary = {
        ...currentLibrary,
        reactors: [...currentLibrary.reactors.filter((profile) => profile.id !== targetProfile.id), targetProfile],
        sessions: currentLibrary.sessions.map((session) => movingIds.has(session.id)
          ? { ...session, reactorId: targetProfile.id, reactorName: targetProfile.name, reactorNameOrigin: 'custom' as const }
          : session)
      }
      return currentLibrary
    }),
    chooseMoviePoster: vi.fn(async (sessionId: string) => {
      const target = currentLibrary.sessions.find((session) => session.id === sessionId)
      if (!target?.moviePath) return null
      currentLibrary = {
        ...currentLibrary,
        sessions: currentLibrary.sessions.map((session) => session.moviePath === target.moviePath
          ? { ...session, moviePosterPath: 'C:\\Posters\\chosen.jpg', updatedAt: '2026-07-14T18:00:00.000Z' }
          : session)
      }
      return currentLibrary
    }),
    clearMoviePoster: vi.fn(async (sessionId: string) => {
      const target = currentLibrary.sessions.find((session) => session.id === sessionId)
      currentLibrary = target?.moviePath
        ? {
            ...currentLibrary,
            sessions: currentLibrary.sessions.map((session) => session.moviePath === target.moviePath
              ? { ...session, moviePosterPath: null, updatedAt: '2026-07-14T18:01:00.000Z' }
              : session)
          }
        : currentLibrary
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
    onMovieWindowGeometry: vi.fn((callback: MovieWindowGeometryCallback) => {
      movieWindowGeometryCallback = callback
      return vi.fn()
    }),
    onMovieWindowPopInRequest: vi.fn((callback: MovieWindowLifecycleCallback) => {
      movieWindowPopInCallback = callback
      return vi.fn()
    }),
    onMovieWindowClosed: vi.fn((callback: MovieWindowLifecycleCallback) => {
      movieWindowClosedCallback = callback
      return vi.fn()
    }),
    checkTools: vi.fn(async () => ({ ready: true, tools: [] })),
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
    onDownloadProgress: vi.fn((callback: DownloadProgressCallback) => {
      downloadProgressCallbacks.add(callback)
      return () => downloadProgressCallbacks.delete(callback)
    }),
    startSessionAutoSync: vi.fn(async () => ({ started: true })),
    cancelSessionAutoSync: vi.fn(async () => undefined),
    onAutoSyncProgress: vi.fn((callback: AutoSyncProgressCallback) => {
      autoSyncProgressCallback = callback
      return vi.fn()
    }),
    onAutoSyncComplete: vi.fn((callback: AutoSyncCompleteCallback) => {
      autoSyncCompleteCallback = callback
      return vi.fn()
    }),
    openOnboardingWizard: vi.fn(async () => undefined),
    openImportWizard: vi.fn(async () => undefined),
    getImportWizardContext: vi.fn(async () => ({ mode: 'new' as const, sessionId: null, movie: null })),
    finishOnboardingWizard: vi.fn(async () => undefined),
    onWizardLifecycle: vi.fn((callback: WizardLifecycleCallback) => {
      wizardLifecycleCallback = callback
      return vi.fn()
    }),
    onWizardCloseRequest: vi.fn(() => vi.fn()),
    confirmMainWindowClose: vi.fn(async () => undefined),
    onMainWindowCloseRequest: vi.fn((callback: () => void) => {
      mainWindowCloseCallback = callback
      return vi.fn()
    }),
    setMediaPlayPauseEnabled: vi.fn(async (enabled: boolean) => enabled),
    onMediaPlayPause: vi.fn((callback: () => void) => {
      mediaPlayPauseCallback = callback
      return () => {
        if (mediaPlayPauseCallback === callback) mediaPlayPauseCallback = null
      }
    })
  }

  return Object.assign(api, {
    emitWizardLifecycle(event: Parameters<WizardLifecycleCallback>[0]) {
      wizardLifecycleCallback?.(event)
    },
    emitMovieWindowPopInRequest() {
      movieWindowPopInCallback?.()
    },
    emitMovieWindowGeometry(event: Parameters<MovieWindowGeometryCallback>[0]) {
      movieWindowGeometryCallback?.(event)
    },
    emitMovieWindowClosed(event?: MovieWindowClosedEvent) {
      movieWindowClosedCallback?.(event)
    },
    emitMainWindowCloseRequest() {
      mainWindowCloseCallback?.()
    },
    emitMediaPlayPause() {
      mediaPlayPauseCallback?.()
    },
    emitAutoSyncProgress(event: Parameters<AutoSyncProgressCallback>[0]) {
      autoSyncProgressCallback?.(event)
    },
    emitAutoSyncComplete(event: Parameters<AutoSyncCompleteCallback>[0]) {
      autoSyncCompleteCallback?.(event)
    },
    emitDownloadProgress(event: Parameters<DownloadProgressCallback>[0]) {
      for (const callback of downloadProgressCallbacks) callback(event)
    }
  }) as unknown as WatchAlongApi & {
    emitWizardLifecycle(event: Parameters<WizardLifecycleCallback>[0]): void
    emitMovieWindowPopInRequest(): void
    emitMovieWindowGeometry(event: Parameters<MovieWindowGeometryCallback>[0]): void
    emitMovieWindowClosed(event?: MovieWindowClosedEvent): void
    emitMainWindowCloseRequest(): void
    emitMediaPlayPause(): void
    emitAutoSyncProgress(event: Parameters<AutoSyncProgressCallback>[0]): void
    emitAutoSyncComplete(event: Parameters<AutoSyncCompleteCallback>[0]): void
    emitDownloadProgress(event: Parameters<DownloadProgressCallback>[0]): void
  }
}

function popOutFromOverlay(): void {
  fireEvent.click(
    within(screen.getByLabelText('Movie picture in picture')).getByRole('button', { name: 'Pop out movie' })
  )
}

describe('App', () => {
  let playMock: ReturnType<typeof vi.fn>
  let pauseMock: ReturnType<typeof vi.fn>
  let fullscreenTargets: Element[]
  let fullscreenElement: Element | null

  beforeEach(() => {
    window.localStorage.clear()
    playMock = vi.fn(async () => undefined)
    pauseMock = vi.fn()
    fullscreenTargets = []
    fullscreenElement = null
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
        fullscreenElement = this
        document.dispatchEvent(new Event('fullscreenchange'))
        return Promise.resolve()
      })
    })
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement
    })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: vi.fn(async () => {
        fullscreenElement = null
        document.dispatchEvent(new Event('fullscreenchange'))
      })
    })
  })

  it('renders the populated library by default and opens a session from a card', async () => {
    const api = createApi()
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
    expect(api.getMediaUrl).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Open First/ }))

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

  it('restores a previously saved reaction position when loading a session', async () => {
    const session = createSession('s1', 'First', 37.5)
    const api = createApi(createLibrary('s1', [session]), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    const reaction = container.querySelector('video.reaction-video') as HTMLVideoElement

    fireEvent.loadedMetadata(reaction)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)

    await waitFor(() => expect(reaction.currentTime).toBe(37.5))
  })

  it('owns the system play/pause key only while playback is ready and toggles both videos', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container, unmount } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('movie', 's1'))
    expect(api.setMediaPlayPauseEnabled).not.toHaveBeenCalledWith(true)

    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    await waitFor(() => expect(api.setMediaPlayPauseEnabled).toHaveBeenLastCalledWith(true))

    playMock.mockClear()
    pauseMock.mockClear()
    act(() => api.emitMediaPlayPause())
    await waitFor(() => expect(playMock).toHaveBeenCalledTimes(2))
    await screen.findByLabelText('Playback status: playing')

    const pauseCallsBeforeMediaKey = pauseMock.mock.calls.length
    act(() => api.emitMediaPlayPause())
    await waitFor(() => expect(pauseMock).toHaveBeenCalledTimes(pauseCallsBeforeMediaKey + 2))

    fireEvent.click(screen.getByLabelText('Command Panel'))
    fireEvent.click(await screen.findByRole('button', { name: /Close Session/i }))
    await waitFor(() => expect(api.setMediaPlayPauseEnabled).toHaveBeenLastCalledWith(false))

    unmount()
    expect(api.setMediaPlayPauseEnabled).toHaveBeenLastCalledWith(false)
  })

  it('shows playable movie tracks and persists a switch only after Chromium confirms it', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('movie', 's1'))
    const reaction = container.querySelector('video.reaction-video')!
    const movie = container.querySelector('video.pip-video') as HTMLVideoElement
    const audioTracks = new FakeAudioTrackList([
      { enabled: true, label: 'English (5.1)', language: 'eng' },
      { enabled: false, label: 'Indonesian (5.1)', language: 'ind' }
    ])
    Object.defineProperty(movie, 'audioTracks', { configurable: true, value: audioTracks })
    fireEvent.loadedMetadata(reaction)
    fireEvent.loadedMetadata(movie)

    fireEvent.click(await screen.findByLabelText('Movie audio: English (5.1)'))
    fireEvent.click(screen.getByRole('button', { name: /Indonesian \(5\.1\).*Indonesian/i }))
    expect(api.saveActiveSession).not.toHaveBeenCalledWith(expect.objectContaining({
      movieAudioTrackPreference: expect.anything()
    }))

    act(() => audioTracks.dispatchEvent(new Event('change')))
    await waitFor(() => expect(api.saveActiveSession).toHaveBeenCalledWith({
      movieAudioTrackPreference: { label: 'Indonesian (5.1)', language: 'ind', ordinal: 1 }
    }))
    expect(await screen.findByLabelText('Movie audio: Indonesian (5.1)')).toBeInTheDocument()
  })

  it('restores a semantic movie track without rewriting the saved preference', async () => {
    const preferred = createSession('s1', 'First', 0, {
      movieAudioTrackPreference: { label: 'Original audio', language: 'ind', ordinal: 1 }
    })
    const api = createApi(createLibrary('s1', [preferred]), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('movie', 's1'))
    const movie = container.querySelector('video.pip-video') as HTMLVideoElement
    const audioTracks = new FakeAudioTrackList([
      { enabled: true, label: 'English dub', language: 'eng' },
      { enabled: false, label: 'Original audio', language: 'ind' }
    ])
    Object.defineProperty(movie, 'audioTracks', { configurable: true, value: audioTracks })
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(movie)
    act(() => audioTracks.dispatchEvent(new Event('change')))

    expect(await screen.findByLabelText('Movie audio: Original audio')).toBeInTheDocument()
    expect(api.saveActiveSession).not.toHaveBeenCalledWith(expect.objectContaining({
      movieAudioTrackPreference: expect.anything()
    }))
  })

  it('keeps Chromium’s default when the saved semantic track is no longer playable', async () => {
    const preferred = createSession('s1', 'First', 0, {
      movieAudioTrackPreference: { label: 'Missing French commentary', language: 'fra', ordinal: 2 }
    })
    const api = createApi(createLibrary('s1', [preferred]), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('movie', 's1'))
    const movie = container.querySelector('video.pip-video') as HTMLVideoElement
    const audioTracks = new FakeAudioTrackList([
      { enabled: true, label: 'English dub', language: 'eng' },
      { enabled: false, label: 'Original audio', language: 'ind' }
    ])
    Object.defineProperty(movie, 'audioTracks', { configurable: true, value: audioTracks })
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(movie)

    expect(await screen.findByLabelText('Movie audio: English dub')).toBeInTheDocument()
    expect(audioTracks.states()).toEqual([true, false])
  })

  it('changes and persists the library layout from the library header', async () => {
    const api = createApi()
    window.watchAlong = api

    render(<App />)

    const library = await screen.findByLabelText('WatchAlong Library')
    expect(library).toHaveClass('library-home-grid')

    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    await waitFor(() => expect(api.setPreference).toHaveBeenCalledWith('libraryView', 'list'))
    await waitFor(() => expect(library).toHaveClass('library-home-list'))

    fireEvent.click(screen.getByRole('button', { name: 'Posters' }))
    await waitFor(() => expect(api.setPreference).toHaveBeenLastCalledWith('libraryView', 'grid'))
    await waitFor(() => expect(library).toHaveClass('library-home-grid'))
  })

  it('restores a previously saved reaction position when opening a session from the library', async () => {
    const session = createSession('s1', 'First', 37.5)
    const api = createApi(createLibrary('s1', [session]))
    window.watchAlong = api
    const loadSession = vi.spyOn(SyncController.prototype, 'loadSession')

    const { container } = render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Open First/ }))
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    expect(api.saveSessionPosition).not.toHaveBeenCalled()
    const reaction = container.querySelector('video.reaction-video') as HTMLVideoElement
    const movie = container.querySelector('video.pip-video') as HTMLVideoElement

    await waitFor(() => {
      expect(reaction).toHaveAttribute('src', 'watchalong://media/s1/reaction')
      expect(movie).toHaveAttribute('src', 'watchalong://media/s1/movie')
    })

    // A real controller animation frame runs before media metadata arrives.
    // It must not replace the stored position with the element's initial zero.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(api.saveSessionPosition).not.toHaveBeenCalledWith('s1', 0)

    fireEvent.loadedMetadata(reaction)
    fireEvent.loadedMetadata(movie)

    await waitFor(() => expect(loadSession).toHaveBeenCalledWith(37.5))
    await waitFor(() => {
      expect(reaction.currentTime).toBe(37.5)
      expect(movie.currentTime).toBe(37.5)
    })
    loadSession.mockRestore()
  })

  it('keeps the saved position when a loading session is closed before metadata arrives', async () => {
    const session = createSession('s1', 'First', 37.5)
    const api = createApi(createLibrary('s1', [session]))
    window.watchAlong = api

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Open First/ }))
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))

    // Let the controller's pre-metadata animation frames run. They report the
    // element's initial zero, which must not replace the disk-backed fallback.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))
    vi.mocked(api.saveSessionPosition).mockClear()

    fireEvent.click(screen.getByLabelText('Command Panel'))
    fireEvent.click(await screen.findByRole('button', { name: /Close Session/i }))

    await waitFor(() => expect(api.saveSessionPosition).toHaveBeenCalledWith('s1', 37.5))
    expect(api.saveSessionPosition).not.toHaveBeenCalledWith('s1', 0)
  })

  it('falls back to the empty library when resume on launch is enabled but no sessions exist', async () => {
    const api = createApi(createLibrary(null, []), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'No WatchAlong pairings yet' })).toBeInTheDocument()
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
    expect(screen.getByText('WatchAlong could not safely open your library. No files were changed.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Open Library/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }))

    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
    expect(api.getLibrary).toHaveBeenCalledTimes(2)
  })

  it('keeps a damaged library recoverable while offering an explicit fresh start', async () => {
    const api = createApi()
    api.getLibrary = vi.fn()
      .mockRejectedValueOnce(new Error('WatchAlong moved a damaged library to a recovery file.'))
      .mockResolvedValueOnce(createLibrary(null, []))
    api.getLibraryRecoveryStatus = vi.fn(async () => ({ available: true }))
    api.revealLibraryRecoveryFile = vi.fn(async () => true)
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByText(/moved a damaged library to a recovery file/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Show Recovery File/i }))
    await waitFor(() => expect(api.revealLibraryRecoveryFile).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', { name: /Start New Library/i }))
    await waitFor(() => expect(api.startFreshLibraryAfterRecovery).toHaveBeenCalledOnce())
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

  it('keeps window-level shortcuts available during Sync Setup while transport and timing keys stay scoped to setup', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)

    fireEvent.click(screen.getByLabelText('Playback settings'))
    fireEvent.click(screen.getByRole('button', { name: 'Sync Setup' }))
    expect(await screen.findByLabelText('Sync setup')).toBeInTheDocument()
    vi.mocked(api.saveActiveSession).mockClear()

    fireEvent.keyDown(window, { code: 'KeyR' })
    fireEvent.keyDown(window, { code: 'KeyM' })
    fireEvent.keyDown(window, { code: 'KeyP' })
    fireEvent.keyDown(window, { code: 'Enter', altKey: true })

    await waitFor(() => expect(api.saveActiveSession).toHaveBeenCalledWith({ isReactionMuted: true }))
    await waitFor(() => expect(api.saveActiveSession).toHaveBeenCalledWith({ isMovieMuted: true }))
    await waitFor(() => expect(api.saveActiveSession).toHaveBeenCalledWith({ isPipHidden: true }))
    expect(fullscreenTargets).toEqual([document.documentElement])

    vi.mocked(api.saveActiveSession).mockClear()
    fireEvent.keyDown(window, { code: 'Space' })
    fireEvent.keyDown(window, { code: 'ArrowRight' })
    fireEvent.keyDown(window, { code: 'BracketRight' })
    expect(playMock).not.toHaveBeenCalled()
    expect(api.saveActiveSession).not.toHaveBeenCalled()
  })

  it('keeps playback shortcuts out of controls, editors, and modified key combinations', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    vi.mocked(api.saveActiveSession).mockClear()

    fireEvent.keyDown(screen.getByLabelText('Reaction timeline'), { code: 'KeyR' })
    fireEvent.keyDown(screen.getByLabelText('Reaction timeline'), { code: 'Enter', altKey: true })
    fireEvent.keyDown(screen.getByLabelText('Fullscreen'), { code: 'Space' })
    fireEvent.keyDown(window, { code: 'KeyR', ctrlKey: true })

    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    document.body.appendChild(editor)
    fireEvent.keyDown(editor, { code: 'KeyM' })
    editor.remove()

    expect(api.saveActiveSession).not.toHaveBeenCalled()
    expect(playMock).not.toHaveBeenCalled()
    expect(fullscreenTargets).toHaveLength(0)
  })

  it('toggles player fullscreen with Alt+Enter and leaves unmodified F unused', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))

    fireEvent.keyDown(window, { code: 'KeyF' })
    expect(fullscreenTargets).toHaveLength(0)

    fireEvent.keyDown(window, { code: 'Enter', altKey: true })
    expect(fullscreenTargets).toEqual([document.documentElement])
    expect(document.fullscreenElement).toBe(document.documentElement)
    expect(screen.getByLabelText('Exit fullscreen')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.keyDown(window, { code: 'Enter', altKey: true, repeat: true })
    fireEvent.keyDown(window, { code: 'Enter', altKey: true, shiftKey: true })
    expect(document.exitFullscreen).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { code: 'Enter', altKey: true })
    await waitFor(() => expect(document.exitFullscreen).toHaveBeenCalledOnce())
    expect(document.fullscreenElement).toBeNull()
    expect(screen.getByLabelText('Fullscreen')).toHaveAttribute('aria-pressed', 'false')
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

  it('keeps downloaded reactor metadata when a missing reaction is relocated', async () => {
    const session = createSession('s1', 'Movie — Downloaded Name', 0, {
      titleOrigin: 'generated',
      reactionSource: 'youtube',
      reactorName: 'Downloaded Name',
      reactorNameOrigin: 'metadata'
    })
    const api = createApi(createLibrary('s1', [session]), { ...defaultPreferences, openLibraryOnLaunch: false })
    api.getMediaUrl = vi.fn(async (role, sessionId) =>
      role === 'reaction' ? null : `watchalong://media/${sessionId}/${role}`)
    window.watchAlong = api

    render(<App />)
    expect(await screen.findByLabelText('Missing media recovery')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Locate reaction/i }))

    await waitFor(() => expect(api.replaceSessionMedia).toHaveBeenCalledWith(
      's1',
      'reaction',
      'C:\\Reactions\\Located reaction.mp4',
      'youtube',
      undefined,
      'Downloaded Name'
    ))
  })

  it('opens an existing pairing without deleting either session when replacement conflicts', async () => {
    const existing = createSession('s2', 'Already saved', 97, {
      reactionPath: firstSession.reactionPath,
      moviePath: 'C:\\Movies\\Located movie.mp4'
    })
    const library = createLibrary('s1', [firstSession, existing])
    const api = createApi(library, { ...defaultPreferences, openLibraryOnLaunch: false })
    api.getMediaUrl = vi.fn(async (role, sessionId) =>
      sessionId === 's1' && role === 'movie' ? null : `watchalong://media/${sessionId}/${role}`)
    api.replaceSessionMedia = vi.fn(async () => ({
      status: 'conflict' as const,
      library,
      existingSessionId: 's2'
    }))
    window.watchAlong = api

    render(<App />)
    expect(await screen.findByLabelText('Missing media recovery')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Locate movie/i }))

    await waitFor(() => expect(api.setActiveSession).toHaveBeenCalledWith('s2'))
    expect(await screen.findByText(/exact pairing is already in your library/i)).toBeInTheDocument()
    expect(api.deleteSession).not.toHaveBeenCalled()
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
    expect(await screen.findByRole('heading', { name: 'No WatchAlong pairings yet' })).toBeInTheDocument()
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

  it('keeps playback essentials on the remote and configuration inside Playback settings', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))

    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)

    const remote = within(screen.getByLabelText('Playback controls'))
    expect(remote.getByLabelText('Play')).toBeInTheDocument()
    expect(remote.getByLabelText('Back 5 seconds')).toBeInTheDocument()
    expect(remote.getByLabelText('Forward 5 seconds')).toBeInTheDocument()
    expect(remote.getByLabelText('Pop out movie')).toBeInTheDocument()
    expect(remote.getByLabelText('Reaction volume')).toBeInTheDocument()
    expect(remote.getByLabelText('Movie volume')).toBeInTheDocument()
    expect(remote.getByLabelText('Fullscreen')).toBeInTheDocument()
    expect(remote.getByLabelText('Command Panel')).toBeInTheDocument()

    const settingsButton = remote.getByLabelText('Playback settings')
    const settings = settingsButton.closest('details')
    const syncSetup = screen.getByRole('button', { name: 'Sync Setup' })
    expect(settings).not.toHaveAttribute('open')
    expect(settings).toContainElement(syncSetup)

    fireEvent.click(settingsButton)
    await waitFor(() => expect(settingsButton).toHaveAttribute('aria-expanded', 'true'))
    expect(settings).toHaveAttribute('open')

    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(settings).not.toHaveAttribute('open'))

    fireEvent.click(settingsButton)
    await waitFor(() => expect(settingsButton).toHaveAttribute('aria-expanded', 'true'))
    expect(settings).toHaveAttribute('open')

    fireEvent.click(syncSetup)
    expect(settings).not.toHaveAttribute('open')
    expect(screen.getByLabelText('Sync setup')).toBeInTheDocument()
  })

  it('saves periodic playback position by session id', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    const reaction = container.querySelector('video.reaction-video') as HTMLVideoElement
    fireEvent.loadedMetadata(reaction)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    reaction.currentTime = 42.25
    fireEvent.click(screen.getByLabelText('Play'))
    await waitFor(() => expect(playMock).toHaveBeenCalled())

    await waitFor(() => expect(api.saveSessionPosition).toHaveBeenCalledWith('s1', 42.25))
    expect(api.saveActiveSession).not.toHaveBeenCalledWith(expect.objectContaining({ lastReactionTimeSeconds: 42.25 }))
  })

  it('flushes the current position before switching sessions', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    const reaction = container.querySelector('video.reaction-video') as HTMLVideoElement
    fireEvent.loadedMetadata(reaction)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    reaction.currentTime = 51.125
    vi.mocked(api.saveSessionPosition).mockClear()
    vi.mocked(api.setActiveSession).mockClear()

    fireEvent.click(screen.getByLabelText('Command Panel'))
    fireEvent.click(await screen.findByRole('button', { name: /Library/ }))
    fireEvent.click(screen.getByRole('button', { name: /Open Second/ }))

    await waitFor(() => expect(api.setActiveSession).toHaveBeenCalledWith('s2'))
    const saveIndex = vi.mocked(api.saveSessionPosition).mock.calls.findIndex(
      ([sessionId, time]) => sessionId === 's1' && time === 51.125
    )
    expect(saveIndex).toBeGreaterThanOrEqual(0)
    expect(vi.mocked(api.saveSessionPosition).mock.invocationCallOrder[saveIndex]).toBeLessThan(
      vi.mocked(api.setActiveSession).mock.invocationCallOrder[0]
    )
  })

  it('flushes the current position before closing to the library', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    const reaction = container.querySelector('video.reaction-video') as HTMLVideoElement
    fireEvent.loadedMetadata(reaction)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    reaction.currentTime = 64.5
    vi.mocked(api.saveSessionPosition).mockClear()

    fireEvent.click(screen.getByLabelText('Command Panel'))
    fireEvent.click(await screen.findByRole('button', { name: /Close Session/i }))

    await waitFor(() => expect(api.saveSessionPosition).toHaveBeenCalledWith('s1', 64.5))
    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
  })

  it('flushes the native reaction time when the media element resets before close', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    const reaction = container.querySelector('video.reaction-video') as HTMLVideoElement
    fireEvent.loadedMetadata(reaction)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    reaction.currentTime = 37.25
    Object.defineProperty(reaction, 'readyState', { configurable: true, get: () => 4 })
    fireEvent.timeUpdate(reaction)
    Object.defineProperty(reaction, 'readyState', { configurable: true, get: () => 0 })
    vi.mocked(api.saveSessionPosition).mockClear()

    fireEvent.click(screen.getByLabelText('Command Panel'))
    fireEvent.click(await screen.findByRole('button', { name: /Close Session/i }))

    await waitFor(() => expect(api.saveSessionPosition).toHaveBeenCalledWith('s1', 37.25))
  })

  it('restores the freshly flushed position when closing and reopening the same session', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api
    const loadSession = vi.spyOn(SyncController.prototype, 'loadSession')

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    const firstReaction = container.querySelector('video.reaction-video') as HTMLVideoElement
    fireEvent.loadedMetadata(firstReaction)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    firstReaction.currentTime = 64.5
    vi.mocked(api.saveSessionPosition).mockClear()

    fireEvent.click(screen.getByLabelText('Command Panel'))
    fireEvent.click(await screen.findByRole('button', { name: /Close Session/i }))
    await waitFor(() => expect(api.saveSessionPosition).toHaveBeenCalledWith('s1', 64.5))
    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()

    loadSession.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /Open First/ }))
    await waitFor(() => expect(container.querySelector('video.reaction-video')).toBeInTheDocument())
    const reopenedReaction = container.querySelector('video.reaction-video') as HTMLVideoElement
    const reopenedMovie = container.querySelector('video.pip-video') as HTMLVideoElement
    await waitFor(() => {
      expect(reopenedReaction).toHaveAttribute('src', 'watchalong://media/s1/reaction')
      expect(reopenedMovie).toHaveAttribute('src', 'watchalong://media/s1/movie')
    })

    fireEvent.loadedMetadata(reopenedReaction)
    fireEvent.loadedMetadata(reopenedMovie)

    await waitFor(() => expect(loadSession).toHaveBeenCalledWith(64.5))
    expect(reopenedReaction.currentTime).toBe(64.5)
    expect(reopenedMovie.currentTime).toBe(64.5)
    loadSession.mockRestore()
  })

  it('flushes the current position before confirming main-window close', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    const reaction = container.querySelector('video.reaction-video') as HTMLVideoElement
    fireEvent.loadedMetadata(reaction)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    reaction.currentTime = 73.25
    vi.mocked(api.saveSessionPosition).mockClear()

    act(() => api.emitMainWindowCloseRequest())

    await waitFor(() => expect(api.confirmMainWindowClose).toHaveBeenCalled())
    expect(api.saveSessionPosition).toHaveBeenCalledWith('s1', 73.25)
    expect(vi.mocked(api.saveSessionPosition).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.confirmMainWindowClose).mock.invocationCallOrder[0]
    )
  })

  it('removes the local PiP while detached and brings the movie back from the primary control', async () => {
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

    popOutFromOverlay()

    await waitFor(() =>
      expect(api.openMovieWindow).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: 's1',
        geometry: firstSession.overlay,
        geometryMode: 'overlay'
      }))
    )
    await waitFor(() => expect(document.querySelector('video.pip-video')).not.toBeInTheDocument())
    expect(screen.queryByLabelText('Movie picture in picture')).not.toBeInTheDocument()
    expect(document.querySelector('.pip-popped-out')).not.toBeInTheDocument()
    const bringBack = within(screen.getByLabelText('Playback controls')).getByRole('button', { name: 'Bring movie back' })
    expect(bringBack).toHaveTextContent('Bring movie back')
    expect(bringBack).toHaveAttribute('aria-pressed', 'true')
    expect(api.saveMovieWindowState).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ isMoviePoppedOut: true })
    )

    fireEvent.click(bringBack)

    await waitFor(() =>
      expect(api.saveMovieWindowState).toHaveBeenCalledWith('s1', expect.objectContaining({
        isMoviePoppedOut: false,
        overlay: { x: 12, y: 18, width: 360, height: 210 }
      }))
    )
    expect(await screen.findByLabelText('Movie picture in picture')).toBeInTheDocument()
    expect(within(screen.getByLabelText('Playback controls')).getByRole('button', { name: 'Pop out movie' }))
      .toHaveAttribute('aria-pressed', 'false')
  })

  it('uses the same overlay-relative placement from the primary and PiP pop-out controls', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)

    fireEvent.click(
      within(screen.getByLabelText('Playback controls')).getByRole('button', { name: 'Pop out movie' })
    )

    await waitFor(() => expect(api.openMovieWindow).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      geometry: firstSession.overlay,
      geometryMode: 'overlay'
    })))
    expect(screen.queryByLabelText('Movie picture in picture')).not.toBeInTheDocument()
  })

  it('makes the embedded movie visible when a hidden PiP completes the pop-out cycle', async () => {
    const hiddenSession = { ...firstSession, isPipHidden: true }
    const api = createApi(
      createLibrary('s1', [hiddenSession, secondSession]),
      { ...defaultPreferences, openLibraryOnLaunch: false }
    )
    window.watchAlong = api

    render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.click(
      within(screen.getByLabelText('Playback controls')).getByRole('button', { name: 'Pop out movie' })
    )

    await waitFor(() => expect(api.openMovieWindow).toHaveBeenCalledWith(expect.objectContaining({
      geometry: hiddenSession.overlay,
      geometryMode: 'overlay'
    })))
    await waitFor(() => expect(api.saveActiveSession).toHaveBeenCalledWith({ isPipHidden: false }))
  })

  it('coalesces duplicate pop-out clicks and discards an open that finishes after a session switch', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    let finishOpen!: (result: Awaited<ReturnType<WatchAlongApi['openMovieWindow']>>) => void
    api.openMovieWindow = vi.fn(() => new Promise<Awaited<ReturnType<WatchAlongApi['openMovieWindow']>>>((resolve) => {
      finishOpen = resolve
    }))
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)

    const popOut = within(screen.getByLabelText('Movie picture in picture')).getByRole('button', { name: 'Pop out movie' })
    fireEvent.click(popOut)
    fireEvent.click(popOut)
    await waitFor(() => expect(api.openMovieWindow).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByLabelText('Command Panel'))
    fireEvent.click(await screen.findByRole('button', { name: /Library/ }))
    fireEvent.click(screen.getByRole('button', { name: /Open Second/ }))
    await waitFor(() => expect(api.setActiveSession).toHaveBeenCalledWith('s2'))

    finishOpen({
      opened: true,
      geometry: { x: 40, y: 50, width: 360, height: 210 },
      state: remoteState()
    })

    await waitFor(() => expect(api.closeMovieWindow).toHaveBeenCalledWith({ notifyMainWindow: false }))
    expect(api.saveMovieWindowState).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ isMoviePoppedOut: true })
    )
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('movie', 's2'))
  })

  it('persists delayed detached-window geometry against its initiating session id', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    popOutFromOverlay()
    await waitFor(() => expect(api.saveMovieWindowState).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ isMoviePoppedOut: true })
    ))

    const geometry = { x: 75, y: 85, width: 480, height: 270 }
    act(() => api.emitMovieWindowGeometry({ sessionId: 's1', geometry, overlay: null }))

    fireEvent.click(screen.getByLabelText('Command Panel'))
    fireEvent.click(await screen.findByRole('button', { name: /Library/ }))
    fireEvent.click(screen.getByRole('button', { name: /Open Second/ }))
    await waitFor(() => expect(api.setActiveSession).toHaveBeenCalledWith('s2'))
    expect(api.saveMovieWindowState).toHaveBeenCalledWith('s1', { movieWindowGeometry: geometry })
    expect(api.saveMovieWindowState).not.toHaveBeenCalledWith('s2', { movieWindowGeometry: geometry })
  })

  it('double-clicking the reaction fullscreens the whole player so PiP remains visible', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))

    fireEvent.doubleClick(container.querySelector('video.reaction-video')!)

    expect(fullscreenTargets).toEqual([document.documentElement])
  })

  it('keeps app fullscreen when Close Session returns to the library', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.doubleClick(container.querySelector('video.reaction-video')!)
    expect(document.fullscreenElement).toBe(document.documentElement)

    fireEvent.click(screen.getByLabelText('Command Panel'))
    fireEvent.click(await screen.findByRole('button', { name: /Close Session/i }))

    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
    expect(document.exitFullscreen).not.toHaveBeenCalled()
    expect(document.fullscreenElement).toBe(document.documentElement)
    expect(screen.getByLabelText('Exit fullscreen')).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps app fullscreen when missing-media navigation returns to the library', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    api.getMediaUrl = vi.fn(async (role, sessionId) => role === 'movie' ? null : `watchalong://media/${sessionId}/${role}`)
    window.watchAlong = api

    const { container } = render(<App />)
    expect(await screen.findByLabelText('Missing media recovery')).toBeInTheDocument()
    fireEvent.doubleClick(container.querySelector('video.reaction-video')!)

    fireEvent.click(screen.getByRole('button', { name: /Back to Library/i }))

    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
    expect(document.exitFullscreen).not.toHaveBeenCalled()
    expect(document.fullscreenElement).toBe(document.documentElement)
  })

  it('keeps app fullscreen when removing a broken session returns to the library', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    api.getMediaUrl = vi.fn(async (role, sessionId) => role === 'movie' ? null : `watchalong://media/${sessionId}/${role}`)
    window.watchAlong = api

    const { container } = render(<App />)
    expect(await screen.findByLabelText('Missing media recovery')).toBeInTheDocument()
    fireEvent.doubleClick(container.querySelector('video.reaction-video')!)

    fireEvent.click(screen.getByRole('button', { name: /Remove session/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^Delete$/i }))

    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
    expect(document.exitFullscreen).not.toHaveBeenCalled()
    expect(document.fullscreenElement).toBe(document.documentElement)
  })

  it('keeps fullscreen while switching sessions because the player remains active', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.doubleClick(container.querySelector('video.reaction-video')!)
    vi.mocked(document.exitFullscreen).mockClear()

    fireEvent.click(screen.getByLabelText('Command Panel'))
    fireEvent.click(await screen.findByRole('button', { name: /^Library/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Open Second/i }))

    await waitFor(() => expect(api.setActiveSession).toHaveBeenCalledWith('s2'))
    expect(document.exitFullscreen).not.toHaveBeenCalled()
    expect(document.fullscreenElement).toBe(document.documentElement)
  })

  it('exits player fullscreen before opening the import workflow', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.doubleClick(container.querySelector('video.reaction-video')!)

    fireEvent.click(screen.getByLabelText('Command Panel'))
    fireEvent.click(await screen.findByRole('button', { name: /^Library/i }))
    fireEvent.click(await screen.findByRole('button', { name: /New Session/i }))

    await waitFor(() => expect(api.openImportWizard).toHaveBeenCalledWith({ mode: 'new' }))
    expect(document.exitFullscreen).toHaveBeenCalledOnce()
    expect(document.fullscreenElement).toBeNull()
  })

  it('detects the movie frame rate and stores the computed correction', async () => {
    const session = createSession('s1', 'First', 0, { detectedMovieFps: null })
    const api = createApi(createLibrary('s1', [session]), { ...defaultPreferences, openLibraryOnLaunch: false })
    api.detectMovieFrameRate = vi.fn(async () => 25)
    window.watchAlong = api

    render(<App />)

    await waitFor(() => expect(api.detectMovieFrameRate).toHaveBeenCalledWith(session.id))
    await waitFor(() =>
      expect(api.saveActiveSession).toHaveBeenCalledWith({
        detectedMovieFps: 25,
        movieRateCorrection: 0.959041,
        offsetSeconds: 0
      })
    )
    expect(await screen.findByText('Detected movie 25 fps / -4.096%')).toBeInTheDocument()
    expect(api.detectMovieFrameRate).toHaveBeenCalledTimes(1)
  })

  it('preserves the current sync point when changing reactor source', async () => {
    const session = createSession('s1', 'First', 0, {
      detectedMovieFps: 25,
      reactorSource: 'streaming',
      movieRateCorrection: 24 / 25,
      offsetSeconds: 5
    })
    const api = createApi(createLibrary('s1', [session]), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    const reaction = container.querySelector('video.reaction-video') as HTMLVideoElement
    reaction.currentTime = 100

    fireEvent.click(screen.getByText('Timing'))
    fireEvent.click(screen.getByRole('button', { name: '25.000 fps (PAL DVD, European broadcast)' }))

    await waitFor(() =>
      expect(api.saveActiveSession).toHaveBeenCalledWith({
        reactorSource: 'pal',
        movieRateCorrection: 1,
        offsetSeconds: 1
      })
    )
  })

  it('shows manual movie rate presets when detection fails', async () => {
    const session = createSession('s1', 'First', 0, { detectedMovieFps: null })
    const api = createApi(createLibrary('s1', [session]), { ...defaultPreferences, openLibraryOnLaunch: false })
    api.detectMovieFrameRate = vi.fn(async () => null)
    window.watchAlong = api

    render(<App />)

    await waitFor(() => expect(api.detectMovieFrameRate).toHaveBeenCalledWith(session.id))
    fireEvent.click(screen.getByText('Timing'))
    expect(screen.getByRole('group', { name: 'Manual movie rate' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stream 24 -> Blu-ray 23.976' })).toBeInTheDocument()
    expect(screen.queryByText(/Detected movie/i)).not.toBeInTheDocument()
  })

  it('labels automatic timing plainly and can measure it again', async () => {
    const session = createSession('s1', 'First', 0, {
      timingOrigin: 'automatic',
      autoSyncConfidence: 0.94,
      autoSyncAnalyzedAt: '2026-07-13T12:00:00.000Z',
      autoSyncAlgorithmVersion: 1,
      detectedMovieFps: 24,
      movieRateCorrection: 0.999
    })
    const api = createApi(createLibrary('s1', [session]), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    const playbackTools = screen.getByRole('group', { name: 'Playback tools' })
    const primarySyncAction = within(playbackTools).getByRole('button', { name: 'Find Sync Again' })
    expect(primarySyncAction).toBeVisible()

    fireEvent.click(screen.getByText('Timing'))
    expect(screen.getByText('Automatically measured')).toBeInTheDocument()
    expect(screen.getAllByText(/94% confidence/)).toHaveLength(2)

    fireEvent.click(primarySyncAction)
    await waitFor(() => expect(api.startSessionAutoSync).toHaveBeenCalledWith('s1', 'recheck'))
    act(() => api.emitAutoSyncProgress({ sessionId: 's1', phase: 'scanning', percent: 45, message: 'Checking moments…' }))
    expect(within(playbackTools).getByRole('button', { name: /Checking moments/i })).toBeDisabled()
    act(() => api.emitAutoSyncComplete({
      sessionId: 's1', outcome: 'confident', message: 'Ready.', offsetSeconds: -20,
      movieRateCorrection: 1, confidence: 0.96, anchorCount: 6
    }))
    await waitFor(() => expect(api.getLibrary).toHaveBeenCalledTimes(2))
  })

  it('does not open manual setup on a different session when a scan finishes', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.click(within(screen.getByRole('group', { name: 'Playback tools' }))
      .getByRole('button', { name: 'Find Sync Again' }))
    await waitFor(() => expect(api.startSessionAutoSync).toHaveBeenCalledWith('s1', 'recheck'))

    await api.setActiveSession('s2')
    act(() => api.emitAutoSyncComplete({
      sessionId: 's1', outcome: 'partial', message: 'Please check the timing.',
      offsetSeconds: -20, movieRateCorrection: 1, confidence: 0.62, anchorCount: 3
    }))

    await waitFor(() => expect(api.getLibrary).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Sync setup')).not.toBeInTheDocument()
  })

  it('rolls an in-player reaction download directly into automatic sync', async () => {
    const session = createSession('s1', 'Aladdin', 0, { reactionPath: null })
    const api = createApi(createLibrary('s1', [session]), { ...defaultPreferences, openLibraryOnLaunch: false })
    api.getMediaUrl = vi.fn(async (role, sessionId) =>
      role === 'reaction' ? null : `watchalong://media/${sessionId}/${role}`
    )
    window.watchAlong = api

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /YouTube link/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.youtube.com/watch?v=...'), {
      target: { value: 'https://www.youtube.com/watch?v=abc123' }
    })
    fireEvent.click(screen.getByRole('button', { name: /Download & Load/i }))
    await waitFor(() => expect(api.startReactionDownload).toHaveBeenCalled())

    act(() => api.emitDownloadProgress({
      jobId: 'job-1',
      source: 'youtube',
      state: 'success',
      message: 'Reaction video ready.',
      percent: 100,
      filePath: 'C:\\Reactions\\Aladdin reaction.mp4',
      metadata: { reactorName: 'Addie Counts' }
    }))

    await waitFor(() => expect(api.replaceSessionMedia).toHaveBeenCalledWith(
      's1',
      'reaction',
      'C:\\Reactions\\Aladdin reaction.mp4',
      'youtube',
      's1-movie — Addie Counts',
      'Addie Counts'
    ))
    expect(api.setSessionMedia).not.toHaveBeenCalled()
    await waitFor(() => expect(api.startSessionAutoSync).toHaveBeenCalledWith('s1', 'initial'))
    expect(await screen.findByRole('dialog', { name: 'Finding automatic sync' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Line Up Manually Instead/i })).toHaveFocus()
    act(() => api.emitAutoSyncComplete({ sessionId: 's1', outcome: 'confident', message: 'Ready.' }))
    await waitFor(() => expect(api.getLibrary).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Finding automatic sync' })).not.toBeInTheDocument())
    expect(screen.queryByText('Sync setup')).not.toBeInTheDocument()
  })

  it('offers to save a Patreon session after a wizard download finishes', async () => {
    const api = createApi()
    window.watchAlong = api
    render(<App />)
    await screen.findByLabelText('WatchAlong Library')

    act(() => api.emitDownloadProgress({
      jobId: 'patreon-job',
      source: 'patreon',
      state: 'success',
      message: 'Reaction video ready.',
      percent: null,
      filePath: 'C:\\Reactions\\Patreon reaction.mp4'
    }))

    expect(await screen.findByText(/Want to skip this step next time/i)).toBeInTheDocument()
  })

  it('opens a popped-out movie with the selected playback multiplier', async () => {
    const session = createSession('s1', 'First', 0, { playbackRate: 1.5, movieRateCorrection: 1.001 })
    const api = createApi(createLibrary('s1', [session]), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)

    popOutFromOverlay()

    await waitFor(() => expect(api.openMovieWindow).toHaveBeenCalled())
    const [request] = vi.mocked(api.openMovieWindow).mock.calls[0]
    expect(request.playbackRate).toBeCloseTo(1.5015)
  })

  it('shows the first-run welcome and opens the import wizard from Get Started', async () => {
    const api = createApi(createLibrary(null, []))
    api.getPreferences = vi.fn(async () => ({ ...defaultPreferences, hasCompletedOnboarding: false }))
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'No WatchAlong pairings yet' })).toBeInTheDocument()
    expect(screen.getByLabelText('Welcome to WatchAlong')).toBeInTheDocument()
    expect(api.openOnboardingWizard).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Get Started/i }))
    await waitFor(() => expect(api.openImportWizard).toHaveBeenCalledWith({ mode: 'new' }))
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

  it('refreshes media and enters sync setup when automatic sync needs review without resuming playback', async () => {
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
    act(() => api.emitWizardLifecycle({ type: 'closed', outcome: 'completed-needs-review' }))

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
    popOutFromOverlay()
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
    popOutFromOverlay()
    await waitFor(() => expect(api.openMovieWindow).toHaveBeenCalled())
    await waitFor(() => expect(document.querySelector('video.pip-video')).not.toBeInTheDocument())
    vi.mocked(api.closeMovieWindow).mockClear()

    act(() => api.emitWizardLifecycle({ type: 'opened' }))
    act(() => api.emitWizardLifecycle({ type: 'closed', outcome: 'cancelled' }))

    await waitFor(() => expect(container.querySelector('.main-window-dim')).not.toBeInTheDocument())
    expect(api.closeMovieWindow).not.toHaveBeenCalled()
    expect(document.querySelector('video.pip-video')).not.toBeInTheDocument()
  })

  it('switches and persists audio through the detached movie command path', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    const movieMediaCallbacks = new Set<RemoteMediaEventCallback>()
    api.onMovieMediaEvent = vi.fn((callback: RemoteMediaEventCallback) => {
      movieMediaCallbacks.add(callback)
      return () => movieMediaCallbacks.delete(callback)
    })
    api.sendMovieMediaCommand = vi.fn(async (command) => ({
      id: command.id,
      ok: true,
      state: remoteState(),
      ...(command.type === 'setAudioTrack'
        ? {
            audioTrackSnapshot: {
              tracks: [
                { label: 'English (5.1)', language: 'eng', ordinal: 0, displayLabel: 'English (5.1)', enabled: false },
                { label: 'Indonesian (5.1)', language: 'ind', ordinal: 1, displayLabel: 'Indonesian (5.1)', enabled: true }
              ],
              selected: { label: 'Indonesian (5.1)', language: 'ind', ordinal: 1 }
            }
          }
        : {})
    }))
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('movie', 's1'))
    const movie = container.querySelector('video.pip-video') as HTMLVideoElement
    const audioTracks = new FakeAudioTrackList([
      { enabled: true, label: 'English (5.1)', language: 'eng' },
      { enabled: false, label: 'Indonesian (5.1)', language: 'ind' }
    ])
    Object.defineProperty(movie, 'audioTracks', { configurable: true, value: audioTracks })
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(movie)
    await screen.findByLabelText('Movie audio: English (5.1)')

    popOutFromOverlay()
    await waitFor(() => expect(document.querySelector('video.pip-video')).not.toBeInTheDocument())
    expect(screen.queryByLabelText('Movie audio: English (5.1)')).not.toBeInTheDocument()
    expect(movieMediaCallbacks.size).toBeGreaterThan(0)
    act(() => {
      for (const callback of movieMediaCallbacks) callback({
        type: 'loadedmetadata',
        state: remoteState(),
        audioTrackSnapshot: {
          tracks: [
            { label: 'English (5.1)', language: 'eng', ordinal: 0, displayLabel: 'English (5.1)', enabled: true },
            { label: 'Indonesian (5.1)', language: 'ind', ordinal: 1, displayLabel: 'Indonesian (5.1)', enabled: false }
          ],
          selected: { label: 'English (5.1)', language: 'eng', ordinal: 0 }
        }
      })
    })
    fireEvent.click(await screen.findByLabelText('Movie audio: English (5.1)'))
    fireEvent.click(screen.getByRole('button', { name: /Indonesian \(5\.1\).*Indonesian/i }))

    await waitFor(() => expect(api.sendMovieMediaCommand).toHaveBeenCalledWith(expect.objectContaining({
      type: 'setAudioTrack',
      value: { label: 'Indonesian (5.1)', language: 'ind', ordinal: 1 }
    })))
    await waitFor(() => expect(api.saveActiveSession).toHaveBeenCalledWith({
      movieAudioTrackPreference: { label: 'Indonesian (5.1)', language: 'ind', ordinal: 1 }
    }))
  })

  it('pauses and resumes a playing popped-out movie around a cancelled wizard', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    let movieMediaCallback: RemoteMediaEventCallback | null = null
    api.onMovieMediaEvent = vi.fn((callback: RemoteMediaEventCallback) => {
      movieMediaCallback = callback
      return vi.fn()
    })
    api.sendMovieMediaCommand = vi.fn(async (command) => {
      const state = remoteState({
        currentTime: command.type === 'setCurrentTime' ? command.value : 0,
        paused: command.type !== 'play',
        seeking: false
      })
      if (command.type === 'setCurrentTime') {
        queueMicrotask(() => movieMediaCallback?.({ type: 'seeked', state }))
      } else if (command.type === 'play') {
        queueMicrotask(() => movieMediaCallback?.({ type: 'play', state }))
      } else if (command.type === 'pause') {
        queueMicrotask(() => movieMediaCallback?.({ type: 'pause', state }))
      }
      return { id: command.id, ok: true, state }
    })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    fireEvent.click(screen.getByLabelText('Play'))
    await waitFor(() => expect(playMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByLabelText('Pause')).toBeInTheDocument())

    popOutFromOverlay()
    await waitFor(() => expect(api.openMovieWindow).toHaveBeenCalled())
    await waitFor(() =>
      expect(api.sendMovieMediaCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'setCurrentTime' }))
    )
    await waitFor(() =>
      expect(api.sendMovieMediaCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'play' }))
    )
    vi.mocked(api.sendMovieMediaCommand).mockClear()

    act(() => api.emitWizardLifecycle({ type: 'opened' }))
    await waitFor(() =>
      expect(api.sendMovieMediaCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'pause' }))
    )

    vi.mocked(api.sendMovieMediaCommand).mockClear()
    act(() => api.emitWizardLifecycle({ type: 'closed', outcome: 'cancelled' }))
    await waitFor(() =>
      expect(api.sendMovieMediaCommand).toHaveBeenCalledWith(expect.objectContaining({ type: 'play' }))
    )
    expect(api.closeMovieWindow).not.toHaveBeenCalled()
  })

  it('returns an unresponsive movie window to PiP with a helpful message', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)
    popOutFromOverlay()
    await waitFor(() => expect(document.querySelector('video.pip-video')).not.toBeInTheDocument())

    act(() => api.emitMovieWindowClosed({ reason: 'unresponsive' }))

    expect(
      await screen.findByText(
        'The movie window stopped responding, so the movie has been brought back into the player.'
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
    const panel = await screen.findByRole('dialog', { name: 'Command Panel' })
    expect(panel).toHaveAttribute('aria-modal', 'true')
    await waitFor(() => expect(screen.getByLabelText('Close Command Panel')).toHaveFocus())
    const closePanelButton = screen.getByLabelText('Close Command Panel')
    const panelContent = screen.getByRole('region', { name: 'Command Panel content' })
    for (const [code, expectedScrollTop] of [['ArrowDown', 64], ['ArrowUp', 0]] as const) {
      const arrowEvent = new KeyboardEvent('keydown', {
        key: code,
        code,
        bubbles: true,
        cancelable: true
      })
      closePanelButton.dispatchEvent(arrowEvent)
      expect(arrowEvent.defaultPrevented).toBe(true)
      expect(panelContent.scrollTop).toBe(expectedScrollTop)
      expect(closePanelButton).toHaveFocus()
    }
    const panelControls = Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]'
    )).filter((element) => {
      const closedDetails = element.closest<HTMLDetailsElement>('details:not([open])')
      return !closedDetails || (element.tagName === 'SUMMARY' && element.parentElement === closedDetails)
    })
    fireEvent.keyDown(window, { code: 'Tab', shiftKey: true })
    expect(panelControls.at(-1)).toHaveFocus()
    fireEvent.keyDown(window, { code: 'Tab' })
    expect(panelControls[0]).toHaveFocus()

    const manualTimingSummary = within(panel).getByText('Manual timing fallback').closest('summary') as HTMLElement
    const manualTimingIndex = panelControls.indexOf(manualTimingSummary)
    expect(manualTimingIndex).toBeGreaterThan(0)
    panelControls[manualTimingIndex - 1].focus()
    fireEvent.keyDown(window, { code: 'Tab' })
    expect(manualTimingSummary).toHaveFocus()
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })
    manualTimingSummary.dispatchEvent(enterEvent)
    expect(enterEvent.defaultPrevented).toBe(false)
    fireEvent.click(manualTimingSummary)
    expect(manualTimingSummary.parentElement).toHaveAttribute('open')

    fireEvent.click(screen.getByRole('button', { name: /Preferences/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Open Library on launch/i }))

    await waitFor(() => expect(api.setPreference).toHaveBeenCalledWith('openLibraryOnLaunch', true))

    fireEvent.click(screen.getByRole('button', { name: /Help & About/i }))
    expect(screen.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
    for (const group of keyboardShortcutHelpGroups) {
      expect(screen.getByRole('heading', { name: group.label })).toBeInTheDocument()
      for (const shortcut of group.items) {
        expect(screen.getByText(shortcut.label)).toBeInTheDocument()
      }
    }
    expect(screen.getByLabelText('Alt plus Enter')).toBeInTheDocument()
    const openMock = vi.spyOn(window, 'open').mockImplementation(() => null)
    const supportButton = screen.getByRole('button', { name: /Support the developer on Ko-fi/i })

    expect(supportButton).toBeEnabled()
    expect(supportButton).toHaveAttribute('title', 'Open https://ko-fi.com/watchalong')
    fireEvent.click(supportButton)
    expect(openMock).toHaveBeenCalledWith('https://ko-fi.com/watchalong', '_blank')
    openMock.mockRestore()

    fireEvent.keyDown(window, { code: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command Panel' })).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByLabelText('Command Panel')).toHaveFocus())
  })

  it('closes the Command Panel when handing off to full manual alignment', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)

    fireEvent.click(screen.getByLabelText('Command Panel'))
    const panel = await screen.findByRole('dialog', { name: 'Command Panel' })
    fireEvent.click(within(panel).getByText('Manual timing fallback'))
    fireEvent.click(within(panel).getByRole('button', { name: 'Open full manual alignment' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command Panel' })).not.toBeInTheDocument())
    expect(screen.getByLabelText('Sync setup')).toBeInTheDocument()
  })

  it('closes the Command Panel when a re-analysis needs manual review', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    const { container } = render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))
    fireEvent.loadedMetadata(container.querySelector('video.reaction-video')!)
    fireEvent.loadedMetadata(container.querySelector('video.pip-video')!)

    fireEvent.click(screen.getByLabelText('Command Panel'))
    const panel = await screen.findByRole('dialog', { name: 'Command Panel' })
    fireEvent.click(within(panel).getByRole('button', { name: /Find Sync Again/i }))
    await waitFor(() => expect(api.startSessionAutoSync).toHaveBeenCalledWith('s1', 'recheck'))

    act(() => api.emitAutoSyncComplete({
      sessionId: 's1',
      outcome: 'partial',
      message: 'Please check the timing.',
      offsetSeconds: -20,
      movieRateCorrection: 1,
      confidence: 0.62,
      anchorCount: 3
    }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command Panel' })).not.toBeInTheDocument())
    expect(screen.getByLabelText('Sync setup')).toBeInTheDocument()
  })

  it('dismisses Playback settings for a keyboard-opened panel and does not resurrect it after returning from the library', async () => {
    const api = createApi(createLibrary(), { ...defaultPreferences, openLibraryOnLaunch: false })
    window.watchAlong = api

    render(<App />)
    await waitFor(() => expect(api.getMediaUrl).toHaveBeenCalledWith('reaction', 's1'))

    const settingsButton = screen.getByLabelText('Playback settings')
    fireEvent.click(settingsButton)
    await waitFor(() => expect(settingsButton).toHaveAttribute('aria-expanded', 'true'))

    fireEvent.keyDown(window, { code: 'KeyP', ctrlKey: true, shiftKey: true })
    expect(await screen.findByRole('dialog', { name: 'Command Panel' })).toBeInTheDocument()
    await waitFor(() => expect(settingsButton).toHaveAttribute('aria-expanded', 'false'))

    fireEvent.click(screen.getByRole('button', { name: /Close Session/i }))
    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Open First/ }))
    await waitFor(() => expect(screen.getByLabelText('Playback settings')).toHaveAttribute('aria-expanded', 'false'))
  })

  it('toggles library fullscreen with Alt+Enter and the header control', async () => {
    const api = createApi()
    window.watchAlong = api

    render(<App />)
    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()

    fireEvent.keyDown(window, { code: 'KeyF' })
    expect(fullscreenTargets).toHaveLength(0)

    const pairingsButton = screen.getByRole('button', { name: 'Pairings' })
    pairingsButton.focus()
    fireEvent.keyDown(pairingsButton, { code: 'Enter', altKey: true })
    expect(fullscreenTargets).toEqual([document.documentElement])
    expect(screen.getByLabelText('Exit fullscreen')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByLabelText('Exit fullscreen'))
    await waitFor(() => expect(document.exitFullscreen).toHaveBeenCalledOnce())
    expect(screen.getByLabelText('Fullscreen')).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByLabelText('Fullscreen'))
    expect(fullscreenTargets).toEqual([document.documentElement, document.documentElement])
  })

  it('opens the Command Panel from the library by button or shortcut while player-only keys stay inactive', async () => {
    const api = createApi()
    window.watchAlong = api

    render(<App />)
    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()

    fireEvent.keyDown(window, { code: 'KeyR' })
    expect(fullscreenTargets).toHaveLength(0)
    expect(api.saveActiveSession).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { code: 'KeyP', ctrlKey: true, shiftKey: true })
    expect(await screen.findByRole('dialog', { name: 'Command Panel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Now Playing/i })).not.toBeInTheDocument()

    fireEvent.keyDown(window, { code: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command Panel' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Command Panel'))
    expect(await screen.findByRole('dialog', { name: 'Command Panel' })).toBeInTheDocument()
  })

  it('renames and deletes sessions from library card actions', async () => {
    const api = createApi()
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /More actions for/ })[0])
    fireEvent.click(screen.getByRole('menuitem', { name: /Rename/i }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renamed session' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save title' }))

    await waitFor(() => expect(api.renameSession).toHaveBeenCalledWith('s1', 'Renamed session'))

    fireEvent.click(screen.getAllByRole('button', { name: /More actions for/ })[0])
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }))

    await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith('s1'))
  })

  it('chooses and clears a local movie poster from a library card', async () => {
    const api = createApi(createLibrary('s1', [firstSession]))
    window.watchAlong = api

    render(<App />)
    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()

    const actions = screen.getByRole('button', { name: /More actions for/ })
    fireEvent.click(actions)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Choose poster…' }))
    await waitFor(() => expect(api.chooseMoviePoster).toHaveBeenCalledWith('s1'))
    expect(await screen.findByRole('status')).toHaveTextContent('Poster selected for this movie.')

    fireEvent.click(actions)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Use automatic poster' }))
    await waitFor(() => expect(api.clearMoviePoster).toHaveBeenCalledWith('s1'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Automatic local poster restored.'))
  })

  it('keeps a cancelled movie poster picker quiet', async () => {
    const api = createApi(createLibrary('s1', [firstSession]))
    api.chooseMoviePoster = vi.fn(async () => null)
    window.watchAlong = api

    render(<App />)
    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /More actions for/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Choose poster…' }))
    await waitFor(() => expect(api.chooseMoviePoster).toHaveBeenCalledWith('s1'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a library alert when choosing a movie poster fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const api = createApi(createLibrary('s1', [firstSession]))
    api.chooseMoviePoster = vi.fn(async () => { throw new Error('disk unavailable') })
    window.watchAlong = api

    render(<App />)
    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /More actions for/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Choose poster…' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'WatchAlong couldn’t save that poster. Your current movie art is unchanged.'
    )
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('shows a library alert when restoring automatic poster art fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const manualSession = createSession('s1', 'First', 0, { moviePosterPath: 'C:\\Posters\\chosen.jpg' })
    const api = createApi(createLibrary('s1', [manualSession]))
    api.clearMoviePoster = vi.fn(async () => { throw new Error('disk unavailable') })
    window.watchAlong = api

    render(<App />)
    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /More actions for/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Use automatic poster' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'WatchAlong couldn’t restore automatic poster art. Your current movie art is unchanged.'
    )
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('keeps an unchanged downloaded reactor separate from a title-only rename', async () => {
    const session = createSession('s1', 'Movie — Downloaded Name', 0, {
      titleOrigin: 'generated',
      reactorName: 'Downloaded Name',
      reactorNameOrigin: 'metadata'
    })
    const api = createApi(createLibrary('s1', [session]))
    window.watchAlong = api

    render(<App />)
    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /More actions for/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Rename/i }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My custom title' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save title' }))

    await waitFor(() => expect(api.renameSession).toHaveBeenCalledWith(
      's1',
      'My custom title'
    ))
  })

  it('edits a card reactor by selecting an existing creator from the library', async () => {
    const target = createSession('s1', 'Target pairing', 0, {
      reactorName: 'Downloaded Name',
      reactorNameOrigin: 'metadata'
    })
    const familiarCreator = createSession('s2', 'Other pairing', 0, {
      reactorName: 'Cinema Therapy',
      reactorNameOrigin: 'custom'
    })
    const library = createLibrary('s1', [target, familiarCreator])
    const familiarProfile = library.reactors.find((profile) => profile.name === 'Cinema Therapy')!
    const api = createApi(library)
    window.watchAlong = api

    render(<App />)
    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
    const actionsTrigger = screen.getByRole('button', { name: 'More actions for Target pairing' })
    fireEvent.click(actionsTrigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change reactor…' }))

    expect(screen.getByRole('dialog', { name: 'Change reactor' })).toBeInTheDocument()
    const creatorChoice = screen.getByRole('radio', { name: /Cinema Therapy/ })
    expect(creatorChoice).toHaveFocus()
    fireEvent.click(creatorChoice)
    fireEvent.click(screen.getByRole('button', { name: 'Use this reactor' }))

    await waitFor(() => expect(api.assignSessionReactor).toHaveBeenCalledWith(
      's1',
      { target: { type: 'existing', reactorId: familiarProfile.id }, scope: 'session' }
    ))
    await waitFor(() => expect(actionsTrigger).toHaveFocus())
  })

  it('merges every pairing on a split reactor shelf in one natural move', async () => {
    const robinHood = createSession('robin', 'Robin Hood pairing', 0, {
      reactorName: 'Hold Down A',
      reactorNameOrigin: 'custom',
      reactionSource: 'youtube',
      reactionPath: 'C:\\Reactions\\youtube\\job-ames\\UC-AMES - Ames Video Store\\Robin Hood.mp4',
      moviePath: 'C:\\Movies\\Robin Hood.mp4'
    })
    const lifeOfBrian = createSession('brian', 'Life of Brian pairing', 0, {
      reactorName: 'Hold Down A',
      reactorNameOrigin: 'custom',
      reactionSource: 'youtube',
      reactionPath: 'C:\\Reactions\\youtube\\job-ames\\UC-AMES - Ames Video Store\\Life of Brian.mp4',
      moviePath: 'C:\\Movies\\Life of Brian.mp4'
    })
    const holyGrail = createSession('grail', 'Holy Grail pairing', 0, {
      reactorName: 'Hold Down A',
      reactorNameOrigin: 'metadata',
      reactionSource: 'youtube',
      reactionPath: 'C:\\Reactions\\youtube\\job-hda\\UC-HDA - Hold Down A\\Holy Grail.mp4',
      moviePath: 'C:\\Movies\\Holy Grail.mp4'
    })
    const api = createApi(createLibrary(robinHood.id, [robinHood, lifeOfBrian, holyGrail]))
    window.watchAlong = api

    render(<App />)
    expect(await screen.findByLabelText('WatchAlong Library')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'By Reactor' }))
    expect(screen.getAllByRole('heading', { name: 'Hold Down A' })).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Robin Hood with Hold Down A' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change reactor…' }))
    fireEvent.click(screen.getByRole('radio', { name: /Hold Down A.*1 pairing/i }))
    expect(screen.getByRole('checkbox', { name: /Move all 2 pairings together/i })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Use this reactor' }))

    await waitFor(() => expect(screen.getAllByRole('heading', { name: 'Hold Down A' })).toHaveLength(1))
    expect(screen.getByText('3 pairings')).toBeInTheDocument()
  })

  it('renders unknown for invalid session timestamps', async () => {
    const session = createSession('s1', 'First', 0, { updatedAt: 'not-a-date' })
    const api = createApi(createLibrary('s1', [session]))
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByText(/Local file · Unknown/i)).toBeInTheDocument()
  })

  it('shows an unsupported subtitle format error for non-empty files with no cues', async () => {
    const session = createSession('s1', 'First', 0, { subtitlePath: 'C:\\Subtitles\\bad.txt' })
    const api = createApi(createLibrary('s1', [session]), { ...defaultPreferences, openLibraryOnLaunch: false })
    api.getSubtitleText = vi.fn(async () => 'not subtitles')
    window.watchAlong = api

    render(<App />)

    expect(await screen.findByText("This subtitle format isn't supported. Use SRT or VTT.")).toBeInTheDocument()
  })

  it('does not show an unsupported subtitle error for WEBVTT header-only files', async () => {
    const session = createSession('s1', 'First', 0, { subtitlePath: 'C:\\Subtitles\\empty.vtt' })
    const api = createApi(createLibrary('s1', [session]), { ...defaultPreferences, openLibraryOnLaunch: false })
    api.getSubtitleText = vi.fn(async () => '\uFEFFWEBVTT\r\n\r\n')
    window.watchAlong = api

    render(<App />)

    await waitFor(() => expect(api.getSubtitleText).toHaveBeenCalledWith('s1'))
    expect(screen.queryByText("This subtitle format isn't supported. Use SRT or VTT.")).not.toBeInTheDocument()
  })
})

class FakeAudioTrackList extends EventTarget implements BrowserAudioTrackList {
  readonly length: number
  readonly [index: number]: BrowserAudioTrack | undefined

  constructor(tracks: BrowserAudioTrack[]) {
    super()
    this.length = tracks.length
    tracks.forEach((track, index) => {
      Object.defineProperty(this, index, { enumerable: true, value: track })
    })
  }

  states(): boolean[] {
    return Array.from({ length: this.length }, (_, index) => this[index]!.enabled)
  }
}

function createSession(
  id: string,
  title: string,
  lastReactionTimeSeconds: number,
  patch: Partial<LibrarySession> = {}
): LibrarySession {
  const base: LibrarySession = {
    id,
    title,
    titleOrigin: 'custom',
    reactorId: null,
    reactorName: null,
    reactorNameOrigin: 'metadata',
    reactionPath: `C:\\Videos\\${id}-reaction.mp4`,
    reactionSource: 'local',
    reactionDurationSeconds: 120,
    moviePath: `C:\\Videos\\${id}-movie.mp4`,
    moviePosterPath: null,
    movieAudioTrackPreference: null,
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
    reactorSource: 'ntsc',
    detectedMovieFps: 24000 / 1001,
    movieRateCorrection: 1,
    timingOrigin: 'manual',
    autoSyncConfidence: null,
    autoSyncAnalyzedAt: null,
    autoSyncAlgorithmVersion: null,
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
