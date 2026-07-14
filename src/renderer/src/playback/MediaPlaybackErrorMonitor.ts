import type { MediaRole } from '@shared/types'

const HAVE_CURRENT_DATA = 2
const HAVE_FUTURE_DATA = 3
const PLAYBACK_PROGRESS_EPSILON_SECONDS = 0.05

export const MEDIA_ERROR_RECOVERY_GRACE_MS = 900

export interface MediaPlaybackObservation {
  currentTime: number
  readyState: number
  ended: boolean
  hasError: boolean
  source: string | null
}

interface PendingMediaError {
  timer: ReturnType<typeof setTimeout>
  observed: MediaPlaybackObservation
}

interface MediaPlaybackErrorMonitorOptions {
  onActionable(role: MediaRole): void
  onRecovery?(role: MediaRole, wasDisplayed: boolean): void
  graceMs?: number
}

/**
 * Chromium can emit a media error while probing a container even though its
 * playable streams continue normally. Delay user-facing errors long enough to
 * distinguish that case from a genuinely unusable file.
 */
export class MediaPlaybackErrorMonitor {
  private readonly pending = new Map<MediaRole, PendingMediaError>()
  private readonly displayed = new Set<MediaRole>()
  private readonly graceMs: number

  constructor(private readonly options: MediaPlaybackErrorMonitorOptions) {
    this.graceMs = options.graceMs ?? MEDIA_ERROR_RECOVERY_GRACE_MS
  }

  reportError(role: MediaRole, readCurrent: () => MediaPlaybackObservation | null): void {
    this.cancelPending(role)
    const observed = readCurrent()
    if (!observed) return

    const timer = setTimeout(() => {
      this.pending.delete(role)
      const current = readCurrent()
      if (!current || playbackRecovered(observed, current)) {
        const wasDisplayed = this.displayed.delete(role)
        this.options.onRecovery?.(role, wasDisplayed)
        return
      }

      this.displayed.add(role)
      this.options.onActionable(role)
    }, this.graceMs)

    this.pending.set(role, { timer, observed })
  }

  reportRecovery(role: MediaRole, observation: MediaPlaybackObservation): boolean {
    const pending = this.pending.get(role)
    const recovered = pending
      ? playbackRecovered(pending.observed, observation)
      : isPlayableObservation(observation)
    if (!recovered) return false

    const hadPending = pending !== undefined
    const wasDisplayed = this.displayed.delete(role)
    if (!hadPending && !wasDisplayed) return false

    this.cancelPending(role)
    this.options.onRecovery?.(role, wasDisplayed)
    return true
  }

  clear(role: MediaRole): void {
    this.cancelPending(role)
    this.displayed.delete(role)
  }

  destroy(): void {
    for (const role of ['reaction', 'movie'] as const) this.clear(role)
  }

  private cancelPending(role: MediaRole): void {
    const pending = this.pending.get(role)
    if (pending) clearTimeout(pending.timer)
    this.pending.delete(role)
  }
}

export function observeHtmlVideo(video: HTMLVideoElement): MediaPlaybackObservation {
  return {
    currentTime: finiteOr(video.currentTime, 0),
    readyState: video.readyState,
    ended: video.ended,
    hasError: video.error !== null,
    source: video.currentSrc || video.src || null
  }
}

export function isPlayableObservation(observation: MediaPlaybackObservation): boolean {
  return !observation.hasError || (
    !observation.ended && observation.readyState >= HAVE_FUTURE_DATA
  )
}

export function mediaPlaybackErrorMessage(role: MediaRole): string {
  return `The ${role} video could not be played by Electron's HTML5 video engine. Use an MP4/WebM file with browser-supported codecs.`
}

function playbackRecovered(
  observed: MediaPlaybackObservation,
  current: MediaPlaybackObservation
): boolean {
  if (observed.source !== current.source || !current.hasError) return true
  if (current.ended || current.readyState < HAVE_CURRENT_DATA) return false

  const advanced = current.currentTime > observed.currentTime + PLAYBACK_PROGRESS_EPSILON_SECONDS
  return advanced || current.readyState >= HAVE_FUTURE_DATA
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}
