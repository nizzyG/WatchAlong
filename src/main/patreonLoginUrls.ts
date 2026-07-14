const PATREON_LOGIN_HOSTS = new Set([
  'patreon.com',
  'www.patreon.com',
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'web.facebook.com',
  'accounts.google.com',
  'appleid.apple.com'
])

export function isAllowedPatreonLoginUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:') {
      return false
    }

    if (url.username || url.password || url.port) {
      return false
    }

    return PATREON_LOGIN_HOSTS.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}
