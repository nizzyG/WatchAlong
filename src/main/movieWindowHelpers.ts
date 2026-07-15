import type {
  AudioTrackPreference,
  MovieAudioTrackOption,
  MovieAudioTrackSnapshot,
  MovieMediaCommandRequest,
  RemoteMediaCommand,
  RemoteMediaCommandResult,
  RemoteMediaEvent,
  RemoteMediaEventType,
  RemoteMediaState
} from '@shared/types'
import { normalizeAudioTrackPreference } from '@shared/session'

export interface RectangleLike {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplayLike {
  workArea: RectangleLike
}

export const MOVIE_WINDOW_MIN_WIDTH = 320
export const MOVIE_WINDOW_MIN_HEIGHT = 180
export const MOVIE_MEDIA_COMMAND_TIMEOUT_MS = 5000
export const MOVIE_MEDIA_COMMAND_TIMEOUT_ERROR = 'Movie window stopped responding.'

const MAX_AUDIO_TRACKS = 128
const MAX_AUDIO_TRACK_LABEL_LENGTH = 1024
const MAX_AUDIO_TRACK_LANGUAGE_LENGTH = 128
const MAX_REMOTE_ERROR_LENGTH = 2048
const remoteMediaEventTypes = new Set<RemoteMediaEventType>([
  'play',
  'pause',
  'seeking',
  'seeked',
  'waiting',
  'canplay',
  'stalled',
  'ended',
  'error',
  'timeupdate',
  'loadedmetadata',
  'durationchange',
  'ratechange',
  'volumechange',
  'loadeddata',
  'canplaythrough',
  'audiotrackchange'
])

export class SerialTaskQueue {
  private tail: Promise<void> = Promise.resolve()

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }
}

export function bindTrustedMovieSource(
  command: MovieMediaCommandRequest,
  source: { mediaUrl: string; title: string; audioTrackPreference: AudioTrackPreference | null }
): RemoteMediaCommand {
  if (command.type !== 'setSource') {
    return command
  }

  return {
    ...command,
    mediaUrl: source.mediaUrl,
    title: source.title,
    audioTrackPreference: source.audioTrackPreference
  }
}

/**
 * Treat detached-renderer media reports as untrusted runtime data. Native
 * AudioTrack objects never cross IPC; this reconstructs the narrow snapshot
 * contract and derives selection from the enabled track instead of trusting a
 * second, independently supplied descriptor.
 */
export function normalizeMovieAudioTrackSnapshot(value: unknown): MovieAudioTrackSnapshot | undefined {
  if (!isRecord(value) || !Array.isArray(value.tracks) || value.tracks.length > MAX_AUDIO_TRACKS) {
    return undefined
  }

  const tracks: MovieAudioTrackOption[] = []
  const ordinals = new Set<number>()
  for (const rawTrack of value.tracks) {
    if (!isRecord(rawTrack) || typeof rawTrack.enabled !== 'boolean') return undefined
    const preference = normalizeBoundedAudioTrackPreference(rawTrack)
    if (!preference || ordinals.has(preference.ordinal)) return undefined
    ordinals.add(preference.ordinal)
    tracks.push({
      ...preference,
      displayLabel: preference.label || preference.language || `Track ${preference.ordinal + 1}`,
      enabled: rawTrack.enabled
    })
  }

  const enabledTracks = tracks.filter((track) => track.enabled)
  if (enabledTracks.length > 1) return undefined
  const enabled = enabledTracks[0]
  return {
    tracks,
    selected: enabled
      ? { label: enabled.label, language: enabled.language, ordinal: enabled.ordinal }
      : null
  }
}

export function normalizeRemoteMediaCommandResult(value: unknown): RemoteMediaCommandResult | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0 || value.id.length > 256 ||
      typeof value.ok !== 'boolean') {
    return null
  }

  const state = normalizeRemoteMediaState(value.state)
  if (!state) return null
  const audioTrackSnapshot = normalizeMovieAudioTrackSnapshot(value.audioTrackSnapshot)
  return {
    id: value.id,
    ok: value.ok,
    state,
    ...(audioTrackSnapshot ? { audioTrackSnapshot } : {}),
    ...normalizedRemoteError(value.error)
  }
}

export function normalizeRemoteMediaEvent(value: unknown): RemoteMediaEvent | null {
  if (!isRecord(value) || typeof value.type !== 'string' ||
      !remoteMediaEventTypes.has(value.type as RemoteMediaEventType)) {
    return null
  }

  const state = normalizeRemoteMediaState(value.state)
  if (!state) return null
  const audioTrackSnapshot = normalizeMovieAudioTrackSnapshot(value.audioTrackSnapshot)
  return {
    type: value.type as RemoteMediaEventType,
    state,
    ...(audioTrackSnapshot ? { audioTrackSnapshot } : {}),
    ...normalizedRemoteError(value.error)
  }
}

interface PendingMovieCommand {
  resolve(result: RemoteMediaCommandResult): void
  timer: ReturnType<typeof setTimeout>
}

export interface PendingMovieCommandTrackerOptions {
  timeoutMs?: number
  getState(): RemoteMediaState
  onTimeout(commandId: string): void
  setTimer?(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout>
  clearTimer?(timer: ReturnType<typeof setTimeout>): void
}

export class PendingMovieCommandTracker {
  private readonly timeoutMs: number
  private readonly getState: () => RemoteMediaState
  private readonly onTimeout: (commandId: string) => void
  private readonly setTimer: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>
  private readonly clearTimer: (timer: ReturnType<typeof setTimeout>) => void
  private readonly pending = new Map<string, PendingMovieCommand>()

  constructor(options: PendingMovieCommandTrackerOptions) {
    this.timeoutMs = options.timeoutMs ?? MOVIE_MEDIA_COMMAND_TIMEOUT_MS
    this.getState = options.getState
    this.onTimeout = options.onTimeout
    this.setTimer = options.setTimer ?? setTimeout
    this.clearTimer = options.clearTimer ?? clearTimeout
  }

  get size(): number {
    return this.pending.size
  }

  add(commandId: string, resolve: (result: RemoteMediaCommandResult) => void): void {
    const timer = this.setTimer(() => this.timeout(commandId), this.timeoutMs)
    this.pending.set(commandId, { resolve, timer })
  }

  resolve(result: RemoteMediaCommandResult): boolean {
    return this.finish(result.id, result)
  }

  resolveAll(error: string): void {
    for (const id of this.pending.keys()) {
      this.finish(id, {
        id,
        ok: false,
        state: this.getState(),
        error
      })
    }
  }

  private timeout(commandId: string): void {
    const didResolve = this.finish(commandId, {
      id: commandId,
      ok: false,
      state: this.getState(),
      error: MOVIE_MEDIA_COMMAND_TIMEOUT_ERROR
    })
    if (didResolve) {
      this.onTimeout(commandId)
    }
  }

  private finish(commandId: string, result: RemoteMediaCommandResult): boolean {
    const pending = this.pending.get(commandId)
    if (!pending) {
      return false
    }

    this.pending.delete(commandId)
    this.clearTimer(pending.timer)
    pending.resolve(result)
    return true
  }
}

export function ensureVisibleWindowBounds(
  bounds: RectangleLike,
  displays: DisplayLike[],
  primaryDisplay: DisplayLike | null
): RectangleLike {
  if (intersectsAnyWorkArea(bounds, displays)) {
    return bounds
  }

  const workArea = primaryDisplay?.workArea ?? displays[0]?.workArea
  if (!workArea) {
    return bounds
  }

  const width = Math.min(Math.max(bounds.width, MOVIE_WINDOW_MIN_WIDTH), workArea.width)
  const height = Math.min(Math.max(bounds.height, MOVIE_WINDOW_MIN_HEIGHT), workArea.height)

  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height
  }
}

function normalizeBoundedAudioTrackPreference(value: unknown): AudioTrackPreference | null {
  const preference = normalizeAudioTrackPreference(value)
  if (!preference || preference.label.length > MAX_AUDIO_TRACK_LABEL_LENGTH ||
      preference.language.length > MAX_AUDIO_TRACK_LANGUAGE_LENGTH) {
    return null
  }
  return preference
}

function normalizeRemoteMediaState(value: unknown): RemoteMediaState | null {
  if (!isRecord(value) ||
      !isFiniteNumber(value.currentTime) || value.currentTime < 0 ||
      typeof value.duration !== 'number' ||
      !isFiniteNumber(value.playbackRate) || value.playbackRate <= 0 ||
      typeof value.readyState !== 'number' || !Number.isInteger(value.readyState) ||
      value.readyState < 0 || value.readyState > 4 ||
      !isFiniteNumber(value.volume) || value.volume < 0 || value.volume > 1 ||
      typeof value.paused !== 'boolean' ||
      typeof value.seeking !== 'boolean' ||
      typeof value.ended !== 'boolean' ||
      typeof value.muted !== 'boolean') {
    return null
  }

  return {
    currentTime: value.currentTime,
    duration: Number.isFinite(value.duration) && value.duration >= 0 ? value.duration : Number.NaN,
    paused: value.paused,
    playbackRate: value.playbackRate,
    readyState: value.readyState,
    seeking: value.seeking,
    ended: value.ended,
    volume: value.volume,
    muted: value.muted
  }
}

function normalizedRemoteError(value: unknown): Pick<RemoteMediaEvent, 'error'> {
  return typeof value === 'string'
    ? { error: value.slice(0, MAX_REMOTE_ERROR_LENGTH) }
    : {}
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function intersectsAnyWorkArea(bounds: RectangleLike, displays: DisplayLike[]): boolean {
  return displays.some((display) => intersectionArea(bounds, display.workArea) > 0)
}

function intersectionArea(rectangle: RectangleLike, workArea: RectangleLike): number {
  const left = Math.max(rectangle.x, workArea.x)
  const right = Math.min(rectangle.x + rectangle.width, workArea.x + workArea.width)
  const top = Math.max(rectangle.y, workArea.y)
  const bottom = Math.min(rectangle.y + rectangle.height, workArea.y + workArea.height)
  return Math.max(0, right - left) * Math.max(0, bottom - top)
}
