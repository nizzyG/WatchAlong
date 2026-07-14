import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findNewestMediaFile, normalizeCompletedPath } from './downloadFiles'

describe('download output containment', () => {
  let root: string
  let outsideRoot: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'watchalong-download-root-'))
    outsideRoot = mkdtempSync(join(tmpdir(), 'watchalong-download-outside-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outsideRoot, { recursive: true, force: true })
  })

  it('accepts only supported regular files beneath the job root', () => {
    const nested = join(root, 'creator')
    mkdirSync(nested)
    const video = join(nested, 'reaction.mp4')
    const text = join(nested, 'notes.txt')
    const outside = join(outsideRoot, 'private.mp4')
    writeFileSync(video, 'video')
    writeFileSync(text, 'text')
    writeFileSync(outside, 'outside')

    expect(normalizeCompletedPath(video, root)).toBe(realpathSync(video))
    expect(normalizeCompletedPath(text, root)).toBeNull()
    expect(normalizeCompletedPath(outside, root)).toBeNull()
    expect(normalizeCompletedPath(nested, root)).toBeNull()
  })

  it('falls back only to contained media files', () => {
    const small = join(root, 'small.mkv')
    const large = join(root, 'large.webm')
    writeFileSync(small, '1')
    writeFileSync(large, '12345')

    expect(findNewestMediaFile(root)).toBe(realpathSync(large))
  })
})
