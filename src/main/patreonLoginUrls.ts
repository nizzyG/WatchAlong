export function isAllowedPatreonLoginUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:') {
      return false
    }

    const host = url.hostname
    return (
      host === 'patreon.com' ||
      host === 'www.patreon.com' ||
      host === 'facebook.com' ||
      host.endsWith('.facebook.com') ||
      host.endsWith('.google.com') ||
      host.endsWith('.apple.com')
    )
  } catch {
    return false
  }
}
