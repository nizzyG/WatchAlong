import {
  chmodSync,
  type Dirent,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import type { DownloadedReactionMetadata, SavedPatreonSessionStatus } from '@shared/types'
import { canonicalizePatreonPostUrl } from '@shared/patreonUrls'
import { cleanMediaFilename, cleanMetadataValue, compactMetadata } from './downloadMetadata'
import { stripAnsi } from './downloadProcess'
import { PatreonSessionVault } from './patreonSessionVault'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const COMPLETED_PATREON_SESSION_TTL_MS = 10 * 60 * 1000
const STALE_PATREON_TEMP_AGE_MS = 0
const PATREON_TEMP_PREFIXES = [
  'watchalong-patreon-dl-',
  'watchalong-patreon-cookies-'
] as const

interface HeldPatreonSession {
  cookie: string
  expiryTimer: ReturnType<typeof setTimeout>
}

export class PatreonSessionRetention {
  private readonly completedCookies = new Map<string, HeldPatreonSession>()
  private retentionGeneration = 0

  get generation(): number {
    return this.retentionGeneration
  }

  hold(jobId: string, cookie: string, generation: number): void {
    if (generation !== this.retentionGeneration) {
      return
    }

    this.clear(jobId)
    const expiryTimer = setTimeout(() => {
      this.completedCookies.delete(jobId)
    }, COMPLETED_PATREON_SESSION_TTL_MS)
    expiryTimer.unref?.()
    this.completedCookies.set(jobId, { cookie, expiryTimer })
  }

  clear(jobId: string): void {
    const heldSession = this.completedCookies.get(jobId)
    if (heldSession) {
      clearTimeout(heldSession.expiryTimer)
      this.completedCookies.delete(jobId)
    }
  }

  save(jobId: string, vault: PatreonSessionVault): SavedPatreonSessionStatus {
    const heldSession = this.completedCookies.get(jobId)
    if (heldSession) {
      try {
        return vault.save(heldSession.cookie)
      } finally {
        this.clear(jobId)
      }
    }
    return vault.status()
  }

  discard(jobId: string, vault: PatreonSessionVault): SavedPatreonSessionStatus {
    this.clear(jobId)
    return vault.status()
  }

  forget(vault: PatreonSessionVault): SavedPatreonSessionStatus {
    // Running downloads still close over their short-lived cookie. Advancing
    // the generation prevents completion from offering a forgotten credential.
    this.retentionGeneration += 1
    for (const jobId of this.completedCookies.keys()) {
      this.clear(jobId)
    }
    return vault.forget()
  }

  dispose(): void {
    this.retentionGeneration += 1
    for (const jobId of this.completedCookies.keys()) {
      this.clear(jobId)
    }
  }
}

export function buildPatreonDownloadArgs(
  cliPath: string,
  url: string,
  downloadDir: string,
  cookieConfigPath: string,
  ffmpegPath: string | null
): string[] {
  const args = [
    cliPath,
    '--no-prompt',
    '--log-level',
    'info',
    '--out-dir',
    downloadDir,
    '--config-file',
    cookieConfigPath
  ]
  if (ffmpegPath) {
    args.push('--ffmpeg', ffmpegPath)
  }
  args.push(url)
  return args
}

export function createPatreonCookieConfig(
  cookie: string
): { path: string; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), 'watchalong-patreon-dl-'))
  const configPath = join(tempDir, 'patreon-dl.conf')
  const singleLineCookie = cookie.replace(/[\r\n]/g, '')

  try {
    writeFileSync(configPath, `[downloader]\ncookie = "${singleLineCookie}"\n`, {
      encoding: 'utf8',
      mode: 0o600
    })
    chmodSync(configPath, 0o600)
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true })
    throw error
  }

  let cleaned = false
  return {
    path: configPath,
    cleanup: () => {
      if (cleaned) {
        return
      }
      cleaned = true

      // Remove the credential contents before deleting the directory. If an
      // antivirus/file-indexer briefly holds the directory on Windows, rmSync
      // retries; a later startup also clears any crash leftovers.
      try {
        writeFileSync(configPath, '', { encoding: 'utf8', mode: 0o600 })
      } catch {
        // The downloader or OS may already have removed/locked the file.
      }
      try {
        rmSync(tempDir, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 25
        })
      } catch {
        // Best effort. The file remains owner-only and stale cleanup retries.
      }
    }
  }
}

export function cleanupStalePatreonTempDirectories(
  tempRoot: string = tmpdir(),
  now: number = Date.now(),
  staleAfterMs: number = STALE_PATREON_TEMP_AGE_MS
): void {
  let entries: Dirent<string>[]
  try {
    entries = readdirSync(tempRoot, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      !PATREON_TEMP_PREFIXES.some((prefix) => entry.name.startsWith(prefix))
    ) {
      continue
    }

    const path = join(tempRoot, entry.name)
    try {
      if (now - statSync(path).mtimeMs < staleAfterMs) {
        continue
      }
      rmSync(path, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 25
      })
    } catch {
      // The OS or a security scanner may still own this directory. Retry on
      // the next launch; the single-instance lock prevents active-job races.
    }
  }
}

export function humanizePatreonLine(line: string): string {
  const clean = stripAnsi(line).toLowerCase()
  if (/ffmpeg|mux|merge|convert|target stream/.test(clean)) {
    return 'Finishing the reaction video...'
  }
  if (/save campaign info|campaign summary|creator|avatar|thumbnail/.test(clean)) {
    return 'Saving creator details...'
  }
  if (/fetch|targeting|checking|request/.test(clean)) {
    return 'Checking access to the Patreon post...'
  }
  if (/download post|create download tasks|download batch created/.test(clean)) {
    return 'Found the post. Preparing its media...'
  }
  if (/download progress|download begin|downloading media/.test(clean)) {
    return 'Downloading reaction media...'
  }
  if (/download complete|batch complete|done downloading|done saving/.test(clean)) {
    return 'Finishing the download...'
  }

  return 'Working through the Patreon post...'
}

export function parsePatreonLogMetadata(line: string): DownloadedReactionMetadata {
  const title = /Download post #\d+\s+\((.+)\)/i.exec(stripAnsi(line))?.[1]?.trim()
  return compactMetadata({ reactionTitle: cleanMetadataValue(title) })
}

export function derivePatreonDownloadMetadata(
  filePath: string,
  loggedTitle?: string
): DownloadedReactionMetadata {
  const ancestry = findPatreonAncestry(filePath)
  const creatorName = ancestry?.campaignRoot
    ? readPatreonCreatorName(ancestry.campaignRoot)
    : undefined
  const campaignFallback = ancestry?.campaignRoot
    ? humanizeCampaignDirectoryName(basename(ancestry.campaignRoot))
    : undefined
  const postFallback = ancestry?.postDirectory
    ? humanizePostDirectoryName(basename(ancestry.postDirectory))
    : undefined
  const fileFallback = cleanMediaFilename(basename(filePath, extname(filePath)))

  return compactMetadata({
    reactionTitle: cleanMetadataValue(loggedTitle) ?? postFallback ?? fileFallback,
    reactorName: creatorName ?? campaignFallback,
    avatarPath: ancestry?.campaignRoot
      ? findPatreonAvatar(ancestry.campaignRoot) ?? undefined
      : undefined
  })
}

export function isAllowedPatreonDownloadUrl(value: string): boolean {
  return canonicalizePatreonPostUrl(value) !== null
}

export { canonicalizePatreonPostUrl } from '@shared/patreonUrls'

function findPatreonAncestry(
  filePath: string
): { campaignRoot: string; postDirectory: string } | null {
  let current = dirname(filePath)
  for (let depth = 0; depth < 12; depth += 1) {
    const parent = dirname(current)
    if (basename(parent).toLowerCase() === 'posts') {
      return { campaignRoot: dirname(parent), postDirectory: current }
    }
    if (parent === current) {
      break
    }
    current = parent
  }
  return null
}

function readPatreonCreatorName(campaignRoot: string): string | undefined {
  const creatorApiPath = join(campaignRoot, 'campaign_info', 'creator-api.json')
  if (!existsSync(creatorApiPath)) {
    return undefined
  }

  try {
    const parsed = JSON.parse(readFileSync(creatorApiPath, 'utf8')) as {
      data?: { attributes?: Record<string, unknown> }
    }
    const attributes = parsed.data?.attributes
    for (const key of ['full_name', 'name', 'vanity']) {
      if (typeof attributes?.[key] === 'string') {
        const value = cleanMetadataValue(attributes[key] as string)
        if (value) {
          return value
        }
      }
    }
  } catch {
    return undefined
  }

  return undefined
}

function findPatreonAvatar(campaignRoot: string): string | null {
  const infoDirectory = join(campaignRoot, 'campaign_info')
  if (!existsSync(infoDirectory)) {
    return null
  }

  const images = readdirSync(infoDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .filter((entry) => avatarFilenameScore(entry.name) > 0)
    .sort(
      (left, right) => avatarFilenameScore(right.name) - avatarFilenameScore(left.name)
    )
  return images[0] ? join(infoDirectory, images[0].name) : null
}

function avatarFilenameScore(filename: string): number {
  const stem = basename(filename, extname(filename)).toLowerCase()
  if (stem === 'avatar') return 100
  if (stem.includes('avatar')) return 80
  if (stem.includes('creator') && stem.includes('thumbnail')) return 60
  if (stem.includes('creator')) return 40
  if (stem.includes('thumbnail')) return 20
  return 0
}

function humanizeCampaignDirectoryName(value: string): string | undefined {
  const pieces = value
    .split(/\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
  const candidate = pieces.at(-1) ?? value
  return cleanMetadataValue(candidate.replace(/^campaign-\d+$/i, ''))
}

function humanizePostDirectoryName(value: string): string | undefined {
  return cleanMetadataValue(value.replace(/^\d+\s+-\s+/, ''))
}
