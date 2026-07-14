import { describe, expect, it } from 'vitest'
import { createDefaultSession } from '@shared/session'
import type { LibrarySession } from '@shared/types'
import {
  deriveMovieIdentity,
  deriveReactorIdentity,
  groupSessionsByMovie,
  groupSessionsByReactor,
  humanizeMediaName,
  sortPairings,
  splitPairingTitle
} from './libraryPresentation'

describe('library presentation', () => {
  it('groups Patreon downloads by stable creator vanity across job folders and path separators', () => {
    const sessions = [
      makeSession('one', {
        reactionPath: "C:\\Reactions\\patreon\\job-one\\vkunia - VKunia\\posts\\101 - Alien\\video\\alien.mp4"
      }),
      makeSession('two', {
        reactionPath: '/Reactions/patreon/job-two/vkunia - VKunia/posts/202 - Aliens/video/aliens.mp4'
      })
    ]

    const groups = groupSessionsByReactor(sessions)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ key: 'patreon:vkunia', label: 'VKunia', known: true })
    expect(groups[0].sessions.map((session) => session.id)).toEqual(['one', 'two'])
  })

  it('uses exact normalized movie paths instead of collapsing similar filenames', () => {
    const sessions = [
      makeSession('one', { moviePath: 'C:\\Movies\\Anchorman.mp4' }),
      makeSession('two', { moviePath: 'c:/movies/ANCHORMAN.mp4' }),
      makeSession('three', { moviePath: 'D:\\Archive\\Anchorman.mp4' })
    ]

    const groups = groupSessionsByMovie(sessions)
    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.sessions.length).sort()).toEqual([1, 2])
  })

  it('uses pairing delimiters for display without treating mutable titles as creator identity', () => {
    expect(splitPairingTitle('A Goofy Movie — Camilla\'s Corner')).toEqual({
      movie: 'A Goofy Movie',
      reactor: "Camilla's Corner"
    })
    expect(splitPairingTitle('Spider-Man - The Reactor Cut')).toBeNull()

    const strict = makeSession('strict', {
      title: 'Aladdin — Addie Counts',
      reactionPath: 'C:\\Reactions\\youtube\\job-one\\UC123 - Addie Counts\\video.mp4'
    })
    const ambiguous = makeSession('ambiguous', { title: 'Aladdin - Addie Counts', reactionPath: 'C:\\youtube\\video.mp4' })
    expect(deriveReactorIdentity(strict)).toMatchObject({ key: 'youtube:uc123', label: 'Addie Counts', known: true })
    expect(deriveReactorIdentity(ambiguous)).toMatchObject({ label: 'Reactor not identified', known: false })
  })

  it('keeps YouTube creator shelves stable across renames and separates duplicate channel names', () => {
    const first = makeSession('first', {
      title: 'My personal title',
      reactionPath: 'C:\\Reactions\\youtube\\job-one\\UC-ONE - Movie Night\\first.mp4'
    })
    const second = makeSession('second', {
      title: 'Renamed again',
      reactionPath: 'C:\\Reactions\\youtube\\job-two\\UC-ONE - Movie Night\\second.mp4'
    })
    const namesake = makeSession('namesake', {
      reactionPath: 'C:\\Reactions\\youtube\\job-three\\UC-TWO - Movie Night\\third.mp4'
    })

    const groups = groupSessionsByReactor([first, second, namesake])
    expect(groups).toHaveLength(2)
    expect(groups.find((group) => group.key === 'youtube:uc-one')?.sessions).toHaveLength(2)
    expect(groups.find((group) => group.key === 'youtube:uc-two')?.sessions).toHaveLength(1)
  })

  it('uses honest stable fallbacks and sorts unknown groups last', () => {
    const unknown = makeSession('unknown', { title: '', moviePath: null, reactionPath: null })
    const known = makeSession('known', { title: 'Alien — VKunia', moviePath: 'C:\\Movies\\Alien.mkv' })

    expect(deriveMovieIdentity(unknown)).toMatchObject({ key: 'unknown:movie', known: false })
    expect(groupSessionsByReactor([unknown, known]).at(-1)).toMatchObject({ key: 'unknown:reactor', known: false })
  })

  it('keeps pairing order deterministic when timestamps are invalid or tied', () => {
    const sessions = [
      makeSession('z', { title: 'Zulu', updatedAt: 'not-a-date' }),
      makeSession('a', { title: 'Alpha', updatedAt: 'also-not-a-date' })
    ]
    expect(sortPairings(sessions).map((session) => session.id)).toEqual(['a', 'z'])
  })

  it('turns media filenames into readable labels without guessing at release metadata', () => {
    expect(humanizeMediaName('C:\\Movies\\A.Goofy_Movie.mkv')).toBe('A Goofy Movie')
    expect(humanizeMediaName('Reaction Title [AbC-123xyz].mp4')).toBe('Reaction Title')
  })
})

function makeSession(id: string, patch: Partial<LibrarySession> = {}): LibrarySession {
  return createDefaultSession(new Date('2026-07-13T12:00:00.000Z'), {
    id,
    title: `${id} title`,
    moviePath: `C:\\Movies\\${id}.mp4`,
    reactionPath: `C:\\Reactions\\${id}.mp4`,
    ...patch
  })
}
