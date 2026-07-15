/**
 * Canonicalizes the Patreon post shapes accepted by WatchAlong and
 * patreon-dl. Patreon commonly copies creator-prefixed links even though the
 * bundled downloader expects /posts/<slug>.
 */
export function canonicalizePatreonPostUrl(value: string): string | null {
  const url = parseSecureNetworkUrl(value)
  if (!url) return null

  const hostname = url.hostname.toLowerCase()
  if (hostname !== 'patreon.com' && !hostname.endsWith('.patreon.com')) return null

  const segments = url.pathname.split('/').filter(Boolean)
  const postsIndex = segments.findIndex((segment) => segment.toLowerCase() === 'posts')
  if (postsIndex < 0 || postsIndex !== segments.length - 2) return null

  let postSlug: string
  try {
    postSlug = decodeURIComponent(segments[postsIndex + 1])
  } catch {
    return null
  }
  if (!postSlug || /[\\/\u0000-\u001f\u007f]/.test(postSlug)) return null

  return `https://www.patreon.com/posts/${encodeURIComponent(postSlug)}`
}

function parseSecureNetworkUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash
      ? url
      : null
  } catch {
    return null
  }
}
