const PATREON_LOGIN_HOST_FAMILIES = [
  'patreon.com',
  'facebook.com',
  'google.com',
  'apple.com'
] as const

export function isAllowedPatreonLoginUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:') {
      return false
    }

    if (url.username || url.password || url.port) {
      return false
    }

    const hostname = url.hostname.toLowerCase()
    return PATREON_LOGIN_HOST_FAMILIES.some(
      (allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
    )
  } catch {
    return false
  }
}
