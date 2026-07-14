import { describe, expect, it } from 'vitest'
import { createDefaultSession } from '@shared/session'
import type { LibrarySession } from '@shared/types'
import {
  deriveMovieIdentity,
  deriveReactorIdentity,
  groupSessionsByMovie,
  groupSessionsByReactor,
  humanizeMediaName,
  pairingDisplayTitle,
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

  it('uses a stored custom reactor for local sessions without parsing the title', () => {
    const local = makeSession('local', {
      title: 'reaction-from-drive.mp4',
      titleOrigin: 'generated',
      reactionPath: 'D:\\Shared reactions\\reaction-from-drive.mp4',
      reactorName: '  Cinema Therapy  ',
      reactorNameOrigin: 'custom'
    })

    expect(deriveReactorIdentity(local)).toEqual({
      key: 'named:cinema therapy',
      label: 'Cinema Therapy',
      known: true
    })
    expect(groupSessionsByReactor([local])[0]).toMatchObject({
      key: 'named:cinema therapy',
      label: 'Cinema Therapy',
      known: true
    })
  })

  it('keeps stable download identities while using stored metadata as the display label', () => {
    const download = makeSession('download', {
      reactionPath: 'C:\\Reactions\\youtube\\job-one\\UC123 - Old Label\\video.mp4',
      reactorName: 'Current Channel Name',
      reactorNameOrigin: 'metadata'
    })

    expect(deriveReactorIdentity(download)).toEqual({
      key: 'youtube:uc123',
      label: 'Current Channel Name',
      known: true
    })
  })

  it('keeps a custom pairing title even when movie and reactor identities are known', () => {
    const custom = makeSession('custom', {
      title: 'My movie-night favorite',
      titleOrigin: 'custom',
      reactorName: 'Cinema Therapy',
      reactorNameOrigin: 'custom'
    })

    expect(pairingDisplayTitle(custom)).toBe('My movie-night favorite')
  })

  it('refreshes a generated pairing title after the reactor is renamed', () => {
    const renamed = makeSession('renamed', {
      title: 'Alien — Old Reactor',
      titleOrigin: 'generated',
      moviePath: 'C:\\Movies\\Alien.mkv',
      reactorName: 'New Reactor',
      reactorNameOrigin: 'custom'
    })

    expect(pairingDisplayTitle(renamed)).toBe('Alien — New Reactor')
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

  it('uses a matching organized movie folder as the cleaner display title', () => {
    const organized = makeSession('organized', {
      title: 'A Goofy Movie 1995 720p BluRay x264 — Reactor',
      moviePath: 'C:\\Movies\\A Goofy Movie (1995)\\A.Goofy.Movie.1995.720p.BluRay.x264.mkv'
    })
    const collection = makeSession('collection', {
      title: 'Alien — Reactor',
      moviePath: 'C:\\Movies\\Sci-Fi Collection\\Alien.mkv'
    })
    const noisyFolder = makeSession('noisy-folder', {
      title: 'A Goofy Movie — Reactor',
      moviePath: 'C:\\Movies\\A Goofy Movie (1995) [BluRay] [720p] [YTS.AM]\\A.Goofy.Movie.1995.720p.BluRay.x264-[YTS.AM].mp4'
    })
    const parentheticalMetadata = makeSession('parenthetical-metadata', {
      title: 'V for Vendetta — Reactor',
      moviePath: 'C:\\Movies\\V for Vendetta (2005) (1080p BluRay x265 HEVC 10bit Tigole)\\V for Vendetta (2005) (1080p BluRay x265 10bit Tigole).mkv'
    })

    expect(deriveMovieIdentity(organized).label).toBe('A Goofy Movie (1995)')
    expect(deriveMovieIdentity(collection).label).toBe('Alien')
    expect(deriveMovieIdentity(noisyFolder).label).toBe('A Goofy Movie (1995)')
    expect(deriveMovieIdentity(parentheticalMetadata).label).toBe('V for Vendetta (2005)')
  })

  it('does not mistake title prefixes or collection folders for the movie title', () => {
    const titlePrefix = makeSession('title-prefix', {
      title: 'Aliens — Reactor',
      moviePath: 'C:\\Movies\\Alien\\Aliens.1986.1080p.mkv'
    })
    const sequelInCollection = makeSession('sequel-in-collection', {
      title: 'Dune Part Two — Reactor',
      moviePath: 'C:\\Movies\\Dune\\Dune.Part.Two.2024.2160p.mkv'
    })

    expect(deriveMovieIdentity(titlePrefix).label).toBe('Aliens')
    expect(deriveMovieIdentity(sequelInCollection).label).toBe('Dune Part Two')
  })

  it('does not erase numeric sequel titles that extend a shorter folder name', () => {
    const numericSequel = makeSession('numeric-sequel', {
      title: 'Blade Runner 2049 — Reactor',
      moviePath: 'C:\\Movies\\Blade Runner\\Blade.Runner.2049.2017.2160p.BluRay.mkv'
    })

    expect(deriveMovieIdentity(numericSequel).label).toBe('Blade Runner 2049')
  })

  it('removes release tags from a movie file when its parent is a broader collection', () => {
    const episode = makeSession('episode', {
      title: 'Custom session title',
      moviePath: 'C:\\Movies\\Game.of.Thrones.S03.720p.BluRay.x264\\Game.of.Thrones.S03E06.720p.BluRay.450MB.Group.mkv'
    })

    expect(deriveMovieIdentity(episode).label).toBe('Game of Thrones S03E06')
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
