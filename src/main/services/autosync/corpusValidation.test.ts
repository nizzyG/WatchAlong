import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeLibrary } from '@shared/session'
import type { LibrarySession, SessionLibrary } from '@shared/types'
import {
  AUTO_SYNC_ALGORITHM_VERSION,
  AutoSyncService,
  type AutoSyncSessionRepository
} from './AutoSyncService'
import { FfmpegAutoSyncBackend } from './ffmpegBackend'

const enabled = process.env.WATCHALONG_CORPUS === '1'

interface ReviewedExpectation {
  key: string
  reactionPathIncludes: string
  offsetSeconds: number
  movieRateCorrection: number
  startTolerance: number
  endTolerance: number
  provenance: 'visual-frame-match'
}

// These values were reviewed against the user's actual local movie, not copied
// from prior AutoSync output. Both reaction timers use a source with less
// opening leader than the local encode, so the visible movie frames are the
// authoritative intercept.
const REVIEWED_EXPECTATIONS: ReviewedExpectation[] = [
  {
    key: 'blazing-saddles-liteweight-patreon-133224181',
    reactionPathIncludes: '133224181 - Blazing Saddles',
    offsetSeconds: -105.58, movieRateCorrection: 1, startTolerance: 0.35, endTolerance: 0.5,
    provenance: 'visual-frame-match'
  },
  {
    key: 'blazing-saddles-two-cavazos-youtube-CXHe4obnpDs',
    reactionPathIncludes: '[CXHe4obnpDs]',
    offsetSeconds: -56.05, movieRateCorrection: 1, startTolerance: 0.25, endTolerance: 0.5,
    provenance: 'visual-frame-match'
  }
]

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
      const reviewed = REVIEWED_EXPECTATIONS.find((expectation) =>
        session.reactionPath!.includes(expectation.reactionPathIncludes)
      )
      // Saved values are ground truth, not hints that analysis may read. The
      // reviewed opening-only cases deliberately exercise the user's actual
      // "Find Sync Again" route; established baselines retain cold import.
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
      const intent = reviewed ? 'recheck' : 'initial'
      const result = await service.analyze(session.id, { intent, snapshot: analysisSession })
      const persisted = repository.getSession(session.id)
      const expectedOffset = reviewed?.offsetSeconds ?? session.offsetSeconds
      const expectedRate = reviewed?.movieRateCorrection ?? session.movieRateCorrection
      const offsetError = result.offsetSeconds === undefined ? null : Math.abs(result.offsetSeconds - expectedOffset)
      const endError = result.offsetSeconds === undefined || result.movieRateCorrection === undefined
        ? null
        : Math.abs((result.offsetSeconds - expectedOffset) +
          (result.movieRateCorrection - expectedRate) * ((movieInfo.duration - expectedOffset) / expectedRate))
      const regressionBaseline = !reviewed && session.timingOrigin === 'automatic' && Math.abs(session.offsetSeconds) > 1
      rows.push({
        title: session.title,
        intent,
        outcome: result.outcome,
        readyToPlay: result.readyToPlay === true,
        confidence: result.confidence,
        reviewed: Boolean(reviewed),
        expectationKey: reviewed?.key ?? null,
        regressionBaseline,
        provenance: reviewed?.provenance ?? (regressionBaseline ? 'saved-result' : null),
        expectedOffset,
        actualOffset: result.offsetSeconds,
        offsetError,
        expectedRate,
        actualRate: result.movieRateCorrection,
        persistedOffset: persisted?.offsetSeconds,
        persistedRate: persisted?.movieRateCorrection,
        persistedTimingOrigin: persisted?.timingOrigin,
        persistedAlgorithmVersion: persisted?.autoSyncAlgorithmVersion,
        endError,
        startTolerance: reviewed?.startTolerance ?? 0.5,
        endTolerance: reviewed?.endTolerance ?? 0.75,
        seconds: (Date.now() - started) / 1000
      })
    }

    console.table(rows)
    expect(rows).toHaveLength(selected.length)
    expect(rows.every((row) => row.outcome !== 'failed')).toBe(true)
    if (requestedIndex === 0) {
      expect(REVIEWED_EXPECTATIONS.every((expectation) =>
        rows.some((row) => row.expectationKey === expectation.key)
      ), 'Every explicitly reviewed corpus case must be present in a full release-gate run.').toBe(true)
    }
    const requiredMatches = rows.filter((row) => row.reviewed || row.regressionBaseline)
    expect(requiredMatches.every((row) => row.outcome === 'confident' || row.readyToPlay === true),
      'Every reviewed case and established regression baseline must remain usable without manual alignment.').toBe(true)
    const reviewedMatches = rows.filter((row) => row.reviewed)
    expect(reviewedMatches.every((row) => row.outcome === 'confident' || row.readyToPlay === true),
      'Every reviewed opening-only case must be usable without a manual-alignment handoff.').toBe(true)
    expect(reviewedMatches.every((row) =>
      row.intent === 'recheck' &&
      row.persistedTimingOrigin === 'automatic' &&
      row.persistedAlgorithmVersion === AUTO_SYNC_ALGORITHM_VERSION &&
      row.persistedOffset === row.actualOffset &&
      row.persistedRate === row.actualRate
    ), 'Every reviewed recheck must persist the usable timing it returns.').toBe(true)
    expect(requiredMatches.every((row) => typeof row.offsetError === 'number' &&
      row.offsetError <= (row.startTolerance as number)), 'Every required start must remain within its tolerance.').toBe(true)
    expect(requiredMatches.every((row) => typeof row.endError === 'number' &&
      row.endError <= (row.endTolerance as number)), 'Every required ending must remain within its tolerance.').toBe(true)
    expect(rows.every((row) => typeof row.seconds === 'number' && row.seconds <= 240), 'Each pair must finish within four minutes.').toBe(true)
  }, 30 * 60 * 1000)
})

class MemoryRepository implements AutoSyncSessionRepository {
  constructor(private session: LibrarySession) {}
  getSession(id: string): LibrarySession | null { return id === this.session.id ? this.session : null }
  updateSession(_id: string, patch: Partial<LibrarySession>): SessionLibrary {
    this.session = { ...this.session, ...patch }
    return { version: 8, activeSessionId: this.session.id, sessions: [this.session], reactors: [] }
  }
}
