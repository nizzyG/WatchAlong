import { useEffect, useRef, type MutableRefObject } from 'react'
import type { AppPreferences, WizardLifecycleEvent } from '@shared/types'
import { mediaPathIdentity } from '@shared/session'
import { TimelineMapping } from '../sync/timeline'
import type { DownloadsHook } from './useDownloads'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'
import type { TransitionToSession } from './useSessionTransition'

interface UseAppSubscriptionsOptions {
  playback: PlaybackHook
  sessionState: SessionHook
  downloads: DownloadsHook
  canPlay: boolean
  wizardSwapMovieMomentRef: MutableRefObject<number | null>
  transitionToSession: TransitionToSession
  flushCurrentSessionPosition: () => Promise<void>
  enterSyncSetup: () => void
}

export function useAppSubscriptions({
  playback,
  sessionState,
  downloads,
  canPlay,
  wizardSwapMovieMomentRef,
  transitionToSession,
  flushCurrentSessionPosition,
  enterSyncSetup
}: UseAppSubscriptionsOptions): void {
  const {
    controllerRef,
    canPlayRef,
    isPlayingRef,
    setupMode,
    setupModeRef,
    pendingSyncSetup,
    setPendingSyncSetup
  } = playback
  const {
    resumeAfterRepairRef,
    playWhenReadySessionIdRef,
    activeSessionIdRef,
    setPreferences,
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
        const result = await transitionToSession<void, undefined>(null, {
          pause: 'none',
          flushPosition: false,
          detachedMovie: 'keep',
          resolveLibrary: async () => ({
            library: await window.watchAlong.getLibrary(),
            metadata: undefined
          }),
          clearResolvedPopOut: false,
          position: 'session',
          presentation: 'active-id-changed',
          destination: 'resolved'
        })
        if (
          result.status === 'completed' && !result.presented &&
          shouldResume && canPlayRef.current
        ) {
          controllerRef.current?.play()
        }
        return
      }

      const outcome = event.outcome
      const swapMovieMoment = wizardSwapMovieMomentRef.current
      pausedForWizardRef.current = false
      await transitionToSession<void, AppPreferences>(null, {
        pause: 'none',
        flushPosition: false,
        detachedMovie: 'wizard-completed',
        resolveLibrary: async () => {
          const [library, preferences] = await Promise.all([
            window.watchAlong.getLibrary(),
            window.watchAlong.getPreferences()
          ])
          return { library, metadata: preferences }
        },
        clearResolvedPopOut: true,
        afterResolved: (_nextSession, preferences) => {
          setPreferences(preferences)
          setShowWelcome(false)
        },
        finalizeResolvedSession: async (nextSession) => {
          if (outcome !== 'completed' || swapMovieMoment === null) return null
          const mappedPosition = new TimelineMapping({
            offsetSeconds: nextSession.offsetSeconds,
            movieRateCorrection: nextSession.movieRateCorrection
          }).movieToReaction(swapMovieMoment)
          return window.watchAlong.saveSessionPosition(nextSession.id, mappedPosition)
        },
        position: 'session',
        presentation: 'always',
        destination: 'resolved',
        beforePresentation: (nextSession) => {
          wizardSwapMovieMomentRef.current = null
          if (!nextSession?.reactionPath) return
          const attachedPath = normalizeMediaPath(nextSession.reactionPath)
          setDownloadEvents((current) => current.filter((item) =>
            item.state !== 'success' || !item.filePath || normalizeMediaPath(item.filePath) !== attachedPath
          ))
          setDownloadIndicator((current) =>
            current?.state === 'success' && current.filePath && normalizeMediaPath(current.filePath) === attachedPath
              ? null
              : current
          )
        },
        beforeViewChange: (nextSession) => {
          setPendingSyncSetup(
            outcome === 'completed-needs-review' &&
            Boolean(nextSession?.reactionPath && nextSession.moviePath)
          )
        },
        afterViewChange: () => {
          setCommandPanelOpen(false)
        }
      })
    }

    return window.watchAlong.onWizardLifecycle((event) => {
      void handleWizardLifecycle(event)
    })
  }, [transitionToSession])

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
    const requestedSessionId = playWhenReadySessionIdRef.current
    if (!canPlay || !requestedSessionId || requestedSessionId !== activeSessionIdRef.current) return
    playWhenReadySessionIdRef.current = null
    controllerRef.current?.play()
  }, [canPlay])

  useEffect(() => {
    if (!canPlay || !resumeAfterRepairRef.current) return
    resumeAfterRepairRef.current = false
    controllerRef.current?.play()
  }, [canPlay])
}

function normalizeMediaPath(value: string): string {
  return mediaPathIdentity(value) ?? value
}
