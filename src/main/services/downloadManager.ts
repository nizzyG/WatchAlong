import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import type { DownloadProgressEvent, PatreonSessionSource, ReactionDownloadRequest, SavedPatreonSessionStatus, StartDownloadResult } from '@shared/types'
import { PatreonSessionVault } from './patreonSessionVault'
import { ToolResolver } from './toolResolution'

type ProgressSink = (event: DownloadProgressEvent) => void
type SpawnDownloadProcess = (
  command: string,
  args: string[],
  options: { windowsHide: boolean }
) => ChildProcessWithoutNullStreams

interface RunningDownload {
  child: ChildProcessWithoutNullStreams
  source: 'youtube' | 'patreon'
  cleanup?: () => void
}

const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi'])

export class DownloadManager {
  private readonly running = new Map<string, RunningDownload>()
  private readonly completedCookies = new Map<string, string>()
  private readonly cancelledJobs = new Set<string>()

  constructor(
    private readonly tools: ToolResolver,
    private readonly vault: PatreonSessionVault,
    private readonly emitProgress: ProgressSink,
    private readonly getDownloadDirectory: () => string | null = () => null,
    private readonly spawnProcess: SpawnDownloadProcess = spawn
  ) {}

  start(request: ReactionDownloadRequest): StartDownloadResult {
    const jobId = randomUUID()
    setTimeout(() => void this.run(jobId, request), 25)
    return { jobId }
  }

  cancel(jobId: string): void {
    const running = this.running.get(jobId)
    if (!running) {
      return
    }

    this.cancelledJobs.add(jobId)
    running.child.kill()
    running.cleanup?.()
    this.completedCookies.delete(jobId)
    this.emit(jobId, running.source, 'cancelled', 'Download cancelled.', null)
    this.running.delete(jobId)
  }

  saveLastPatreonSession(jobId: string): SavedPatreonSessionStatus {
    const cookie = this.completedCookies.get(jobId)
    if (cookie) {
      try {
        return this.vault.save(cookie)
      } finally {
        this.completedCookies.delete(jobId)
      }
    }

    return this.vault.status()
  }

  discardLastPatreonSession(jobId: string): SavedPatreonSessionStatus {
    this.completedCookies.delete(jobId)
    return this.vault.status()
  }

  private async run(jobId: string, request: ReactionDownloadRequest): Promise<void> {
    this.emit(jobId, request.source, 'checking', 'Checking downloader tools...', null)
    if (request.source === 'youtube') {
      await this.runYouTube(jobId, request.url)
    } else {
      await this.runPatreon(jobId, request.url, request.sessionSource)
    }
  }

  private async runYouTube(jobId: string, url: string): Promise<void> {
    const ytDlpPath = this.tools.getYtDlpPath()
    if (!ytDlpPath) {
      this.emit(jobId, 'youtube', 'failed', 'yt-dlp was not found.', null, undefined, 'yt-dlp was not found.')
      return
    }

    const downloadDir = createDownloadDir('youtube', this.getDownloadDirectory())
    const args = [
      '--no-playlist',
      '--newline',
      '--progress',
      '--progress-template',
      'download:%(progress._percent_str)s',
      '--print',
      'after_move:filepath',
      '-P',
      downloadDir,
      '-o',
      '%(title).180B [%(id)s].%(ext)s',
      '-f',
      'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best',
      '--merge-output-format',
      'mp4'
    ]

    const ffmpegPath = this.tools.getFfmpegPath()
    if (ffmpegPath) {
      args.push('--ffmpeg-location', ffmpegPath)
    }

    args.push(url)
    await this.spawnDownload(jobId, 'youtube', ytDlpPath, args, downloadDir, null)
  }

  private async runPatreon(jobId: string, url: string, source: PatreonSessionSource): Promise<void> {
    const cliPath = this.tools.getPatreonCliPath()
    const nodePath = this.tools.getNodePath()
    if (!cliPath || !nodePath || !this.tools.getPatreonDistPath()) {
      this.emit(
        jobId,
        'patreon',
        'failed',
        'Patreon downloader is not ready.',
        null,
        undefined,
        'Patreon downloader is not ready.'
      )
      return
    }

    const cookie = this.vault.resolve(source)
    if (!cookie) {
      this.emit(jobId, 'patreon', 'failed', 'A Patreon session is required.', null, undefined, 'A Patreon session is required.')
      return
    }

    const downloadDir = createDownloadDir('patreon', this.getDownloadDirectory())
    const cookieConfig = createPatreonCookieConfig(cookie)
    const args = [cliPath, '--no-prompt', '--log-level', 'info', '--out-dir', downloadDir, '--config-file', cookieConfig.path]
    const ffmpegPath = this.tools.getFfmpegPath()
    if (ffmpegPath) {
      args.push('--ffmpeg', ffmpegPath)
    }
    args.push(url)

    await this.spawnDownload(jobId, 'patreon', nodePath, args, downloadDir, cookie, cookieConfig.cleanup)
  }

  private async spawnDownload(
    jobId: string,
    source: 'youtube' | 'patreon',
    command: string,
    args: string[],
    downloadDir: string,
    cookie: string | null,
    cleanup?: () => void
  ): Promise<void> {
    this.emit(jobId, source, 'downloading', source === 'youtube' ? 'Downloading reaction video...' : 'Downloading Patreon post...', null)

    const child = this.spawnProcess(command, args, { windowsHide: true })
    this.running.set(jobId, { child, source, cleanup })

    let lastPath: string | null = null
    let output = ''

    const onText = (chunk: Buffer): void => {
      const text = chunk.toString()
      output += text
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed) {
          continue
        }

        const percent = extractPercent(trimmed)
        if (percent !== null) {
          this.emit(jobId, source, 'downloading', `Downloading... ${Math.round(percent)}%`, percent)
          continue
        }

        if (looksLikeVideoPath(trimmed)) {
          lastPath = trimmed
        } else if (source === 'patreon' && !trimmed.toLowerCase().includes('cookie')) {
          this.emit(jobId, source, 'downloading', humanizePatreonLine(trimmed), null)
        }
      }
    }

    child.stdout.on('data', onText)
    child.stderr.on('data', onText)

    await new Promise<void>((resolvePromise) => {
      let settled = false
      const finish = (callback: () => void): void => {
        if (settled) {
          return
        }

        settled = true
        cleanup?.()
        callback()
        resolvePromise()
      }

      child.on('close', (code) => {
        finish(() => {
          const wasCancelled = this.cancelledJobs.delete(jobId)
          this.running.delete(jobId)
          if (wasCancelled) {
            return
          }

          if (code === 0) {
            const filePath = normalizeCompletedPath(lastPath) ?? findNewestMediaFile(downloadDir)
            if (filePath) {
              if (source === 'patreon' && cookie) {
                this.completedCookies.set(jobId, cookie)
              }
              this.emit(jobId, source, 'success', 'Reaction video ready.', 100, filePath)
            } else {
              this.emit(jobId, source, 'failed', 'No playable video file was found in the download.', null, undefined, sanitizeOutput(output))
            }
          } else if (code !== null) {
            const message =
              source === 'youtube'
                ? 'This video could not be downloaded. It may be private or restricted.'
                : 'The Patreon post could not be downloaded. Check the subscription or session and try again.'
            this.emit(jobId, source, 'failed', message, null, undefined, sanitizeOutput(output))
          }
        })
      })

      child.on('error', (error) => {
        finish(() => {
          const wasCancelled = this.cancelledJobs.delete(jobId)
          this.running.delete(jobId)
          if (!wasCancelled) {
            this.emit(jobId, source, 'failed', error.message, null, undefined, error.message)
          }
        })
      })
    })
  }

  private emit(
    jobId: string,
    source: 'youtube' | 'patreon',
    state: DownloadProgressEvent['state'],
    message: string,
    percent: number | null,
    filePath?: string,
    error?: string
  ): void {
    this.emitProgress({ jobId, source, state, message, percent, filePath, error })
  }
}

export function extractPercent(line: string): number | null {
  const match = /(\d+(?:\.\d+)?)%/.exec(line)
  if (!match) {
    return null
  }

  const percent = Number.parseFloat(match[1])
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null
}

export function getDefaultReactionDownloadDirectory(): string {
  return join(app.getPath('videos') || homedir(), 'WatchAlong', 'Reactions')
}

function createDownloadDir(source: 'youtube' | 'patreon', preferredRoot: string | null): string {
  const dir = join(preferredRoot ?? getDefaultReactionDownloadDirectory(), source, randomUUID())
  mkdirSync(dir, { recursive: true })
  return dir
}

function createPatreonCookieConfig(cookie: string): { path: string; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), 'watchalong-patreon-dl-'))
  const configPath = join(tempDir, 'patreon-dl.conf')
  const singleLineCookie = cookie.replace(/[\r\n]/g, '')

  try {
    writeFileSync(configPath, `[downloader]\ncookie = "${singleLineCookie}"\n`, { encoding: 'utf8', mode: 0o600 })
    chmodSync(configPath, 0o600)
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true })
    throw error
  }

  return {
    path: configPath,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true })
  }
}

function findNewestMediaFile(root: string): string | null {
  if (!existsSync(root)) {
    return null
  }

  const files: Array<{ path: string; mtime: number; size: number }> = []
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const entryPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(entryPath)
      } else if (VIDEO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        const stats = statSync(entryPath)
        files.push({ path: entryPath, mtime: stats.mtimeMs, size: stats.size })
      }
    }
  }

  visit(root)
  return files.sort((a, b) => b.size - a.size || b.mtime - a.mtime)[0]?.path ?? null
}

function looksLikeVideoPath(line: string): boolean {
  return VIDEO_EXTENSIONS.has(extname(line).toLowerCase()) && (line.includes('\\') || line.includes('/'))
}

function normalizeCompletedPath(filePath: string | null): string | null {
  if (!filePath) {
    return null
  }

  const trimmed = filePath.trim()
  return existsSync(trimmed) ? trimmed : null
}

function humanizePatreonLine(line: string): string {
  const withoutAnsi = line.replace(/\x1b\[[0-9;]*m/g, '')
  if (withoutAnsi.length <= 96) {
    return withoutAnsi
  }

  return `${withoutAnsi.slice(0, 93)}...`
}

function sanitizeOutput(output: string): string {
  return output.replace(/session_id=[^;\s]+/g, 'session_id=[redacted]')
}
