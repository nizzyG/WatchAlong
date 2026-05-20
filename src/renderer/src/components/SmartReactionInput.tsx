import {
  Check,
  CirclePlay,
  FileVideo,
  Heart,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  X
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  BrowserDetection,
  BrowserName,
  DownloadProgressEvent,
  PatreonSessionSource,
  ReactionDownloadSource,
  SavedPatreonSessionStatus
} from '@shared/types'

type ActiveCard = 'local' | 'youtube' | 'patreon' | null

interface SmartReactionInputProps {
  movieReady: boolean
  onSelectLocal(): Promise<void>
  onDownloaded(filePath: string, metadata: { jobId: string; source: ReactionDownloadSource }): void
}

interface PatreonStorageOfferProps {
  jobId: string
  onDismiss(): void
}

const browserGlyphs: Record<BrowserName, string> = {
  chrome: 'C',
  firefox: 'F',
  edge: 'E',
  brave: 'B',
  opera: 'O'
}

export function SmartReactionInput({ movieReady, onSelectLocal, onDownloaded }: SmartReactionInputProps): JSX.Element {
  const [activeCard, setActiveCard] = useState<ActiveCard>(null)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [patreonUrl, setPatreonUrl] = useState('')
  const [manualSessionId, setManualSessionId] = useState('')
  const [browsers, setBrowsers] = useState<BrowserDetection[]>([])
  const [browserReading, setBrowserReading] = useState<BrowserName | null>(null)
  const [loginWindowOpen, setLoginWindowOpen] = useState(false)
  const [savedSession, setSavedSession] = useState<SavedPatreonSessionStatus>({ available: false, canEncrypt: false })
  const [jobId, setJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState<DownloadProgressEvent | null>(null)
  const [error, setError] = useState<string | null>(null)

  const validYoutubeUrl = useMemo(() => isValidYouTubeUrl(youtubeUrl), [youtubeUrl])
  const validPatreonUrl = useMemo(() => isValidPatreonPostUrl(patreonUrl), [patreonUrl])
  const isWorking = progress?.state === 'checking' || progress?.state === 'downloading'
  const firefoxBrowser = useMemo(() => browsers.find((b) => b.name === 'firefox') ?? null, [browsers])

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const [detectedBrowsers, status] = await Promise.all([
          window.watchAlong.detectBrowsers(),
          window.watchAlong.getSavedPatreonSessionStatus()
        ])
        if (mounted) {
          setBrowsers(detectedBrowsers)
          setSavedSession(status)
        }
      } catch {
        if (mounted) {
          setError('WatchAlong could not check Patreon sign-in options. You can still paste your session_id manually.')
        }
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    return window.watchAlong.onDownloadProgress((event) => {
      if (event.jobId !== jobId) {
        return
      }

      setProgress(event)
      if (event.state === 'failed') {
        setError(event.message)
      } else if (event.state === 'cancelled') {
        setError(null)
      } else if (event.state === 'success' && event.filePath) {
        setError(null)
        onDownloaded(event.filePath, { jobId: event.jobId, source: event.source })
      }
    })
  }, [jobId, onDownloaded])

  const startYouTubeDownload = async (): Promise<void> => {
    if (!validYoutubeUrl || isWorking) {
      return
    }

    setError(null)
    setProgress(null)
    try {
      const result = await window.watchAlong.startReactionDownload({ source: 'youtube', url: youtubeUrl.trim() })
      setJobId(result.jobId)
      setProgress({
        jobId: result.jobId,
        source: 'youtube',
        state: 'checking',
        message: 'Checking downloader tools...',
        percent: null
      })
    } catch {
      setError('WatchAlong could not start that YouTube download. Check the link and try again.')
    }
  }

  const startPatreonDownload = async (sessionSource: PatreonSessionSource): Promise<void> => {
    if (!validPatreonUrl || isWorking) {
      return
    }

    setError(null)
    setProgress(null)
    try {
      const result = await window.watchAlong.startReactionDownload({
        source: 'patreon',
        url: patreonUrl.trim(),
        sessionSource
      })
      setJobId(result.jobId)
      setProgress({
        jobId: result.jobId,
        source: 'patreon',
        state: 'checking',
        message: 'Checking downloader tools...',
        percent: null
      })
    } catch {
      setError('WatchAlong could not start that Patreon download. Check access to the post and try again.')
    }
  }

  const readBrowserSession = async (browser: BrowserDetection): Promise<void> => {
    if (!validPatreonUrl || isWorking) {
      return
    }

    setError(null)
    setBrowserReading(browser.name)
    try {
      const result = await window.watchAlong.extractPatreonSession(browser.name)
      setBrowserReading(null)
      if (result.ok && result.token) {
        await startPatreonDownload({ type: 'browser', browser: browser.name, token: result.token })
      } else {
        setError(result.message ?? 'We could not automatically read your Patreon session.')
      }
    } catch {
      setBrowserReading(null)
      setError('We could not automatically read your Patreon session.')
    }
  }

  const openLoginWindow = async (): Promise<void> => {
    if (!validPatreonUrl || isWorking || loginWindowOpen) {
      return
    }

    setError(null)
    setLoginWindowOpen(true)
    try {
      const result = await window.watchAlong.openPatreonLoginWindow()
      setLoginWindowOpen(false)
      if (result.ok && result.token) {
        await startPatreonDownload({ type: 'token', token: result.token })
      } else {
        setError(result.message ?? 'Patreon sign-in did not return a session.')
      }
    } catch {
      setLoginWindowOpen(false)
      setError('Patreon sign-in could not be opened. You can paste your session_id manually.')
    }
  }

  const cancelDownload = async (): Promise<void> => {
    if (jobId) {
      try {
        await window.watchAlong.cancelDownload(jobId)
      } catch {
        setError('WatchAlong could not cancel this download. It may finish in the background.')
      }
    }
  }

  const selectLocalReaction = async (): Promise<void> => {
    setError(null)
    try {
      await onSelectLocal()
    } catch {
      setError('WatchAlong could not open the reaction picker. Try again when you are ready.')
    }
  }

  return (
    <section className="smart-input" aria-label="Add Reaction Video">
      <div className="smart-input-header">
        <h2>Add Reaction Video</h2>
        <p>{movieReady ? 'Choose the full-length reaction to sync with your movie.' : 'Load your movie first, then add a reaction.'}</p>
      </div>

      <div className="reaction-cards">
        <ReactionCard
          active={activeCard === 'local'}
          subdued={activeCard !== null && activeCard !== 'local'}
          icon={<FileVideo size={30} aria-hidden />}
          title="Local file"
          description="I already downloaded the reaction video. MP4 and WebM work best."
          onClick={() => {
            setActiveCard('local')
            void selectLocalReaction()
          }}
        />

        <ReactionCard
          active={activeCard === 'youtube'}
          subdued={activeCard !== null && activeCard !== 'youtube'}
          icon={<CirclePlay size={31} aria-hidden />}
          title="YouTube link"
          description="The reactor shared a private or unlisted YouTube link."
          onClick={() => setActiveCard('youtube')}
        >
          <div className="expanded-form">
            <label>
              <span>YouTube URL</span>
              <input
                value={youtubeUrl}
                placeholder="https://www.youtube.com/watch?v=..."
                onChange={(event) => setYoutubeUrl(event.currentTarget.value)}
              />
            </label>
            <button
              className={`primary-button ${validYoutubeUrl && !isWorking ? 'pulse-ready' : ''}`}
              type="button"
              disabled={!validYoutubeUrl || isWorking}
              onClick={() => void startYouTubeDownload()}
            >
              <CirclePlay size={17} aria-hidden />
              Download & Load
            </button>
            <small>Requires yt-dlp (bundled). No account needed.</small>
          </div>
        </ReactionCard>

        <ReactionCard
          active={activeCard === 'patreon'}
          subdued={activeCard !== null && activeCard !== 'patreon'}
          icon={<Heart size={31} aria-hidden />}
          title="Patreon post"
          description="The full-length watchalong is on their Patreon page."
          onClick={() => setActiveCard('patreon')}
        >
          <div className="expanded-form patreon-flow">
            <label>
              <span>Patreon post URL</span>
              <textarea
                className="url-textarea"
                value={patreonUrl}
                placeholder="https://www.patreon.com/posts/..."
                rows={2}
                onChange={(event) => {
                  setPatreonUrl(event.currentTarget.value)
                }}
              />
            </label>

            {validPatreonUrl && (
              <div className="patreon-connect">
                <div>
                  <h3>Connect to Patreon</h3>
                  <p>Sign in securely to download this post. Your password is handled entirely by Patreon.</p>
                </div>
                <div className="privacy-badge">
                  <Lock size={15} aria-hidden />
                  Your cookies never leave your device. We only access the Patreon session.
                </div>

                {savedSession.available && !isWorking && (
                  <div className="saved-session-prompt">
                    <ShieldCheck size={18} aria-hidden />
                    <div>
                      <strong>You have a saved Patreon session.</strong>
                      <p>Use it to download now?</p>
                    </div>
                    <button className="primary-button" type="button" onClick={() => void startPatreonDownload({ type: 'saved' })}>
                      Yes, download
                    </button>
                    <button className="secondary-button" type="button" onClick={() => setSavedSession({ ...savedSession, available: false })}>
                      No, re-authenticate
                    </button>
                  </div>
                )}

                {(!savedSession.available || isWorking) && (
                  <>
                    <button
                      className={`primary-button login-window-primary ${validPatreonUrl && !isWorking && !loginWindowOpen ? 'pulse-ready' : ''}`}
                      type="button"
                      disabled={isWorking || loginWindowOpen}
                      onClick={() => void openLoginWindow()}
                    >
                      {loginWindowOpen ? <Loader2 size={17} aria-hidden className="spin" /> : <Lock size={17} aria-hidden />}
                      {loginWindowOpen ? 'Waiting for Patreon sign-in...' : 'Sign in to Patreon'}
                    </button>
                    <small className="login-hint">Works with any browser - opens a secure sign-in window</small>

                    {firefoxBrowser && firefoxBrowser.installed && (
                      <>
                        <div className="tier-divider"><span>or</span></div>
                        <button
                          className="secondary-button firefox-instant"
                          type="button"
                          disabled={isWorking || browserReading !== null}
                          onClick={() => void readBrowserSession(firefoxBrowser)}
                        >
                          <span className="browser-icon firefox-icon" aria-hidden>F</span>
                          {browserReading === 'firefox' ? 'Reading Firefox session...' : 'Use my Firefox login'}
                          <span className="recommended-badge">Recommended</span>
                        </button>
                        <small className="login-hint">Instant setup - uses your existing Firefox Patreon login</small>
                      </>
                    )}

                    <div className="tier-divider"><span>or paste your session_id</span></div>
                    <ManualPatreonFallback
                      value={manualSessionId}
                      disabled={isWorking}
                      onChange={setManualSessionId}
                      onSubmit={() => void startPatreonDownload({ type: 'manual', sessionId: manualSessionId })}
                    />
                  </>
                )}

                {browserReading && (
                  <div className="inline-status">
                    <Loader2 size={17} aria-hidden className="spin" />
                    Reading Patreon session from {browserLabel(browserReading, browsers)}...
                  </div>
                )}
                {error && <p className="fallback-reason">{error}</p>}
              </div>
            )}
          </div>
        </ReactionCard>
      </div>

      {progress && (
        <div className={`download-status download-${progress.state}`} aria-live="polite">
          <div className="download-status-header">
            <span>{isWorking ? 'Downloading your reaction now. Nothing leaves this device.' : progress.message}</span>
            {isWorking && (
              <button className="mini-button" type="button" onClick={() => void cancelDownload()}>
                <X size={14} aria-hidden />
                Cancel
              </button>
            )}
            {progress.state === 'failed' && (
              <button className="mini-button" type="button" onClick={() => setProgress(null)}>
                <RefreshCw size={14} aria-hidden />
                Retry
              </button>
            )}
          </div>
          <div className={`progress-track ${progress.percent === null ? 'progress-indeterminate' : ''}`}>
            <span style={{ width: `${progress.percent ?? 42}%` }} />
          </div>
        </div>
      )}

    </section>
  )
}

export function PatreonStorageOffer({ jobId, onDismiss }: PatreonStorageOfferProps): JSX.Element {
  const [enabled, setEnabled] = useState(false)
  const [learnMore, setLearnMore] = useState(false)
  const [status, setStatus] = useState<SavedPatreonSessionStatus | null>(null)

  const toggle = async (): Promise<void> => {
    const next = !enabled
    setEnabled(next)
    if (next) {
      setStatus(await window.watchAlong.saveLastPatreonSession(jobId))
    } else {
      setStatus(await window.watchAlong.forgetPatreonSession())
    }
  }

  return (
    <aside className="patreon-storage-offer" aria-label="Save Patreon session">
      <div className="offer-lock">
        <Lock size={18} aria-hidden />
      </div>
      <div>
        <strong>Want to skip this step next time?</strong>
        <p>We can securely save your Patreon session on this device, encrypted with your OS keychain.</p>
        {learnMore && (
          <p className="learn-more-text">
            WatchAlong uses Electron safeStorage for device-local encryption. The session can be deleted from this app at any time.
          </p>
        )}
        {status && !status.canEncrypt && <p className="learn-more-text">Secure storage is not available on this device.</p>}
      </div>
      <label className="storage-toggle">
        <input type="checkbox" checked={enabled} onChange={() => void toggle()} />
        <span>Save</span>
      </label>
      <button className="link-button" type="button" onClick={() => setLearnMore((current) => !current)}>
        Learn more
      </button>
      <button className="icon-button" type="button" title="Dismiss" aria-label="Dismiss" onClick={onDismiss}>
        <X size={16} aria-hidden />
      </button>
    </aside>
  )
}

function ReactionCard({
  active,
  subdued,
  icon,
  title,
  description,
  children,
  onClick
}: {
  active: boolean
  subdued: boolean
  icon: JSX.Element
  title: string
  description: string
  children?: ReactNode
  onClick(): void
}): JSX.Element {
  return (
    <article className={`reaction-card ${active ? 'reaction-card-active' : ''} ${subdued ? 'reaction-card-subdued' : ''}`}>
      <button className="reaction-card-button" type="button" onClick={onClick}>
        <span className="reaction-card-icon">{icon}</span>
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
      </button>
      <div className="reaction-card-expansion">{active && children}</div>
    </article>
  )
}

function ManualPatreonFallback({
  value,
  disabled,
  onChange,
  onSubmit
}: {
  value: string
  disabled: boolean
  onChange(value: string): void
  onSubmit(): void
}): JSX.Element {
  return (
    <div className="manual-fallback">
      <p>Grab your session_id manually in a few clicks:</p>
      <ol>
        <li>Open Patreon in your browser and log in if needed.</li>
        <li>Press F12 to open Developer Tools, then click the Application tab (Chrome/Edge) or Storage tab (Firefox).</li>
        <li>In the left sidebar, find Cookies &gt; https://www.patreon.com. Double-click the session_id row and copy the Value.</li>
      </ol>
      <label>
        <span>session_id</span>
        <textarea
          value={value}
          placeholder="Paste your session_id here"
          rows={2}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </label>
      <button className="primary-button" type="button" disabled={disabled || value.trim().length < 8} onClick={onSubmit}>
        <Check size={16} aria-hidden />
        Use this session & download
      </button>
    </div>
  )
}

export function isValidYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

export function isValidPatreonPostUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    const hostname = url.hostname.toLowerCase()
    return (hostname === 'patreon.com' || hostname.endsWith('.patreon.com')) && url.pathname.includes('/posts/')
  } catch {
    return false
  }
}

function browserLabel(name: BrowserName, browsers: BrowserDetection[]): string {
  return browsers.find((browser) => browser.name === name)?.label ?? name
}
