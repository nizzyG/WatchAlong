import { describe, expect, it } from 'vitest'
import { createDefaultSession } from '@shared/session'
import type { AutoSyncCompleteEvent, LibrarySession, SessionLibrary } from '@shared/types'
import { AutoSyncService, type AutoSyncSessionRepository } from './AutoSyncService'
import type { AutoSyncMediaBackend, FrameExtractionRequest, MediaInfo } from './ffmpegBackend'
import type { PixelFrame } from './signatures'

describe('AutoSyncService', () => {
  it('persists a confident result atomically', async () => {
    const session = createDefaultSession(new Date('2026-01-01T00:00:00Z'), {
      id: 'session-1', moviePath: 'movie.mp4', reactionPath: 'reaction.mp4'
    })
    const repository = new MemorySessions(session)
    const service = new AutoSyncService({ sessions: repository, backend: new SyntheticBackend(-20), emitProgress: () => undefined, emitComplete: () => undefined, now: () => new Date('2026-07-13T12:00:00Z') })

    const result = await service.analyze(session.id, session)

    expect(result.outcome, JSON.stringify(result)).toBe('confident')
    expect(result.offsetSeconds).toBeCloseTo(-20, 0)
    expect(repository.session).toMatchObject({
      timingOrigin: 'automatic',
      autoSyncAnalyzedAt: '2026-07-13T12:00:00.000Z',
      autoSyncAlgorithmVersion: 1
    })
  }, 20000)

  it('discards a result when the media paths changed during analysis', async () => {
    const session = createDefaultSession(new Date(), { id: 'session-1', moviePath: 'movie.mp4', reactionPath: 'reaction.mp4' })
    const repository = new MemorySessions({ ...session, moviePath: 'replacement.mp4' })
    const service = new AutoSyncService({ sessions: repository, backend: new SyntheticBackend(-20), emitProgress: () => undefined, emitComplete: () => undefined })
    const result = await service.analyze(session.id, session)
    expect(result.outcome).toBe('stale')
    expect(repository.updates).toHaveLength(0)
  }, 20000)

  it('cancels an in-progress scan without changing timing', async () => {
    const session = createDefaultSession(new Date(), { id: 'session-1', moviePath: 'movie.mp4', reactionPath: 'reaction.mp4' })
    const repository = new MemorySessions(session)
    let complete!: (event: AutoSyncCompleteEvent) => void
    const completion = new Promise<AutoSyncCompleteEvent>((resolve) => { complete = resolve })
    const service = new AutoSyncService({ sessions: repository, backend: new BlockingBackend(), emitProgress: () => undefined, emitComplete: complete })
    expect(service.start(session.id)).toEqual({ started: true })
    service.cancel(session.id)
    expect((await completion).outcome).toBe('cancelled')
    expect(repository.updates).toHaveLength(0)
  })
})

class MemorySessions implements AutoSyncSessionRepository {
  updates: Array<Partial<LibrarySession>> = []
  constructor(public session: LibrarySession) {}
  getSession(id: string): LibrarySession | null { return id === this.session.id ? this.session : null }
  updateSession(_id: string, patch: Partial<LibrarySession>): SessionLibrary {
    this.updates.push(patch); this.session = { ...this.session, ...patch }
    return { version: 4, activeSessionId: this.session.id, sessions: [this.session] }
  }
}

class SyntheticBackend implements AutoSyncMediaBackend {
  constructor(private readonly offset: number) {}
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
        ? reactionFrameFor(storyTime, request.width, request.height)
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

function reactionFrameFor(time: number, width: number, height: number): PixelFrame {
  const data = new Uint8Array(width * height * 3).fill(18)
  const insetWidth = Math.max(1, Math.round(width * 0.78))
  const insetHeight = Math.max(1, Math.round(height * 0.78))
  const inset = frameFor(time, insetWidth, insetHeight)
  const startX = Math.round(width * 0.11)
  const startY = Math.round(height * 0.11)
  for (let y = 0; y < insetHeight && startY + y < height; y += 1) for (let x = 0; x < insetWidth && startX + x < width; x += 1) {
    const source = (y * insetWidth + x) * 3
    const target = ((startY + y) * width + startX + x) * 3
    data[target] = inset.data[source]
    data[target + 1] = inset.data[source + 1]
    data[target + 2] = inset.data[source + 2]
  }
  return { data, width, height, channels: 3 }
}

function abortError(): Error {
  const error = new Error('cancelled'); error.name = 'AbortError'; return error
}
