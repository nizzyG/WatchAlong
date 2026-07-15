import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isSupportedSubtitleFile,
  MAX_SUBTITLE_BYTES,
  readSubtitleFile
} from './subtitleFiles'

describe('subtitle file boundary', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'watchalong-subtitles-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('reads only supported regular subtitle files', () => {
    const subtitle = join(root, 'captions.srt')
    const disguised = join(root, 'captions.txt')
    const directory = join(root, 'folder.vtt')
    writeFileSync(subtitle, '1\n00:00:00,000 --> 00:00:01,000\nHello\n', 'utf8')
    writeFileSync(disguised, 'not a subtitle', 'utf8')
    mkdirSync(directory)

    expect(isSupportedSubtitleFile(subtitle)).toBe(true)
    expect(readSubtitleFile(subtitle)).toContain('Hello')
    expect(isSupportedSubtitleFile(disguised)).toBe(false)
    expect(readSubtitleFile(directory)).toBeNull()
  })

  it('refuses subtitle files larger than the read cap', () => {
    const subtitle = join(root, 'huge.vtt')
    writeFileSync(subtitle, Buffer.alloc(MAX_SUBTITLE_BYTES + 1, 65))

    expect(readSubtitleFile(subtitle)).toBeNull()
  })
})
