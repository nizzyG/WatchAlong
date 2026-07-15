import { canonicalizePatreonPostUrl } from '@shared/patreonUrls'

export function isValidYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

export function isValidPatreonPostUrl(value: string): boolean {
  return canonicalizePatreonPostUrl(value) !== null
}
