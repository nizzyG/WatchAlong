import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canExtractNatively, findPatreonSessionCookieValue, humanizeCookieExtractionError, parsePatreonSessionCookie } from './mediaServices'

describe('media services', () => {
  describe('canExtractNatively', () => {
    it('returns true for firefox', () => {
      expect(canExtractNatively('firefox')).toBe(true)
    })

    it('returns false for chromium browsers blocked by App-Bound Encryption', () => {
      expect(canExtractNatively('chrome')).toBe(false)
      expect(canExtractNatively('edge')).toBe(false)
      expect(canExtractNatively('brave')).toBe(false)
      expect(canExtractNatively('opera')).toBe(false)
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
})
