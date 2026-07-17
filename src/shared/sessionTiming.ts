import type { LibrarySession } from './types'

const timingSnapshotKeys = [
  'id',
  'moviePath',
  'reactionPath',
  'offsetSeconds',
  'movieRateCorrection',
  'reactorSource',
  'detectedMovieFps',
  'timingOrigin',
  'autoSyncConfidence',
  'autoSyncAnalyzedAt',
  'autoSyncAlgorithmVersion'
] as const satisfies readonly (keyof LibrarySession)[]

export type TimingSnapshot = Pick<LibrarySession, (typeof timingSnapshotKeys)[number]>

export function captureTimingSnapshot(session: LibrarySession): TimingSnapshot {
  return Object.fromEntries(
    timingSnapshotKeys.map((key) => [key, session[key]])
  ) as TimingSnapshot
}

export function isTimingSnapshotCurrent(
  current: LibrarySession | null,
  snapshot: TimingSnapshot
): current is LibrarySession {
  return Boolean(current && timingSnapshotKeys.every((key) => current[key] === snapshot[key]))
}
