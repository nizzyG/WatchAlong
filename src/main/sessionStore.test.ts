import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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

  it('inherits exact-movie art for a new draft, preserves it across a same-name relocation, and clears it for another movie', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const store = new SessionStore(join(dir, 'library.json'), join(dir, 'session.json'))
      const original = store.createOrSwitchSession(
        'C:\\Reactions\\Film.mp4',
        'C:\\Movies\\Film\\Film.mkv'
      )
      store.setMoviePosterPath(original.activeSessionId!, 'C:\\Art\\Film.jpg')

      const inherited = store.setSessionMedia('movie', 'c:\\movies\\film\\film.mkv')
      const draftId = inherited.activeSessionId!
      expect(inherited.sessions.find((session) => session.id === draftId)).toMatchObject({
        moviePath: 'c:\\movies\\film\\film.mkv',
        reactionPath: null,
        moviePosterPath: 'C:\\Art\\Film.jpg'
      })

      const relocated = store.setSessionMedia('movie', 'D:\\Archive\\FILM.MKV')
      expect(relocated.sessions.find((session) => session.id === draftId)?.moviePosterPath)
        .toBe('C:\\Art\\Film.jpg')

      const changedMovie = store.setSessionMedia('movie', 'D:\\Archive\\Heat.mkv')
      expect(changedMovie.sessions.find((session) => session.id === draftId)?.moviePosterPath).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('replaces media on an existing complete session without creating a draft', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const store = new SessionStore(join(dir, 'library.json'), join(dir, 'session.json'))

      const library = store.createOrSwitchSession('C:\\Reactions\\First.mp4', 'C:\\Movies\\First.mp4')
      const sessionId = library.activeSessionId!
      const result = store.replaceSessionMedia(sessionId, 'reaction', 'C:\\Reactions\\Second.mp4', 'youtube')
      expect(result.status).toBe('replaced')
      const next = result.library

      expect(next.sessions).toHaveLength(1)
      expect(next.activeSessionId).toBe(sessionId)
      expect(next.sessions[0]).toMatchObject({
        id: sessionId,
        moviePath: 'C:\\Movies\\First.mp4',
        reactionPath: 'C:\\Reactions\\Second.mp4',
        reactionSource: 'youtube'
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps art for a same-name movie relocation, adopts destination art, and clears stale art for another movie', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const store = new SessionStore(join(dir, 'library.json'), join(dir, 'session.json'))
      const source = store.createOrSwitchSession(
        'C:\\Reactions\\Tombstone.mp4',
        'C:\\Missing\\Tombstone.mkv'
      )
      const sourceId = source.activeSessionId!
      store.setMoviePosterPath(sourceId, 'C:\\Art\\Tombstone.jpg')

      const relocated = store.replaceSessionMedia(
        sourceId,
        'movie',
        'D:\\Restored\\TOMBSTONE.MKV'
      ).library
      expect(relocated.sessions.find((session) => session.id === sourceId)?.moviePosterPath)
        .toBe('C:\\Art\\Tombstone.jpg')

      const destination = store.createOrSwitchSession(
        'C:\\Reactions\\Heat.mp4',
        'D:\\Movies\\Heat.mkv'
      )
      const destinationId = destination.activeSessionId!
      store.setMoviePosterPath(destinationId, 'D:\\Art\\Heat.png')

      const adopted = store.replaceSessionMedia(sourceId, 'movie', 'd:\\movies\\heat.mkv').library
      expect(adopted.sessions.find((session) => session.id === sourceId)?.moviePosterPath)
        .toBe('D:\\Art\\Heat.png')
      expect(adopted.sessions.find((session) => session.id === destinationId)?.moviePosterPath)
        .toBe('D:\\Art\\Heat.png')

      const changedMovie = store.replaceSessionMedia(
        sourceId,
        'movie',
        'D:\\Movies\\Collateral.mkv'
      ).library
      expect(changedMovie.sessions.find((session) => session.id === sourceId)?.moviePosterPath).toBeNull()
      expect(changedMovie.sessions.find((session) => session.id === destinationId)?.moviePosterPath)
        .toBe('D:\\Art\\Heat.png')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('switches to an existing pairing when a replacement would create a duplicate', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const store = new SessionStore(join(dir, 'library.json'), join(dir, 'session.json'))
      const first = store.createOrSwitchSession('C:\\Reactions\\First.mp4', 'C:\\Movies\\Film.mp4')
      const firstId = first.activeSessionId!
      const second = store.createOrSwitchSession('C:\\Reactions\\Second.mp4', 'C:\\Movies\\Film.mp4')
      const secondId = second.activeSessionId!
      store.renameSession(secondId, 'My saved second pairing')
      store.saveSessionPosition(secondId, 412.5)

      const result = store.replaceSessionMedia(
        firstId,
        'reaction',
        'c:\\reactions\\second.mp4',
        'youtube'
      )

      expect(result).toMatchObject({ status: 'conflict', existingSessionId: secondId })
      expect(result.library.sessions).toHaveLength(2)
      expect(result.library.activeSessionId).toBe(secondId)
      expect(result.library.sessions.find((session) => session.id === secondId)).toMatchObject({
        title: 'My saved second pairing',
        lastReactionTimeSeconds: 412.5
      })
      expect(result.library.sessions.find((session) => session.id === firstId)).toMatchObject({
        reactionPath: 'C:\\Reactions\\First.mp4'
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('applies a suggested title only when creating a genuinely new media pairing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const store = new SessionStore(join(dir, 'library.json'), join(dir, 'session.json'))
      const first = store.createOrSwitchSession(
        'C:\\Reactions\\First.mp4',
        'C:\\Movies\\First.mp4',
        'youtube',
        'First Movie — Reactor One'
      )
      const sessionId = first.activeSessionId!
      store.renameSession(sessionId, 'My custom title')

      const switched = store.createOrSwitchSession(
        'c:\\reactions\\first.mp4',
        'c:\\movies\\first.mp4',
        'patreon',
        'First Movie — Reactor Two'
      )
      const second = store.createOrSwitchSession(
        'C:\\Reactions\\Second.mp4',
        'C:\\Movies\\Second.mp4',
        'patreon',
        '  Second Movie\n—\tReactor Two  '
      )

      expect(switched.sessions).toHaveLength(1)
      expect(switched.activeSessionId).toBe(sessionId)
      expect(switched.sessions[0]).toMatchObject({
        title: 'My custom title',
        reactionSource: 'youtube'
      })
      expect(second.sessions).toHaveLength(2)
      expect(second.sessions[1].title).toBe('Second Movie — Reactor Two')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('atomically names completed drafts without replacing a title the user chose', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const store = new SessionStore(join(dir, 'library.json'), join(dir, 'session.json'))

      store.setSessionMedia('movie', 'C:\\Movies\\Aladdin.mp4')
      const named = store.setSessionMedia(
        'reaction',
        'C:\\Reactions\\Aladdin reaction.mp4',
        'youtube',
        'Aladdin — Addie Counts'
      )
      expect(named.sessions[0].title).toBe('Aladdin — Addie Counts')
      expect(named.sessions[0].titleOrigin).toBe('generated')

      const swapped = store.replaceSessionMedia(
        named.activeSessionId!,
        'reaction',
        'C:\\Reactions\\Aladdin replacement.mp4',
        'youtube',
        'Aladdin — New Reactor'
      )
      expect(swapped.library.sessions[0].title).toBe('Aladdin — New Reactor')

      store.renameSession(named.activeSessionId!, 'Aladdin — My Preferred Label')
      const customPrefixPreserved = store.replaceSessionMedia(
        named.activeSessionId!,
        'reaction',
        'C:\\Reactions\\Aladdin third.mp4',
        'youtube',
        'Aladdin — Third Reactor'
      )
      expect(customPrefixPreserved.library.sessions[0]).toMatchObject({
        title: 'Aladdin — My Preferred Label',
        titleOrigin: 'custom'
      })

      const secondDraft = store.setSessionMedia('movie', 'C:\\Movies\\X-Men.mp4')
      const secondId = secondDraft.activeSessionId!
      store.renameSession(secondId, 'My X-Men setup')
      const preserved = store.setSessionMedia(
        'reaction',
        'C:\\Reactions\\X-Men reaction.mp4',
        'youtube',
        'X-Men — Another Reactor'
      )
      expect(preserved.sessions.find((session) => session.id === secondId)?.title).toBe('My X-Men setup')

      const thirdDraft = store.setSessionMedia('movie', 'C:\\Movies\\Anchorman.mp4')
      const thirdId = thirdDraft.activeSessionId!
      const replaced = store.replaceSessionMedia(
        thirdId,
        'reaction',
        'C:\\Reactions\\Anchorman reaction.mp4',
        'patreon',
        'Anchorman — Mary Cherry'
      )
      expect(replaced.library.sessions.find((session) => session.id === thirdId)?.title).toBe('Anchorman — Mary Cherry')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stores downloaded reactor metadata and preserves a user-edited name across media and title changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const store = new SessionStore(join(dir, 'library.json'), join(dir, 'session.json'))
      const created = store.createOrSwitchSession(
        'C:\\Reactions\\First.mp4',
        'C:\\Movies\\Movie.mp4',
        'youtube',
        'Movie — Downloaded Name',
        'Downloaded Name'
      )
      const sessionId = created.activeSessionId!

      expect(created.sessions[0]).toMatchObject({
        reactorName: 'Downloaded Name',
        reactorNameOrigin: 'metadata'
      })

      const titleOnlyWithPrefilledReactor = store.renameSession(
        sessionId,
        'My custom watchalong title',
        'Downloaded Name'
      )
      expect(titleOnlyWithPrefilledReactor.sessions[0]).toMatchObject({
        title: 'My custom watchalong title',
        reactorName: 'Downloaded Name',
        reactorNameOrigin: 'metadata'
      })

      const repaired = store.replaceSessionMedia(
        sessionId,
        'reaction',
        'D:\\Moved reactions\\First.mp4',
        'youtube',
        undefined,
        titleOnlyWithPrefilledReactor.sessions[0].reactorName ?? undefined
      ).library
      expect(repaired.sessions[0]).toMatchObject({
        reactorName: 'Downloaded Name',
        reactorNameOrigin: 'metadata'
      })

      const metadataUpdated = store.replaceSessionMedia(
        sessionId,
        'reaction',
        'C:\\Reactions\\Second.mp4',
        'youtube',
        'Movie — New Download',
        'New Download'
      ).library
      expect(metadataUpdated.sessions[0]).toMatchObject({
        reactorName: 'New Download',
        reactorNameOrigin: 'metadata'
      })

      const renamed = store.renameSession(sessionId, metadataUpdated.sessions[0].title, '  My Reactor  ')
      expect(renamed.sessions[0]).toMatchObject({
        titleOrigin: 'custom',
        reactorName: 'My Reactor',
        reactorNameOrigin: 'custom'
      })

      const preserved = store.replaceSessionMedia(
        sessionId,
        'reaction',
        'C:\\Reactions\\Third.mp4',
        'patreon',
        'Movie — Someone Else',
        'Someone Else'
      ).library
      expect(preserved.sessions[0]).toMatchObject({
        reactorName: 'My Reactor',
        reactorNameOrigin: 'custom'
      })

      const titleOnlyRename = store.renameSession(sessionId, 'My custom watchalong')
      expect(titleOnlyRename.sessions[0]).toMatchObject({
        title: 'My custom watchalong',
        reactorName: 'My Reactor',
        reactorNameOrigin: 'custom'
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resets automatic timing metadata when media is replaced', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const store = new SessionStore(join(dir, 'library.json'), join(dir, 'session.json'))
      const library = store.createOrSwitchSession('reaction.mp4', 'movie.mp4')
      const sessionId = library.activeSessionId!
      store.updateActive({
        timingOrigin: 'automatic',
        autoSyncConfidence: 0.94,
        autoSyncAnalyzedAt: '2026-07-12T00:00:00.000Z',
        autoSyncAlgorithmVersion: 1
      })

      const next = store.replaceSessionMedia(sessionId, 'movie', 'replacement.mp4').library

      expect(next.sessions[0]).toMatchObject({
        timingOrigin: 'manual',
        autoSyncConfidence: null,
        autoSyncAnalyzedAt: null,
        autoSyncAlgorithmVersion: null
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resets automatic metadata for manual timing changes but permits an atomic automatic result', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const store = new SessionStore(join(dir, 'library.json'), join(dir, 'session.json'))
      store.createOrSwitchSession('reaction.mp4', 'movie.mp4')
      const automatic = store.updateActive({
        offsetSeconds: 12.5,
        movieRateCorrection: 1.001,
        timingOrigin: 'automatic',
        autoSyncConfidence: 0.94,
        autoSyncAnalyzedAt: '2026-07-12T00:00:00.000Z',
        autoSyncAlgorithmVersion: 1
      })
      expect(automatic.sessions[0].timingOrigin).toBe('automatic')

      const manual = store.updateActive({ offsetSeconds: 13 })
      expect(manual.sessions[0]).toMatchObject({
        timingOrigin: 'manual',
        autoSyncConfidence: null,
        autoSyncAnalyzedAt: null,
        autoSyncAlgorithmVersion: null
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('updates one session resume position without changing the active session', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const store = new SessionStore(join(dir, 'library.json'), join(dir, 'session.json'))

      const first = store.createOrSwitchSession('C:\\Reactions\\First.mp4', 'C:\\Movies\\First.mp4')
      const firstId = first.activeSessionId!
      const second = store.createOrSwitchSession('C:\\Reactions\\Second.mp4', 'C:\\Movies\\Second.mp4')
      const secondId = second.activeSessionId!

      const next = store.saveSessionPosition(firstId, 83.25)

      expect(next.activeSessionId).toBe(secondId)
      expect(next.sessions.find((session) => session.id === firstId)?.lastReactionTimeSeconds).toBe(83.25)
      expect(next.sessions.find((session) => session.id === secondId)?.lastReactionTimeSeconds).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('applies and clears a manual poster across every pairing for the same movie', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const store = new SessionStore(join(dir, 'library.json'), join(dir, 'session.json'))
      const first = store.createOrSwitchSession(
        'C:\\Reactions\\First.mp4',
        'C:\\Movies\\Film.mp4'
      )
      const firstId = first.activeSessionId!
      const second = store.createOrSwitchSession(
        'C:\\Reactions\\Second.mp4',
        'c:\\movies\\film.mp4'
      )
      const secondId = second.activeSessionId!
      const other = store.createOrSwitchSession(
        'C:\\Reactions\\Other.mp4',
        'C:\\Movies\\Other.mp4'
      )
      const otherId = other.activeSessionId!

      const selected = store.setMoviePosterPath(firstId, 'C:\\Artwork\\Film poster.jpg')

      expect(selected.sessions.find((session) => session.id === firstId)?.moviePosterPath)
        .toBe('C:\\Artwork\\Film poster.jpg')
      expect(selected.sessions.find((session) => session.id === secondId)?.moviePosterPath)
        .toBe('C:\\Artwork\\Film poster.jpg')
      expect(selected.sessions.find((session) => session.id === otherId)?.moviePosterPath).toBeNull()

      const cleared = store.setMoviePosterPath(secondId, null)
      expect(cleared.sessions.find((session) => session.id === firstId)?.moviePosterPath).toBeNull()
      expect(cleared.sessions.find((session) => session.id === secondId)?.moviePosterPath).toBeNull()
      expect(cleared.sessions.find((session) => session.id === otherId)?.moviePosterPath).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('inherits a manual poster when createOrSwitchSession creates a future complete pairing for that movie', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const store = new SessionStore(join(dir, 'library.json'), join(dir, 'session.json'))
      const original = store.createOrSwitchSession(
        'C:\\Reactions\\First.mp4',
        'C:\\Movies\\Film.mp4'
      )
      store.setMoviePosterPath(original.activeSessionId!, 'C:\\Artwork\\Film poster.jpg')

      const futurePairing = store.createOrSwitchSession(
        'C:\\Reactions\\Later.mp4',
        'c:\\movies\\film.mp4'
      )

      expect(futurePairing.sessions.find((session) => session.id === futurePairing.activeSessionId))
        .toMatchObject({
          reactionPath: 'C:\\Reactions\\Later.mp4',
          moviePath: 'c:\\movies\\film.mp4',
          moviePosterPath: 'C:\\Artwork\\Film poster.jpg'
        })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('normalizes a version 4 library to version 5 and persists poster data on the next update', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const libraryPath = join(dir, 'library.json')
      writeFileSync(libraryPath, JSON.stringify({
        version: 4,
        activeSessionId: 'legacy-session',
        sessions: [{
          id: 'legacy-session',
          reactionPath: 'C:\\Reactions\\Legacy.mp4',
          moviePath: 'C:\\Movies\\Legacy.mp4'
        }]
      }), 'utf8')
      const store = new SessionStore(libraryPath, join(dir, 'session.json'))

      const migrated = store.read()
      expect(migrated).toMatchObject({
        version: 5,
        activeSessionId: 'legacy-session',
        sessions: [{ id: 'legacy-session', moviePosterPath: null }]
      })

      store.setMoviePosterPath('legacy-session', 'C:\\Movies\\poster.png')
      expect(JSON.parse(readFileSync(libraryPath, 'utf8'))).toMatchObject({
        version: 5,
        sessions: [{ id: 'legacy-session', moviePosterPath: 'C:\\Movies\\poster.png' }]
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('restores the latest good backup and quarantines a corrupt library', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const libraryPath = join(dir, 'library.json')
      const store = new SessionStore(libraryPath, join(dir, 'session.json'))
      store.createOrSwitchSession('C:\\Reactions\\First.mp4', 'C:\\Movies\\First.mp4')
      store.createOrSwitchSession('C:\\Reactions\\Second.mp4', 'C:\\Movies\\Second.mp4')
      writeFileSync(libraryPath, '{"sessions": [', 'utf8')

      const recovered = store.read()

      expect(recovered.sessions).toHaveLength(2)
      expect(JSON.parse(readFileSync(libraryPath, 'utf8'))).toMatchObject({ version: 5 })
      const quarantine = readdirSync(dir).find((name) => name.startsWith('library.json.corrupt-'))
      expect(quarantine).toBeTruthy()
      expect(readFileSync(join(dir, quarantine!), 'utf8')).toBe('{"sessions": [')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.each([
    '{}',
    'null',
    '{"sessions":"bad"}',
    '{"sessions":["bad"]}',
    '{"sessions":[{"id":"bad-poster","reactionPath":"reaction.mp4","moviePath":"movie.mp4","moviePosterPath":42}]}',
    '{"reactionPath":123,"moviePath":456}'
  ])(
    'recovers from parseable JSON with an invalid library shape: %s',
    (invalidJson) => {
      const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
      try {
        const libraryPath = join(dir, 'library.json')
        const store = new SessionStore(libraryPath, join(dir, 'session.json'))
        store.createOrSwitchSession('C:\\Reactions\\First.mp4', 'C:\\Movies\\First.mp4')
        store.createOrSwitchSession('C:\\Reactions\\Second.mp4', 'C:\\Movies\\Second.mp4')
        writeFileSync(libraryPath, invalidJson, 'utf8')

        const recovered = store.read()

        expect(recovered.sessions).toHaveLength(2)
        const quarantine = readdirSync(dir).find((name) => name.startsWith('library.json.corrupt-'))
        expect(quarantine).toBeTruthy()
        expect(readFileSync(join(dir, quarantine!), 'utf8')).toBe(invalidJson)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  )

  it.each(['not json', '{}', '{"reactionPath":123,"moviePath":null}'])(
    'preserves a malformed legacy session and exposes the normal recovery flow: %s',
    (invalidJson) => {
      const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
      try {
        const libraryPath = join(dir, 'library.json')
        const legacyPath = join(dir, 'session.json')
        writeFileSync(legacyPath, invalidJson, 'utf8')
        const store = new SessionStore(libraryPath, legacyPath)

        expect(() => store.read()).toThrow(/recovery file/)
        const quarantine = readdirSync(dir).find((name) => name.startsWith('session.json.corrupt-'))
        expect(quarantine).toBeTruthy()
        expect(readFileSync(join(dir, quarantine!), 'utf8')).toBe(invalidJson)
        expect(store.getLatestRecoveryPath()).toBe(join(dir, quarantine!))

        expect(() => store.read()).toThrow(/recovery file/)
        expect(store.startFreshLibraryAfterRecovery().sessions).toEqual([])
        expect(readFileSync(join(dir, quarantine!), 'utf8')).toBe(invalidJson)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  )

  it('never accepts a parseable but invalid backup as an empty library', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const libraryPath = join(dir, 'library.json')
      writeFileSync(libraryPath, '{}', 'utf8')
      const invalidBackup = '{"sessions":"bad"}'
      writeFileSync(`${libraryPath}.bak`, invalidBackup, 'utf8')
      const store = new SessionStore(libraryPath, join(dir, 'session.json'))

      expect(() => store.read()).toThrow(/recovery file/)
      expect(readdirSync(dir).some((name) => name.startsWith('library.json.corrupt-'))).toBe(true)
      const preservedBackup = readdirSync(dir).find((name) => name.startsWith('library.json.bak.corrupt-'))
      expect(preservedBackup).toBeTruthy()
      expect(readFileSync(join(dir, preservedBackup!), 'utf8')).toBe(invalidBackup)

      store.startFreshLibraryAfterRecovery()
      expect(readFileSync(join(dir, preservedBackup!), 'utf8')).toBe(invalidBackup)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('never restores a quarantined modern library from a stale valid legacy snapshot', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const libraryPath = join(dir, 'library.json')
      const legacyPath = join(dir, 'session.json')
      writeFileSync(libraryPath, 'damaged modern library', 'utf8')
      writeFileSync(legacyPath, JSON.stringify({ reactionPath: 'old.mp4', moviePath: 'old-movie.mp4' }), 'utf8')
      const store = new SessionStore(libraryPath, legacyPath)

      expect(() => store.read()).toThrow(/recovery file/)
      expect(readFileSync(legacyPath, 'utf8')).toContain('old-movie.mp4')
      expect(readdirSync(dir).some((name) => name.startsWith('library.json.corrupt-'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('selects the newest recovery artifact across modern, backup, and legacy files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const libraryPath = join(dir, 'library.json')
      const legacyPath = join(dir, 'session.json')
      writeFileSync(`${legacyPath}.corrupt-100`, 'old legacy', 'utf8')
      writeFileSync(`${libraryPath}.bak.corrupt-150`, 'newer backup', 'utf8')
      writeFileSync(`${libraryPath}.corrupt-200`, 'newest library', 'utf8')
      const store = new SessionStore(libraryPath, legacyPath)

      expect(store.getLatestRecoveryPath()).toBe(`${libraryPath}.corrupt-200`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('preserves a corrupt library even when no backup exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'watchalong-session-store-'))
    try {
      const libraryPath = join(dir, 'library.json')
      writeFileSync(libraryPath, 'not json', 'utf8')
      const store = new SessionStore(libraryPath, join(dir, 'session.json'))

      expect(() => store.read()).toThrow(/recovery file/)
      expect(existsSync(libraryPath)).toBe(false)
      const quarantine = readdirSync(dir).find((name) => name.startsWith('library.json.corrupt-'))
      expect(quarantine).toBeTruthy()
      expect(readFileSync(join(dir, quarantine!), 'utf8')).toBe('not json')

      expect(() => store.read()).toThrow(/recovery file/)
      expect(store.startFreshLibraryAfterRecovery().sessions).toEqual([])
      expect(store.read().sessions).toEqual([])
      expect(readFileSync(join(dir, quarantine!), 'utf8')).toBe('not json')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
