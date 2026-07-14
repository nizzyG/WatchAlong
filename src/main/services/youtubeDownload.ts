import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { DownloadedReactionMetadata } from '@shared/types'
import { cleanMediaFilename, cleanMetadataValue, compactMetadata } from './downloadMetadata'
import {
  captureProcessOutput,
  stripAnsi,
  type SpawnDownloadProcess
} from './downloadProcess'

export interface YouTubeOutputMetadata extends DownloadedReactionMetadata {
  channelUrl?: string
}

export interface ParsedYtDlpProgress {
  percent: number | null
  speed?: string
  eta?: string
  fragmentIndex?: number
  fragmentCount?: number
}

export interface YouTubeThumbnail {
  id?: string
  url?: string
  width?: number
  height?: number
}

export type FetchAvatar = (
  url: string,
  options: { signal: AbortSignal; redirect: 'error' }
) => Promise<{
  ok: boolean
  headers: { get(name: string): string | null }
  body?: AsyncIterable<Uint8Array> | null
  arrayBuffer(): Promise<ArrayBuffer>
}>

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const YT_PROGRESS_PREFIX = 'WA_PROGRESS\t'
const YT_METADATA_PREFIX = 'WA_METADATA\t'
const YT_FILE_PREFIX = 'WA_FILE\t'
const MAX_AVATAR_BYTES = 8 * 1024 * 1024
const YOUTUBE_DOWNLOAD_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be'
])
const YOUTUBE_AVATAR_HOSTS = new Set([
  'yt3.ggpht.com',
  'yt3.googleusercontent.com',
  'i.ytimg.com'
])

export function buildYouTubeDownloadArgs(
  url: string,
  downloadDir: string,
  ffmpegPath: string | null
): string[] {
  const args = [
    '--no-playlist',
    '--newline',
    '--no-colors',
    '--progress',
    '--progress-template',
    `${YT_PROGRESS_PREFIX}%(progress._percent_str)s\t%(progress._speed_str)s\t%(progress._eta_str)s\t%(progress.fragment_index)s\t%(progress.fragment_count)s`,
    '--print',
    `before_dl:${YT_METADATA_PREFIX}%(title)j\t%(channel)j\t%(uploader)j\t%(channel_url)j\t%(uploader_url)j`,
    '--print',
    `after_move:${YT_FILE_PREFIX}%(filepath)j`,
    '-P',
    downloadDir,
    '-o',
    '%(channel_id)s - %(channel)s/%(title).180B [%(id)s].%(ext)s',
    '-f',
    'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best',
    '--merge-output-format',
    'mp4'
  ]

  if (ffmpegPath) {
    args.push('--ffmpeg-location', ffmpegPath)
  }
  args.push(url)
  return args
}

export function parseYtDlpProgressLine(line: string): ParsedYtDlpProgress | null {
  if (!line.startsWith(YT_PROGRESS_PREFIX)) {
    return null
  }

  const [
    ,
    percentValue = '',
    speedValue = '',
    etaValue = '',
    fragmentIndexValue = '',
    fragmentCountValue = ''
  ] = line.split('\t')
  const fragmentIndex = parsePositiveInteger(fragmentIndexValue)
  const fragmentCount = parsePositiveInteger(fragmentCountValue)

  return {
    percent: extractPercent(percentValue),
    ...(normalizeYtDlpValue(speedValue) ? { speed: normalizeYtDlpValue(speedValue) } : {}),
    ...(normalizeYtDlpValue(etaValue) ? { eta: normalizeYtDlpValue(etaValue) } : {}),
    ...(fragmentIndex ? { fragmentIndex } : {}),
    ...(fragmentCount ? { fragmentCount } : {})
  }
}

export function parseYtDlpMetadataLine(line: string): YouTubeOutputMetadata | null {
  if (!line.startsWith(YT_METADATA_PREFIX)) {
    return null
  }

  const [
    ,
    titleValue = '',
    channelValue = '',
    uploaderValue = '',
    channelUrlValue = '',
    uploaderUrlValue = ''
  ] = line.split('\t')
  const reactionTitle = decodeYtDlpJsonString(titleValue) ?? undefined
  const reactorName =
    decodeYtDlpJsonString(channelValue) ?? decodeYtDlpJsonString(uploaderValue) ?? undefined
  const channelUrl =
    decodeYtDlpJsonString(channelUrlValue) ??
    decodeYtDlpJsonString(uploaderUrlValue) ??
    undefined
  return compactMetadata({ reactionTitle, reactorName, channelUrl })
}

export function parseYtDlpCompletedPath(line: string): string | null {
  if (!line.startsWith(YT_FILE_PREFIX)) {
    return null
  }

  return decodeYtDlpJsonString(line.slice(YT_FILE_PREFIX.length))
}

export function extractPercent(line: string): number | null {
  const match = /(\d+(?:\.\d+)?)%/.exec(line)
  if (!match) {
    return null
  }

  const percent = Number.parseFloat(match[1])
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null
}

export function formatYtDlpProgressMessage(progress: ParsedYtDlpProgress): string {
  void progress
  return 'Downloading reaction video...'
}

export function deriveYouTubeDownloadMetadata(
  filePath: string,
  metadata: YouTubeOutputMetadata
): DownloadedReactionMetadata {
  return compactMetadata({
    reactionTitle:
      metadata.reactionTitle ?? cleanMediaFilename(basename(filePath, extname(filePath))),
    reactorName: metadata.reactorName
  })
}

export function selectYouTubeAvatarThumbnail(
  thumbnails: YouTubeThumbnail[]
): YouTubeThumbnail | null {
  const candidates = thumbnails.filter((thumbnail) => {
    if (!thumbnail.url) {
      return false
    }
    const id = thumbnail.id?.toLowerCase() ?? ''
    if (id.includes('avatar')) {
      return true
    }
    if (!thumbnail.width || !thumbnail.height) {
      return false
    }
    const ratio = thumbnail.width / thumbnail.height
    return ratio >= 0.8 && ratio <= 1.25
  })

  return (
    candidates.sort((left, right) => {
      const leftAvatar = left.id?.toLowerCase().includes('avatar') ? 1 : 0
      const rightAvatar = right.id?.toLowerCase().includes('avatar') ? 1 : 0
      return rightAvatar - leftAvatar || thumbnailArea(right) - thumbnailArea(left)
    })[0] ?? null
  )
}

export async function retrieveYouTubeCreatorAvatar(
  channelUrl: string,
  reactionPath: string,
  ytDlpPath: string,
  spawnProcess: SpawnDownloadProcess = spawn,
  fetchAvatar: FetchAvatar = (url, options) => fetch(url, options)
): Promise<string | null> {
  if (!isAllowedYouTubeDownloadUrl(channelUrl)) {
    return null
  }

  try {
    const channelInfo = await captureProcessOutput(spawnProcess, ytDlpPath, [
      '--flat-playlist',
      '--playlist-end',
      '1',
      '--dump-single-json',
      '--no-warnings',
      channelUrl
    ])
    if (!channelInfo) {
      return null
    }

    const parsed = JSON.parse(channelInfo) as { thumbnails?: YouTubeThumbnail[] }
    const thumbnail = selectYouTubeAvatarThumbnail(parsed.thumbnails ?? [])
    if (!thumbnail?.url || !isAllowedYouTubeAvatarUrl(thumbnail.url)) {
      return null
    }

    const response = await fetchAvatar(thumbnail.url, {
      signal: AbortSignal.timeout(12_000),
      redirect: 'error'
    })
    if (!response.ok) {
      return null
    }

    const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10)
    if (Number.isFinite(contentLength) && contentLength > MAX_AVATAR_BYTES) {
      return null
    }

    const contentType =
      response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
    if (contentType && (!contentType.startsWith('image/') || contentType === 'image/avif')) {
      return null
    }

    const bytes = await readBoundedAvatarBytes(response)
    if (!bytes) {
      return null
    }

    const avatarPath = join(
      dirname(reactionPath),
      `reactor-avatar${avatarExtension(contentType, thumbnail.url)}`
    )
    writeFileSync(avatarPath, bytes)
    return avatarPath
  } catch {
    return null
  }
}

export function isAllowedYouTubeDownloadUrl(value: string): boolean {
  const url = parseSecureNetworkUrl(value)
  return Boolean(url && YOUTUBE_DOWNLOAD_HOSTS.has(url.hostname.toLowerCase()))
}

export function isAllowedYouTubeAvatarUrl(value: string): boolean {
  const url = parseSecureNetworkUrl(value)
  return Boolean(url && YOUTUBE_AVATAR_HOSTS.has(url.hostname.toLowerCase()))
}

async function readBoundedAvatarBytes(response: {
  body?: AsyncIterable<Uint8Array> | null
  arrayBuffer(): Promise<ArrayBuffer>
}): Promise<Buffer | null> {
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer())
    return bytes.length > 0 && bytes.length <= MAX_AVATAR_BYTES ? bytes : null
  }

  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk)
    totalBytes += bytes.length
    if (totalBytes > MAX_AVATAR_BYTES) {
      return null
    }
    chunks.push(bytes)
  }

  return totalBytes > 0 ? Buffer.concat(chunks, totalBytes) : null
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

function parsePositiveInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value.trim(), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function normalizeYtDlpValue(value: string): string | undefined {
  const clean = stripAnsi(value).trim()
  return !clean || /^(?:n\/?a|na|none|null|unknown|-)$/i.test(clean) ? undefined : clean
}

function decodeYtDlpJsonString(value: string): string | null {
  const clean = value.trim()
  if (!clean || /^(?:NA|null|none)$/i.test(clean)) {
    return null
  }

  try {
    const decoded = JSON.parse(clean) as unknown
    return typeof decoded === 'string' ? cleanMetadataValue(decoded) ?? null : null
  } catch {
    return cleanMetadataValue(clean) ?? null
  }
}

function thumbnailArea(thumbnail: YouTubeThumbnail): number {
  return (thumbnail.width ?? 0) * (thumbnail.height ?? 0)
}

function avatarExtension(contentType: string, url: string): string {
  if (contentType === 'image/png') return '.png'
  if (contentType === 'image/webp') return '.webp'
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') return '.jpg'

  try {
    const extension = extname(new URL(url).pathname).toLowerCase()
    return IMAGE_EXTENSIONS.has(extension) ? extension : '.jpg'
  } catch {
    return '.jpg'
  }
}
