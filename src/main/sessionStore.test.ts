import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SessionStore } from './sessionStore'

describe('SessionStore media drafts', () => {
  it('creates a movie draft and fills it with a reaction path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const store = new SessionStore(join(dir, 'library.json'), join(dir, 'session.json'))

      const movieLibrary = store.setSessionMedia('movie', 'C:\\Movies\\Film.mp4')
      expect(movieLibrary.sessions).toHaveLength(1)
      expect(movieLibrary.sessions[0]).toMatchObject({
        moviePath: 'C:\\Movies\\Film.mp4',
        reactionPath: null,
        title: 'Film.mp4'
      })

      const reactionLibrary = store.setSessionMedia('reaction', 'C:\\Reactions\\Film reaction.mp4')
      expect(reactionLibrary.sessions).toHaveLength(1)
      expect(reactionLibrary.sessions[0]).toMatchObject({
        moviePath: 'C:\\Movies\\Film.mp4',
        reactionPath: 'C:\\Reactions\\Film reaction.mp4'
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('starts a new draft instead of overwriting a complete session', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const store = new SessionStore(join(dir, 'library.json'), join(dir, 'session.json'))

      store.setSessionMedia('movie', 'C:\\Movies\\First.mp4')
      store.setSessionMedia('reaction', 'C:\\Reactions\\First.mp4')
      const next = store.setSessionMedia('movie', 'C:\\Movies\\Second.mp4')

      expect(next.sessions).toHaveLength(2)
      expect(next.sessions[1]).toMatchObject({
        moviePath: 'C:\\Movies\\Second.mp4',
        reactionPath: null
      })
      expect(next.activeSessionId).toBe(next.sessions[1].id)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
