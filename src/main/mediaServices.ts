import { app, safeStorage } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  BrowserDetection,
  BrowserExtractionMode,
  BrowserName,
  DownloadProgressEvent,
  PatreonSessionSource,
  ReactionDownloadRequest,
  SavedPatreonSessionStatus,
  StartDownloadResult,
  ToolCheckResult,
  ToolName,
  ToolStatus
} from '@shared/types'

type ProgressSink = (event: DownloadProgressEvent) => void
type SpawnDownloadProcess = (
  command: string,
  args: string[],
  options: { windowsHide: boolean }
) => ChildProcessWithoutNullStreams

interface RunningDownload {
  child: ChildProcessWithoutNullStreams
  cookie: string | null
  source: 'youtube' | 'patreon'
}

const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi'])
type ToolExecutableName = Exclude<ToolName, 'patreon-dl'>

interface BrowserDefinition {
  name: BrowserName
  label: string
  paths: string[]
}

const CHROMIUM_BROWSERS = new Set<BrowserName>(['chrome', 'edge', 'brave', 'opera'])

function browserLabelFromName(browserName: BrowserName): string {
  return getBrowserDefinitions().find((browser) => browser.name === browserName)?.label ?? browserName
}

export function getPlatformToolFilename(
  toolName: ToolExecutableName,
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch
): string {
  if (platform === 'win32') {
    return {
      'yt-dlp': 'yt-dlp.exe',
      ffmpeg: 'ffmpeg.exe',
      node: 'node.exe'
    }[toolName]
  }

  if (platform === 'darwin') {
    const darwinArch = arch === 'arm64' ? 'arm64' : 'x64'
    return {
      'yt-dlp': 'yt-dlp_macos',
      ffmpeg: `ffmpeg-darwin-${darwinArch}`,
      node: `node-darwin-${darwinArch}`
    }[toolName]
  }

  return {
    'yt-dlp': 'yt-dlp',
    ffmpeg: 'ffmpeg',
    node: 'node'
  }[toolName]
}

export function getBrowserExtractionMode(
  browserName: BrowserName,
  platform: NodeJS.Platform = process.platform
): BrowserExtractionMode {
  if (browserName === 'firefox') {
    return 'automatic'
  }

  if (platform === 'darwin' && CHROMIUM_BROWSERS.has(browserName)) {
    return 'best-effort'
  }

  return 'manual-only'
}

function getBrowserSubtitle(browserName: BrowserName, platform: NodeJS.Platform): string | undefined {
  const mode = getBrowserExtractionMode(browserName, platform)
  if (mode === 'best-effort') {
    return 'May not work'
  }

  if (browserName === 'safari') {
    return 'Rarely works - manual entry needed'
  }

  if (mode === 'manual-only') {
    return 'Manual entry needed'
  }

  return undefined
}

export function getBrowserDefinitions(
  platform: NodeJS.Platform = process.platform,
  homeDirectory: string = homedir()
): BrowserDefinition[] {
  const appPath = (name: string): string => `/Applications/${name}`
  const userAppPath = (name: string): string => `${homeDirectory}/Applications/${name}`

  if (platform === 'darwin') {
    return [
      { name: 'firefox', label: 'Firefox', paths: [appPath('Firefox.app'), userAppPath('Firefox.app')] },
      { name: 'chrome', label: 'Chrome', paths: [appPath('Google Chrome.app'), userAppPath('Google Chrome.app')] },
      { name: 'edge', label: 'Edge', paths: [appPath('Microsoft Edge.app'), userAppPath('Microsoft Edge.app')] },
      { name: 'brave', label: 'Brave', paths: [appPath('Brave Browser.app'), userAppPath('Brave Browser.app')] },
      {
        name: 'safari',
        label: 'Safari',
        paths: [appPath('Safari.app'), '/System/Applications/Safari.app', userAppPath('Safari.app')]
      },
      { name: 'opera', label: 'Opera', paths: [appPath('Opera.app'), userAppPath('Opera.app')] }
    ]
  }

  return [
    {
      name: 'firefox',
      label: 'Firefox',
      paths: [
        join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Mozilla Firefox\\firefox.exe'),
        join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Mozilla Firefox\\firefox.exe')
      ]
    },
    {
      name: 'chrome',
      label: 'Chrome',
      paths: [
        join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
        join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
        join(process.env.LOCALAPPDATA ?? '', 'Google\\Chrome\\Application\\chrome.exe')
      ]
    },
    {
      name: 'edge',
      label: 'Edge',
      paths: [
        join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
        join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe')
      ]
    },
    {
      name: 'brave',
      label: 'Brave',
      paths: [
        join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
        join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
        join(process.env.LOCALAPPDATA ?? '', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe')
      ]
    },
    { name: 'safari', label: 'Safari', paths: [] },
    {
      name: 'opera',
      label: 'Opera',
      paths: [
        join(process.env.LOCALAPPDATA ?? '', 'Programs\\Opera\\opera.exe'),
        join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Opera\\launcher.exe')
      ]
    }
  ]
}

export class ToolResolver {
  async checkTools(): Promise<ToolCheckResult> {
    const tools = await Promise.all<ToolStatus>([
      this.checkExecutable('yt-dlp', 'yt-dlp', this.getYtDlpPath(), ['--version']),
      this.checkExecutable('ffmpeg', 'FFmpeg', this.getFfmpegPath(), ['-version']),
      this.checkExecutable('node', 'Node runtime', this.getNodePath(), ['--version']),
      this.checkPatreonDl()
    ])

    return {
      ready: tools.every((tool) => tool.ok),
      tools
    }
  }

  getYtDlpPath(): string | null {
    return firstExisting([resourcePath('tools', 'yt-dlp', getPlatformToolFilename('yt-dlp'))])
  }

  getFfmpegPath(): string | null {
    return firstExisting([resourcePath('tools', 'ffmpeg', getPlatformToolFilename('ffmpeg'))])
  }

  getNodePath(): string | null {
    return firstExisting([resourcePath('tools', 'node', getPlatformToolFilename('node'))])
  }

  getPatreonCliPath(): string | null {
    return firstExisting([
      resourcePath('tools', 'patreon-dl', 'bin', 'patreon-dl.js'),
      resourcePath('tools', 'patreon-dl', 'node_modules', 'patreon-dl', 'bin', 'patreon-dl.js')
    ])
  }

  getPatreonDistPath(): string | null {
    const cliPath = this.getPatreonCliPath()
    if (!cliPath) {
      return null
    }

    const distPath = resolve(dirname(cliPath), '..', 'dist', 'cli', 'index.js')
    return existsSync(distPath) ? distPath : null
  }

  private async checkPatreonDl(): Promise<ToolStatus> {
    const cliPath = this.getPatreonCliPath()
    const nodePath = this.getNodePath()
    if (!cliPath) {
      return {
        name: 'patreon-dl',
        label: 'Patreon downloader',
        ok: false,
        path: null,
        message: 'patreon-dl was not found in bundled resources or the local tool clone.'
      }
    }

    if (!nodePath || !this.getPatreonDistPath()) {
      return {
        name: 'patreon-dl',
        label: 'Patreon downloader',
        ok: false,
        path: cliPath,
        message: 'patreon-dl source was found, but its built dist files or Node runtime are missing.'
      }
    }

    const packagePath = resolve(dirname(cliPath), '..', 'package.json')
    const version = readPackageVersion(packagePath)
    return {
      name: 'patreon-dl',
      label: 'Patreon downloader',
      ok: Boolean(version),
      path: cliPath,
      version,
      message: version ? undefined : 'patreon-dl package metadata could not be read.'
    }
  }

  private async checkExecutable(name: ToolName, label: string, filePath: string | null, args: string[]): Promise<ToolStatus> {
    if (!filePath) {
      return {
        name,
        label,
        ok: false,
        path: null,
        message: `${label} was not found.`
      }
    }

    const result = await runVersionCheck(filePath, args, 10000)
    return {
      name,
      label,
      ok: result.ok,
      path: filePath,
      version: result.output.split(/\r?\n/)[0]?.trim(),
      message: result.ok ? undefined : result.output || `${label} could not be started.`
    }
  }
}

export class PatreonSessionVault {
  private readonly tokens = new Map<string, string>()

  constructor(private readonly encryptedCookiePath: string) {}

  createToken(cookie: string): string {
    const token = randomUUID()
    this.tokens.set(token, cookie)
    return token
  }

  resolve(source: PatreonSessionSource): string | null {
    if (source.type === 'browser') {
      return this.tokens.get(source.token) ?? null
    }

    if (source.type === 'token') {
      return this.tokens.get(source.token) ?? null
    }

    if (source.type === 'manual') {
      return sessionIdToCookie(source.sessionId)
    }

    return this.readSavedCookie()
  }

  status(): SavedPatreonSessionStatus {
    return {
      available: Boolean(this.readSavedCookie()),
      canEncrypt: safeStorage.isEncryptionAvailable()
    }
  }

  save(cookie: string): SavedPatreonSessionStatus {
    if (!safeStorage.isEncryptionAvailable()) {
      return this.status()
    }

    mkdirSync(dirname(this.encryptedCookiePath), { recursive: true })
    writeFileSync(this.encryptedCookiePath, safeStorage.encryptString(cookie))
    return this.status()
  }

  forget(): SavedPatreonSessionStatus {
    rmSync(this.encryptedCookiePath, { force: true })
    return this.status()
  }

  private readSavedCookie(): string | null {
    if (!safeStorage.isEncryptionAvailable() || !existsSync(this.encryptedCookiePath)) {
      return null
    }

    try {
      return safeStorage.decryptString(readFileSync(this.encryptedCookiePath))
    } catch {
      return null
    }
  }
}

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
    this.emit(jobId, running.source, 'cancelled', 'Download cancelled.', null)
    this.running.delete(jobId)
  }

  saveLastPatreonSession(jobId: string): SavedPatreonSessionStatus {
    const cookie = this.completedCookies.get(jobId)
    if (cookie) {
      return this.vault.save(cookie)
    }

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
    const args = [cliPath, '--no-prompt', '--log-level', 'info', '--out-dir', downloadDir, '--cookie', cookie]
    const ffmpegPath = this.tools.getFfmpegPath()
    if (ffmpegPath) {
      args.push('--ffmpeg', ffmpegPath)
    }
    args.push(url)

    await this.spawnDownload(jobId, 'patreon', nodePath, args, downloadDir, cookie)
  }

  private async spawnDownload(
    jobId: string,
    source: 'youtube' | 'patreon',
    command: string,
    args: string[],
    downloadDir: string,
    cookie: string | null
  ): Promise<void> {
    this.emit(jobId, source, 'downloading', source === 'youtube' ? 'Downloading reaction video...' : 'Downloading Patreon post...', null)

    const child = this.spawnProcess(command, args, { windowsHide: true })
    this.running.set(jobId, { child, cookie, source })

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

export function canExtractNatively(browserName: BrowserName, platform: NodeJS.Platform = process.platform): boolean {
  return getBrowserExtractionMode(browserName, platform) !== 'manual-only'
}

export function detectBrowsers(
  platform: NodeJS.Platform = process.platform,
  pathExists: (path: string) => boolean = existsSync
): BrowserDetection[] {
  return getBrowserDefinitions(platform).map((browser) => {
    const paths = browser.paths.filter((browserPath) => pathExists(browserPath))
    const extractionMode = getBrowserExtractionMode(browser.name, platform)
    return {
      name: browser.name,
      label: browser.label,
      installed: paths.length > 0,
      extractionSupported: extractionMode !== 'manual-only',
      extractionMode,
      subtitle: getBrowserSubtitle(browser.name, platform),
      paths
    }
  })
}

export async function extractPatreonSession(
  browserName: BrowserName,
  tools: ToolResolver,
  vault: PatreonSessionVault,
  platform: NodeJS.Platform = process.platform
): Promise<{ ok: boolean; token?: string; message?: string }> {
  if (getBrowserExtractionMode(browserName, platform) === 'manual-only') {
    const browserLabel = browserLabelFromName(browserName)
    return {
      ok: false,
      message: `${browserLabel} requires manual Patreon session entry in WatchAlong. Paste your session_id to continue.`
    }
  }

  const ytDlpPath = tools.getYtDlpPath()
  if (!ytDlpPath) {
    return { ok: false, message: 'yt-dlp is required to read browser cookies.' }
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'watchalong-patreon-cookies-'))
  const cookiePath = join(tempDir, 'cookies.txt')
  try {
    const result = await runVersionCheck(ytDlpPath, [
      '--cookies-from-browser',
      browserName,
      '--cookies',
      cookiePath,
      '--skip-download',
      '--simulate',
      'https://www.patreon.com/posts/0'
    ], 30000)

    const cookie = parsePatreonSessionCookie(cookiePath)
    if (!cookie) {
      return {
        ok: false,
        message: humanizeCookieExtractionError(browserName, result.output)
      }
    }

    return { ok: true, token: vault.createToken(cookie) }
  } catch (error) {
    return {
      ok: false,
      message: humanizeCookieExtractionError(
        browserName,
        error instanceof Error ? error.message : 'Could not read browser cookies.'
      )
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

export function parsePatreonSessionCookie(cookiePath: string): string | null {
  if (!existsSync(cookiePath)) {
    return null
  }

  const lines = readFileSync(cookiePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    if (!line || (line.startsWith('#') && !line.startsWith('#HttpOnly_'))) {
      continue
    }

    const cleanLine = line.startsWith('#HttpOnly_') ? line.substring(10) : line
    const parts = cleanLine.split('\t')
    const [domain, , , , , name, value] = parts
    if (domain?.includes('patreon.com') && name === 'session_id' && value) {
      return `session_id=${value}`
    }
  }

  return null
}

export function findPatreonSessionCookieValue(
  cookies: Array<{ name: string; value?: string; domain?: string }>
): string | null {
  const session = cookies.find((cookie) => {
    const domain = cookie.domain?.toLowerCase() ?? ''
    return cookie.name === 'session_id' && Boolean(cookie.value) && (domain === 'patreon.com' || domain.endsWith('.patreon.com'))
  })

  return session?.value ?? null
}

export function sessionIdToCookie(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('session_id=')) {
    return trimmed
  }

  return `session_id=${trimmed}`
}

export function extractPercent(line: string): number | null {
  const match = /(\d+(?:\.\d+)?)%/.exec(line)
  if (!match) {
    return null
  }

  const percent = Number.parseFloat(match[1])
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null
}

function runVersionCheck(command: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { windowsHide: true })
    let output = ''
    let settled = false
    const finish = (ok: boolean, nextOutput = output): void => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)
      resolvePromise({ ok, output: nextOutput })
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(false, `${output}\nTimed out after ${timeoutMs / 1000}s.`.trim())
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.on('error', (error) => finish(false, error.message))
    child.on('close', (code) => finish(code === 0, output))
  })
}

function firstExisting(paths: Array<string | null>): string | null {
  for (const filePath of paths) {
    if (!filePath) {
      continue
    }

    if (filePath.includes('\\') || filePath.includes('/')) {
      if (existsSync(filePath)) {
        return filePath
      }
    } else {
      return filePath
    }
  }

  return null
}

function resourcePath(...parts: string[]): string {
  const resourcesPath = app.isPackaged
    ? ((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? process.cwd())
    : join(process.cwd(), 'resources')
  return join(resourcesPath, ...parts)
}

export function getDefaultReactionDownloadDirectory(): string {
  return join(app.getPath('videos') || homedir(), 'WatchAlong', 'Reactions')
}

function createDownloadDir(source: 'youtube' | 'patreon', preferredRoot: string | null): string {
  const dir = join(preferredRoot ?? getDefaultReactionDownloadDirectory(), source, randomUUID())
  mkdirSync(dir, { recursive: true })
  return dir
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

export function humanizeCookieExtractionError(browserName: BrowserName, output: string): string {
  const browserLabel = browserLabelFromName(browserName)
  if (/could not copy chrome cookie database|file is locked|locked or in use|database is locked/i.test(output)) {
    return `${browserLabel} is blocking cookie access. This is usually caused by browser encryption or a locked database. Use the Patreon sign-in window or paste session_id manually.`
  }

  if (/could not find .*cookies database|No .*cookie|session_id/i.test(output)) {
    return `No Patreon session was found in ${browserLabel}. Make sure you are logged into Patreon in that browser, then try again.`
  }

  return `We could not read your Patreon session from ${browserLabel}. Use the Patreon sign-in window or paste session_id manually.`
}

function readPackageVersion(packagePath: string): string | undefined {
  try {
    const raw = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: unknown }
    return typeof raw.version === 'string' ? raw.version : undefined
  } catch {
    return undefined
  }
}
