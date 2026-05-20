import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidPatreonPostUrl, PatreonStorageOffer, SmartReactionInput } from './SmartReactionInput'
import type { BrowserDetection, PatreonSessionExtractionResult, WatchAlongApi } from '@shared/types'

const browsers: BrowserDetection[] = [
  { name: 'chrome', label: 'Chrome', installed: false, extractionSupported: false, paths: [] },
  { name: 'firefox', label: 'Firefox', installed: true, extractionSupported: true, paths: ['firefox.exe'] },
  { name: 'edge', label: 'Edge', installed: true, extractionSupported: false, paths: ['msedge.exe'] },
  { name: 'brave', label: 'Brave', installed: false, extractionSupported: false, paths: [] },
  { name: 'opera', label: 'Opera', installed: false, extractionSupported: false, paths: [] }
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

    await waitFor(() => expect(screen.getByRole('button', { name: /Sign in to Patreon/i })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Sign in to Patreon/i })).toHaveClass('login-window-primary')
  })

  it('starts the Patreon download with the token returned by the sign-in window', async () => {
    window.watchAlong.openPatreonLoginWindow = vi.fn(async () => ({ ok: true, token: 'patreon-token' }))

    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Patreon post/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.patreon.com/posts/...'), {
      target: { value: 'https://www.patreon.com/posts/example-123' }
    })

    fireEvent.click(await screen.findByRole('button', { name: /Sign in to Patreon/i }))

    await waitFor(() =>
      expect(window.watchAlong.startReactionDownload).toHaveBeenCalledWith({
        source: 'patreon',
        url: 'https://www.patreon.com/posts/example-123',
        sessionSource: { type: 'token', token: 'patreon-token' }
      })
    )
  })

  it('shows Firefox instant-setup with Recommended badge when installed', async () => {
    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Patreon post/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.patreon.com/posts/...'), {
      target: { value: 'https://www.patreon.com/posts/example-123' }
    })

    await waitFor(() => expect(screen.getByText('Recommended')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Use my Firefox login/i })).toBeInTheDocument()
  })

  it('renders the manual session_id paste area always visible', async () => {
    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Patreon post/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.patreon.com/posts/...'), {
      target: { value: 'https://www.patreon.com/posts/example-123' }
    })

    await waitFor(() => expect(screen.getByPlaceholderText('Paste your session_id here')).toBeInTheDocument())
    expect(screen.getByText(/Press F12 to open Developer Tools/i)).toBeInTheDocument()
  })

  it('shows Firefox reading status when extracting', async () => {
    window.watchAlong.extractPatreonSession = vi.fn(() => new Promise<PatreonSessionExtractionResult>(() => undefined))

    render(<SmartReactionInput movieReady onSelectLocal={vi.fn()} onDownloaded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Patreon post/i }))
    fireEvent.change(screen.getByPlaceholderText('https://www.patreon.com/posts/...'), {
      target: { value: 'https://www.patreon.com/posts/example-123' }
    })

    await waitFor(() => screen.getByRole('button', { name: /Use my Firefox login/i }))
    fireEvent.click(screen.getByRole('button', { name: /Use my Firefox login/i }))

    expect(await screen.findByText('Reading Patreon session from Firefox...')).toBeInTheDocument()
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

  it('rejects Patreon lookalike domains while accepting Patreon post URLs', () => {
    expect(isValidPatreonPostUrl('https://www.patreon.com/posts/example-123')).toBe(true)
    expect(isValidPatreonPostUrl('https://patreon.com/posts/example-123')).toBe(true)
    expect(isValidPatreonPostUrl('https://notpatreon.com/posts/example-123')).toBe(false)
    expect(isValidPatreonPostUrl('https://patreon.com.evil.test/posts/example-123')).toBe(false)
  })
})

function createApi(): WatchAlongApi {
  return {
    openVideos: vi.fn(),
    selectMovieFile: vi.fn(),
    selectReactionFile: vi.fn(),
    createOrSwitchSessionFromPaths: vi.fn(),
    getLibrary: vi.fn(),
    saveActiveSession: vi.fn(),
    setSessionMedia: vi.fn(),
    setActiveSession: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
    openSubtitle: vi.fn(),
    clearSubtitle: vi.fn(),
    getSubtitleText: vi.fn(),
    getMediaUrl: vi.fn(),
    checkTools: vi.fn(),
    detectBrowsers: vi.fn(async () => browsers),
    extractPatreonSession: vi.fn(async () => ({ ok: false })),
    openPatreonLoginWindow: vi.fn(async () => ({ ok: false })),
    getSavedPatreonSessionStatus: vi.fn(async () => ({ available: false, canEncrypt: true })),
    saveLastPatreonSession: vi.fn(async () => ({ available: true, canEncrypt: true })),
    forgetPatreonSession: vi.fn(async () => ({ available: false, canEncrypt: true })),
    startReactionDownload: vi.fn(async () => ({ jobId: 'job-1' })),
    cancelDownload: vi.fn(async () => undefined),
    onDownloadProgress: vi.fn(() => vi.fn()),
    openOnboardingWizard: vi.fn(),
    openImportWizard: vi.fn(),
    finishOnboardingWizard: vi.fn(),
    onWizardLifecycle: vi.fn(() => vi.fn()),
    getPreferences: vi.fn(),
    setPreference: vi.fn(),
    selectDownloadDirectory: vi.fn(),
    completeOnboarding: vi.fn()
  }
}
