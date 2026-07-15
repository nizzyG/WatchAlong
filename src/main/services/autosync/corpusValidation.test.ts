import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeLibrary } from '@shared/session'
import type { LibrarySession, SessionLibrary } from '@shared/types'
import { AutoSyncService, type AutoSyncSessionRepository } from './AutoSyncService'
import { FfmpegAutoSyncBackend } from './ffmpegBackend'

const enabled = process.env.WATCHALONG_CORPUS === '1'

describe.runIf(enabled)('local auto-sync corpus shipping gate', () => {
  it('reproduces accessible manually verified timing without touching the real library', async () => {
    const appData = process.env.APPDATA
    if (!appData) throw new Error('APPDATA is unavailable.')
    const library = normalizeLibrary(JSON.parse(readFileSync(join(appData, 'WatchAlong', 'library.json'), 'utf8')))
    const requestedIndex = Number(process.env.WATCHALONG_CORPUS_INDEX ?? 0)
    const accessible = library.sessions.filter((session) =>
      Boolean(session.moviePath && session.reactionPath && existsSync(session.moviePath) && existsSync(session.reactionPath))
    )
    const selected = requestedIndex > 0 ? [library.sessions[requestedIndex - 1]].filter(Boolean) : accessible
    const ffmpeg = join(process.cwd(), 'resources', 'tools', 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
    const ffprobe = join(process.cwd(), 'resources', 'tools', 'ffmpeg', process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
    const rows: Array<Record<string, unknown>> = []

    for (const session of selected) {
      // Validate the cold-import experience. The saved values are ground truth,
      // not hints that the analysis is allowed to read.
      const analysisSession: LibrarySession = {
        ...session,
        offsetSeconds: 0,
        movieRateCorrection: 1,
        timingOrigin: 'manual',
        autoSyncConfidence: null,
        autoSyncAnalyzedAt: null,
        autoSyncAlgorithmVersion: null
      }
      const repository = new MemoryRepository(analysisSession)
      const started = Date.now()
      let lastPhase = ''
      const backend = new FfmpegAutoSyncBackend(ffmpeg, ffprobe)
      const movieInfo = await backend.probe(session.moviePath!, new AbortController().signal)
      const service = new AutoSyncService({
        sessions: repository,
        backend,
        emitProgress: (event) => {
          if (event.phase !== lastPhase) {
            lastPhase = event.phase
            console.info(`[corpus] ${event.phase} after ${((Date.now() - started) / 1000).toFixed(1)}s`)
          }
        },
        emitComplete: () => undefined
      })
      const result = await service.analyze(session.id, { intent: 'initial', snapshot: analysisSession })
      const offsetError = result.offsetSeconds === undefined ? null : Math.abs(result.offsetSeconds - session.offsetSeconds)
      const endError = result.offsetSeconds === undefined || result.movieRateCorrection === undefined
        ? null
        : Math.abs((result.offsetSeconds - session.offsetSeconds) +
          (result.movieRateCorrection - session.movieRateCorrection) * ((movieInfo.duration - session.offsetSeconds) / session.movieRateCorrection))
      // Zero is the store's historical default, so only non-default values are
      // usable as local ground truth. The full run still reports every pair.
      const hasVerifiedTiming = Math.abs(session.offsetSeconds) > 1
      rows.push({ title: session.title, outcome: result.outcome, confidence: result.confidence, verified: hasVerifiedTiming, expectedOffset: session.offsetSeconds, actualOffset: result.offsetSeconds, offsetError, expectedRate: session.movieRateCorrection, actualRate: result.movieRateCorrection, endError, seconds: (Date.now() - started) / 1000 })
    }

    console.table(rows)
    expect(rows).toHaveLength(selected.length)
    expect(rows.every((row) => row.outcome !== 'failed')).toBe(true)
    const supportedGroundTruth = rows.filter((row) => row.verified)
    const matched = supportedGroundTruth.filter((row) => row.outcome === 'confident' || row.outcome === 'partial')
    if (supportedGroundTruth.length > 0) {
      expect(matched.length / supportedGroundTruth.length, 'At least 90% of supported verified pairs must auto-match.').toBeGreaterThanOrEqual(0.9)
    }
    expect(matched.every((row) => typeof row.offsetError === 'number' && row.offsetError <= 0.5), 'Start error must be at most 0.5 seconds.').toBe(true)
    expect(matched.every((row) => typeof row.endError === 'number' && row.endError <= 0.75), 'End error must be at most 0.75 seconds.').toBe(true)
    expect(rows.every((row) => typeof row.seconds === 'number' && row.seconds <= 120), 'Each pair must finish within two minutes.').toBe(true)
  }, 30 * 60 * 1000)
})

class MemoryRepository implements AutoSyncSessionRepository {
  constructor(private session: LibrarySession) {}
  getSession(id: string): LibrarySession | null { return id === this.session.id ? this.session : null }
  updateSession(_id: string, patch: Partial<LibrarySession>): SessionLibrary {
    this.session = { ...this.session, ...patch }
    return { version: 6, activeSessionId: this.session.id, sessions: [this.session] }
  }
}
