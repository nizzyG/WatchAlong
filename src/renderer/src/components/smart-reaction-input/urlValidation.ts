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
  try {
    const url = new URL(value.trim())
    const hostname = url.hostname.toLowerCase()
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (hostname === 'patreon.com' || hostname.endsWith('.patreon.com')) &&
      url.pathname.includes('/posts/')
  } catch {
    return false
  }
}
