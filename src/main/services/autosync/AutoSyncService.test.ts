import { describe, expect, it, vi } from 'vitest'
import { createDefaultSession } from '@shared/session'
import type { AutoSyncCompleteEvent, LibrarySession, SessionLibrary } from '@shared/types'
import { AutoSyncService, type AutoSyncSessionRepository } from './AutoSyncService'
import type { AutoSyncMediaBackend, FrameExtractionRequest, MediaInfo } from './ffmpegBackend'
import type { PixelFrame } from './signatures'

describe('AutoSyncService', () => {
  it('replaces an existing automatic timing snapshot when a confident recheck succeeds', async () => {
    const session = createDefaultSession(new Date('2026-01-01T00:00:00Z'), {
      id: 'session-1',
      moviePath: 'movie.mp4',
      reactionPath: 'reaction.mp4',
      offsetSeconds: 12,
      movieRateCorrection: 0.999,
      timingOrigin: 'automatic',
      autoSyncConfidence: 0.91,
      autoSyncAnalyzedAt: '2026-02-01T00:00:00.000Z',
      autoSyncAlgorithmVersion: 1
    })
    const repository = new MemorySessions(session)
    const service = new AutoSyncService({ sessions: repository, backend: new SyntheticBackend(-20), emitProgress: () => undefined, emitComplete: () => undefined, now: () => new Date('2026-07-13T12:00:00Z') })

    const result = await service.analyze(session.id, { intent: 'recheck', snapshot: session })

    expect(result.outcome, JSON.stringify(result)).toBe('confident')
    expect(result.offsetSeconds).toBeCloseTo(-20, 0)
    expect(repository.updates).toHaveLength(1)
    expect(repository.session).toMatchObject({
      offsetSeconds: result.offsetSeconds,
      movieRateCorrection: result.movieRateCorrection,
      timingOrigin: 'automatic',
      autoSyncAnalyzedAt: '2026-07-13T12:00:00.000Z',
      autoSyncAlgorithmVersion: 2
    })
  }, 20000)

  it('uses compact corner geometry when the ordinary inset search cannot see the movie', async () => {
    const session = createDefaultSession(new Date(), {
      id: 'session-1', moviePath: 'movie.mp4', reactionPath: 'reaction.mp4'
    })
    const repository = new MemorySessions(session)
    const backend = new SyntheticBackend(-40, 0.2)
    const service = new AutoSyncService({
      sessions: repository,
      backend,
      emitProgress: () => undefined,
      emitComplete: () => undefined
    })
    const signal = new AbortController().signal
    const [movieInfo, reactionInfo] = await Promise.all([
      backend.probe(session.moviePath!),
      backend.probe(session.reactionPath!)
    ])
    const findGeometry = (service as unknown as GeometryServiceInternals).findGeometry.bind(service)

    const result = await findGeometry(session, movieInfo, reactionInfo, signal)

    expect(result?.geometry.width).toBeLessThan(0.32)
    expect(result?.initialOffsetSeconds).toBeCloseTo(-40, 0)
  }, 30000)

  it('keeps known-good timing and automatic metadata when a recheck is only partial', async () => {
    const knownTiming = {
      offsetSeconds: 18.25,
      movieRateCorrection: 0.999,
      detectedMovieFps: 23.976,
      timingOrigin: 'automatic' as const,
      autoSyncConfidence: 0.93,
      autoSyncAnalyzedAt: '2026-07-01T12:00:00.000Z',
      autoSyncAlgorithmVersion: 2
    }
    const session = createDefaultSession(new Date(), {
      id: 'session-1', moviePath: 'movie.mp4', reactionPath: 'reaction.mp4', ...knownTiming
    })
    const repository = new MemorySessions(session)
    const service = partialResultService(repository, -30)

    const result = await service.analyze(session.id, { intent: 'recheck', snapshot: session })

    expect(result).toMatchObject({ outcome: 'partial', offsetSeconds: -30, movieRateCorrection: 0.999 })
    expect(result.message).toContain('kept your existing timing')
    expect(repository.updates).toHaveLength(0)
    expect(repository.session).toMatchObject(knownTiming)
  })

  it('applies a partial starting point during initial import', async () => {
    const session = createDefaultSession(new Date(), {
      id: 'session-1', moviePath: 'movie.mp4', reactionPath: 'reaction.mp4', movieRateCorrection: 1.001
    })
    const repository = new MemorySessions(session)
    const service = partialResultService(repository, -30)

    const result = await service.analyze(session.id, { intent: 'initial', snapshot: session })

    expect(result).toMatchObject({ outcome: 'partial', offsetSeconds: -30, movieRateCorrection: 1.001 })
    expect(repository.updates).toHaveLength(1)
    expect(repository.session).toMatchObject({
      offsetSeconds: -30,
      movieRateCorrection: 1.001,
      timingOrigin: 'automatic',
      autoSyncConfidence: 0.69,
      autoSyncAlgorithmVersion: 2
    })
  })

  it('discards a result when the media paths changed during analysis', async () => {
    const session = createDefaultSession(new Date(), { id: 'session-1', moviePath: 'movie.mp4', reactionPath: 'reaction.mp4' })
    const repository = new MemorySessions({ ...session, moviePath: 'replacement.mp4' })
    const service = new AutoSyncService({ sessions: repository, backend: new SyntheticBackend(-20), emitProgress: () => undefined, emitComplete: () => undefined })
    const result = await service.analyze(session.id, { intent: 'initial', snapshot: session })
    expect(result.outcome).toBe('stale')
    expect(repository.updates).toHaveLength(0)
  }, 20000)

  it('discards a result when timing was adjusted during analysis', async () => {
    const session = createDefaultSession(new Date(), {
      id: 'session-1', moviePath: 'movie.mp4', reactionPath: 'reaction.mp4', offsetSeconds: 4
    })
    const repository = new MemorySessions({ ...session, offsetSeconds: 8 })
    const service = new AutoSyncService({
      sessions: repository,
      backend: new SyntheticBackend(-20),
      emitProgress: () => undefined,
      emitComplete: () => undefined
    })

    expect((await service.analyze(session.id, { intent: 'initial', snapshot: session })).outcome).toBe('stale')
    expect(repository.updates).toHaveLength(0)
  }, 20000)

  it('cancels an in-progress scan without changing timing', async () => {
    const session = createDefaultSession(new Date(), { id: 'session-1', moviePath: 'movie.mp4', reactionPath: 'reaction.mp4' })
    const repository = new MemorySessions(session)
    let complete!: (event: AutoSyncCompleteEvent) => void
    const completion = new Promise<AutoSyncCompleteEvent>((resolve) => { complete = resolve })
    const service = new AutoSyncService({ sessions: repository, backend: new BlockingBackend(), emitProgress: () => undefined, emitComplete: complete })
    expect(service.start(session.id, 'initial')).toEqual({ started: true })
    service.cancel(session.id)
    expect((await completion).outcome).toBe('cancelled')
    expect(repository.updates).toHaveLength(0)
  })

  it('does not save timing for an unrelated moving video with a static corner logo', async () => {
    const session = createDefaultSession(new Date(), {
      id: 'session-1', moviePath: 'movie.mp4', reactionPath: 'reaction.mp4'
    })
    const repository = new MemorySessions(session)
    const service = new AutoSyncService({
      sessions: repository,
      backend: new UnrelatedVideoBackend(),
      emitProgress: () => undefined,
      emitComplete: () => undefined
    })

    const result = await service.analyze(session.id, { intent: 'initial', snapshot: session })

    expect(result.outcome, JSON.stringify(result)).toBe('fallback')
    expect(repository.updates).toHaveLength(0)
  }, 120000)
})

function partialResultService(repository: MemorySessions, candidateOffset: number): AutoSyncService {
  const service = new AutoSyncService({
    sessions: repository,
    backend: new ProbeOnlyBackend(),
    emitProgress: () => undefined,
    emitComplete: () => undefined,
    now: () => new Date('2026-07-13T12:00:00Z')
  })
  const geometry = { x: 0, y: 0, width: 1, height: 1, flipHorizontal: false }
  const anchors = [30, 60, 90].map((reactionTime) => ({
    reactionTime,
    movieTime: reactionTime * repository.session.movieRateCorrection + candidateOffset,
    confidence: 0.8,
    score: 0.1,
    runnerUpScore: 0.7
  }))
  type AsyncInternal = (...args: never[]) => Promise<unknown>
  const internals = service as unknown as Record<'findGeometry' | 'scanTimelines' | 'refineAnchors', AsyncInternal>
  vi.spyOn(internals, 'findGeometry').mockResolvedValue({
    geometry,
    mask: null,
    confidence: 0.8,
    initialOffsetSeconds: candidateOffset,
    referenceReactionTime: anchors[0].reactionTime,
    referenceMovieTime: anchors[0].movieTime,
    anchors
  })
  vi.spyOn(internals, 'scanTimelines').mockResolvedValue({ anchors: [], consensus: null, geometry, mask: null })
  vi.spyOn(internals, 'refineAnchors')
    .mockResolvedValueOnce({ anchors: [], consensus: null })
    .mockResolvedValueOnce({ anchors, consensus: null })
  return service
}

class MemorySessions implements AutoSyncSessionRepository {
  updates: Array<Partial<LibrarySession>> = []
  constructor(public session: LibrarySession) {}
  getSession(id: string): LibrarySession | null { return id === this.session.id ? this.session : null }
  updateSession(_id: string, patch: Partial<LibrarySession>): SessionLibrary {
    this.updates.push(patch); this.session = { ...this.session, ...patch }
    return { version: 6, activeSessionId: this.session.id, sessions: [this.session] }
  }
}

class ProbeOnlyBackend implements AutoSyncMediaBackend {
  async probe(): Promise<MediaInfo> {
    return { duration: 600, width: 96, height: 54, frameRate: 24 }
  }
  async extractFrames(): Promise<void> {
    throw new Error('Partial-analysis internals should be stubbed in this test.')
  }
}

class SyntheticBackend implements AutoSyncMediaBackend {
  constructor(private readonly offset: number, private readonly insetFraction = 0.78) {}
  async probe(filePath: string): Promise<MediaInfo> {
    return { duration: filePath.startsWith('reaction') ? 640 : 600, width: 96, height: 54, frameRate: 24 }
  }
  async extractFrames(filePath: string, request: FrameExtractionRequest, signal: AbortSignal, onFrame: (frame: PixelFrame, time: number) => void): Promise<void> {
    const count = Math.floor(request.duration * request.fps)
    for (let index = 0; index < count; index += 1) {
      if (signal.aborted) throw abortError()
      const time = request.start + index / request.fps
      const storyTime = filePath.startsWith('reaction') ? time + this.offset : time
      onFrame(filePath.startsWith('reaction')
        ? reactionFrameFor(storyTime, request.width, request.height, this.insetFraction)
        : frameFor(storyTime, request.width, request.height), time)
    }
  }
}

class BlockingBackend implements AutoSyncMediaBackend {
  probe(_filePath: string, signal: AbortSignal): Promise<MediaInfo> {
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(abortError()), { once: true }))
  }
  async extractFrames(): Promise<void> { /* never reached */ }
}

interface GeometryServiceInternals {
  findGeometry(
    session: LibrarySession,
    movieInfo: MediaInfo,
    reactionInfo: MediaInfo,
    signal: AbortSignal
  ): Promise<{ geometry: { width: number }; initialOffsetSeconds: number } | null>
}

class UnrelatedVideoBackend implements AutoSyncMediaBackend {
  async probe(filePath: string): Promise<MediaInfo> {
    return { duration: filePath.startsWith('reaction') ? 640 : 600, width: 96, height: 54, frameRate: 24 }
  }
  async extractFrames(filePath: string, request: FrameExtractionRequest, signal: AbortSignal, onFrame: (frame: PixelFrame, time: number) => void): Promise<void> {
    const count = Math.floor(request.duration * request.fps)
    for (let index = 0; index < count; index += 1) {
      if (signal.aborted) throw abortError()
      const time = request.start + index / request.fps
      const frame = filePath.startsWith('reaction')
        ? unrelatedFrameFor(time, request.width, request.height)
        : frameFor(time, request.width, request.height)
      if (filePath.startsWith('reaction')) paintStaticCornerLogo(frame)
      onFrame(frame, time)
    }
  }
}

function frameFor(time: number, width: number, height: number): PixelFrame {
  const data = new Uint8Array(width * height * 3)
  // Hold each synthetic shot for two seconds so independently-seeked frame grids
  // still share temporal content, as real video does between cuts.
  const seed = Math.max(0, Math.floor(time / 2))
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 3
    const nx = Math.floor(x / width * 32)
    const ny = Math.floor(y / height * 18)
    let hash = Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(nx + 17, 0x85ebca6b) ^ Math.imul(ny + 31, 0xc2b2ae35)
    hash ^= hash >>> 16; hash = Math.imul(hash, 0x7feb352d); hash ^= hash >>> 15
    const value = hash & 255
    data[index] = value; data[index + 1] = (hash >>> 8) & 255; data[index + 2] = (hash >>> 16) & 255
  }
  return { data, width, height, channels: 3 }
}

function reactionFrameFor(time: number, width: number, height: number, insetFraction = 0.78): PixelFrame {
  const data = new Uint8Array(width * height * 3).fill(18)
  const insetWidth = Math.max(1, Math.round(width * insetFraction))
  const insetHeight = Math.max(1, Math.round(height * insetFraction))
  const inset = frameFor(time, insetWidth, insetHeight)
  const compact = insetFraction < 0.32
  const startX = compact ? 0 : Math.round((width - insetWidth) / 2)
  const startY = compact ? height - insetHeight : Math.round((height - insetHeight) / 2)
  for (let y = 0; y < insetHeight && startY + y < height; y += 1) for (let x = 0; x < insetWidth && startX + x < width; x += 1) {
    const source = (y * insetWidth + x) * 3
    const target = ((startY + y) * width + startX + x) * 3
    data[target] = inset.data[source]
    data[target + 1] = inset.data[source + 1]
    data[target + 2] = inset.data[source + 2]
  }
  return { data, width, height, channels: 3 }
}

function unrelatedFrameFor(time: number, width: number, height: number): PixelFrame {
  const data = new Uint8Array(width * height * 3)
  const shot = Math.floor(time / 3)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 3
    const nx = Math.floor(x / width * 32)
    const ny = Math.floor(y / height * 18)
    const wave = (nx * 7 + ny * 13 + shot * 19) & 255
    const movingBand = Math.abs(nx - shot % 32) <= 2 ? 90 : 0
    data[index] = (wave + movingBand) & 255
    data[index + 1] = (shot * 11 + ny * 5 + movingBand) & 255
    data[index + 2] = (255 - wave + nx * 3) & 255
  }
  return { data, width, height, channels: 3 }
}

function paintStaticCornerLogo(frame: PixelFrame): void {
  const logoWidth = Math.max(1, Math.round(frame.width * 0.2))
  const logoHeight = Math.max(1, Math.round(frame.height * 0.2))
  for (let y = frame.height - logoHeight; y < frame.height; y += 1) for (let x = 0; x < logoWidth; x += 1) {
    const index = (y * frame.width + x) * 3
    const darkStripe = y % 4 === 0 || x % 6 === 0
    frame.data[index] = darkStripe ? 28 : 226
    frame.data[index + 1] = darkStripe ? 25 : 218
    frame.data[index + 2] = darkStripe ? 22 : 196
  }
}

function abortError(): Error {
  const error = new Error('cancelled'); error.name = 'AbortError'; return error
}
