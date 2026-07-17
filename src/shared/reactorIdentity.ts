import type { LibrarySession, ReactorProfile } from './types'

export interface DerivedReactorIdentity {
  key: string
  label: string
  known: boolean
  externalIdentityKeys: string[]
}

const unknownReactor: DerivedReactorIdentity = {
  key: 'unknown:reactor',
  label: 'Reactor not identified',
  known: false,
  externalIdentityKeys: []
}

/**
 * Derives the best identity available in pre-profile libraries and for a new
 * import that has not been attached to a profile yet. Provider identifiers
 * remain aliases even when a person previously supplied a custom display name.
 */
export function deriveLegacyReactorIdentity(
  session: Pick<LibrarySession, 'reactionPath' | 'reactorName' | 'reactorNameOrigin'>
): DerivedReactorIdentity {
  const storedName = cleanReactorLabel(session.reactorName ?? '')
  const provider = session.reactionPath ? deriveProviderReactorIdentity(session.reactionPath) : null

  if (storedName && session.reactorNameOrigin === 'custom') {
    const nameKey = `named:${normalizeReactorLabel(storedName)}`
    return {
      key: nameKey,
      label: storedName,
      known: true,
      externalIdentityKeys: uniqueKeys([nameKey, ...(provider ? [provider.key] : [])])
    }
  }

  if (provider) {
    return {
      ...provider,
      label: storedName || provider.label,
      externalIdentityKeys: uniqueKeys([provider.key])
    }
  }

  if (storedName) {
    const nameKey = `named:${normalizeReactorLabel(storedName)}`
    return {
      key: nameKey,
      label: storedName,
      known: true,
      externalIdentityKeys: [nameKey]
    }
  }

  return unknownReactor
}

export function deriveProfileReactorIdentity(
  session: Pick<LibrarySession, 'reactorId' | 'reactionPath' | 'reactorName' | 'reactorNameOrigin'>,
  profiles: readonly ReactorProfile[]
): DerivedReactorIdentity {
  const profile = session.reactorId
    ? profiles.find((candidate) => candidate.id === session.reactorId)
    : null
  if (!profile) return deriveLegacyReactorIdentity(session)

  return {
    key: `reactor:${profile.id}`,
    label: profile.name,
    known: true,
    externalIdentityKeys: profile.externalIdentityKeys
  }
}

export function normalizeReactorLabel(value: string): string {
  return cleanReactorLabel(value).normalize('NFKC').toLocaleLowerCase()
}

export function cleanReactorLabel(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
}

export function providerIdentityKind(identityKey: string): 'youtube' | 'patreon' | null {
  if (identityKey.startsWith('youtube:')) return 'youtube'
  if (identityKey.startsWith('patreon:')) return 'patreon'
  return null
}

export function deriveProviderReactorIdentity(reactionPath: string): DerivedReactorIdentity | null {
  return derivePatreonIdentity(reactionPath) ?? deriveYouTubeIdentity(reactionPath)
}

function deriveYouTubeIdentity(reactionPath: string): DerivedReactorIdentity | null {
  const segments = reactionPath.split(/[\\/]/).filter(Boolean)
  if (segments.length < 4) return null

  const creatorFolder = cleanReactorLabel(segments.at(-2) ?? '')
  const sourceFolder = segments.at(-4)?.toLocaleLowerCase()
  if (sourceFolder !== 'youtube') return null

  const separatorIndex = creatorFolder.indexOf(' - ')
  if (separatorIndex <= 0) return null
  const channelId = cleanReactorLabel(creatorFolder.slice(0, separatorIndex))
  const channelName = cleanReactorLabel(creatorFolder.slice(separatorIndex + 3))
  if (!channelId || !channelName) return null

  const key = `youtube:${normalizeReactorLabel(channelId)}`
  return { key, label: channelName, known: true, externalIdentityKeys: [key] }
}

function derivePatreonIdentity(reactionPath: string): DerivedReactorIdentity | null {
  const segments = reactionPath.split(/[\\/]/).filter(Boolean)
  let postsIndex = -1
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index].toLocaleLowerCase() === 'posts') {
      postsIndex = index
      break
    }
  }
  if (postsIndex < 1) return null

  const campaignFolder = cleanReactorLabel(segments[postsIndex - 1])
  const separatorIndex = campaignFolder.indexOf(' - ')
  if (separatorIndex <= 0) return null

  const vanity = cleanReactorLabel(campaignFolder.slice(0, separatorIndex))
  const campaignName = cleanReactorLabel(campaignFolder.slice(separatorIndex + 3))
  if (!vanity || !campaignName) return null

  const key = `patreon:${normalizeReactorLabel(vanity)}`
  return { key, label: campaignName, known: true, externalIdentityKeys: [key] }
}

function uniqueKeys(keys: string[]): string[] {
  return [...new Set(keys.filter(Boolean))]
}
