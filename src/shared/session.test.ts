import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OVERLAY,
  createDefaultSession,
  createSessionFromPaths,
  findMatchingSession,
  mergeSession,
  normalizeAudioTrackPreference,
  normalizeLibrary,
  normalizeSession
} from './session'

describe('session helpers', () => {
  it('normalizes missing values to safe defaults', () => {
    const session = normalizeSession({ volume: 4, overlay: { width: 10, height: 10 } })

    expect(session.reactionVolume).toBe(1)
    expect(session.movieVolume).toBe(1)
    expect(session.overlay.width).toBe(320)
    expect(session.overlay.height).toBe(180)
    expect(session.reactionPath).toBeNull()
    expect(session.moviePosterPath).toBeNull()
    expect(session.movieAudioTrackPreference).toBeNull()
    expect(session.titleOrigin).toBe('generated')
    expect(session.reactorName).toBeNull()
    expect(session.reactorNameOrigin).toBe('metadata')
    expect(session.playbackRate).toBe(1)
    expect(session.reactorSource).toBe('ntsc')
    expect(session.detectedMovieFps).toBeNull()
    expect(session.movieRateCorrection).toBe(1)
    expect(session.timingOrigin).toBe('manual')
    expect(session.syncReadiness).toBe('needs-sync')
    expect(session.autoSyncConfidence).toBeNull()
    expect(session.autoSyncAnalyzedAt).toBeNull()
    expect(session.autoSyncAlgorithmVersion).toBeNull()
    expect(session.isMoviePoppedOut).toBe(false)
    expect(session.movieWindowGeometry).toMatchObject({
      width: 320,
      height: 180
    })
  })

  it('starts new complete pairings as needing sync', () => {
    const session = createSessionFromPaths('reaction.mp4', 'movie.mp4')

    expect(session.syncReadiness).toBe('needs-sync')
  })

  it('merges overlay patches without dropping existing geometry', () => {
    const session = createDefaultSession()
    const merged = mergeSession(session, { overlay: { x: 88 } as typeof DEFAULT_OVERLAY })

    expect(merged.overlay).toMatchObject({
      x: 88,
      y: DEFAULT_OVERLAY.y,
      width: DEFAULT_OVERLAY.width,
      height: DEFAULT_OVERLAY.height
    })
  })

  it('merges movie window geometry patches without dropping existing geometry', () => {
    const session = createDefaultSession()
    const merged = mergeSession(session, { movieWindowGeometry: { x: 144 } as typeof DEFAULT_OVERLAY })

    expect(merged.movieWindowGeometry).toMatchObject({
      x: 144,
      y: DEFAULT_OVERLAY.y,
      width: DEFAULT_OVERLAY.width,
      height: DEFAULT_OVERLAY.height
    })
  })

  it('treats generic title patches as custom unless generation is explicit', () => {
    const session = createSessionFromPaths('reaction.mp4', 'movie.mp4')

    expect(mergeSession(session, { title: 'My own title' }).titleOrigin).toBe('custom')
    expect(mergeSession(session, {
      title: 'Movie — Reactor',
      titleOrigin: 'generated'
    }).titleOrigin).toBe('generated')
    expect(mergeSession(session, { titleOrigin: 'custom' }).titleOrigin).toBe('generated')
  })

  it('normalizes reactor names and preserves their provenance', () => {
    const metadataNamed = createSessionFromPaths(
      'reaction.mp4',
      'movie.mp4',
      new Date('2026-07-14T00:00:00.000Z'),
      'youtube',
      'Movie — Cinema Therapy',
      '  Cinema\nTherapy\u0000  '
    )

    expect(metadataNamed).toMatchObject({
      reactorName: 'Cinema Therapy',
      reactorNameOrigin: 'metadata'
    })
    expect(mergeSession(metadataNamed, { title: 'My title' })).toMatchObject({
      reactorName: 'Cinema Therapy',
      reactorNameOrigin: 'metadata'
    })
    expect(mergeSession(metadataNamed, { reactorName: '  My favorite creator  ' })).toMatchObject({
      reactorName: 'My favorite creator',
      reactorNameOrigin: 'custom'
    })
  })

  it('migrates a local pairing into the one unambiguous matching downloaded reactor profile', () => {
    const local = createDefaultSession(undefined, {
      id: 'shanelle-local',
      reactorName: "  Watch Along's with Shanelle  ",
      reactorNameOrigin: 'custom',
      reactionPath: 'C:\\Reactions\\Across the Universe local.mp4',
      moviePath: 'C:\\Movies\\Across the Universe.mp4'
    })
    const youtube = createDefaultSession(undefined, {
      id: 'shanelle-youtube',
      reactorName: "Watch Along's with Shanelle",
      reactorNameOrigin: 'metadata',
      reactionSource: 'youtube',
      reactionPath: "C:\\Reactions\\youtube\\job-1\\UC76BA - Watch Along's with Shanelle\\South Park.mp4",
      moviePath: 'C:\\Movies\\South Park.mp4'
    })

    const migrated = normalizeLibrary({ version: 6, activeSessionId: local.id, sessions: [local, youtube] })

    expect(migrated.reactors).toHaveLength(1)
    expect(migrated.reactors[0]).toMatchObject({ name: "Watch Along's with Shanelle" })
    expect(migrated.reactors[0].externalIdentityKeys).toEqual(expect.arrayContaining([
      "named:watch along's with shanelle",
      'youtube:uc76ba'
    ]))
    expect(new Set(migrated.sessions.map((session) => session.reactorId))).toEqual(
      new Set([migrated.reactors[0].id])
    )
  })

  it('keeps same-name channels separate when their stable provider ids conflict', () => {
    const reassignedAmes = createDefaultSession(undefined, {
      id: 'ames-as-hda',
      reactorName: 'Hold Down A',
      reactorNameOrigin: 'custom',
      reactionSource: 'youtube',
      reactionPath: 'C:\\Reactions\\youtube\\job-ames\\UC-AMES - Ames Video Store\\Robin Hood.mp4'
    })
    const realHoldDownA = createDefaultSession(undefined, {
      id: 'real-hda',
      reactorName: 'Hold Down A',
      reactorNameOrigin: 'metadata',
      reactionSource: 'youtube',
      reactionPath: 'C:\\Reactions\\youtube\\job-hda\\UC-HDA - Hold Down A\\Holy Grail.mp4'
    })

    const migrated = normalizeLibrary({
      version: 6,
      activeSessionId: reassignedAmes.id,
      sessions: [reassignedAmes, realHoldDownA]
    })

    expect(migrated.reactors.map((profile) => profile.name)).toEqual(['Hold Down A', 'Hold Down A'])
    expect(new Set(migrated.sessions.map((session) => session.reactorId)).size).toBe(2)
  })

  it('migrates legacy single-session data into a library', () => {
    const library = normalizeLibrary({
      reactionPath: 'C:\\Videos\\reaction.mp4',
      moviePath: 'C:\\Videos\\movie.mp4',
      volume: 0.4,
      offsetSeconds: 12.5,
      lastReactionTimeSeconds: 90
    })

    expect(library.version).toBe(8)
    expect(library.sessions).toHaveLength(1)
    expect(library.activeSessionId).toBe(library.sessions[0].id)
    expect(library.sessions[0]).toMatchObject({
      title: 'movie.mp4',
      reactionVolume: 0.4,
      movieVolume: 0.4,
      offsetSeconds: 12.5,
      lastReactionTimeSeconds: 90,
      moviePosterPath: null,
      movieAudioTrackPreference: null,
      reactorName: null,
      reactorNameOrigin: 'metadata',
      timingOrigin: 'manual',
      syncReadiness: 'ready',
      autoSyncConfidence: null,
      autoSyncAnalyzedAt: null,
      autoSyncAlgorithmVersion: null
    })
  })

  it('migrates version 4 sessions without poster data and preserves a saved poster path', () => {
    const migrated = normalizeLibrary({
      version: 4,
      activeSessionId: 'legacy-session',
      sessions: [{
        id: 'legacy-session',
        reactionPath: 'C:\\Reactions\\Legacy.mp4',
        moviePath: 'C:\\Movies\\Legacy.mp4'
      }]
    })
    const withPoster = normalizeSession({
      id: 'poster-session',
      reactionPath: 'C:\\Reactions\\Poster.mp4',
      moviePath: 'C:\\Movies\\Poster.mp4',
      moviePosterPath: 'C:\\Movies\\poster.jpg'
    })

    expect(migrated).toMatchObject({
      version: 8,
      activeSessionId: 'legacy-session',
      sessions: [{ moviePosterPath: null, movieAudioTrackPreference: null }]
    })
    expect(withPoster.moviePosterPath).toBe('C:\\Movies\\poster.jpg')
  })

  it('migrates version 5 sessions with no audio preference and round-trips a semantic preference', () => {
    const migrated = normalizeLibrary({
      version: 5,
      activeSessionId: 'legacy-session',
      sessions: [{
        id: 'legacy-session',
        reactionPath: 'C:\\Reactions\\Legacy.mp4',
        moviePath: 'C:\\Movies\\Legacy.mkv'
      }]
    })
    const preference = {
      label: 'Indonesian (5.1) (Original Score)',
      language: 'ind',
      ordinal: 1
    }
    const session = createDefaultSession(new Date('2026-07-15T00:00:00.000Z'), {
      reactionPath: 'C:\\Reactions\\The Raid.mp4',
      moviePath: 'C:\\Movies\\The Raid.mkv',
      movieAudioTrackPreference: preference
    })
    const roundTripped = normalizeLibrary(JSON.parse(JSON.stringify({
      version: 8,
      activeSessionId: session.id,
      sessions: [session]
    })))

    expect(migrated).toMatchObject({
      version: 8,
      sessions: [{ movieAudioTrackPreference: null }]
    })
    expect(roundTripped.sessions[0].movieAudioTrackPreference).toEqual(preference)
  })

  it('migrates v7 complete pairings as ready and incomplete drafts as needing sync', () => {
    const migrated = normalizeLibrary({
      version: 7,
      activeSessionId: 'complete',
      sessions: [
        { id: 'complete', reactionPath: 'reaction.mp4', moviePath: 'movie.mp4' },
        { id: 'draft', reactionPath: 'reaction-only.mp4', moviePath: null }
      ]
    })

    expect(migrated.version).toBe(8)
    expect(migrated.sessions.find((session) => session.id === 'complete')?.syncReadiness).toBe('ready')
    expect(migrated.sessions.find((session) => session.id === 'draft')?.syncReadiness).toBe('needs-sync')
  })

  it('does not treat malformed persisted readiness as legacy-ready', () => {
    const session = normalizeSession({
      reactionPath: 'reaction.mp4',
      moviePath: 'movie.mp4',
      syncReadiness: 'definitely-ready'
    })

    expect(session.syncReadiness).toBe('needs-sync')
  })

  it('rejects malformed audio preferences atomically', () => {
    const invalidPreferences = [
      undefined,
      'indonesian',
      [],
      {},
      { label: 7, language: 'ind', ordinal: 1 },
      { label: 'Indonesian', language: null, ordinal: 1 },
      { label: 'Indonesian', language: 'ind', ordinal: -1 },
      { label: 'Indonesian', language: 'ind', ordinal: 1.5 },
      { label: 'Indonesian', language: 'ind', ordinal: Number.POSITIVE_INFINITY }
    ]

    expect(invalidPreferences.map(normalizeAudioTrackPreference)).toEqual(
      invalidPreferences.map(() => null)
    )
  })

  it('accepts metadata-free tracks and strips Chromium-generated ids and unknown fields', () => {
    const normalized = normalizeSession({
      movieAudioTrackPreference: {
        id: '7',
        label: '',
        language: '',
        ordinal: 5,
        enabled: true
      }
    })

    expect(normalized.movieAudioTrackPreference).toEqual({
      label: '',
      language: '',
      ordinal: 5
    })
    expect(normalized.movieAudioTrackPreference).not.toHaveProperty('id')
    expect(normalized.movieAudioTrackPreference).not.toHaveProperty('enabled')
  })

  it('deduplicates and finds sessions by media pair', () => {
    const first = createDefaultSession(new Date('2026-01-01T00:00:00.000Z'), {
      reactionPath: 'C:\\Reactions\\A.mp4',
      moviePath: 'C:\\Movies\\B.mp4'
    })
    const duplicate = createDefaultSession(new Date('2026-01-02T00:00:00.000Z'), {
      reactionPath: 'c:\\reactions\\a.mp4',
      moviePath: 'c:\\movies\\b.mp4'
    })
    const library = normalizeLibrary({ sessions: [first, duplicate], activeSessionId: duplicate.id })

    expect(library.sessions).toHaveLength(1)
    expect(findMatchingSession(library, 'C:\\REACTIONS\\A.mp4', 'C:\\MOVIES\\B.mp4')?.id).toBe(first.id)
  })

  it('keeps case-distinct and delimiter-containing POSIX media pairs separate', () => {
    const upper = createDefaultSession(new Date('2026-01-01T00:00:00.000Z'), {
      reactionPath: '/media/Reactions/A|B.mp4',
      moviePath: '/media/Movies/C.mp4'
    })
    const lower = createDefaultSession(new Date('2026-01-02T00:00:00.000Z'), {
      reactionPath: '/media/reactions/a.mp4',
      moviePath: '/media/movies/B|C.mp4'
    })
    const caseVariant = createDefaultSession(new Date('2026-01-03T00:00:00.000Z'), {
      reactionPath: '/media/Reactions/a|b.mp4',
      moviePath: '/media/Movies/C.mp4'
    })

    const library = normalizeLibrary({ sessions: [upper, lower, caseVariant] })

    expect(library.sessions.map((session) => session.id)).toEqual([
      upper.id,
      lower.id,
      caseVariant.id
    ])
  })

  it('sanitizes a suggested title and falls back to the movie filename when it is blank', () => {
    const named = createSessionFromPaths(
      'C:\\Reactions\\Reaction.mp4',
      'C:\\Movies\\Movie.mp4',
      new Date('2026-07-13T00:00:00.000Z'),
      'youtube',
      '  Movie\nTitle\u0000 —\t Reactor\u0085Name  '
    )
    const fallback = createSessionFromPaths(
      'C:\\Reactions\\Reaction.mp4',
      'C:\\Movies\\Movie.mp4',
      new Date('2026-07-13T00:00:00.000Z'),
      'patreon',
      '\n\u0000\t\u0085'
    )

    expect(named.title).toBe('Movie Title — Reactor Name')
    expect(named.titleOrigin).toBe('generated')
    expect(fallback.title).toBe('Movie.mp4')
    expect(fallback.titleOrigin).toBe('generated')
  })

  it('migrates titles without provenance conservatively as custom', () => {
    const legacyNamed = normalizeSession({
      title: 'Movie — My Favorite Reactor',
      moviePath: 'C:\\Movies\\Movie.mp4',
      reactionPath: 'C:\\Reactions\\Reaction.mp4'
    })
    const legacyDefault = normalizeSession({
      title: 'Movie.mp4',
      moviePath: 'C:\\Movies\\Movie.mp4'
    })

    expect(legacyNamed.titleOrigin).toBe('custom')
    expect(legacyDefault.titleOrigin).toBe('custom')
  })

  it('migrates a stored reactor name without provenance conservatively as custom', () => {
    const migrated = normalizeSession({
      reactorName: '  Movie Night  ',
      moviePath: 'C:\\Movies\\Movie.mp4',
      reactionPath: 'C:\\Reactions\\Reaction.mp4'
    })

    expect(migrated.reactorName).toBe('Movie Night')
    expect(migrated.reactorNameOrigin).toBe('custom')
  })
})
