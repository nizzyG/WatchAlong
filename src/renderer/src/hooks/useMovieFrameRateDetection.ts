import { useEffect } from 'react'
import { captureTimingSnapshot, isTimingSnapshotCurrent } from '@shared/sessionTiming'
import type { LibrarySession } from '@shared/types'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'
import { calculateMovieRateCorrection } from './playerTiming'

interface UseMovieFrameRateDetectionOptions {
  playback: PlaybackHook
  sessionState: SessionHook
  activeSession: LibrarySession | null
  autoSyncBusy: boolean
  persist: (patch: Partial<LibrarySession>) => Promise<LibrarySession | null>
  applyMovieRateCorrection: (
    movieRateCorrection: number,
    patch?: Partial<LibrarySession>
  ) => Promise<void>
}

export function useMovieFrameRateDetection({
  playback,
  sessionState,
  activeSession,
  autoSyncBusy,
  persist,
  applyMovieRateCorrection
}: UseMovieFrameRateDetectionOptions): void {
  const { movieFrameRateDetectionKeyRef } = playback
  const { sessionRef } = sessionState

  useEffect(() => {
    const moviePath = activeSession?.moviePath
    if (!activeSession || !moviePath || activeSession.detectedMovieFps !== null || autoSyncBusy) return

    const detectionKey = `${activeSession.id}|${moviePath}`
    if (movieFrameRateDetectionKeyRef.current === detectionKey) return

    movieFrameRateDetectionKeyRef.current = detectionKey
    const detectionSnapshot = captureTimingSnapshot(activeSession)
    let cancelled = false
    void (async () => {
      let detectedMovieFps: number | null = null
      try {
        detectedMovieFps = await window.watchAlong.detectMovieFrameRate(activeSession.id)
      } catch {
        detectedMovieFps = null
      }
      if (cancelled) return

      const authoritativeLibrary = await window.watchAlong.getLibrary()
      if (cancelled) return
      const authoritativeSession = authoritativeLibrary.sessions.find((item) => item.id === activeSession.id) ?? null
      if (!isTimingSnapshotCurrent(authoritativeSession, detectionSnapshot)) return

      const currentSession = sessionRef.current
      if (!isTimingSnapshotCurrent(currentSession, detectionSnapshot)) return

      const movieRateCorrection = calculateMovieRateCorrection(detectedMovieFps, authoritativeSession.reactorSource)
      if (movieRateCorrection === null) {
        await persist({ detectedMovieFps: null })
        return
      }
      await applyMovieRateCorrection(movieRateCorrection, { detectedMovieFps })
    })()

    return () => {
      cancelled = true
      if (movieFrameRateDetectionKeyRef.current === detectionKey) {
        movieFrameRateDetectionKeyRef.current = null
      }
    }
  }, [activeSession?.detectedMovieFps, activeSession?.id, activeSession?.moviePath, autoSyncBusy])
}
