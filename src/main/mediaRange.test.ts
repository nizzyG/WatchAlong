import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMediaResponse, parseRange } from './mediaRange'

describe('media range handling', () => {
  describe('parseRange', () => {
    it('parses explicit byte ranges', () => {
      expect(parseRange('bytes=100-499', 1000)).toEqual({ start: 100, end: 499 })
      expect(parseRange('bytes=100-2000', 1000)).toEqual({ start: 100, end: 999 })
    })

    it('parses open-ended byte ranges', () => {
      expect(parseRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 })
    })

    it('parses suffix byte ranges as the final bytes of the file', () => {
      expect(parseRange('bytes=-500', 1000)).toEqual({ start: 500, end: 999 })
      expect(parseRange('bytes=-1500', 1000)).toEqual({ start: 0, end: 999 })
    })

    it('rejects invalid and unsatisfiable ranges', () => {
      expect(parseRange('bytes=-0', 1000)).toBeNull()
      expect(parseRange('bytes=-', 1000)).toBeNull()
      expect(parseRange('bytes=1000-', 1000)).toBeNull()
      expect(parseRange('bytes=500-499', 1000)).toBeNull()
      expect(parseRange('items=0-10', 1000)).toBeNull()
    })
  })

  describe('createMediaResponse', () => {
    let tempDir: string
    let mediaPath: string

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'watchalong-range-test-'))
      mediaPath = join(tempDir, 'sample.mp4')
      writeFileSync(mediaPath, '0123456789')
    })

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true })
    })

    it('returns a 206 response with the correct suffix Content-Range', async () => {
      const response = createMediaResponse(mediaPath, 'bytes=-4')

      expect(response.status).toBe(206)
      expect(response.headers.get('Content-Range')).toBe('bytes 6-9/10')
      expect(response.headers.get('Content-Length')).toBe('4')
      expect(await response.text()).toBe('6789')
    })

    it('returns 416 with the file-size Content-Range for invalid ranges', () => {
      const response = createMediaResponse(mediaPath, 'bytes=20-30')

      expect(response.status).toBe(416)
      expect(response.headers.get('Content-Range')).toBe('bytes */10')
    })
  })
})
