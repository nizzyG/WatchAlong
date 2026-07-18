import { describe, expect, it } from 'vitest'
import { createDefaultSession } from '@shared/session'
import { libraryPrimaryAction, libraryProgress } from './libraryPlayback'

describe('library playback presentation', () => {
  it('requires sync before offering playback even when an old position exists', () => {
    const session = createDefaultSession(new Date('2026-07-18T12:00:00Z'), {
      moviePath: 'C:\\Movies\\Alien.mkv',
      reactionPath: 'C:\\Reactions\\Alien.mp4',
      syncReadiness: 'needs-sync',
      lastReactionTimeSeconds: 125
    })

    expect(libraryPrimaryAction(session)).toEqual({ intent: 'sync', label: 'Find Sync' })
  })

  it('offers Play for a ready unwatched pairing and Continue for a saved position', () => {
    const ready = createDefaultSession(new Date('2026-07-18T12:00:00Z'), {
      moviePath: 'C:\\Movies\\Alien.mkv',
      reactionPath: 'C:\\Reactions\\Alien.mp4',
      syncReadiness: 'ready'
    })
    expect(libraryPrimaryAction(ready)).toEqual({ intent: 'play', label: 'Play Reaction' })

    expect(libraryPrimaryAction({ ...ready, lastReactionTimeSeconds: 65 }))
      .toEqual({ intent: 'play', label: 'Continue Reaction' })
  })

  it('keeps an in-progress state when duration is unknown and calculates a bounded percentage when known', () => {
    const session = createDefaultSession(new Date('2026-07-18T12:00:00Z'), {
      lastReactionTimeSeconds: 75,
      reactionDurationSeconds: null
    })
    expect(libraryProgress(session)).toEqual({ hasSavedPosition: true, percent: null })
    expect(libraryProgress({ ...session, reactionDurationSeconds: 300 })).toEqual({ hasSavedPosition: true, percent: 25 })
    expect(libraryProgress({ ...session, reactionDurationSeconds: 30 }).percent).toBe(100)
  })
})
