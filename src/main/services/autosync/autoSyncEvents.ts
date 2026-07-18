import type { AutoSyncCompleteEvent, AutoSyncIntent } from '@shared/types'
import type { AutoSyncFit } from './fitting'

export type CommitAutoSyncTiming = (
  sessionId: string,
  offsetSeconds: number,
  movieRateCorrection: number,
  confidence: number,
  detectedMovieFps: number,
  result: AutoSyncCompleteEvent
) => void

export interface AutoSyncEvents {
  completeFromFit(sessionId: string, fit: AutoSyncFit, detectedMovieFps: number): AutoSyncCompleteEvent
  completePartial(
    sessionId: string,
    intent: AutoSyncIntent,
    offsetSeconds: number,
    movieRateCorrection: number,
    confidence: number,
    anchorCount: number,
    detectedMovieFps: number
  ): AutoSyncCompleteEvent
  completeReadyOpeningPartial(
    sessionId: string,
    offsetSeconds: number,
    movieRateCorrection: number,
    confidence: number,
    anchorCount: number,
    detectedMovieFps: number
  ): AutoSyncCompleteEvent
}

export function createAutoSyncEvents(commit: CommitAutoSyncTiming): AutoSyncEvents {
  return {
    completeFromFit(sessionId, fit, detectedMovieFps) {
      const result: AutoSyncCompleteEvent = {
        sessionId,
        outcome: 'confident',
        message: 'Ready — WatchAlong found the timing and will keep both videos together.',
        offsetSeconds: fit.offsetSeconds,
        movieRateCorrection: fit.movieRateCorrection,
        confidence: fit.confidence,
        anchorCount: fit.anchors.length
      }
      commit(
        sessionId,
        fit.offsetSeconds,
        fit.movieRateCorrection,
        fit.confidence,
        detectedMovieFps,
        result
      )
      return result
    },

    completePartial(
      sessionId,
      intent,
      offsetSeconds,
      movieRateCorrection,
      confidence,
      anchorCount,
      detectedMovieFps
    ) {
      const result: AutoSyncCompleteEvent = {
        sessionId,
        outcome: 'partial',
        message: intent === 'initial'
          ? 'WatchAlong found the starting point. Please give the timing a quick check before you begin.'
          : 'WatchAlong found a possible starting point, but kept your existing timing because the new result was not certain enough.',
        offsetSeconds,
        movieRateCorrection,
        confidence,
        anchorCount
      }
      if (intent === 'initial') {
        commit(sessionId, offsetSeconds, movieRateCorrection, confidence, detectedMovieFps, result)
      }
      return result
    },

    completeReadyOpeningPartial(
      sessionId,
      offsetSeconds,
      movieRateCorrection,
      confidence,
      anchorCount,
      detectedMovieFps
    ) {
      // The opening establishes a trustworthy intercept, but not enough
      // full-runtime evidence to claim a drift-aware confident result. Commit
      // that honest partial for both import and an explicit recheck so the UI
      // can continue directly into playback without pretending it was a full
      // timeline fit.
      const result: AutoSyncCompleteEvent = {
        sessionId,
        outcome: 'partial',
        readyToPlay: true,
        message: 'Ready — WatchAlong found the starting point from the visible opening.',
        offsetSeconds,
        movieRateCorrection,
        confidence,
        anchorCount
      }
      commit(sessionId, offsetSeconds, movieRateCorrection, confidence, detectedMovieFps, result)
      return result
    }
  }
}

export function fallback(sessionId: string, message: string): AutoSyncCompleteEvent {
  return { sessionId, outcome: 'fallback', message }
}

export function stale(sessionId: string): AutoSyncCompleteEvent {
  return {
    sessionId,
    outcome: 'stale',
    message: 'The files or timing changed while WatchAlong was checking, so the old result was safely ignored.'
  }
}

export function friendlyError(error: unknown): string {
  const detail = error instanceof Error ? error.message : ''
  if (/video stream|invalid data|could not be analyzed/i.test(detail)) {
    return 'One of these files could not be read clearly. Your existing timing was left unchanged.'
  }
  return 'Automatic sync couldn’t finish this time. Your existing timing was left unchanged.'
}
