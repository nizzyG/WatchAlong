import type { LibrarySession } from '@shared/types'
import { mediaPathIdentity } from '@shared/session'

export type LibraryMode = 'pairings' | 'reactors' | 'movies'

export interface LibraryIdentity {
  key: string
  label: string
  known: boolean
}

export interface LibraryGroup extends LibraryIdentity {
  sessions: LibrarySession[]
}

export interface PairingTitleParts {
  movie: string
  reactor: string
}

const unknownMovie: LibraryIdentity = {
  key: 'unknown:movie',
  label: 'Movie not identified',
  known: false
}

const unknownReactor: LibraryIdentity = {
  key: 'unknown:reactor',
  label: 'Reactor not identified',
  known: false
}

const labelCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function splitPairingTitle(title: string): PairingTitleParts | null {
  const separator = ' — '
  const separatorIndex = title.lastIndexOf(separator)
  if (separatorIndex <= 0) {
    return null
  }

  const movie = cleanLabel(title.slice(0, separatorIndex))
  const reactor = cleanLabel(title.slice(separatorIndex + separator.length))
  return movie && reactor ? { movie, reactor } : null
}

export function deriveMovieIdentity(session: LibrarySession): LibraryIdentity {
  if (session.moviePath) {
    const pathKey = normalizePath(session.moviePath)
    const generatedTitle = splitPairingTitle(session.title)
    const organizedFolderTitle = movieFolderTitle(session.moviePath)
    return {
      key: `path:${pathKey}`,
      label: organizedFolderTitle ?? generatedTitle?.movie ?? movieFileTitle(session.moviePath),
      known: true
    }
  }

  const generatedTitle = splitPairingTitle(session.title)
  if (generatedTitle) {
    return {
      key: `title:${normalizeLabel(generatedTitle.movie)}`,
      label: generatedTitle.movie,
      known: true
    }
  }

  return unknownMovie
}

export function deriveReactorIdentity(session: LibrarySession): LibraryIdentity {
  const storedName = cleanLabel(session.reactorName ?? '')
  if (storedName && session.reactorNameOrigin === 'custom') {
    return namedReactorIdentity(storedName)
  }

  const patreonIdentity = session.reactionPath ? derivePatreonIdentity(session.reactionPath) : null
  if (patreonIdentity) {
    return storedName ? { ...patreonIdentity, label: storedName } : patreonIdentity
  }

  const youtubeIdentity = session.reactionPath ? deriveYouTubeIdentity(session.reactionPath) : null
  if (youtubeIdentity) {
    return storedName ? { ...youtubeIdentity, label: storedName } : youtubeIdentity
  }

  if (storedName) return namedReactorIdentity(storedName)
  return unknownReactor
}

function namedReactorIdentity(name: string): LibraryIdentity {
  return {
    key: `named:${normalizeLabel(name)}`,
    label: name,
    known: true
  }
}

function deriveYouTubeIdentity(reactionPath: string): LibraryIdentity | null {
  const segments = reactionPath.split(/[\\/]/).filter(Boolean)
  if (segments.length < 4) return null

  const creatorFolder = cleanLabel(segments.at(-2) ?? '')
  const sourceFolder = segments.at(-4)?.toLocaleLowerCase()
  if (sourceFolder !== 'youtube') return null

  const separatorIndex = creatorFolder.indexOf(' - ')
  if (separatorIndex <= 0) return null
  const channelId = cleanLabel(creatorFolder.slice(0, separatorIndex))
  const channelName = cleanLabel(creatorFolder.slice(separatorIndex + 3))
  if (!channelId || !channelName) return null

  return {
    key: `youtube:${normalizeLabel(channelId)}`,
    label: channelName,
    known: true
  }
}

export function pairingDisplayTitle(session: LibrarySession): string {
  const explicitTitle = cleanLabel(session.title)
  if (explicitTitle && session.titleOrigin === 'custom') {
    return stripMediaExtension(explicitTitle)
  }

  const movie = deriveMovieIdentity(session)
  const reactor = deriveReactorIdentity(session)
  if (movie.known && reactor.known) {
    return `${movie.label} — ${reactor.label}`
  }

  const generatedTitle = splitPairingTitle(explicitTitle)
  if (generatedTitle) {
    return `${generatedTitle.movie} — ${generatedTitle.reactor}`
  }

  if (explicitTitle) {
    return stripMediaExtension(explicitTitle)
  }

  return movie.known ? movie.label : humanizeMediaName(session.reactionPath ?? 'Untitled watchalong')
}

export function sortPairings(sessions: LibrarySession[]): LibrarySession[] {
  return [...sessions].sort((left, right) => {
    const updatedDifference = safeTimestamp(right.updatedAt) - safeTimestamp(left.updatedAt)
    if (updatedDifference !== 0) {
      return updatedDifference
    }

    return labelCollator.compare(pairingDisplayTitle(left), pairingDisplayTitle(right)) || left.id.localeCompare(right.id)
  })
}

export function groupSessionsByMovie(sessions: LibrarySession[]): LibraryGroup[] {
  return groupSessions(sessions, deriveMovieIdentity, deriveReactorIdentity)
}

export function groupSessionsByReactor(sessions: LibrarySession[]): LibraryGroup[] {
  return groupSessions(sessions, deriveReactorIdentity, deriveMovieIdentity)
}

export function humanizeMediaName(pathOrName: string): string {
  const baseName = pathOrName.split(/[\\/]/).at(-1) ?? pathOrName
  const withoutExtension = stripMediaExtension(baseName)
  const withoutVideoId = withoutExtension.replace(/\s+\[[\w-]{6,}\]$/, '')
  return cleanLabel(withoutVideoId.replace(/[._]+/g, ' ')) || 'Untitled watchalong'
}

function groupSessions(
  sessions: LibrarySession[],
  groupIdentity: (session: LibrarySession) => LibraryIdentity,
  itemIdentity: (session: LibrarySession) => LibraryIdentity
): LibraryGroup[] {
  const grouped = new Map<string, LibraryGroup>()
  for (const session of sessions) {
    const identity = groupIdentity(session)
    const current = grouped.get(identity.key)
    if (current) {
      current.sessions.push(session)
    } else {
      grouped.set(identity.key, { ...identity, sessions: [session] })
    }
  }

  const groups = [...grouped.values()]
  for (const group of groups) {
    group.sessions.sort((left, right) => {
      const labelDifference = labelCollator.compare(itemIdentity(left).label, itemIdentity(right).label)
      if (labelDifference !== 0) {
        return labelDifference
      }

      const updatedDifference = safeTimestamp(right.updatedAt) - safeTimestamp(left.updatedAt)
      return updatedDifference || left.id.localeCompare(right.id)
    })
  }

  return groups.sort((left, right) => {
    if (left.known !== right.known) {
      return left.known ? -1 : 1
    }

    return labelCollator.compare(left.label, right.label) || left.key.localeCompare(right.key)
  })
}

function derivePatreonIdentity(reactionPath: string): LibraryIdentity | null {
  const segments = reactionPath.split(/[\\/]/).filter(Boolean)
  let postsIndex = -1
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index].toLocaleLowerCase() === 'posts') {
      postsIndex = index
      break
    }
  }
  if (postsIndex < 1) {
    return null
  }

  const campaignFolder = cleanLabel(segments[postsIndex - 1])
  const separatorIndex = campaignFolder.indexOf(' - ')
  if (separatorIndex <= 0) {
    return null
  }

  const vanity = cleanLabel(campaignFolder.slice(0, separatorIndex))
  const campaignName = cleanLabel(campaignFolder.slice(separatorIndex + 3))
  if (!vanity || !campaignName) {
    return null
  }

  return {
    key: `patreon:${normalizeLabel(vanity)}`,
    label: campaignName,
    known: true
  }
}

function normalizePath(value: string): string {
  return mediaPathIdentity(value) ?? value
}

function normalizeLabel(value: string): string {
  return cleanLabel(value).normalize('NFKC').toLocaleLowerCase()
}

function cleanLabel(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
}

function stripMediaExtension(value: string): string {
  return value.replace(/\.(?:mp4|m4v|mov|webm|mkv|avi|ogv|ogg)$/i, '')
}

function movieFolderTitle(moviePath: string): string | null {
  const segments = moviePath.split(/[\\/]/).filter(Boolean)
  const folderName = segments.at(-2)
  if (!folderName) return null

  const folderTitle = cleanMovieFolderTitle(folderName)
  const fileTitle = humanizeMediaName(moviePath)
  const folderKey = titleComparisonKey(folderTitle)
  const fileKey = titleComparisonKey(fileTitle)
  if (folderKey.length < 4 || (fileKey !== folderKey && !fileKey.startsWith(`${folderKey} `))) return null

  const remainder = fileKey.slice(folderKey.length).trim()
  if (remainder && !isReleaseMetadataSequence(remainder)) return null

  return folderTitle
}

function movieFileTitle(moviePath: string): string {
  const originalTitle = humanizeMediaName(moviePath)
  const metadataStart = originalTitle.search(/[\s([_-](?:\d{3,4}p|4k|8k|uhd|hdr\d*|bluray|brrip|bdrip|web(?:\s|-)?dl|webrip|hdtv|dvd(?:rip)?|remux|x26[45]|h26[45]|hevc|av1|10bit)\b/i)
  if (metadataStart < 0) return originalTitle

  const cleanTitle = originalTitle
    .slice(0, metadataStart)
    .replace(/[\s([_{-]+$/u, '')
    .replace(/\s((?:18|19|20)\d{2})$/u, ' ($1)')
    .trim()
  return cleanTitle || originalTitle
}

function isReleaseMetadataSequence(value: string): boolean {
  const tokens = value.split(' ').filter(Boolean)
  let releaseYearCount = 0
  let sawNonYearMetadata = false
  let sawReleaseGroup = false

  return tokens.length > 0 && tokens.every((token) => {
    if (/^\d{4}$/.test(token)) {
      if (sawReleaseGroup || !isPlausibleReleaseYear(token)) return false
      releaseYearCount += 1
      return releaseYearCount === 1
    }

    if (isNonYearReleaseMetadataToken(token)) {
      if (sawReleaseGroup) return false
      sawNonYearMetadata = true
      return true
    }

    if (!sawNonYearMetadata || !/^[\p{L}\p{N}-]{1,24}$/u.test(token)) return false
    sawReleaseGroup = true
    return true
  })
}

function cleanMovieFolderTitle(folderName: string): string {
  let title = humanizeMediaName(folderName)
  const bracketSuffix = title.match(/((?:\s*\[[^\]]+\])+?)\s*$/u)
  if (bracketSuffix?.index !== undefined) {
    const groups = [...bracketSuffix[1].matchAll(/\[([^\]]+)\]/gu)].map((match) => cleanLabel(match[1]))
    if (groups.some(containsNonYearReleaseMetadata)) {
      const releaseYears = groups.filter(isPlausibleReleaseYear)
      title = title.slice(0, bracketSuffix.index).trim()
      if (releaseYears.length === 1 && !titleComparisonKey(title).endsWith(releaseYears[0])) {
        title = `${title} (${releaseYears[0]})`
      }
    }
  }

  while (true) {
    const trailingGroup = title.match(/\s*\(([^()]*)\)\s*$/u)
    if (!trailingGroup?.index || !containsNonYearReleaseMetadata(trailingGroup[1])) break
    title = title.slice(0, trailingGroup.index).trim()
  }

  return cleanLabel(title) || humanizeMediaName(folderName)
}

function containsNonYearReleaseMetadata(value: string): boolean {
  return titleComparisonKey(value).split(' ').some(isNonYearReleaseMetadataToken)
}

function isNonYearReleaseMetadataToken(token: string): boolean {
  return /^(?:\d{3,4}p|4k|8k|uhd|hdr\d*|dv|sdr|blu|bluray|brrip|bdrip|web|dl|webrip|hdtv|dvd|dvdrip|remux|rip|x26[45]|h26[45]|hevc|av1|10bit|proper|repack|aac\d*|ac3|eac3|ddp?\d*|dts|truehd|atmos)$/i.test(token)
}

function isPlausibleReleaseYear(value: string): boolean {
  if (!/^\d{4}$/.test(value)) return false
  const year = Number(value)
  return year >= 1888 && year <= new Date().getUTCFullYear() + 1
}

function titleComparisonKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function safeTimestamp(value: string): number {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}
