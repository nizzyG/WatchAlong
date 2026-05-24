import { describe, expect, it, vi } from 'vitest'
import { SyncController, type VideoAdapter } from './SyncController'
import type { MediaRole, SyncState } from '@shared/types'

class FakeVideo implements VideoAdapter {
  readonly listeners = new Map<string, Set<EventListener>>()
  readonly role: MediaRole
  duration = 120
  readyState = 4
  paused = true
  playbackRate = 1
  seeking = false
  ended = false
  volume = 1
  muted = false
  private value = 0

  constructor(role: MediaRole) {
    this.role = role
  }

  get currentTime(): number {
    return this.value
  }

  set currentTime(value: number) {
    this.seeking = true
    this.emit('seeking')
    this.value = value
    this.seeking = false
    this.emit('seeked')
    this.emit('timeupdate')
    this.emit('canplay')
  }

  play = vi.fn(async () => {
    this.paused = false
    this.emit('playing')
  })

  pause = vi.fn(() => {
    this.paused = true
  })

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener)
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new Event(type))
    }
  }
}

function createController(offset = 0, movieRateCorrection = 1, moviePlaybackMultiplier?: number): {
  controller: SyncController
  reaction: FakeVideo
  movie: FakeVideo
  states: SyncState[]
  getOffset(): number
} {
  const reaction = new FakeVideo('reaction')
  const movie = new FakeVideo('movie')
  const states: SyncState[] = []
  let currentOffset = offset
  const controller = new SyncController({
    reaction,
    movie,
    getOffset: () => currentOffset,
    getMovieRateCorrection: () => movieRateCorrection,
    ...(moviePlaybackMultiplier !== undefined ? { getMoviePlaybackMultiplier: () => moviePlaybackMultiplier } : {}),
    setOffset: (next) => {
      currentOffset = next
    },
    onState: (state) => states.push(state)
  })

  return {
    controller,
    reaction,
    movie,
    states,
    getOffset: () => currentOffset
  }
}

describe('SyncController', () => {
  it('seeks from movie time back to the canonical reaction timeline', async () => {
    const { controller, reaction, movie } = createController(5)

    controller.seekMovie(40)
    await controller.flushForTest()

    expect(reaction.currentTime).toBe(35)
    expect(movie.currentTime).toBe(40)
    expect(controller.getState()).toBe('paused')
  })

  it('calculates and stores sync offset from current matching frames', async () => {
    const { controller, reaction, movie, getOffset } = createController()
    reaction.currentTime = 12
    movie.currentTime = 44.25

    controller.syncNow()
    await controller.flushForTest()

    expect(getOffset()).toBe(32.25)
  })

  it('pauses both videos while buffering and resumes when ready', async () => {
    const { controller, reaction, movie } = createController()

    controller.attach()
    controller.play()
    await controller.flushForTest()
    movie.readyState = 1
    movie.emit('waiting')

    expect(reaction.paused).toBe(true)
    expect(movie.paused).toBe(true)
    expect(controller.getState()).toBe('buffering')

    movie.readyState = 4
    movie.emit('canplay')
    await controller.flushForTest()

    expect(reaction.paused).toBe(false)
    expect(movie.paused).toBe(false)
    expect(controller.getState()).toBe('playing')
    controller.destroy()
  })

  it('uses playback rate for soft movie drift', async () => {
    const { controller, movie } = createController()

    controller.play()
    await controller.flushForTest()
    movie.currentTime = 0.25
    controller.correctDriftForTest()

    expect(movie.playbackRate).toBe(0.97)
  })

  it('applies soft drift around the selected base playback speed', async () => {
    const { controller, movie } = createController()

    controller.setPlaybackRate(1.5)
    controller.play()
    await controller.flushForTest()
    movie.currentTime = 0.25
    controller.correctDriftForTest()

    expect(movie.playbackRate).toBeCloseTo(1.455)
  })

  it('applies the movie playback multiplier to the movie base playback speed', async () => {
    const { controller, reaction, movie } = createController(0, 0.999001, 1.001)

    controller.setPlaybackRate(1.5)

    expect(reaction.playbackRate).toBe(1.5)
    expect(movie.playbackRate).toBeCloseTo(1.5015)
  })

  it('defaults playback multiplier to the inverse timeline correction', async () => {
    const { controller, movie } = createController(0, 0.999001)

    controller.setPlaybackRate(1)

    expect(movie.playbackRate).toBeCloseTo(1.001)
  })

  it('uses timeline correction, not playback multiplier, when mapping seeks', async () => {
    const { controller, reaction, movie } = createController(0, 0.999001, 1.001)

    controller.seekReaction(100)
    await controller.flushForTest()

    expect(reaction.currentTime).toBe(100)
    expect(movie.currentTime).toBeCloseTo(99.9001)
  })

  it('sets independent volumes and muted state without changing sync state', () => {
    const { controller, reaction, movie } = createController()

    controller.setAudio({
      reactionVolume: 0.35,
      movieVolume: 0.8,
      isReactionMuted: true,
      isMovieMuted: false
    })

    expect(reaction.volume).toBe(0.35)
    expect(movie.volume).toBe(0.8)
    expect(reaction.muted).toBe(true)
    expect(movie.muted).toBe(false)
    expect(controller.getState()).toBe('empty')
  })

  it('hard-corrects large movie drift with a seek', async () => {
    const { controller, movie } = createController()

    controller.play()
    await controller.flushForTest()
    movie.currentTime = 8
    controller.correctDriftForTest()

    expect(movie.currentTime).toBeLessThan(0.1)
  })

  it('parks the movie until a negative offset reaches movie time zero', async () => {
    const { controller, reaction, movie } = createController(-10)

    controller.play()
    await controller.flushForTest()

    expect(reaction.paused).toBe(false)
    expect(movie.paused).toBe(true)
    expect(movie.play).not.toHaveBeenCalled()

    controller.seekReaction(10.5)
    await controller.flushForTest()

    expect(movie.currentTime).toBe(0.5)
    expect(movie.play).toHaveBeenCalled()
    expect(movie.paused).toBe(false)
  })
})
