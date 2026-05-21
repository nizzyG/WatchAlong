import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DownloadProgressEvent } from '@shared/types'
import {
  canExtractNatively,
  detectBrowsers,
  DownloadManager,
  extractPatreonSession,
  findPatreonSessionCookieValue,
  getBrowserExtractionMode,
  getPlatformToolFilename,
  humanizeCookieExtractionError,
  parsePatreonSessionCookie,
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
  describe('getPlatformToolFilename', () => {
    it('uses Windows bundled executable names', () => {
      expect(getPlatformToolFilename('yt-dlp', 'win32')).toBe('yt-dlp.exe')
      expect(getPlatformToolFilename('ffmpeg', 'win32')).toBe('ffmpeg.exe')
      expect(getPlatformToolFilename('node', 'win32')).toBe('node.exe')
    })

    it('uses macOS bundled executable names by architecture', () => {
      expect(getPlatformToolFilename('yt-dlp', 'darwin')).toBe('yt-dlp_macos')
      expect(getPlatformToolFilename('ffmpeg', 'darwin', 'arm64')).toBe('ffmpeg-darwin-arm64')
      expect(getPlatformToolFilename('ffmpeg', 'darwin', 'x64')).toBe('ffmpeg-darwin-x64')
      expect(getPlatformToolFilename('node', 'darwin', 'arm64')).toBe('node-darwin-arm64')
      expect(getPlatformToolFilename('node', 'darwin', 'x64')).toBe('node-darwin-x64')
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

      const { jobId } = manager.start({ source: 'youtube', url: 'https://example.com/video' })
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
  })
})

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
