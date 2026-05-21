import type { RemoteMediaCommandResult, RemoteMediaState } from '@shared/types'

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
