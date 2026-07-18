import type { LibrarySession } from '@shared/types'

export type LibrarySessionStartIntent = 'play' | 'sync'

export interface LibraryPrimaryAction {
  intent: LibrarySessionStartIntent
  label: 'Continue Reaction' | 'Play Reaction' | 'Find Sync'
}

export interface LibraryProgress {
  hasSavedPosition: boolean
  percent: number | null
}

const SAVED_POSITION_THRESHOLD_SECONDS = 1

export function libraryPrimaryAction(session: LibrarySession): LibraryPrimaryAction {
  if (session.syncReadiness !== 'ready') return { intent: 'sync', label: 'Find Sync' }
  return session.lastReactionTimeSeconds >= SAVED_POSITION_THRESHOLD_SECONDS
    ? { intent: 'play', label: 'Continue Reaction' }
    : { intent: 'play', label: 'Play Reaction' }
}

export function libraryProgress(session: LibrarySession): LibraryProgress {
  const hasSavedPosition = session.lastReactionTimeSeconds >= SAVED_POSITION_THRESHOLD_SECONDS
  const duration = session.reactionDurationSeconds ?? 0
  return {
    hasSavedPosition,
    percent: hasSavedPosition && duration > 0
      ? Math.min(100, Math.max(0, (session.lastReactionTimeSeconds / duration) * 100))
      : null
  }
}
