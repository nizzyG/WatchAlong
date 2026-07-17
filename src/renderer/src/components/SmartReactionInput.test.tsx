import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidPatreonPostUrl, PatreonStorageOffer, SmartReactionInput } from './SmartReactionInput'
import type { BrowserDetection, PatreonSessionExtractionResult, WatchAlongApi } from '@shared/types'

const browsers: BrowserDetection[] = [
  { name: 'firefox', label: 'Firefox', installed: true, paths: ['firefox.exe'] }
]

describe('SmartReactionInput', () => {
  beforeEach(() => {
    window.watchAlong = createApi()
  })

  it('pulses the YouTube download button for a valid URL', async () => {
    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />)

    await waitFor(() => expect(window.watchAlong.detectBrowsers).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /YouTube link/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.youtube.com/watch?v=...'), {
      target: { value: 'https://www.youtube.com/watch?v=abc123' }
    })

    expect(screen.getByRole('button', { name: /Download & Load/i })).toHaveClass('pulse-ready')
  })

  it('shows the sign-in window button as primary Patreon connect option', async () => {
    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Patreon post/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.patreon.com/posts/...'), {
      target: { value: 'https://www.patreon.com/posts/example-123' }
    })

    await waitFor(() => expect(screen.getByRole('button', { name: /Sign in with browser/i })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Sign in with browser/i })).toHaveClass('login-window-primary')
  })

  it('shows accurate Patreon session privacy copy', async () => {
    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Patreon post/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.patreon.com/posts/...'), {
      target: { value: 'https://www.patreon.com/posts/example-123' }
    })

    await waitFor(() => {
      expect(
        screen.getByText(
          'Your Patreon session is used only for this Patreon download. It never goes to a WatchAlong server or anyone besides Patreon, and it is saved on this device only if you choose.'
        )
      ).toBeInTheDocument()
    })
  })

  it('starts the Patreon download with the token returned by the sign-in window', async () => {
    window.watchAlong.openPatreonLoginWindow = vi.fn(async () => ({ ok: true, token: 'patreon-token' }))

    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Patreon post/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.patreon.com/posts/...'), {
      target: { value: 'https://www.patreon.com/posts/example-123' }
    })

    fireEvent.click(await screen.findByRole('button', { name: /Sign in with browser/i }))

    await waitFor(() =>
      expect(window.watchAlong.startReactionDownload).toHaveBeenCalledWith({
        source: 'patreon',
        url: 'https://www.patreon.com/posts/example-123',
        sessionSource: { type: 'token', token: 'patreon-token' }
      })
    )
  })

  it('retries with the same OAuth token when main reports that it was not consumed', async () => {
    let reportProgress: Parameters<WatchAlongApi['onDownloadProgress']>[0] | null = null
    window.watchAlong.openPatreonLoginWindow = vi.fn(async () => ({
      ok: true,
      token: 'retryable-oauth-token'
    }))
    window.watchAlong.onDownloadProgress = vi.fn((callback) => {
      reportProgress = callback
      return () => undefined
    })

    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Patreon post/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.patreon.com/posts/...'), {
      target: { value: 'https://www.patreon.com/posts/example-123' }
    })
    fireEvent.click(await screen.findByRole('button', { name: /Sign in with browser/i }))
    await waitFor(() => expect(window.watchAlong.startReactionDownload).toHaveBeenCalledTimes(1))

    act(() => {
      (reportProgress as Parameters<WatchAlongApi['onDownloadProgress']>[0])({
        jobId: 'job-1',
        source: 'patreon',
        state: 'failed',
        message: 'Patreon downloader is not ready.',
        percent: null,
        retryWithoutPatreonSignIn: true
      })
    })

    const retryButton = await screen.findByRole('button', { name: /Retry Download/i })
    expect(screen.queryByRole('button', { name: /Sign In Again/i })).not.toBeInTheDocument()
    fireEvent.click(retryButton)

    await waitFor(() => expect(window.watchAlong.startReactionDownload).toHaveBeenCalledTimes(2))
    expect(window.watchAlong.startReactionDownload).toHaveBeenLastCalledWith({
      source: 'patreon',
      url: 'https://www.patreon.com/posts/example-123',
      sessionSource: { type: 'token', token: 'retryable-oauth-token' }
    })
    expect(window.watchAlong.openPatreonLoginWindow).toHaveBeenCalledTimes(1)
  })

  it('still requires a new Patreon sign-in when a failed OAuth token may be consumed', async () => {
    let reportProgress: Parameters<WatchAlongApi['onDownloadProgress']>[0] | null = null
    window.watchAlong.openPatreonLoginWindow = vi.fn(async () => ({
      ok: true,
      token: 'consumed-oauth-token'
    }))
    window.watchAlong.onDownloadProgress = vi.fn((callback) => {
      reportProgress = callback
      return () => undefined
    })

    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Patreon post/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.patreon.com/posts/...'), {
      target: { value: 'https://www.patreon.com/posts/example-123' }
    })
    fireEvent.click(await screen.findByRole('button', { name: /Sign in with browser/i }))
    await waitFor(() => expect(window.watchAlong.startReactionDownload).toHaveBeenCalledTimes(1))

    act(() => {
      (reportProgress as Parameters<WatchAlongApi['onDownloadProgress']>[0])({
        jobId: 'job-1',
        source: 'patreon',
        state: 'failed',
        message: 'Patreon could not open that post.',
        percent: null
      })
    })

    const signInAgainButton = await screen.findByRole('button', { name: /Sign In Again/i })
    expect(screen.queryByRole('button', { name: /Retry Download/i })).not.toBeInTheDocument()
    fireEvent.click(signInAgainButton)

    expect(await screen.findByRole('alert')).toHaveTextContent(/Sign in to Patreon again/i)
    expect(window.watchAlong.startReactionDownload).toHaveBeenCalledTimes(1)
  })

  it('keeps Patreon authentication active through StrictMode effect replay', async () => {
    window.watchAlong.openPatreonLoginWindow = vi.fn(async () => ({ ok: true, token: 'strict-token' }))

    render(
      <StrictMode>
        <SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />
      </StrictMode>
    )

    fireEvent.click(screen.getByRole('button', { name: /Patreon post/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.patreon.com/posts/...'), {
      target: { value: 'https://www.patreon.com/posts/example-123' }
    })
    fireEvent.click(await screen.findByRole('button', { name: /Sign in with browser/i }))

    await waitFor(() => expect(window.watchAlong.startReactionDownload).toHaveBeenCalledWith({
      source: 'patreon',
      url: 'https://www.patreon.com/posts/example-123',
      sessionSource: { type: 'token', token: 'strict-token' }
    }))
  })

  it('starts only one download and locks source switching while startup is pending', async () => {
    window.watchAlong.startReactionDownload = vi.fn(
      () => new Promise<Awaited<ReturnType<WatchAlongApi['startReactionDownload']>>>(() => undefined)
    )
    const onSelectLocal = vi.fn()
    render(<SmartReactionInput movieReady onSelectLocal={onSelectLocal} onDownloaded={vi.fn()} />)

    await waitFor(() => expect(window.watchAlong.detectBrowsers).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: /YouTube link/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.youtube.com/watch?v=...'), {
      target: { value: 'https://www.youtube.com/watch?v=abc123' }
    })
    const downloadButton = screen.getByRole('button', { name: /Download & Load/i })
    fireEvent.click(downloadButton)
    fireEvent.click(downloadButton)

    expect(window.watchAlong.startReactionDownload).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Local file/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Local file/i }))
    expect(onSelectLocal).not.toHaveBeenCalled()
  })

  it('shows YouTube startup errors outside the Patreon form', async () => {
    window.watchAlong.startReactionDownload = vi.fn(async () => {
      throw new Error('start failed')
    })
    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /YouTube link/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.youtube.com/watch?v=...'), {
      target: { value: 'https://www.youtube.com/watch?v=abc123' }
    })
    fireEvent.click(screen.getByRole('button', { name: /Download & Load/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not start that YouTube download/i)
  })

  it('discards an OAuth token when the download request is rejected before startup', async () => {
    window.watchAlong.openPatreonLoginWindow = vi.fn(async () => ({
      ok: true,
      token: 'rejected-oauth-token'
    }))
    window.watchAlong.startReactionDownload = vi.fn(async () => {
      throw new Error('IPC rejected')
    })
    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Patreon post/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.patreon.com/posts/...'), {
      target: { value: 'https://www.patreon.com/posts/example-123' }
    })
    fireEvent.click(await screen.findByRole('button', { name: /Sign in with browser/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not start that Patreon download/i)
    expect(window.watchAlong.discardPatreonSessionToken).toHaveBeenCalledOnce()
    expect(window.watchAlong.discardPatreonSessionToken).toHaveBeenCalledWith(
      'rejected-oauth-token'
    )
  })

  it('keeps a completed download actionable when attaching it fails', async () => {
    let reportProgress: Parameters<WatchAlongApi['onDownloadProgress']>[0] | null = null
    window.watchAlong.onDownloadProgress = vi.fn((callback) => {
      reportProgress = callback
      return () => undefined
    })
    const onDownloaded = vi.fn(async () => {
      throw new Error('library unavailable')
    })
    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={onDownloaded} />)

    fireEvent.click(screen.getByRole('button', { name: /YouTube link/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.youtube.com/watch?v=...'), {
      target: { value: 'https://www.youtube.com/watch?v=abc123' }
    })
    fireEvent.click(screen.getByRole('button', { name: /Download & Load/i }))
    await waitFor(() => expect(window.watchAlong.startReactionDownload).toHaveBeenCalled())

    await act(async () => {
      (reportProgress as Parameters<WatchAlongApi['onDownloadProgress']>[0])({
        jobId: 'job-1',
        source: 'youtube',
        state: 'success',
        message: 'Reaction video ready.',
        percent: 100,
        filePath: 'C:\\Reactions\\ready.mp4'
      })
      await Promise.resolve()
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(/safely downloaded.*could not attach/i)
    expect(screen.getByText('Reaction video ready.')).toBeInTheDocument()
  })

  it('accepts a fast terminal event before React rebinds the progress subscription', async () => {
    const listeners: Array<Parameters<WatchAlongApi['onDownloadProgress']>[0]> = []
    window.watchAlong.onDownloadProgress = vi.fn((callback) => {
      listeners.push(callback)
      return () => undefined
    })
    const onDownloaded = vi.fn()
    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={onDownloaded} />)

    fireEvent.click(screen.getByRole('button', { name: /YouTube link/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.youtube.com/watch?v=...'), {
      target: { value: 'https://www.youtube.com/watch?v=abc123' }
    })
    fireEvent.click(screen.getByRole('button', { name: /Download & Load/i }))
    await waitFor(() => expect(window.watchAlong.startReactionDownload).toHaveBeenCalled())

    act(() => {
      // Deliberately invoke the first listener. Its closure predates the job,
      // matching the main/renderer race this regression protects.
      listeners[0]({
        jobId: 'job-1',
        source: 'youtube',
        state: 'failed',
        message: 'Downloader tool unavailable.',
        percent: null
      })
    })

    expect(await screen.findByText('Downloader tool unavailable.')).toBeInTheDocument()
    expect(onDownloaded).not.toHaveBeenCalled()
  })

  it('offers exactly in-app sign-in and Firefox for a new Patreon connection', async () => {
    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Patreon post/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.patreon.com/posts/...'), {
      target: { value: 'https://www.patreon.com/posts/example-123' }
    })

    expect(await screen.findByRole('button', { name: /Sign in with browser/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Use Firefox/i })).toBeEnabled()
    expect(screen.queryByPlaceholderText(/session_id/i)).not.toBeInTheDocument()
    for (const removedBrowser of ['Chrome', 'Edge', 'Brave', 'Safari', 'Opera']) {
      expect(screen.queryByText(removedBrowser)).not.toBeInTheDocument()
    }
  })

  it('shows Firefox reading status when extracting', async () => {
    window.watchAlong.extractPatreonSession = vi.fn(() => new Promise<PatreonSessionExtractionResult>(() => undefined))

    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Patreon post/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.patreon.com/posts/...'), {
      target: { value: 'https://www.patreon.com/posts/example-123' }
    })

    await waitFor(() => screen.getByRole('button', { name: /Use Firefox/i }))
    fireEvent.click(screen.getByRole('button', { name: /Use Firefox/i }))

    expect(await screen.findByText('Reading Patreon session from Firefox...')).toBeInTheDocument()
  })

  it('starts a download with the one-use token read from Firefox', async () => {
    window.watchAlong.extractPatreonSession = vi.fn(async () => ({ ok: true, token: 'firefox-token' }))

    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Patreon post/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.patreon.com/posts/...'), {
      target: { value: 'https://www.patreon.com/posts/example-123' }
    })
    fireEvent.click(await screen.findByRole('button', { name: /Use Firefox/i }))

    await waitFor(() => expect(window.watchAlong.startReactionDownload).toHaveBeenCalledWith({
      source: 'patreon',
      url: 'https://www.patreon.com/posts/example-123',
      sessionSource: { type: 'browser', browser: 'firefox', token: 'firefox-token' }
    }))
  })

  it('still lets portable or custom-installed Firefox users try one-click access', async () => {
    window.watchAlong.detectBrowsers = vi.fn(async (): Promise<BrowserDetection[]> => [
      { name: 'firefox', label: 'Firefox', installed: false, paths: [] }
    ])
    window.watchAlong.extractPatreonSession = vi.fn(async () => ({
      ok: false,
      message: 'No Patreon session was found in Firefox.'
    }))

    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Patreon post/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.patreon.com/posts/...'), {
      target: { value: 'https://www.patreon.com/posts/example-123' }
    })

    const firefoxButton = await screen.findByRole('button', { name: /Try Firefox/i })
    expect(firefoxButton).toBeEnabled()
    expect(screen.getByRole('button', { name: /Sign in with browser/i })).toBeEnabled()
    fireEvent.click(firefoxButton)
    await waitFor(() => expect(window.watchAlong.extractPatreonSession).toHaveBeenCalledWith('firefox'))
  })

  it('shows saved session confirmation prompt when a saved session exists', async () => {
    window.watchAlong.getSavedPatreonSessionStatus = vi.fn(async () => ({ available: true, canEncrypt: true }))

    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Patreon post/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.patreon.com/posts/...'), {
      target: { value: 'https://www.patreon.com/posts/example-123' }
    })

    await waitFor(() => expect(screen.getByText(/You have a saved Patreon session/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Yes, download/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /No, re-authenticate/i })).toBeInTheDocument()
  })

  it('shows the post-download storage offer with learn-more copy', () => {
    render(<PatreonStorageOffer jobId="job-1" onDismiss={vi.fn()} />)

    expect(screen.getByText(/Want to skip this step next time/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Learn more/i }))
    expect(screen.getByText(/Electron safeStorage/i)).toBeInTheDocument()
  })

  it('discards the completed Patreon session when the storage offer is dismissed', async () => {
    const onDismiss = vi.fn()
    render(<PatreonStorageOffer jobId="job-1" onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }))

    await waitFor(() => expect(window.watchAlong.discardLastPatreonSession).toHaveBeenCalledWith('job-1'))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('saves the completed Patreon session when the storage toggle is enabled', async () => {
    render(<PatreonStorageOffer jobId="job-1" onDismiss={vi.fn()} />)

    fireEvent.click(screen.getByRole('checkbox', { name: /Save/i }))

    await waitFor(() => expect(window.watchAlong.saveLastPatreonSession).toHaveBeenCalledWith('job-1'))
    expect(window.watchAlong.discardLastPatreonSession).not.toHaveBeenCalled()
  })

  it('rejects Patreon lookalike domains while accepting Patreon post URLs', () => {
    expect(isValidPatreonPostUrl('https://www.patreon.com/posts/example-123')).toBe(true)
    expect(isValidPatreonPostUrl('https://patreon.com/posts/example-123')).toBe(true)
    expect(isValidPatreonPostUrl('https://patreon.com/creator/posts/example-123?utm_source=copy')).toBe(true)
    expect(isValidPatreonPostUrl('https://notpatreon.com/posts/example-123')).toBe(false)
    expect(isValidPatreonPostUrl('https://patreon.com.evil.test/posts/example-123')).toBe(false)
    expect(isValidPatreonPostUrl('http://patreon.com/posts/example-123')).toBe(false)
    expect(isValidPatreonPostUrl('https://patreon.com/posts/example-123/extra')).toBe(false)
    expect(isValidPatreonPostUrl('https://patreon.com/posts/example-123#sign-in-again')).toBe(false)
  })
})

function createApi(): WatchAlongApi {
  return {
    openVideos: vi.fn(),
    selectMovieFile: vi.fn(),
    selectReactionFile: vi.fn(),
    chooseMoviePoster: vi.fn(async () => null),
    clearMoviePoster: vi.fn(),
    createOrSwitchSessionFromPaths: vi.fn(),
    getLibrary: vi.fn(),
    getLibraryRecoveryStatus: vi.fn(async () => ({ available: false })),
    revealLibraryRecoveryFile: vi.fn(async () => false),
    startFreshLibraryAfterRecovery: vi.fn(async () => ({ version: 7 as const, activeSessionId: null, sessions: [], reactors: [] })),
    saveActiveSession: vi.fn(),
    saveSessionPosition: vi.fn(),
    setSessionMedia: vi.fn(),
    replaceSessionMedia: vi.fn(),
    setActiveSession: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
    assignSessionReactor: vi.fn(),
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
    detectBrowsers: vi.fn(async () => browsers),
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
    startSessionAutoSync: vi.fn(async () => ({ started: true })),
    cancelSessionAutoSync: vi.fn(async () => undefined),
    onAutoSyncProgress: vi.fn(() => vi.fn()),
    onAutoSyncComplete: vi.fn(() => vi.fn()),
    openOnboardingWizard: vi.fn(),
    openImportWizard: vi.fn(),
    getImportWizardContext: vi.fn(),
    finishOnboardingWizard: vi.fn(),
    onWizardLifecycle: vi.fn(() => vi.fn()),
    onWizardCloseRequest: vi.fn(() => vi.fn()),
    confirmMainWindowClose: vi.fn(),
    onMainWindowCloseRequest: vi.fn(() => vi.fn()),
    setMediaPlayPauseEnabled: vi.fn(async () => false),
    onMediaPlayPause: vi.fn(() => vi.fn()),
    getPreferences: vi.fn(),
    getCabinetThemePreference: vi.fn(async () => 'system' as const),
    onCabinetThemePreference: vi.fn(() => vi.fn()),
    setPreference: vi.fn(),
    selectDownloadDirectory: vi.fn(),
    completeOnboarding: vi.fn()
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
