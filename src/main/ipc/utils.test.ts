import { mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
  showOpenDialog: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showOpenDialog: (...args: unknown[]) => electronMocks.showOpenDialog(...args) }
}))

import { selectMoviePoster } from './utils'
import { MAX_MOVIE_POSTER_BYTES } from '../services/moviePosterFiles'

describe('movie poster picker', () => {
  let root: string
  const parent = {} as Electron.BrowserWindow

  beforeEach(() => {
    electronMocks.showOpenDialog.mockReset()
    root = mkdtempSync(join(tmpdir(), 'watchalong-poster-picker-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('returns an existing supported image selected by the user', async () => {
    const posterPath = join(root, 'my-cover.webp')
    writeFileSync(posterPath, 'image')
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [posterPath] })

    await expect(selectMoviePoster(parent)).resolves.toEqual({
      status: 'selected',
      file: {
        path: posterPath,
        name: 'my-cover.webp'
      }
    })
    expect(electronMocks.showOpenDialog).toHaveBeenCalledWith(parent, {
      title: 'Choose a movie poster',
      properties: ['openFile'],
      filters: [
        { name: 'Image files', extensions: ['jpg', 'jpeg', 'png', 'webp'] }
      ]
    })
  })

  it('returns cancellation only when the dialog was cancelled', async () => {
    electronMocks.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    await expect(selectMoviePoster(parent)).resolves.toEqual({ status: 'cancelled' })
  })

  it('returns an explainable rejection for a selected but unusable file', async () => {
    const svgPath = join(root, 'active.svg')
    writeFileSync(svgPath, '<svg/>')
    electronMocks.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [svgPath] })
    await expect(selectMoviePoster(parent)).resolves.toMatchObject({
      status: 'rejected',
      reason: 'unsupported-format',
      message: expect.stringMatching(/JPG.*PNG.*WebP/i)
    })

    electronMocks.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [join(root, 'missing.jpg')]
    })
    await expect(selectMoviePoster(parent)).resolves.toMatchObject({
      status: 'rejected',
      reason: 'unavailable',
      message: expect.stringMatching(/drive is connected/i)
    })

    const directoryPath = join(root, 'directory.png')
    mkdirSync(directoryPath)
    electronMocks.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [directoryPath] })
    await expect(selectMoviePoster(parent)).resolves.toMatchObject({
      status: 'rejected',
      reason: 'not-file'
    })

    const oversizedPath = join(root, 'oversized.jpg')
    writeFileSync(oversizedPath, '')
    truncateSync(oversizedPath, MAX_MOVIE_POSTER_BYTES + 1)
    electronMocks.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [oversizedPath] })
    await expect(selectMoviePoster(parent)).resolves.toMatchObject({
      status: 'rejected',
      reason: 'too-large',
      message: expect.stringMatching(/64 MB/i)
    })
  })
})
