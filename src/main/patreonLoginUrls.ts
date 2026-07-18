const PATREON_LOGIN_HOST_FAMILIES = [
  'patreon.com',
  'facebook.com',
  'google.com',
  'apple.com'
] as const

// Google can bridge an authenticated Gaia session through this exact YouTube
// account origin during SSO. Keep it exact: ordinary YouTube pages and
// subdomains are not part of the Patreon login surface.
const PATREON_LOGIN_EXACT_HOSTS = new Set([
  'accounts.youtube.com'
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

    const hostname = url.hostname.toLowerCase()
    return PATREON_LOGIN_EXACT_HOSTS.has(hostname)
      || PATREON_LOGIN_HOST_FAMILIES.some(
        (allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
      )
  } catch {
    return false
  }
}
