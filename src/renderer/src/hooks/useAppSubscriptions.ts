import { useEffect, useRef, type MutableRefObject } from 'react'
import type { LibrarySession, SessionLibrary, WizardLifecycleEvent } from '@shared/types'
import { mediaPathIdentity } from '@shared/session'
import { TimelineMapping } from '../sync/timeline'
import type { DownloadsHook } from './useDownloads'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'

interface UseAppSubscriptionsOptions {
  playback: PlaybackHook
  sessionState: SessionHook
  downloads: DownloadsHook
  canPlay: boolean
  wizardSwapMovieMomentRef: MutableRefObject<number | null>
  commitLibrary: (next: SessionLibrary) => LibrarySession | null
  refreshMediaUrls: (sessionId: string | null) => Promise<void>
  flushCurrentSessionPosition: () => Promise<void>
  closeMovieWindowForModeChange: () => Promise<void>
  destroyRemoteMovieAdapter: () => void
  enterSyncSetup: () => void
}

export function useAppSubscriptions({
  playback,
  sessionState,
  downloads,
  canPlay,
  wizardSwapMovieMomentRef,
  commitLibrary,
  refreshMediaUrls,
  flushCurrentSessionPosition,
  closeMovieWindowForModeChange,
  destroyRemoteMovieAdapter,
  enterSyncSetup
}: UseAppSubscriptionsOptions): void {
  const {
    controllerRef,
    canPlayRef,
    isPlayingRef,
    setupMode,
    setupModeRef,
    restoredPopOutSessionRef,
    setPosition,
    setMoviePosition,
    pendingSyncSetup,
    setPendingSyncSetup,
    setMovieWindowActive,
    movieWindowActive
  } = playback
  const {
    sessionRef,
    activeSessionIdRef,
    resumeAfterRepairRef,
    setPreferences,
    setAppView,
    setShowWelcome,
    setWizardDimmed,
    wizardDimmed,
    setCommandPanelOpen
  } = sessionState
  const {
    pausedForWizardRef,
    downloadIndicatorTimerRef,
    setPatreonStorageJobId,
    setDownloadIndicator,
    setDownloadEvents
  } = downloads

  const mediaPlayPauseEnabled = canPlay && !setupMode && !wizardDimmed
  const mediaPlayPauseEnabledRef = useRef(mediaPlayPauseEnabled)
  mediaPlayPauseEnabledRef.current = mediaPlayPauseEnabled

  useEffect(() => {
    void window.watchAlong.setMediaPlayPauseEnabled(mediaPlayPauseEnabled).catch(() => undefined)
    return () => {
      if (mediaPlayPauseEnabled) {
        void window.watchAlong.setMediaPlayPauseEnabled(false).catch(() => undefined)
      }
    }
  }, [mediaPlayPauseEnabled])

  useEffect(() => window.watchAlong.onMediaPlayPause(() => {
    // Main already releases the global key when playback becomes unavailable;
    // refs provide a final synchronous guard while that IPC update is in flight.
    if (!mediaPlayPauseEnabledRef.current || !canPlayRef.current || setupModeRef.current) return
    if (isPlayingRef.current) controllerRef.current?.pause()
    else controllerRef.current?.play()
  }), [])

  useEffect(() => {
    const handleWizardLifecycle = async (event: WizardLifecycleEvent): Promise<void> => {
      if (event.type === 'opened') {
        setWizardDimmed(true)
        pausedForWizardRef.current = pausedForWizardRef.current || (canPlayRef.current && isPlayingRef.current)
        if (pausedForWizardRef.current) controllerRef.current?.pause()
        return
      }

      setWizardDimmed(false)
      if (event.outcome === 'cancelled') {
        const shouldResume = pausedForWizardRef.current
        pausedForWizardRef.current = false
        wizardSwapMovieMomentRef.current = null
        const previousSessionId = activeSessionIdRef.current
        const reconciled = commitLibrary(await window.watchAlong.getLibrary())
        if ((reconciled?.id ?? null) !== previousSessionId) {
          setPosition(reconciled?.lastReactionTimeSeconds ?? 0)
          setMoviePosition(0)
          setAppView(reconciled ? 'player' : 'library')
          await refreshMediaUrls(reconciled?.id ?? null)
          return
        }
        if (shouldResume && canPlayRef.current) controllerRef.current?.play()
        return
      }

      pausedForWizardRef.current = false
      if (movieWindowActive) {
        await closeMovieWindowForModeChange()
        destroyRemoteMovieAdapter()
        restoredPopOutSessionRef.current = sessionRef.current.id
        setMovieWindowActive(false)
      }
      const [nextLibrary, nextPreferences] = await Promise.all([
        window.watchAlong.getLibrary(),
        window.watchAlong.getPreferences()
      ])
      let nextSession = commitLibrary(nextLibrary)
      if (nextSession?.isMoviePoppedOut) {
        nextSession = commitLibrary(await window.watchAlong.saveActiveSession({ isMoviePoppedOut: false }))
      }
      setPreferences(nextPreferences)
      setShowWelcome(false)
      if (event.outcome === 'completed' && nextSession && wizardSwapMovieMomentRef.current !== null) {
        const mappedPosition = new TimelineMapping({
          offsetSeconds: nextSession.offsetSeconds,
          movieRateCorrection: nextSession.movieRateCorrection
        }).movieToReaction(wizardSwapMovieMomentRef.current)
        nextSession = commitLibrary(await window.watchAlong.saveSessionPosition(nextSession.id, mappedPosition))
      }
      wizardSwapMovieMomentRef.current = null
      if (nextSession?.reactionPath) {
        const attachedPath = normalizeMediaPath(nextSession.reactionPath)
        setDownloadEvents((current) => current.filter((item) =>
          item.state !== 'success' || !item.filePath || normalizeMediaPath(item.filePath) !== attachedPath
        ))
        setDownloadIndicator((current) =>
          current?.state === 'success' && current.filePath && normalizeMediaPath(current.filePath) === attachedPath
            ? null
            : current
        )
      }
      setPosition(nextSession?.lastReactionTimeSeconds ?? 0)
      setMoviePosition(0)
      setPendingSyncSetup(event.outcome === 'completed-needs-review' && Boolean(nextSession?.reactionPath && nextSession.moviePath))
      setAppView(nextSession ? 'player' : 'library')
      setCommandPanelOpen(false)
      await refreshMediaUrls(nextSession?.id ?? null)
    }

    return window.watchAlong.onWizardLifecycle((event) => {
      void handleWizardLifecycle(event)
    })
  }, [commitLibrary, movieWindowActive, refreshMediaUrls])

  useEffect(() => window.watchAlong.onMainWindowCloseRequest(() => {
    void (async () => {
      try {
        await flushCurrentSessionPosition()
      } finally {
        await window.watchAlong.confirmMainWindowClose()
      }
    })()
  }), [flushCurrentSessionPosition])

  useEffect(() => window.watchAlong.onDownloadProgress((event) => {
    if (downloadIndicatorTimerRef.current !== null) {
      window.clearTimeout(downloadIndicatorTimerRef.current)
      downloadIndicatorTimerRef.current = null
    }
    if (event.state === 'cancelled') {
      setDownloadIndicator(null)
      setDownloadEvents((current) => current.filter((item) => item.jobId !== event.jobId))
      return
    }

    setDownloadIndicator(event)
    setDownloadEvents((current) => [
      event,
      ...current.filter((item) => item.jobId !== event.jobId)
    ].slice(0, 8))
    if (event.state === 'success' || event.state === 'failed') {
      if (event.state === 'success' && event.source === 'patreon') setPatreonStorageJobId(event.jobId)
      downloadIndicatorTimerRef.current = window.setTimeout(() => {
        setDownloadIndicator(null)
        downloadIndicatorTimerRef.current = null
      }, 5000)
    }
  }), [])

  useEffect(() => () => {
    if (downloadIndicatorTimerRef.current !== null) window.clearTimeout(downloadIndicatorTimerRef.current)
  }, [])

  useEffect(() => {
    if (pendingSyncSetup && canPlay) {
      setPendingSyncSetup(false)
      enterSyncSetup()
    }
  }, [canPlay, pendingSyncSetup])

  useEffect(() => {
    if (!canPlay || !resumeAfterRepairRef.current) return
    resumeAfterRepairRef.current = false
    controllerRef.current?.play()
  }, [canPlay])
}

function normalizeMediaPath(value: string): string {
  return mediaPathIdentity(value) ?? value
}
