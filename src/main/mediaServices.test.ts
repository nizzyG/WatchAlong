import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DownloadProgressEvent } from '@shared/types'
import { cleanupStalePatreonTempDirectories } from './services/patreonDownload'
import {
  canExtractNatively,
  BufferedLineReader,
  detectBrowsers,
  derivePatreonDownloadMetadata,
  DownloadManager,
  extractPatreonSession,
  findPatreonSessionCookieValue,
  getBrowserExtractionMode,
  getPlatformToolFilename,
  humanizePatreonLine,
  humanizeCookieExtractionError,
  isAllowedPatreonDownloadUrl,
  isAllowedYouTubeAvatarUrl,
  isAllowedYouTubeDownloadUrl,
  parsePatreonLogMetadata,
  parseFfprobeFrameRate,
  parsePatreonSessionCookie,
  parseYtDlpCompletedPath,
  parseYtDlpMetadataLine,
  parseYtDlpProgressLine,
  PatreonSessionVault,
  retrieveYouTubeCreatorAvatar,
  selectYouTubeAvatarThumbnail,
  ToolResolver
} from './mediaServices'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => process.cwd()
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString('utf8')
  }
}))

describe('media services', () => {
  describe('PatreonSessionVault', () => {
    it('uses extracted session tokens once and clears unused tokens when forgotten', () => {
      const root = mkdtempSync(join(tmpdir(), 'watchalong-vault-test-'))
      try {
        const vault = new PatreonSessionVault(join(root, 'patreon-session.bin'))
        const firstToken = vault.createToken('session_id=one-time')

        expect(vault.resolve({ type: 'token', token: firstToken })).toBe('session_id=one-time')
        expect(vault.resolve({ type: 'token', token: firstToken })).toBeNull()

        const forgottenToken = vault.createToken('session_id=forget-me')
        const staleEpoch = vault.authEpoch
        vault.forget()
        expect(vault.resolve({ type: 'browser', browser: 'firefox', token: forgottenToken })).toBeNull()
        expect(vault.createToken('session_id=finished-too-late', staleEpoch)).toBeNull()
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('expires unused renderer-visible authentication tokens', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-13T00:00:00.000Z'))
      const root = mkdtempSync(join(tmpdir(), 'watchalong-vault-expiry-test-'))
      try {
        const vault = new PatreonSessionVault(join(root, 'patreon-session.bin'))
        const token = vault.createToken('session_id=short-lived')

        vi.advanceTimersByTime(10 * 60 * 1000 + 1)

        expect((vault as unknown as { tokens: Map<string, unknown> }).tokens.size).toBe(0)
        expect(vault.resolve({ type: 'token', token })).toBeNull()
      } finally {
        vi.useRealTimers()
        rmSync(root, { recursive: true, force: true })
      }
    })
  })

  describe('download URL boundaries', () => {
    it('accepts only secure first-party video and post links', () => {
      expect(isAllowedYouTubeDownloadUrl('https://www.youtube.com/watch?v=abc')).toBe(true)
      expect(isAllowedYouTubeDownloadUrl('https://youtu.be/abc')).toBe(true)
      expect(isAllowedYouTubeDownloadUrl('https://youtube.com.evil.test/watch?v=abc')).toBe(false)
      expect(isAllowedYouTubeDownloadUrl('http://www.youtube.com/watch?v=abc')).toBe(false)
      expect(isAllowedYouTubeDownloadUrl('https://user@www.youtube.com/watch?v=abc')).toBe(false)

      expect(isAllowedPatreonDownloadUrl('https://www.patreon.com/posts/example-123')).toBe(true)
      expect(isAllowedPatreonDownloadUrl('https://creator.patreon.com/posts/example-123')).toBe(true)
      expect(isAllowedPatreonDownloadUrl('https://www.patreon.com/home')).toBe(false)
      expect(isAllowedPatreonDownloadUrl('https://patreon.com.evil.test/posts/example-123')).toBe(false)
    })

    it('allows creator images only from secure YouTube image hosts', () => {
      expect(isAllowedYouTubeAvatarUrl('https://yt3.googleusercontent.com/avatar.jpg')).toBe(true)
      expect(isAllowedYouTubeAvatarUrl('https://yt3.ggpht.com/avatar.jpg')).toBe(true)
      expect(isAllowedYouTubeAvatarUrl('https://example.com/avatar.jpg')).toBe(false)
      expect(isAllowedYouTubeAvatarUrl('http://yt3.googleusercontent.com/avatar.jpg')).toBe(false)
    })
  })

  describe('getPlatformToolFilename', () => {
    it('uses Windows bundled executable names', () => {
      expect(getPlatformToolFilename('yt-dlp', 'win32')).toBe('yt-dlp.exe')
      expect(getPlatformToolFilename('ffmpeg', 'win32')).toBe('ffmpeg.exe')
      expect(getPlatformToolFilename('ffprobe', 'win32')).toBe('ffprobe.exe')
      expect(getPlatformToolFilename('node', 'win32')).toBe('node.exe')
    })

    it('uses macOS bundled executable names by architecture', () => {
      expect(getPlatformToolFilename('yt-dlp', 'darwin')).toBe('yt-dlp_macos')
      expect(getPlatformToolFilename('ffmpeg', 'darwin', 'arm64')).toBe('ffmpeg-darwin-arm64')
      expect(getPlatformToolFilename('ffmpeg', 'darwin', 'x64')).toBe('ffmpeg-darwin-x64')
      expect(getPlatformToolFilename('ffprobe', 'darwin', 'arm64')).toBe('ffprobe-darwin-arm64')
      expect(getPlatformToolFilename('ffprobe', 'darwin', 'x64')).toBe('ffprobe-darwin-x64')
      expect(getPlatformToolFilename('node', 'darwin', 'arm64')).toBe('node-darwin-arm64')
      expect(getPlatformToolFilename('node', 'darwin', 'x64')).toBe('node-darwin-x64')
    })
  })

  describe('parseFfprobeFrameRate', () => {
    it('parses and rounds ffprobe frame-rate fractions', () => {
      expect(parseFfprobeFrameRate('25/1')).toBe(25)
      expect(parseFfprobeFrameRate('24000/1001')).toBe(23.976)
      expect(parseFfprobeFrameRate('30000/1001')).toBe(29.97)
      expect(parseFfprobeFrameRate('24/1')).toBe(24)
    })

    it('returns null for missing or unparseable frame-rate output', () => {
      expect(parseFfprobeFrameRate('')).toBeNull()
      expect(parseFfprobeFrameRate('garbage')).toBeNull()
      expect(parseFfprobeFrameRate('0/0')).toBeNull()
    })
  })

  describe('ToolResolver', () => {
    it('locates the reproducibly installed Patreon downloader CLI and dist files', () => {
      const resolver = new ToolResolver()

      expect(resolver.getPatreonCliPath()?.replace(/\\/g, '/')).toMatch(
        /resources\/tools\/patreon-dl\/node_modules\/patreon-dl\/bin\/patreon-dl\.js$/
      )
      expect(resolver.getPatreonDistPath()?.replace(/\\/g, '/')).toMatch(
        /resources\/tools\/patreon-dl\/node_modules\/patreon-dl\/dist\/cli\/index\.js$/
      )
    })
  })

  describe('canExtractNatively', () => {
    it('returns true for firefox', () => {
      expect(canExtractNatively('firefox')).toBe(true)
    })

    it('keeps Windows chromium browsers manual-only', () => {
      expect(canExtractNatively('chrome', 'win32')).toBe(false)
      expect(canExtractNatively('edge', 'win32')).toBe(false)
      expect(canExtractNatively('brave', 'win32')).toBe(false)
      expect(canExtractNatively('opera', 'win32')).toBe(false)
    })

    it('allows macOS chromium browsers as best-effort extraction targets', () => {
      expect(canExtractNatively('chrome', 'darwin')).toBe(true)
      expect(getBrowserExtractionMode('chrome', 'darwin')).toBe('best-effort')
      expect(getBrowserExtractionMode('firefox', 'darwin')).toBe('automatic')
      expect(getBrowserExtractionMode('safari', 'darwin')).toBe('manual-only')
    })
  })

  describe('detectBrowsers', () => {
    it('reports macOS browser policy metadata', () => {
      const browsers = detectBrowsers('darwin', (browserPath) =>
        browserPath === '/Applications/Firefox.app' ||
        browserPath === '/Applications/Google Chrome.app' ||
        browserPath === '/Applications/Safari.app'
      )

      expect(browsers.map((browser) => browser.name)).toEqual(['firefox', 'chrome', 'edge', 'brave', 'safari', 'opera'])
      expect(browsers.find((browser) => browser.name === 'firefox')).toMatchObject({
        installed: true,
        extractionMode: 'automatic',
        extractionSupported: true,
        subtitle: undefined
      })
      expect(browsers.find((browser) => browser.name === 'chrome')).toMatchObject({
        installed: true,
        extractionMode: 'best-effort',
        extractionSupported: true,
        subtitle: 'May not work'
      })
      expect(browsers.find((browser) => browser.name === 'safari')).toMatchObject({
        installed: true,
        extractionMode: 'manual-only',
        extractionSupported: false,
        subtitle: 'Rarely works - manual entry needed'
      })
    })

    it('reports Windows chromium browsers as manual-only', () => {
      const browsers = detectBrowsers('win32', (browserPath) => browserPath.endsWith('chrome.exe'))
      expect(browsers.find((browser) => browser.name === 'chrome')).toMatchObject({
        installed: true,
        extractionMode: 'manual-only',
        extractionSupported: false,
        subtitle: 'Manual entry needed'
      })
    })
  })

  describe('extractPatreonSession', () => {
    it('does not request yt-dlp for manual-only browsers', async () => {
      const result = await extractPatreonSession(
        'safari',
        {
          getYtDlpPath: () => {
            throw new Error('yt-dlp should not be requested')
          }
        } as never,
        {
          createToken: () => {
            throw new Error('no token should be created')
          }
        } as never,
        'darwin'
      )

      expect(result.ok).toBe(false)
      expect(result.message).toContain('Safari')
      expect(result.message).toContain('manual')
    })

    it('does not mint a token when Forget is pressed during browser extraction', async () => {
      const root = mkdtempSync(join(tmpdir(), 'watchalong-extraction-epoch-test-'))
      try {
        const vault = new PatreonSessionVault(join(root, 'patreon-session.bin'))
        const result = await extractPatreonSession(
          'firefox',
          { getYtDlpPath: () => 'yt-dlp' } as ToolResolver,
          vault,
          'win32',
          async (_command, args) => {
            const cookiePath = valueAfter(args, '--cookies')
            writeFileSync(
              cookiePath,
              '.patreon.com\tTRUE\t/\tTRUE\t1234567890\tsession_id\tlate-session\n'
            )
            vault.forget()
            return { ok: true, output: '' }
          }
        )

        expect(result).toEqual({
          ok: false,
          message: 'Patreon sign-in was cancelled before browser access finished.'
        })
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
  })

  describe('Patreon temporary files', () => {
    it('removes old crash leftovers without touching unrelated temp folders', () => {
      const root = mkdtempSync(join(tmpdir(), 'watchalong-stale-temp-test-'))
      try {
        const configLeftover = join(root, 'watchalong-patreon-dl-old')
        const extractionLeftover = join(root, 'watchalong-patreon-cookies-old')
        const unrelated = join(root, 'another-app-temp')
        mkdirSync(configLeftover)
        mkdirSync(extractionLeftover)
        mkdirSync(unrelated)

        cleanupStalePatreonTempDirectories(root, Date.now() + 1_000, 0)

        expect(existsSync(configLeftover)).toBe(false)
        expect(existsSync(extractionLeftover)).toBe(false)
        expect(existsSync(unrelated)).toBe(true)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
  })

  describe('humanizeCookieExtractionError', () => {
    it('maps locked Brave cookie database errors to guided copy', () => {
      expect(humanizeCookieExtractionError('brave', 'ERROR: Could not copy Chrome cookie database')).toContain(
        'Patreon sign-in window'
      )
    })

    it('maps missing cookie database errors to guided copy', () => {
      const message = humanizeCookieExtractionError('firefox', 'No readable cookie session_id found')
      expect(message).toContain('Firefox')
      expect(message).toContain('logged into Patreon')
    })

    it('provides a generic fallback message for unknown errors', () => {
      const message = humanizeCookieExtractionError('edge', 'Something unexpected happened')
      expect(message).toContain('Edge')
      expect(message).toContain('session_id')
    })
  })

  describe('findPatreonSessionCookieValue', () => {
    it('reads Patreon session cookies from root or subdomain cookies', () => {
      expect(
        findPatreonSessionCookieValue([
          { name: 'session_id', value: 'root-session', domain: 'patreon.com' },
          { name: 'other', value: 'nope', domain: '.patreon.com' }
        ])
      ).toBe('root-session')

      expect(
        findPatreonSessionCookieValue([
          { name: 'session_id', value: 'www-session', domain: '.www.patreon.com' }
        ])
      ).toBe('www-session')
    })

    it('ignores non-Patreon session_id cookies', () => {
      expect(
        findPatreonSessionCookieValue([
          { name: 'session_id', value: 'wrong-site', domain: '.example.com' }
        ])
      ).toBeNull()
    })
  })

  describe('parsePatreonSessionCookie', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const os = require('node:os')
    
    let tempDir: string
    
    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cookie-test-'))
    })
    
    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true })
    })

    it('parses normal session_id cookies', () => {
      const mockCookieFile = path.join(tempDir, 'cookies1.txt')
      fs.writeFileSync(mockCookieFile, '.patreon.com\tTRUE\t/\tFALSE\t1234567890\tsession_id\tnormal-session-123\n')
      expect(parsePatreonSessionCookie(mockCookieFile)).toBe('session_id=normal-session-123')
    })

    it('parses HttpOnly session_id cookies (with #HttpOnly_ prefix)', () => {
      const mockCookieFile = path.join(tempDir, 'cookies2.txt')
      fs.writeFileSync(mockCookieFile, '#HttpOnly_.patreon.com\tTRUE\t/\tTRUE\t1234567890\tsession_id\thttponly-session-123\n')
      expect(parsePatreonSessionCookie(mockCookieFile)).toBe('session_id=httponly-session-123')
    })

    it('skips comment lines', () => {
      const mockCookieFile = path.join(tempDir, 'cookies3.txt')
      fs.writeFileSync(mockCookieFile, '# Netscape HTTP Cookie File\n# https://curl.haxx.se/rfc/cookie_spec.html\n.patreon.com\tTRUE\t/\tFALSE\t1234567890\tsession_id\tnormal-session-123\n')
      expect(parsePatreonSessionCookie(mockCookieFile)).toBe('session_id=normal-session-123')
    })

    it('rejects lookalike Patreon cookie domains', () => {
      const mockCookieFile = path.join(tempDir, 'cookies4.txt')
      fs.writeFileSync(mockCookieFile, '.patreon.com.attacker.example\tTRUE\t/\tFALSE\t1234567890\tsession_id\tstolen-session\n')
      expect(parsePatreonSessionCookie(mockCookieFile)).toBeNull()
    })
  })

  describe('download output parsing', () => {
    it('buffers partial stdout and stderr chunks without inventing lines', () => {
      const reader = new BufferedLineReader()

      expect(reader.push('WA_PROGRESS\t 4')).toEqual([])
      expect(reader.push('2.5%\t3.2MiB/s\r')).toEqual(['WA_PROGRESS\t 42.5%\t3.2MiB/s'])
      expect(reader.push('\nWA_FILE\t"C:\\\\reaction')).toEqual([])
      expect(reader.push('.mp4"')).toEqual([])
      expect(reader.flush()).toEqual(['WA_FILE\t"C:\\\\reaction.mp4"'])
      expect(reader.flush()).toEqual([])
    })

    it('parses only tagged yt-dlp progress with real speed, ETA, and fragment context', () => {
      expect(parseYtDlpProgressLine('[download] 99.8% of 1GiB')).toBeNull()
      expect(parseYtDlpProgressLine('WA_PROGRESS\t 42.5%\t3.2MiB/s\t00:18\t3\t12')).toEqual({
        percent: 42.5,
        speed: '3.2MiB/s',
        eta: '00:18',
        fragmentIndex: 3,
        fragmentCount: 12
      })
      expect(parseYtDlpProgressLine('WA_PROGRESS\tNA\tNA\tUnknown\tNA\tNA')).toEqual({ percent: null })
    })

    it('parses JSON-escaped yt-dlp metadata and completed paths', () => {
      expect(
        parseYtDlpMetadataLine(
          'WA_METADATA\t"X-Men\\tReaction"\t"Cinema Crew"\t"Uploader fallback"\t"https://youtube.com/@cinema"\tnull'
        )
      ).toEqual({
        reactionTitle: 'X-Men Reaction',
        reactorName: 'Cinema Crew',
        channelUrl: 'https://youtube.com/@cinema'
      })
      expect(parseYtDlpCompletedPath('WA_FILE\t"C:\\\\Videos\\\\reaction.mp4"')).toBe('C:\\Videos\\reaction.mp4')
    })

    it('keeps Patreon phases honest and extracts only descriptive metadata', () => {
      const line = 'Download progress (#1.2): 90 / 100 MBs / 90% (400 kB/s)'
      expect(humanizePatreonLine(line)).toBe('Downloading reaction media...')
      expect(parsePatreonLogMetadata('Download post #123 (X-Men: The Reaction)')).toEqual({
        reactionTitle: 'X-Men: The Reaction'
      })
    })

    it('derives Patreon title, creator, and existing avatar from its downloaded layout', () => {
      const root = mkdtempSync(join(tmpdir(), 'watchalong-patreon-metadata-'))
      try {
        const campaignRoot = join(root, 'camillas-corner - Camilla Corner')
        const infoDir = join(campaignRoot, 'campaign_info')
        const videoDir = join(campaignRoot, 'posts', '123 - X-Men Reaction', 'video')
        mkdirSync(infoDir, { recursive: true })
        mkdirSync(videoDir, { recursive: true })
        writeFileSync(
          join(infoDir, 'creator-api.json'),
          JSON.stringify({ data: { attributes: { full_name: 'Camilla' } } })
        )
        writeFileSync(join(infoDir, 'avatar.jpg'), 'avatar')
        const filePath = join(videoDir, 'reaction.mp4')
        writeFileSync(filePath, 'video')

        expect(derivePatreonDownloadMetadata(filePath)).toEqual({
          reactionTitle: 'X-Men Reaction',
          reactorName: 'Camilla',
          avatarPath: join(infoDir, 'avatar.jpg')
        })
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })

    it('chooses a square YouTube channel avatar over banner artwork', () => {
      expect(
        selectYouTubeAvatarThumbnail([
          { id: 'banner', url: 'https://example.com/banner.jpg', width: 2560, height: 424 },
          { id: 'avatar_uncropped', url: 'https://example.com/avatar.jpg', width: 900, height: 900 },
          { id: 'square', url: 'https://example.com/square.jpg', width: 1200, height: 1200 }
        ])
      ).toMatchObject({ id: 'avatar_uncropped', url: 'https://example.com/avatar.jpg' })
    })

    it('saves a best-effort YouTube creator avatar beside the reaction', async () => {
      const root = mkdtempSync(join(tmpdir(), 'watchalong-youtube-avatar-'))
      try {
        const child = createFakeChildProcess()
        const spawnProcess = vi.fn(() => child as never)
        const fetchAvatar = vi.fn(async () => ({
          ok: true,
          headers: { get: (name: string) => (name === 'content-type' ? 'image/jpeg' : null) },
          arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer as ArrayBuffer
        }))
        const reactionPath = join(root, 'reaction.mp4')
        const avatarPromise = retrieveYouTubeCreatorAvatar(
          'https://youtube.com/@cinema',
          reactionPath,
          'yt-dlp',
          spawnProcess as never,
          fetchAvatar
        )

        child.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              thumbnails: [
                { id: 'banner', url: 'https://example.com/banner.jpg', width: 2000, height: 400 },
                { id: 'avatar_uncropped', url: 'https://yt3.googleusercontent.com/avatar.jpg', width: 800, height: 800 }
              ]
            })
          )
        )
        child.emit('close', 0)

        const avatarPath = await avatarPromise
        expect(spawnProcess).toHaveBeenCalledWith(
          'yt-dlp',
          expect.arrayContaining(['--dump-single-json', 'https://youtube.com/@cinema']),
          { windowsHide: true }
        )
        expect(fetchAvatar).toHaveBeenCalledWith(
          'https://yt3.googleusercontent.com/avatar.jpg',
          expect.objectContaining({ signal: expect.anything(), redirect: 'error' })
        )
        expect(avatarPath).toBe(join(root, 'reactor-avatar.jpg'))
        expect(readFileSync(avatarPath!, 'hex')).toBe('010203')
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
  })

  describe('DownloadManager cancellation', () => {
    let tempDir: string

    beforeEach(() => {
      vi.useFakeTimers()
      tempDir = mkdtempSync(join(tmpdir(), 'watchalong-download-test-'))
    })

    afterEach(() => {
      vi.useRealTimers()
      rmSync(tempDir, { recursive: true, force: true })
    })

    it('emits cancelled without a later failed event when the child process closes non-zero', async () => {
      const child = createFakeChildProcess()
      const events: DownloadProgressEvent[] = []
      const manager = new DownloadManager(
        {
          getYtDlpPath: () => 'yt-dlp',
          getFfmpegPath: () => null
        } as ToolResolver,
        {} as never,
        (event) => events.push(event),
        () => tempDir,
        () => child as never
      )

      const { jobId } = manager.start({ source: 'youtube', url: 'https://www.youtube.com/watch?v=cancel' })
      await vi.advanceTimersByTimeAsync(25)
      manager.cancel(jobId)
      child.emit('close', 1)
      await Promise.resolve()

      const states = events.map((event) => event.state)
      expect(child.kill).toHaveBeenCalled()
      expect(states.filter((state) => state === 'cancelled')).toHaveLength(1)
      expect(states).not.toContain('failed')
      expect(states).not.toContain('success')
    })

    it('ends honestly when the configured download directory cannot be prepared', async () => {
      const blockedDownloadRoot = join(tempDir, 'not-a-directory')
      writeFileSync(blockedDownloadRoot, 'file')
      const events: DownloadProgressEvent[] = []
      const manager = new DownloadManager(
        {
          getYtDlpPath: () => 'yt-dlp',
          getFfmpegPath: () => null
        } as ToolResolver,
        {} as never,
        (event) => events.push(event),
        () => blockedDownloadRoot
      )

      manager.start({ source: 'youtube', url: 'https://www.youtube.com/watch?v=blocked' })
      await vi.advanceTimersByTimeAsync(25)

      expect(events.at(-1)).toMatchObject({
        source: 'youtube',
        state: 'failed',
        message: 'WatchAlong could not prepare the download. Check the download location and try again.'
      })
    })

    it('emits structured YouTube telemetry and metadata when process lines arrive in partial chunks', async () => {
      const child = createFakeChildProcess()
      const events: DownloadProgressEvent[] = []
      const spawnProcess = vi.fn((_command: string, _args: string[], _options: { windowsHide: boolean }) => child as never)
      const manager = new DownloadManager(
        {
          getYtDlpPath: () => 'yt-dlp',
          getFfmpegPath: () => null
        } as ToolResolver,
        {} as never,
        (event) => events.push(event),
        () => tempDir,
        spawnProcess as never
      )

      manager.start({ source: 'youtube', url: 'https://www.youtube.com/watch?v=telemetry' })
      await vi.advanceTimersByTimeAsync(25)

      const args = spawnProcess.mock.calls[0][1]
      expect(valueAfter(args, '--progress-template')).toContain('WA_PROGRESS')
      expect(args.filter((value: string) => value === '--print')).toHaveLength(2)
      const outDir = valueAfter(args, '-P')
      const filePath = join(outDir, 'X-Men Reaction.mp4')
      writeFileSync(filePath, 'video')

      child.stdout.emit(
        'data',
        Buffer.from('WA_METADATA\t"X-Men Reaction"\t"Cinema Crew"\tnull\tnull\tnull\nWA_PROGRESS\t 4')
      )
      child.stdout.emit(
        'data',
        Buffer.from(`2.5%\t3.2MiB/s\t00:18\t3\t12\nWA_FILE\t${JSON.stringify(filePath)}`)
      )
      child.emit('close', 0)
      await flushPromises()

      expect(events).toContainEqual(
        expect.objectContaining({
          source: 'youtube',
          state: 'downloading',
          percent: 42.5,
          speed: '3.2MiB/s',
          eta: '00:18',
          fragmentIndex: 3,
          fragmentCount: 12
        })
      )
      expect(events.at(-1)).toMatchObject({
        source: 'youtube',
        state: 'success',
        percent: 100,
        filePath,
        metadata: { reactionTitle: 'X-Men Reaction', reactorName: 'Cinema Crew' }
      })
    })

    it('keeps every Patreon event indeterminate while preserving title, creator, and avatar metadata', async () => {
      const child = createFakeChildProcess()
      const events: DownloadProgressEvent[] = []
      const cookie = 'session_id=phase-cookie'
      const { manager, spawnProcess } = createPatreonDownloadManager(child, tempDir, cookie, events)

      manager.start({
        source: 'patreon',
        url: 'https://www.patreon.com/posts/example-123',
        sessionSource: { type: 'manual', sessionId: cookie }
      })
      await vi.advanceTimersByTimeAsync(25)

      const outDir = valueAfter(spawnProcess.mock.calls[0][1], '--out-dir')
      const campaignRoot = join(outDir, 'camillas-corner - Camilla Corner')
      const infoDir = join(campaignRoot, 'campaign_info')
      const videoDir = join(campaignRoot, 'posts', '123 - Filename fallback', 'video')
      mkdirSync(infoDir, { recursive: true })
      mkdirSync(videoDir, { recursive: true })
      writeFileSync(join(infoDir, 'creator-api.json'), JSON.stringify({ data: { attributes: { full_name: 'Camilla' } } }))
      writeFileSync(join(infoDir, 'avatar.jpg'), 'avatar')
      const filePath = join(videoDir, 'reaction.mp4')
      writeFileSync(filePath, 'video')

      child.stderr.emit('data', Buffer.from('Download post #123 (X-Men Reaction)\nDownload progress (#1.2): 90 / '))
      child.stderr.emit('data', Buffer.from('100 MBs / 90% (400 kB/s)\n'))
      child.emit('close', 0)
      await flushPromises()

      expect(events.filter((event) => event.source === 'patreon').every((event) => event.percent === null)).toBe(true)
      expect(events).toContainEqual(
        expect.objectContaining({
          state: 'downloading',
          message: 'Downloading reaction media...',
          percent: null
        })
      )
      expect(events.at(-1)).toMatchObject({
        state: 'success',
        percent: null,
        filePath,
        metadata: {
          reactionTitle: 'X-Men Reaction',
          reactorName: 'Camilla',
          avatarPath: join(infoDir, 'avatar.jpg')
        }
      })
    })

    it('passes Patreon cookies through a temporary config file and clears them after save', async () => {
      const child = createFakeChildProcess()
      const cookie = 'session_id=private-cookie'
      const { manager, vault, spawnProcess } = createPatreonDownloadManager(child, tempDir, cookie)

      const { jobId } = manager.start({ source: 'patreon', url: 'https://www.patreon.com/posts/example-123', sessionSource: { type: 'manual', sessionId: cookie } })
      await vi.advanceTimersByTimeAsync(25)

      const args = spawnProcess.mock.calls[0][1]
      const configPath = valueAfter(args, '--config-file')
      const outDir = valueAfter(args, '--out-dir')
      expect(args).not.toContain(cookie)
      expect(args).not.toContain('--cookie')
      expect(readFileSync(configPath, 'utf8')).toContain(cookie)

      writeFileSync(join(outDir, 'reaction.mp4'), 'video')
      child.emit('close', 0)
      await flushPromises()

      expect(existsSync(configPath)).toBe(false)
      expect(manager.saveLastPatreonSession(jobId)).toEqual({ available: true, canEncrypt: true })
      expect(vault.save).toHaveBeenCalledWith(cookie)
      manager.saveLastPatreonSession(jobId)
      expect(vault.save).toHaveBeenCalledTimes(1)
    })

    it('deletes the Patreon temp config and does not retain cookies after failure', async () => {
      const child = createFakeChildProcess()
      const cookie = 'session_id=failing-cookie'
      const { manager, vault, spawnProcess } = createPatreonDownloadManager(child, tempDir, cookie)

      const { jobId } = manager.start({ source: 'patreon', url: 'https://www.patreon.com/posts/example-123', sessionSource: { type: 'manual', sessionId: cookie } })
      await vi.advanceTimersByTimeAsync(25)

      const configPath = valueAfter(spawnProcess.mock.calls[0][1], '--config-file')
      child.emit('close', 1)
      await flushPromises()

      expect(existsSync(configPath)).toBe(false)
      manager.saveLastPatreonSession(jobId)
      expect(vault.save).not.toHaveBeenCalled()
    })

    it('forgets both saved and not-yet-accepted Patreon sessions', async () => {
      const child = createFakeChildProcess()
      const cookie = 'session_id=forget-everywhere'
      const { manager, vault, spawnProcess } = createPatreonDownloadManager(child, tempDir, cookie)

      const { jobId } = manager.start({
        source: 'patreon',
        url: 'https://www.patreon.com/posts/example-123',
        sessionSource: { type: 'manual', sessionId: cookie }
      })
      await vi.advanceTimersByTimeAsync(25)
      const outDir = valueAfter(spawnProcess.mock.calls[0][1], '--out-dir')
      writeFileSync(join(outDir, 'reaction.mp4'), 'video')
      child.emit('close', 0)
      await flushPromises()

      expect(manager.forgetPatreonSession()).toEqual({ available: false, canEncrypt: true })
      expect(vault.forget).toHaveBeenCalled()
      manager.saveLastPatreonSession(jobId)
      expect(vault.save).not.toHaveBeenCalled()
    })

    it('does not make a running Patreon session saveable after Forget is pressed', async () => {
      const child = createFakeChildProcess()
      const cookie = 'session_id=forget-while-running'
      const { manager, vault, spawnProcess } = createPatreonDownloadManager(child, tempDir, cookie)

      const { jobId } = manager.start({
        source: 'patreon',
        url: 'https://www.patreon.com/posts/example-123',
        sessionSource: { type: 'manual', sessionId: cookie }
      })
      await vi.advanceTimersByTimeAsync(25)
      const outDir = valueAfter(spawnProcess.mock.calls[0][1], '--out-dir')

      manager.forgetPatreonSession()
      writeFileSync(join(outDir, 'reaction.mp4'), 'video')
      child.emit('close', 0)
      await flushPromises()

      manager.saveLastPatreonSession(jobId)
      expect(vault.save).not.toHaveBeenCalled()
    })

    it('invalidates a Patreon download that was still pending when Forget was pressed', async () => {
      const child = createFakeChildProcess()
      const cookie = 'session_id=forget-before-start'
      const events: DownloadProgressEvent[] = []
      const { manager, spawnProcess } = createPatreonDownloadManager(
        child,
        tempDir,
        cookie,
        events
      )

      manager.start({
        source: 'patreon',
        url: 'https://www.patreon.com/posts/example-123',
        sessionSource: { type: 'manual', sessionId: cookie }
      })
      manager.forgetPatreonSession()
      await vi.advanceTimersByTimeAsync(25)

      expect(spawnProcess).not.toHaveBeenCalled()
      expect(events.at(-1)).toMatchObject({
        source: 'patreon',
        state: 'failed',
        message: 'A Patreon session is required.'
      })
    })

    it('deletes the Patreon temp config and retained cookie when cancelled or discarded', async () => {
      const child = createFakeChildProcess()
      const cookie = 'session_id=discard-cookie'
      const { manager, vault, spawnProcess } = createPatreonDownloadManager(child, tempDir, cookie)

      const { jobId } = manager.start({ source: 'patreon', url: 'https://www.patreon.com/posts/example-123', sessionSource: { type: 'manual', sessionId: cookie } })
      await vi.advanceTimersByTimeAsync(25)

      const configPath = valueAfter(spawnProcess.mock.calls[0][1], '--config-file')
      expect(existsSync(configPath)).toBe(true)
      manager.cancel(jobId)
      child.emit('close', 1)
      await flushPromises()

      expect(existsSync(configPath)).toBe(false)
      expect(manager.discardLastPatreonSession(jobId)).toEqual({ available: false, canEncrypt: true })
      manager.saveLastPatreonSession(jobId)
      expect(vault.save).not.toHaveBeenCalled()
    })

    it('kills running children and synchronously removes Patreon credentials on dispose', async () => {
      const child = createFakeChildProcess()
      const cookie = 'session_id=shutdown-cookie'
      const events: DownloadProgressEvent[] = []
      const { manager, spawnProcess } = createPatreonDownloadManager(
        child,
        tempDir,
        cookie,
        events
      )

      manager.start({
        source: 'patreon',
        url: 'https://www.patreon.com/posts/example-123',
        sessionSource: { type: 'manual', sessionId: cookie }
      })
      await vi.advanceTimersByTimeAsync(25)
      const configPath = valueAfter(spawnProcess.mock.calls[0][1], '--config-file')
      expect(existsSync(configPath)).toBe(true)

      manager.dispose()

      expect(child.kill).toHaveBeenCalledOnce()
      expect(existsSync(configPath)).toBe(false)
      child.emit('close', 1)
      await flushPromises()
      expect(events.map((event) => event.state)).not.toContain('success')
      expect(events.map((event) => event.state)).not.toContain('failed')
    })

    it('prevents pending downloads from spawning after dispose', async () => {
      const spawnProcess = vi.fn()
      const manager = new DownloadManager(
        {
          getYtDlpPath: () => 'yt-dlp',
          getFfmpegPath: () => null
        } as ToolResolver,
        {} as never,
        vi.fn(),
        () => tempDir,
        spawnProcess as never
      )

      manager.start({
        source: 'youtube',
        url: 'https://www.youtube.com/watch?v=shutdown-pending'
      })
      manager.dispose()
      await vi.advanceTimersByTimeAsync(25)

      expect(spawnProcess).not.toHaveBeenCalled()
    })
  })
})

function createPatreonDownloadManager(
  child: ReturnType<typeof createFakeChildProcess>,
  tempDir: string,
  cookie: string,
  events?: DownloadProgressEvent[]
) {
  let authEpoch = 0
  const vault = {
    get authEpoch() {
      return authEpoch
    },
    resolve: vi.fn((_source: unknown, expectedEpoch = authEpoch) =>
      expectedEpoch === authEpoch ? cookie : null
    ),
    save: vi.fn(() => ({ available: true, canEncrypt: true })),
    status: vi.fn(() => ({ available: false, canEncrypt: true })),
    forget: vi.fn(() => {
      authEpoch += 1
      return { available: false, canEncrypt: true }
    })
  }
  const spawnProcess = vi.fn((_command: string, _args: string[]) => child as never)
  const manager = new DownloadManager(
    {
      getPatreonCliPath: () => 'patreon-dl.js',
      getPatreonDistPath: () => 'dist/cli/index.js',
      getNodePath: () => 'node',
      getFfmpegPath: () => null
    } as ToolResolver,
    vault as never,
    (event) => events?.push(event),
    () => tempDir,
    spawnProcess as never
  )

  return { manager, vault, spawnProcess }
}

function valueAfter(args: string[], flag: string): string {
  const index = args.indexOf(flag)
  expect(index).toBeGreaterThanOrEqual(0)
  return args[index + 1]
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function createFakeChildProcess(): EventEmitter & {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn(() => true)
  return child
}
