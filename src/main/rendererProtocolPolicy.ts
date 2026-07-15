import { isAbsolute, relative, resolve, sep } from 'node:path'
import { RENDERER_HOST, RENDERER_SCHEME } from './constants'

export type RendererView = 'wizard' | 'movie'

export interface RendererAssetRequest {
  relativePath: string
  view: RendererView | null
}

const RENDERER_ENTRY_PATH = 'index.html'
const RENDERER_ASSET_DIRECTORY = 'assets'

export function createRendererEntryUrl(view?: RendererView): string {
  const url = new URL(`${RENDERER_SCHEME}://${RENDERER_HOST}/${RENDERER_ENTRY_PATH}`)
  if (view) {
    url.searchParams.set('view', view)
  }
  return url.toString()
}

export function trustedDevelopmentRendererUrl(
  isPackaged: boolean,
  rawUrl: string | undefined
): string | null {
  if (isPackaged || !rawUrl) return null

  try {
    const url = new URL(rawUrl)
    const loopbackHost = url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]' ||
      url.hostname === '::1'
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      !loopbackHost ||
      url.username !== '' ||
      url.password !== ''
    ) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Parses only the renderer entry point and Vite's generated asset directory.
 * Files elsewhere in the application bundle are never addressable by URL.
 */
export function parseRendererAssetRequest(rawUrl: string): RendererAssetRequest | null {
  const rawPath = getRawPath(rawUrl)
  if (!rawPath) {
    return null
  }

  const segments = decodeSafePathSegments(rawPath)
  if (!segments) {
    return null
  }

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  if (
    url.protocol !== `${RENDERER_SCHEME}:` ||
    url.hostname !== RENDERER_HOST ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== ''
  ) {
    return null
  }

  const normalizedSegments = decodeSafePathSegments(url.pathname)
  if (
    !normalizedSegments ||
    normalizedSegments.length !== segments.length ||
    normalizedSegments.some((segment, index) => segment !== segments[index])
  ) {
    return null
  }

  const relativePath = segments.join('/')
  if (relativePath === RENDERER_ENTRY_PATH) {
    const view = parseEntryView(url.search)
    return view === undefined ? null : { relativePath, view }
  }

  if (
    segments.length >= 2 &&
    segments[0] === RENDERER_ASSET_DIRECTORY &&
    url.search === '' &&
    url.hash === ''
  ) {
    return { relativePath, view: null }
  }

  return null
}

/** Resolves a previously parsed asset while retaining a defense-in-depth root check. */
export function resolveRendererAssetPath(rendererRoot: string, relativePath: string): string | null {
  const segments = relativePath.split('/')
  if (
    segments.length === 0 ||
    segments.some((segment) => !isSafePathSegment(segment))
  ) {
    return null
  }

  const root = resolve(rendererRoot)
  const candidate = resolve(root, ...segments)
  return isPathInside(root, candidate) ? candidate : null
}

export function isPathInside(rootPath: string, candidatePath: string): boolean {
  const child = relative(resolve(rootPath), resolve(candidatePath))
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

function getRawPath(rawUrl: string): string | null {
  const schemeSeparator = rawUrl.indexOf('://')
  if (schemeSeparator <= 0) {
    return null
  }

  const authorityStart = schemeSeparator + 3
  const pathStart = rawUrl.indexOf('/', authorityStart)
  const queryStart = rawUrl.indexOf('?', authorityStart)
  const hashStart = rawUrl.indexOf('#', authorityStart)
  if (
    pathStart < 0 ||
    (queryStart >= 0 && queryStart < pathStart) ||
    (hashStart >= 0 && hashStart < pathStart)
  ) {
    return null
  }

  const pathEnd = [queryStart, hashStart]
    .filter((index) => index >= pathStart)
    .reduce((earliest, index) => Math.min(earliest, index), rawUrl.length)
  return rawUrl.slice(pathStart, pathEnd)
}

function decodeSafePathSegments(rawPath: string): string[] | null {
  if (!rawPath.startsWith('/') || rawPath.includes('\\')) {
    return null
  }

  const rawSegments = rawPath.slice(1).split('/')
  if (rawSegments.length === 0 || rawSegments.some((segment) => segment === '')) {
    return null
  }

  const segments: string[] = []
  for (const rawSegment of rawSegments) {
    let segment: string
    try {
      segment = decodeURIComponent(rawSegment)
    } catch {
      return null
    }

    if (!isSafePathSegment(segment)) {
      return null
    }
    segments.push(segment)
  }

  return segments
}

function isSafePathSegment(segment: string): boolean {
  return segment !== '' &&
    segment !== '.' &&
    segment !== '..' &&
    !segment.includes('/') &&
    !segment.includes('\\') &&
    !/[<>:"|?*\u0000-\u001f\u007f]/.test(segment) &&
    !/[. ]$/.test(segment) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)
}

function parseEntryView(search: string): RendererView | null | undefined {
  switch (search) {
    case '':
      return null
    case '?view=wizard':
      return 'wizard'
    case '?view=movie':
      return 'movie'
    default:
      return undefined
  }
}
