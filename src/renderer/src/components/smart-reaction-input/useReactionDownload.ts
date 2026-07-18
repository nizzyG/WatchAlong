import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type {
  BrowserDetection,
  BrowserName,
  DownloadProgressEvent,
  PatreonSessionSource,
  ReactionDownloadSource,
  SavedPatreonSessionStatus
} from '@shared/types'
import type { DownloadedReactionMetadata } from './types'
import { isValidPatreonPostUrl, isValidYouTubeUrl } from './urlValidation'

interface UseReactionDownloadOptions {
  onSelectLocal(): Promise<void>
  onDownloaded(filePath: string, metadata: DownloadedReactionMetadata): void | Promise<void>
}

export interface ReactionDownloadController {
  youtubeUrl: string
  setYoutubeUrl: Dispatch<SetStateAction<string>>
  patreonUrl: string
  setPatreonUrl: Dispatch<SetStateAction<string>>
  browsers: BrowserDetection[]
  browserReading: BrowserName | null
  loginWindowOpen: boolean
  savedSession: SavedPatreonSessionStatus
  dismissSavedSession(): void
  progress: DownloadProgressEvent | null
  error: string | null
  validYoutubeUrl: boolean
  validPatreonUrl: boolean
  isWorking: boolean
  interactionBusy: boolean
  retryNeedsPatreonSignIn: boolean
  startYouTubeDownload(): Promise<void>
  startPatreonDownload(sessionSource: PatreonSessionSource): Promise<void>
  readBrowserSession(browser: BrowserDetection): Promise<void>
  openLoginWindow(): Promise<void>
  cancelDownload(): Promise<void>
  selectLocalReaction(): Promise<void>
  retryFailedDownload(): void
}

export function useReactionDownload({
  onSelectLocal,
  onDownloaded
}: UseReactionDownloadOptions): ReactionDownloadController {
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [patreonUrl, setPatreonUrl] = useState('')
  const [browsers, setBrowsers] = useState<BrowserDetection[]>([])
  const [browserReading, setBrowserReading] = useState<BrowserName | null>(null)
  const [loginWindowOpen, setLoginWindowOpen] = useState(false)
  const [savedSession, setSavedSession] = useState<SavedPatreonSessionStatus>({ available: false, canEncrypt: false })
  const [progress, setProgress] = useState<DownloadProgressEvent | null>(null)
  const [startingSource, setStartingSource] = useState<ReactionDownloadSource | null>(null)
  const [error, setError] = useState<string | null>(null)

  const validYoutubeUrl = useMemo(() => isValidYouTubeUrl(youtubeUrl), [youtubeUrl])
  const validPatreonUrl = useMemo(() => isValidPatreonPostUrl(patreonUrl), [patreonUrl])
  const isWorking = progress?.state === 'checking' || progress?.state === 'downloading'
  const downloadBusy = startingSource !== null || isWorking
  const authBusy = loginWindowOpen || browserReading !== null
  const interactionBusy = downloadBusy || authBusy
  const lastPatreonSessionSourceRef = useRef<PatreonSessionSource | null>(null)
  const jobIdRef = useRef<string | null>(null)
  const startingDownloadRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    // React StrictMode intentionally mounts, cleans up, and mounts effects again
    // in development. Restore the flag during every setup so a real, mounted
    // input never discards a completed Patreon sign-in as if it were stale.
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

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
          setError('WatchAlong could not check for Firefox. You can still try Firefox or use Sign in with browser.')
        }
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    return window.watchAlong.onDownloadProgress((event) => {
      if (event.jobId !== jobIdRef.current) return

      setProgress(event)
      if (event.state === 'failed' || event.state === 'cancelled') {
        setError(null)
      } else if (event.state === 'success' && event.filePath) {
        setError(null)
        try {
          void Promise.resolve(onDownloaded(event.filePath, {
            jobId: event.jobId,
            source: event.source,
            reactionTitle: event.metadata?.reactionTitle,
            reactorName: event.metadata?.reactorName,
            avatarPath: event.metadata?.avatarPath
          })).catch(() => {
            setError('The reaction is safely downloaded, but WatchAlong could not attach it. Open Downloads in the Control Panel and choose Attach.')
          })
        } catch {
          setError('The reaction is safely downloaded, but WatchAlong could not attach it. Open Downloads in the Control Panel and choose Attach.')
        }
      }
    })
  }, [onDownloaded])

  const discardUnusedToken = async (token?: string): Promise<void> => {
    if (!token) return
    try {
      await window.watchAlong.discardPatreonSessionToken(token)
    } catch {
      // Tokens are one-use and process-local; main also clears them on Forget.
    }
  }

  const startYouTubeDownload = async (): Promise<void> => {
    if (!validYoutubeUrl || downloadBusy || startingDownloadRef.current) return

    startingDownloadRef.current = true
    setStartingSource('youtube')
    setError(null)
    setProgress(null)
    jobIdRef.current = null
    try {
      const result = await window.watchAlong.startReactionDownload({ source: 'youtube', url: youtubeUrl.trim() })
      // The progress subscription reads this synchronous ref, so a fast
      // terminal event cannot outrun React's next state commit.
      jobIdRef.current = result.jobId
      setProgress({
        jobId: result.jobId,
        source: 'youtube',
        state: 'checking',
        message: 'Checking downloader tools...',
        percent: null
      })
    } catch {
      setError('WatchAlong could not start that YouTube download. Check the link and try again.')
    } finally {
      startingDownloadRef.current = false
      setStartingSource(null)
    }
  }

  const startPatreonDownload = async (sessionSource: PatreonSessionSource): Promise<void> => {
    if (!validPatreonUrl || downloadBusy || startingDownloadRef.current) return

    startingDownloadRef.current = true
    setStartingSource('patreon')
    lastPatreonSessionSourceRef.current = sessionSource
    setError(null)
    setProgress(null)
    jobIdRef.current = null
    try {
      const result = await window.watchAlong.startReactionDownload({
        source: 'patreon',
        url: patreonUrl.trim(),
        sessionSource
      })
      jobIdRef.current = result.jobId
      setProgress({
        jobId: result.jobId,
        source: 'patreon',
        state: 'checking',
        message: 'Checking downloader tools...',
        percent: null
      })
    } catch {
      if (sessionSource.type === 'token' || sessionSource.type === 'browser') {
        await discardUnusedToken(sessionSource.token)
      }
      if (lastPatreonSessionSourceRef.current === sessionSource) {
        lastPatreonSessionSourceRef.current = null
      }
      setError('WatchAlong could not start that Patreon download. Check access to the post and try again.')
    } finally {
      startingDownloadRef.current = false
      setStartingSource(null)
    }
  }

  const readBrowserSession = async (browser: BrowserDetection): Promise<void> => {
    if (!validPatreonUrl || downloadBusy) return

    setError(null)
    setBrowserReading(browser.name)
    try {
      const result = await window.watchAlong.extractPatreonSession(browser.name)
      if (!mountedRef.current) {
        await discardUnusedToken(result.token)
        return
      }
      setBrowserReading(null)
      if (result.ok && result.token) {
        await startPatreonDownload({ type: 'browser', browser: browser.name, token: result.token })
      } else {
        setError(result.message ?? 'We could not automatically read your Patreon session.')
      }
    } catch {
      if (!mountedRef.current) return
      setBrowserReading(null)
      setError('We could not automatically read your Patreon session.')
    }
  }

  const openLoginWindow = async (): Promise<void> => {
    if (!validPatreonUrl || downloadBusy || loginWindowOpen) return

    setError(null)
    setLoginWindowOpen(true)
    try {
      const result = await window.watchAlong.openPatreonLoginWindow()
      if (!mountedRef.current) {
        await discardUnusedToken(result.token)
        return
      }
      setLoginWindowOpen(false)
      if (result.ok && result.token) {
        await startPatreonDownload({ type: 'token', token: result.token })
      } else {
        setError(result.message ?? 'Patreon sign-in did not return a session.')
      }
    } catch {
      if (!mountedRef.current) return
      setLoginWindowOpen(false)
      setError('Patreon sign-in could not be opened. Try again or use Firefox.')
    }
  }

  const cancelDownload = async (): Promise<void> => {
    const activeJobId = jobIdRef.current
    if (!activeJobId) return
    try {
      await window.watchAlong.cancelDownload(activeJobId)
    } catch {
      setError('WatchAlong could not cancel this download. It may finish in the background.')
    }
  }

  const selectLocalReaction = async (): Promise<void> => {
    if (interactionBusy) return
    setError(null)
    try {
      await onSelectLocal()
    } catch {
      setError('WatchAlong could not open the reaction picker. Try again when you are ready.')
    }
  }

  const retryFailedDownload = (): void => {
    if (progress?.source === 'youtube') {
      void startYouTubeDownload()
      return
    }

    const sessionSource = lastPatreonSessionSourceRef.current
    if (
      sessionSource &&
      (sessionSource.type === 'saved' || progress?.retryWithoutPatreonSignIn === true)
    ) {
      void startPatreonDownload(sessionSource)
      return
    }

    setProgress(null)
    setError('Sign in to Patreon again, then WatchAlong can retry the download.')
  }

  return {
    youtubeUrl,
    setYoutubeUrl,
    patreonUrl,
    setPatreonUrl,
    browsers,
    browserReading,
    loginWindowOpen,
    savedSession,
    dismissSavedSession: () => setSavedSession((current) => ({ ...current, available: false })),
    progress,
    error,
    validYoutubeUrl,
    validPatreonUrl,
    isWorking,
    interactionBusy,
    retryNeedsPatreonSignIn: progress?.source === 'patreon' &&
      lastPatreonSessionSourceRef.current?.type !== 'saved' &&
      progress.retryWithoutPatreonSignIn !== true,
    startYouTubeDownload,
    startPatreonDownload,
    readBrowserSession,
    openLoginWindow,
    cancelDownload,
    selectLocalReaction,
    retryFailedDownload
  }
}
