import type { MediaRole, SyncCommand, SyncState } from '@shared/types'
import { SyncCommandQueue } from './commandQueue'
import { TimelineMapping } from './timeline'

const HAVE_FUTURE_DATA = 3
const SOFT_DRIFT_SECONDS = 0.1
const RESET_DRIFT_SECONDS = 0.03
const HARD_DRIFT_SECONDS = 0.75
const READY_TIMEOUT_MS = 5000

export interface VideoAdapter {
  readonly role: MediaRole
  currentTime: number
  readonly duration: number
  readonly paused: boolean
  playbackRate: number
  readonly readyState: number
  readonly seeking: boolean
  readonly ended: boolean
  volume: number
  muted: boolean
  play(): Promise<void>
  pause(): void
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
}

export interface SyncControllerOptions {
  reaction: VideoAdapter
  movie: VideoAdapter
  getOffset(): number
  getMovieRateCorrection?(): number
  setOffset(offsetSeconds: number): void | Promise<void>
  onState?(state: SyncState): void
  onPosition?(reactionTime: number): void
  onError?(message: string): void
}

export function createHtmlVideoAdapter(role: MediaRole, element: HTMLVideoElement): VideoAdapter {
  return {
    role,
    get currentTime() {
      return element.currentTime
    },
    set currentTime(value: number) {
      element.currentTime = value
    },
    get duration() {
      return element.duration
    },
    get paused() {
      return element.paused
    },
    get readyState() {
      return element.readyState
    },
    get seeking() {
      return element.seeking
    },
    get ended() {
      return element.ended
    },
    get playbackRate() {
      return element.playbackRate
    },
    set playbackRate(value: number) {
      element.playbackRate = value
    },
    get volume() {
      return element.volume
    },
    set volume(value: number) {
      element.volume = value
    },
    get muted() {
      return element.muted
    },
    set muted(value: boolean) {
      element.muted = value
    },
    play: () => element.play(),
    pause: () => element.pause(),
    addEventListener: (type, listener) => element.addEventListener(type, listener),
    removeEventListener: (type, listener) => element.removeEventListener(type, listener)
  }
}

export class SyncController {
  private readonly queue = new SyncCommandQueue()
  private state: SyncState = 'empty'
  private processing = false
  private desiredPlaying = false
  private suppressMediaEvents = 0
  private frameId: number | null = null
  private destroyed = false
  private setupMode = false
  private hardCorrectionInFlight = false
  private anchorReactionTime = 0
  private anchorClockTime = performance.now()
  private basePlaybackRate = 1

  private readonly onReactionSeeking = () => this.handleExternalSeek(this.options.reaction)
  private readonly onMovieSeeking = () => this.handleExternalSeek(this.options.movie)
  private readonly onWaiting = () => this.handleBuffering()
  private readonly onCanPlay = () => this.handleCanPlay()
  private readonly onEnded = () => this.handleEnded()

  constructor(private readonly options: SyncControllerOptions) {}

  attach(): void {
    for (const video of [this.options.reaction, this.options.movie]) {
      video.addEventListener('waiting', this.onWaiting)
      video.addEventListener('stalled', this.onWaiting)
      video.addEventListener('canplay', this.onCanPlay)
      video.addEventListener('ended', this.onEnded)
    }

    this.options.reaction.addEventListener('seeking', this.onReactionSeeking)
    this.options.movie.addEventListener('seeking', this.onMovieSeeking)
    this.startDriftLoop()
  }

  destroy(): void {
    this.destroyed = true
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId)
    }

    for (const video of [this.options.reaction, this.options.movie]) {
      video.removeEventListener('waiting', this.onWaiting)
      video.removeEventListener('stalled', this.onWaiting)
      video.removeEventListener('canplay', this.onCanPlay)
      video.removeEventListener('ended', this.onEnded)
    }

    this.options.reaction.removeEventListener('seeking', this.onReactionSeeking)
    this.options.movie.removeEventListener('seeking', this.onMovieSeeking)
  }

  play(): void {
    this.enqueue({ type: 'play' })
  }

  pause(): void {
    this.enqueue({ type: 'pause' })
  }

  seekReaction(time: number): void {
    this.enqueue({ type: 'seekReaction', time })
  }

  seekMovie(time: number): void {
    this.enqueue({ type: 'seekMovie', time })
  }

  syncNow(): void {
    this.enqueue({ type: 'syncNow' })
  }

  loadSession(time: number): void {
    this.enqueue({ type: 'loadSession', time })
  }

  setVolume(volume: number): void {
    const safeVolume = Math.min(1, Math.max(0, volume))
    this.options.reaction.volume = safeVolume
    this.options.movie.volume = safeVolume
  }

  setAudio({
    reactionVolume,
    movieVolume,
    isReactionMuted,
    isMovieMuted
  }: {
    reactionVolume: number
    movieVolume: number
    isReactionMuted: boolean
    isMovieMuted: boolean
  }): void {
    this.options.reaction.volume = clamp(reactionVolume, 0, 1)
    this.options.movie.volume = clamp(movieVolume, 0, 1)
    this.options.reaction.muted = isReactionMuted
    this.options.movie.muted = isMovieMuted
  }

  setPlaybackRate(rate: number): void {
    this.basePlaybackRate = clamp(rate, 0.25, 4)
    this.options.reaction.playbackRate = this.reactionBaseRate()
    this.options.movie.playbackRate = this.movieBaseRate()
  }

  setSetupMode(enabled: boolean): void {
    this.setupMode = enabled
    if (enabled) {
      this.desiredPlaying = false
      this.pauseMediaOnly()
      this.setState(this.isMediaUsable() ? 'paused' : 'empty')
    } else {
      this.reanchorExpectedTimeline()
    }
  }

  getState(): SyncState {
    return this.state
  }

  async flushForTest(): Promise<void> {
    while (this.processing || this.queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  correctDriftForTest(): void {
    this.correctDrift()
  }

  private enqueue(command: SyncCommand): void {
    this.queue.push(command)
    void this.processQueue()
  }

  private async processQueue(): Promise<void> {
    if (this.processing) {
      return
    }

    this.processing = true
    try {
      let command: SyncCommand | undefined
      while ((command = this.queue.shift())) {
        await this.execute(command)
      }
    } finally {
      this.processing = false
    }
  }

  private async execute(command: SyncCommand): Promise<void> {
    try {
      switch (command.type) {
        case 'play':
          this.desiredPlaying = true
          await this.startPlayback()
          break
        case 'pause':
          this.desiredPlaying = false
          this.pauseMediaOnly()
          this.setState(this.isMediaUsable() ? 'paused' : 'empty')
          break
        case 'seekReaction':
          await this.seekOnReactionTimeline(command.time, this.desiredPlaying)
          break
        case 'seekMovie':
          await this.seekOnReactionTimeline(this.mapping().movieToReaction(command.time), this.desiredPlaying)
          break
        case 'syncNow':
          await this.options.setOffset(
            TimelineMapping.calculateOffset(
              this.options.reaction.currentTime,
              this.options.movie.currentTime,
              this.movieRateCorrection()
            )
          )
          this.reanchorExpectedTimeline()
          break
        case 'loadSession':
          this.desiredPlaying = false
          await this.seekOnReactionTimeline(command.time, false)
          break
      }
    } catch (error) {
      this.setState('error')
      this.options.onError?.(error instanceof Error ? error.message : 'Playback sync failed')
    }
  }

  private async startPlayback(): Promise<void> {
    if (!this.isMediaUsable()) {
      this.setState('empty')
      return
    }

    this.setState('loading')
    await this.alignToReaction(this.options.reaction.currentTime, true)
    const shouldPlayMovie = this.shouldPlayMovieAtReaction(this.options.reaction.currentTime)
    await Promise.all([
      this.waitUntilReady(this.options.reaction),
      shouldPlayMovie ? this.waitUntilReady(this.options.movie) : Promise.resolve()
    ])

    this.setState('playing')
    this.reanchorExpectedTimeline()
    await Promise.all([this.options.reaction.play(), shouldPlayMovie ? this.options.movie.play() : Promise.resolve()])
    if (!shouldPlayMovie) {
      this.options.movie.pause()
    }
  }

  private async seekOnReactionTimeline(reactionTime: number, resume: boolean): Promise<void> {
    if (!this.isMediaUsable()) {
      this.setState('empty')
      return
    }

    this.setState('seeking')
    this.pauseMediaOnly()
    await this.alignToReaction(reactionTime, false)
    this.options.onPosition?.(this.options.reaction.currentTime)

    if (resume) {
      await this.startPlayback()
    } else {
      this.setState('paused')
      this.reanchorExpectedTimeline()
    }
  }

  private async alignToReaction(reactionTime: number, pauseBeforeSeek: boolean): Promise<void> {
    const mapping = this.mapping()
    const targetReaction = mapping.clampReaction(reactionTime)
    const targetMovie = mapping.reactionToMovie(targetReaction)

    this.suppressMediaEvents += 1
    try {
      if (pauseBeforeSeek) {
        this.pauseMediaOnly()
      }

      this.options.reaction.currentTime = targetReaction
      this.options.movie.currentTime = targetMovie
      await Promise.all([
        this.waitForSeek(this.options.reaction, targetReaction),
        this.waitForSeek(this.options.movie, targetMovie),
        this.waitUntilReady(this.options.reaction),
        this.waitUntilReady(this.options.movie)
      ])
    } finally {
      this.suppressMediaEvents -= 1
    }
  }

  private pauseMediaOnly(): void {
    this.options.reaction.pause()
    this.options.movie.pause()
    this.options.reaction.playbackRate = this.reactionBaseRate()
    this.options.movie.playbackRate = this.movieBaseRate()
    this.reanchorExpectedTimeline()
  }

  private handleExternalSeek(video: VideoAdapter): void {
    if (this.setupMode || this.suppressMediaEvents > 0) {
      return
    }

    if (video.role === 'movie') {
      this.seekMovie(video.currentTime)
    } else {
      this.seekReaction(video.currentTime)
    }
  }

  /**
   * This is the local version of Syncplay's command/readiness handling: when one
   * player buffers, both are paused and the desired play state is queued until
   * both media elements confirm that they can continue.
   */
  private handleBuffering(): void {
    if (this.setupMode || this.state !== 'playing' || !this.desiredPlaying) {
      return
    }

    this.pauseMediaOnly()
    this.setState('buffering')
  }

  private handleCanPlay(): void {
    if (!this.setupMode && this.state === 'buffering' && this.desiredPlaying && this.readyForCurrentTimeline()) {
      this.play()
    }
  }

  private handleEnded(): void {
    if (this.options.reaction.ended) {
      this.desiredPlaying = false
      this.pauseMediaOnly()
      this.setState('ended')
    }
  }

  /**
   * Drift correction follows Syncplay's split between soft correction and hard
   * seeks. Small drift changes playbackRate briefly; large drift gets a direct
   * seek, equivalent to a local doSeek state update.
   */
  private correctDrift(): void {
    if (this.setupMode || this.state !== 'playing' || this.hardCorrectionInFlight) {
      return
    }

    const expectedReaction = this.expectedReactionTime()
    const mapping = this.mapping()
    const expectedMovie = mapping.reactionToMovie(expectedReaction)
    const expectedRawMovie = mapping.rawReactionToMovie(expectedReaction)
    const reactionDrift = this.options.reaction.currentTime - expectedReaction
    const movieDrift = this.options.movie.currentTime - expectedMovie

    if (Math.abs(reactionDrift) > HARD_DRIFT_SECONDS) {
      this.hardCorrectionInFlight = true
      void this.alignToReaction(expectedReaction, false).finally(() => {
        this.hardCorrectionInFlight = false
        this.reanchorExpectedTimeline()
      })
      return
    }

    if (!this.shouldPlayMovieAtReaction(expectedReaction)) {
      this.parkInactiveMovie(expectedRawMovie)
      return
    }

    if (this.desiredPlaying && this.options.movie.paused && this.options.movie.readyState >= HAVE_FUTURE_DATA) {
      void this.options.movie.play()
    }

    if (Math.abs(movieDrift) > HARD_DRIFT_SECONDS) {
      this.suppressMediaEvents += 1
      this.options.movie.currentTime = expectedMovie
      this.suppressMediaEvents -= 1
      this.options.movie.playbackRate = this.movieBaseRate()
      return
    }

    this.options.movie.playbackRate = correctedRate(movieDrift, this.movieBaseRate())
    this.options.reaction.playbackRate = correctedRate(reactionDrift, this.reactionBaseRate())
  }

  private expectedReactionTime(): number {
    if (this.state !== 'playing') {
      return this.options.reaction.currentTime
    }

    return this.mapping().clampReaction(
      this.anchorReactionTime + ((performance.now() - this.anchorClockTime) / 1000) * this.reactionBaseRate()
    )
  }

  private reanchorExpectedTimeline(): void {
    this.anchorReactionTime = this.options.reaction.currentTime
    this.anchorClockTime = performance.now()
  }

  private startDriftLoop(): void {
    const tick = (): void => {
      if (this.destroyed) {
        return
      }

      this.correctDrift()
      this.options.onPosition?.(this.options.reaction.currentTime)
      this.frameId = requestAnimationFrame(tick)
    }

    this.frameId = requestAnimationFrame(tick)
  }

  private waitForSeek(video: VideoAdapter, target: number): Promise<void> {
    if (!video.seeking && Math.abs(video.currentTime - target) <= 0.05) {
      return Promise.resolve()
    }

    return this.waitForAnyEvent(video, ['seeked', 'canplay', 'timeupdate'], READY_TIMEOUT_MS)
  }

  private waitUntilReady(video: VideoAdapter): Promise<void> {
    if (video.readyState >= HAVE_FUTURE_DATA) {
      return Promise.resolve()
    }

    return this.waitForAnyEvent(video, ['canplay', 'canplaythrough', 'loadeddata'], READY_TIMEOUT_MS)
  }

  private waitForAnyEvent(video: VideoAdapter, events: string[], timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer)
        for (const event of events) {
          video.removeEventListener(event, onEvent)
        }
      }

      const onEvent = (): void => {
        cleanup()
        resolve()
      }

      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`Timed out waiting for ${video.role} video`))
      }, timeoutMs)

      for (const event of events) {
        video.addEventListener(event, onEvent)
      }
    })
  }

  private mapping(): TimelineMapping {
    return new TimelineMapping({
      offsetSeconds: this.options.getOffset(),
      movieRateCorrection: this.movieRateCorrection(),
      reactionDuration: this.options.reaction.duration,
      movieDuration: this.options.movie.duration
    })
  }

  private bothReady(): boolean {
    return this.options.reaction.readyState >= HAVE_FUTURE_DATA && this.options.movie.readyState >= HAVE_FUTURE_DATA
  }

  private readyForCurrentTimeline(): boolean {
    return this.options.reaction.readyState >= HAVE_FUTURE_DATA &&
      (!this.shouldPlayMovieAtReaction(this.options.reaction.currentTime) || this.options.movie.readyState >= HAVE_FUTURE_DATA)
  }

  private shouldPlayMovieAtReaction(reactionTime: number): boolean {
    const rawMovieTime = this.mapping().rawReactionToMovie(reactionTime)
    return rawMovieTime >= 0 && rawMovieTime <= this.options.movie.duration
  }

  private parkInactiveMovie(rawMovieTime: number): void {
    this.options.movie.pause()
    this.options.movie.playbackRate = this.movieBaseRate()
    const target = rawMovieTime < 0 ? 0 : this.options.movie.duration
    if (Number.isFinite(target) && Math.abs(this.options.movie.currentTime - target) > RESET_DRIFT_SECONDS) {
      this.suppressMediaEvents += 1
      this.options.movie.currentTime = target
      this.suppressMediaEvents -= 1
    }
  }

  private isMediaUsable(): boolean {
    return Number.isFinite(this.options.reaction.duration) && Number.isFinite(this.options.movie.duration)
  }

  private movieRateCorrection(): number {
    return clamp(this.options.getMovieRateCorrection?.() ?? 1, 0.95, 1.05)
  }

  private reactionBaseRate(): number {
    return this.basePlaybackRate
  }

  private movieBaseRate(): number {
    return this.basePlaybackRate * this.movieRateCorrection()
  }

  private setState(state: SyncState): void {
    if (this.state === state) {
      return
    }

    this.state = state
    this.options.onState?.(state)
  }
}

function correctedRate(driftSeconds: number, basePlaybackRate = 1): number {
  const absoluteDrift = Math.abs(driftSeconds)
  if (absoluteDrift < RESET_DRIFT_SECONDS) {
    return basePlaybackRate
  }

  if (absoluteDrift < SOFT_DRIFT_SECONDS) {
    return basePlaybackRate
  }

  return driftSeconds > 0 ? basePlaybackRate * 0.97 : basePlaybackRate * 1.03
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
