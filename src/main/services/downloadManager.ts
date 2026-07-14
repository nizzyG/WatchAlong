import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { rmdirSync } from 'node:fs'
import type {
  DownloadedReactionMetadata,
  DownloadProgressEvent,
  PatreonSessionSource,
  ReactionDownloadRequest,
  SavedPatreonSessionStatus,
  StartDownloadResult
} from '@shared/types'
import {
  createDownloadDir,
  findNewestMediaFile,
  normalizeCompletedPath
} from './downloadFiles'
import {
  BufferedLineReader,
  MAX_DIAGNOSTIC_OUTPUT_LENGTH,
  sanitizeOutput,
  stripAnsi,
  type SpawnDownloadProcess
} from './downloadProcess'
import {
  buildPatreonDownloadArgs,
  canonicalizePatreonPostUrl,
  createPatreonCookieConfig,
  derivePatreonDownloadMetadata,
  humanizePatreonLine,
  isAllowedPatreonDownloadUrl,
  parsePatreonLogMetadata,
  PatreonSessionRetention
} from './patreonDownload'
import { PatreonSessionVault } from './patreonSessionVault'
import { ToolResolver } from './toolResolution'
import {
  buildYouTubeDownloadArgs,
  deriveYouTubeDownloadMetadata,
  formatYtDlpProgressMessage,
  isAllowedYouTubeDownloadUrl,
  parseYtDlpCompletedPath,
  parseYtDlpMetadataLine,
  parseYtDlpProgressLine,
  retrieveYouTubeCreatorAvatar,
  type YouTubeOutputMetadata
} from './youtubeDownload'

export { getDefaultReactionDownloadDirectory } from './downloadFiles'
export { BufferedLineReader } from './downloadProcess'
export {
  canonicalizePatreonPostUrl,
  derivePatreonDownloadMetadata,
  humanizePatreonLine,
  isAllowedPatreonDownloadUrl,
  parsePatreonLogMetadata
} from './patreonDownload'
export {
  extractPercent,
  isAllowedYouTubeAvatarUrl,
  isAllowedYouTubeDownloadUrl,
  parseYtDlpCompletedPath,
  parseYtDlpMetadataLine,
  parseYtDlpProgressLine,
  retrieveYouTubeCreatorAvatar,
  selectYouTubeAvatarThumbnail
} from './youtubeDownload'
export type { ParsedYtDlpProgress, YouTubeThumbnail } from './youtubeDownload'

type ProgressSink = (event: DownloadProgressEvent) => void
type DownloadSource = 'youtube' | 'patreon'

interface RunningDownload {
  child: ChildProcessWithoutNullStreams
  source: DownloadSource
  cleanup?: () => void
}

interface PendingDownload {
  timer: ReturnType<typeof setTimeout>
  source: DownloadSource
  sessionToken?: string
}

export class DownloadManager {
  private readonly running = new Map<string, RunningDownload>()
  private readonly pending = new Map<string, PendingDownload>()
  private readonly cancelledJobs = new Set<string>()
  private readonly patreonSessions = new PatreonSessionRetention()
  private disposed = false

  constructor(
    private readonly tools: ToolResolver,
    private readonly vault: PatreonSessionVault,
    private readonly emitProgress: ProgressSink,
    private readonly getDownloadDirectory: () => string | null = () => null,
    private readonly spawnProcess: SpawnDownloadProcess = spawn
  ) {}

  start(request: ReactionDownloadRequest): StartDownloadResult {
    const jobId = randomUUID()
    const sessionToken = getPatreonSessionToken(request)
    if (this.disposed) {
      if (sessionToken) this.vault.discardToken(sessionToken)
      return { jobId }
    }

    const authorizationEpoch = request.source === 'patreon' ? this.vault.authEpoch : undefined
    const timer = setTimeout(() => {
      this.pending.delete(jobId)
      if (this.disposed) {
        return
      }

      void this.run(jobId, request, authorizationEpoch).catch((error: unknown) => {
        this.running.delete(jobId)
        this.cancelledJobs.delete(jobId)
        const details =
          error instanceof Error ? error.message : 'The download could not be prepared.'
        this.emit(
          jobId,
          request.source,
          'failed',
          'WatchAlong could not prepare the download. Check the download location and try again.',
          null,
          undefined,
          sanitizeOutput(details)
        )
      })
    }, 25)
    this.pending.set(jobId, { timer, source: request.source, sessionToken })
    return { jobId }
  }

  cancel(jobId: string): void {
    const pending = this.pending.get(jobId)
    if (pending) {
      clearTimeout(pending.timer)
      this.pending.delete(jobId)
      if (pending.sessionToken) this.vault.discardToken(pending.sessionToken)
      this.emit(jobId, pending.source, 'cancelled', 'Download cancelled.', null)
      return
    }

    const running = this.running.get(jobId)
    if (!running) {
      return
    }

    this.stopRunningDownload(jobId, running, true)
  }

  cancelAll(): void {
    this.cancelAllInternal(true)
  }

  dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    this.cancelAllInternal(false)
    this.patreonSessions.dispose()
  }

  saveLastPatreonSession(jobId: string): SavedPatreonSessionStatus {
    return this.patreonSessions.save(jobId, this.vault)
  }

  discardLastPatreonSession(jobId: string): SavedPatreonSessionStatus {
    return this.patreonSessions.discard(jobId, this.vault)
  }

  forgetPatreonSession(): SavedPatreonSessionStatus {
    return this.patreonSessions.forget(this.vault)
  }

  private async run(
    jobId: string,
    request: ReactionDownloadRequest,
    authorizationEpoch?: number
  ): Promise<void> {
    this.emit(jobId, request.source, 'checking', 'Checking downloader tools...', null)
    if (request.source === 'youtube') {
      if (!isAllowedYouTubeDownloadUrl(request.url)) {
        this.emit(
          jobId,
          'youtube',
          'failed',
          'Paste a valid YouTube video link and try again.',
          null
        )
        return
      }
      await this.runYouTube(jobId, request.url)
      return
    }

    const canonicalUrl = canonicalizePatreonPostUrl(request.url)
    if (!canonicalUrl) {
      // Invalid renderer input must not leave a bearer token reusable.
      this.vault.resolve(request.sessionSource, authorizationEpoch)
      this.emit(
        jobId,
        'patreon',
        'failed',
        'Paste a valid Patreon post link and try again.',
        null
      )
      return
    }
    await this.runPatreon(
      jobId,
      canonicalUrl,
      request.sessionSource,
      authorizationEpoch,
      this.patreonSessions.generation
    )
  }

  private async runYouTube(jobId: string, url: string): Promise<void> {
    const ytDlpPath = this.tools.getYtDlpPath()
    if (!ytDlpPath) {
      this.emit(
        jobId,
        'youtube',
        'failed',
        'yt-dlp was not found.',
        null,
        undefined,
        'yt-dlp was not found.'
      )
      return
    }

    const downloadDir = createDownloadDir('youtube', this.getDownloadDirectory())
    const args = buildYouTubeDownloadArgs(
      url,
      downloadDir,
      this.tools.getFfmpegPath()
    )
    await this.spawnDownload(jobId, 'youtube', ytDlpPath, args, downloadDir, null)
  }

  private async runPatreon(
    jobId: string,
    url: string,
    sessionSource: PatreonSessionSource,
    authorizationEpoch: number | undefined,
    retentionGeneration: number
  ): Promise<void> {
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
        'Patreon downloader is not ready.',
        { retryWithoutPatreonSignIn: true }
      )
      return
    }

    // Local prerequisites are independent of authentication. Check them before
    // resolving a one-use renderer token so a broken installation or download
    // location never turns a successful OAuth flow into another forced sign-in.
    let downloadDir: string
    try {
      downloadDir = createDownloadDir('patreon', this.getDownloadDirectory())
    } catch (error) {
      const details =
        error instanceof Error ? error.message : 'The download folder could not be prepared.'
      this.emit(
        jobId,
        'patreon',
        'failed',
        'WatchAlong could not use the download location. Choose another folder and try again.',
        null,
        undefined,
        sanitizeOutput(details),
        { retryWithoutPatreonSignIn: true }
      )
      return
    }

    const cookie = this.vault.resolve(sessionSource, authorizationEpoch)
    if (!cookie) {
      try {
        rmdirSync(downloadDir)
      } catch {
        // The unique job directory is empty here; leaving it behind is harmless
        // if another process briefly holds it open.
      }
      this.emit(
        jobId,
        'patreon',
        'failed',
        'A Patreon session is required.',
        null,
        undefined,
        'A Patreon session is required.'
      )
      return
    }

    const cookieConfig = createPatreonCookieConfig(cookie)
    try {
      const args = buildPatreonDownloadArgs(
        cliPath,
        url,
        downloadDir,
        cookieConfig.path,
        this.tools.getFfmpegPath()
      )
      await this.spawnDownload(
        jobId,
        'patreon',
        nodePath,
        args,
        downloadDir,
        cookie,
        cookieConfig.cleanup,
        retentionGeneration
      )
    } catch (error) {
      cookieConfig.cleanup()
      throw error
    }
  }

  private async spawnDownload(
    jobId: string,
    source: DownloadSource,
    command: string,
    args: string[],
    downloadDir: string,
    cookie: string | null,
    cleanup?: () => void,
    patreonRetentionGeneration?: number
  ): Promise<void> {
    this.emit(
      jobId,
      source,
      'downloading',
      source === 'youtube' ? 'Starting the reaction download...' : 'Opening the Patreon post...',
      null
    )

    let cleanupFinished = false
    const cleanupOnce = (): void => {
      if (cleanupFinished) {
        return
      }
      cleanupFinished = true
      try {
        cleanup?.()
      } catch {
        // Cleanup is retried on next startup if the OS still holds a file.
      }
    }

    let child: ChildProcessWithoutNullStreams
    try {
      child = this.spawnProcess(command, args, { windowsHide: true })
    } catch (error) {
      cleanupOnce()
      const message =
        error instanceof Error ? error.message : 'The downloader could not be started.'
      this.emit(jobId, source, 'failed', message, null, undefined, message)
      return
    }

    this.running.set(jobId, { child, source, cleanup: cleanupOnce })

    let lastPath: string | null = null
    let output = ''
    let youtubeMetadata: YouTubeOutputMetadata = {}
    let patreonTitle: string | undefined
    let lastPatreonMessage = source === 'patreon' ? 'Opening the Patreon post...' : undefined
    const stdoutLines = new BufferedLineReader()
    const stderrLines = new BufferedLineReader()

    const consumeLine = (line: string): void => {
      const trimmed = stripAnsi(line).trim()
      if (!trimmed) {
        return
      }

      if (source === 'youtube') {
        const progress = parseYtDlpProgressLine(trimmed)
        if (progress) {
          this.emit(
            jobId,
            source,
            'downloading',
            formatYtDlpProgressMessage(progress),
            progress.percent,
            undefined,
            undefined,
            progress
          )
          return
        }

        const metadata = parseYtDlpMetadataLine(trimmed)
        if (metadata) {
          youtubeMetadata = { ...youtubeMetadata, ...metadata }
          return
        }

        const completedPath = parseYtDlpCompletedPath(trimmed)
        if (completedPath) {
          lastPath = completedPath
        }
        return
      }

      const logMetadata = parsePatreonLogMetadata(trimmed)
      if (logMetadata.reactionTitle) {
        patreonTitle = logMetadata.reactionTitle
      }
      const message = humanizePatreonLine(trimmed)
      if (message === 'Working through the Patreon post...' && lastPatreonMessage) {
        return
      }
      if (message !== lastPatreonMessage) {
        lastPatreonMessage = message
        this.emit(jobId, source, 'downloading', message, null)
      }
    }

    const onText = (reader: BufferedLineReader, chunk: Buffer | string): void => {
      const text = chunk.toString()
      output = `${output}${text}`.slice(-MAX_DIAGNOSTIC_OUTPUT_LENGTH)
      for (const line of reader.push(text)) {
        consumeLine(line)
      }
    }

    child.stdout.on('data', (chunk: Buffer | string) => onText(stdoutLines, chunk))
    child.stderr.on('data', (chunk: Buffer | string) => onText(stderrLines, chunk))

    await new Promise<void>((resolvePromise) => {
      let settled = false
      const flushLines = (): void => {
        for (const line of [...stdoutLines.flush(), ...stderrLines.flush()]) {
          consumeLine(line)
        }
      }
      const finish = (callback: () => void | Promise<void>): void => {
        if (settled) {
          return
        }

        settled = true
        flushLines()
        cleanupOnce()
        void Promise.resolve()
          .then(callback)
          .catch((error: unknown) => {
            const wasCancelled = this.cancelledJobs.delete(jobId)
            this.running.delete(jobId)
            if (!wasCancelled) {
              const message =
                error instanceof Error ? error.message : 'The download could not be finished.'
              this.emit(jobId, source, 'failed', message, null, undefined, message)
            }
          })
          .finally(resolvePromise)
      }

      child.on('close', (code) => {
        finish(async () => {
          const wasCancelled = this.cancelledJobs.delete(jobId)
          if (wasCancelled) {
            this.running.delete(jobId)
            return
          }

          if (code === 0) {
            const filePath = normalizeCompletedPath(lastPath, downloadDir) ?? findNewestMediaFile(downloadDir)
            if (!filePath) {
              this.running.delete(jobId)
              this.emit(
                jobId,
                source,
                'failed',
                'No playable video file was found in the download.',
                null,
                undefined,
                sanitizeOutput(output)
              )
              return
            }

            let metadata: DownloadedReactionMetadata
            if (source === 'youtube') {
              metadata = deriveYouTubeDownloadMetadata(filePath, youtubeMetadata)
            } else {
              metadata = derivePatreonDownloadMetadata(filePath, patreonTitle)
            }

            if (this.cancelledJobs.delete(jobId)) {
              this.running.delete(jobId)
              return
            }
            this.running.delete(jobId)
            if (source === 'patreon' && cookie && patreonRetentionGeneration !== undefined) {
              this.patreonSessions.hold(jobId, cookie, patreonRetentionGeneration)
            }

            this.emit(
              jobId,
              source,
              'success',
              'Reaction video ready.',
              source === 'youtube' ? 100 : null,
              filePath,
              undefined,
              { metadata }
            )
            if (source === 'youtube' && youtubeMetadata.channelUrl) {
              // Creator art is decorative and best-effort. Never hold up the
              // saved-session/autosync handoff for an extra network request.
              void retrieveYouTubeCreatorAvatar(
                youtubeMetadata.channelUrl,
                filePath,
                command,
                this.spawnProcess
              )
            }
            return
          }

          const message =
            source === 'youtube'
              ? 'This video could not be downloaded. It may be private or restricted.'
              : 'The Patreon post could not be downloaded. Check the subscription or session and try again.'
          this.running.delete(jobId)
          this.emit(jobId, source, 'failed', message, null, undefined, sanitizeOutput(output))
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
    source: DownloadSource,
    state: DownloadProgressEvent['state'],
    message: string,
    percent: number | null,
    filePath?: string,
    error?: string,
    details: Partial<
      Pick<
        DownloadProgressEvent,
        | 'speed'
        | 'eta'
        | 'fragmentIndex'
        | 'fragmentCount'
        | 'metadata'
        | 'retryWithoutPatreonSignIn'
      >
    > = {}
  ): void {
    this.emitProgress({ jobId, source, state, message, percent, filePath, error, ...details })
  }

  private cancelAllInternal(emitCancelled: boolean): void {
    for (const [jobId, pending] of this.pending) {
      clearTimeout(pending.timer)
      if (pending.sessionToken) this.vault.discardToken(pending.sessionToken)
      if (emitCancelled) {
        this.emit(jobId, pending.source, 'cancelled', 'Download cancelled.', null)
      }
    }
    this.pending.clear()

    for (const [jobId, running] of [...this.running]) {
      this.stopRunningDownload(jobId, running, emitCancelled)
    }
  }

  private stopRunningDownload(
    jobId: string,
    running: RunningDownload,
    emitCancelled: boolean
  ): void {
    this.cancelledJobs.add(jobId)
    try {
      running.child.kill()
    } catch {
      // The process may already have exited between the map read and kill().
    }

    try {
      running.cleanup?.()
    } catch {
      // Cleanup is best effort here and is also covered by stale-temp cleanup.
    }
    this.patreonSessions.clear(jobId)
    if (emitCancelled) {
      this.emit(jobId, running.source, 'cancelled', 'Download cancelled.', null)
    }
    this.running.delete(jobId)
  }
}

function getPatreonSessionToken(request: ReactionDownloadRequest): string | undefined {
  if (request.source !== 'patreon') return undefined
  return request.sessionSource.type === 'browser' || request.sessionSource.type === 'token'
    ? request.sessionSource.token
    : undefined
}
