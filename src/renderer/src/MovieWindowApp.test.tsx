import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MovieWindowCommandCallback, WatchAlongApi } from '@shared/types'
import type { BrowserAudioTrack, BrowserAudioTrackList } from './playback/audioTrackCapability'
import { MovieWindowApp } from './MovieWindowApp'

describe('MovieWindowApp fullscreen shortcut', () => {
  let fullscreenElement: Element | null
  let originalRequestFullscreen: PropertyDescriptor | undefined
  let originalFullscreenElement: PropertyDescriptor | undefined
  let originalExitFullscreen: PropertyDescriptor | undefined
  const requestFullscreen = vi.fn()
  const exitFullscreen = vi.fn()
  let movieCommand: MovieWindowCommandCallback | null

  beforeEach(() => {
    fullscreenElement = null
    movieCommand = null
    requestFullscreen.mockImplementation(function (this: Element) {
      fullscreenElement = this
      document.dispatchEvent(new Event('fullscreenchange'))
      return Promise.resolve()
    })
    exitFullscreen.mockImplementation(() => {
      fullscreenElement = null
      document.dispatchEvent(new Event('fullscreenchange'))
      return Promise.resolve()
    })

    originalRequestFullscreen = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'requestFullscreen')
    originalFullscreenElement = Object.getOwnPropertyDescriptor(document, 'fullscreenElement')
    originalExitFullscreen = Object.getOwnPropertyDescriptor(document, 'exitFullscreen')
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen
    })
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement
    })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen
    })

    window.watchAlong = {
      getCabinetThemePreference: vi.fn(async () => 'system'),
      onCabinetThemePreference: vi.fn(() => vi.fn()),
      getMovieWindowInit: vi.fn(async () => null),
      movieWindowReady: vi.fn(async () => undefined),
      onMovieMediaCommand: vi.fn((callback: MovieWindowCommandCallback) => {
        movieCommand = callback
        return vi.fn()
      }),
      reportMovieMediaEvent: vi.fn(async () => undefined),
      acknowledgeMovieMediaCommand: vi.fn(async () => undefined),
      requestMovieWindowPopIn: vi.fn(async () => undefined)
    } as unknown as WatchAlongApi
  })

  afterEach(() => {
    restoreProperty(HTMLElement.prototype, 'requestFullscreen', originalRequestFullscreen)
    restoreProperty(document, 'fullscreenElement', originalFullscreenElement)
    restoreProperty(document, 'exitFullscreen', originalExitFullscreen)
  })

  it('uses exact Alt+Enter, ignores F and repeat, and respects interactive controls', async () => {
    render(<MovieWindowApp />)
    await waitFor(() => expect(window.watchAlong.movieWindowReady).toHaveBeenCalledOnce())

    fireEvent.keyDown(window, { code: 'KeyF' })
    expect(requestFullscreen).not.toHaveBeenCalled()

    fireEvent.keyDown(screen.getByRole('button', { name: 'Pop movie back in' }), {
      code: 'Enter',
      altKey: true
    })
    expect(requestFullscreen).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { code: 'Enter', altKey: true })
    expect(requestFullscreen).toHaveBeenCalledOnce()

    fireEvent.keyDown(window, { code: 'Enter', altKey: true, repeat: true })
    expect(exitFullscreen).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { code: 'Enter', altKey: true, shiftKey: true })
    expect(exitFullscreen).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { code: 'Enter', altKey: true })
    expect(exitFullscreen).toHaveBeenCalledOnce()
  })

  it('acknowledges a detached audio switch only after the native change event confirms it', async () => {
    render(<MovieWindowApp />)
    await waitFor(() => expect(movieCommand).not.toBeNull())
    const video = document.querySelector('video')
    expect(video).not.toBeNull()
    const tracks = new FakeAudioTrackList([
      { enabled: true, label: 'English (5.1)', language: 'eng' },
      { enabled: false, label: 'Indonesian (5.1)', language: 'ind' }
    ])
    Object.defineProperty(video!, 'audioTracks', { configurable: true, value: tracks })

    movieCommand?.({
      id: 'audio-1',
      type: 'setAudioTrack',
      value: { label: 'Indonesian (5.1)', language: 'ind', ordinal: 1 }
    })
    await Promise.resolve()
    expect(window.watchAlong.acknowledgeMovieMediaCommand).not.toHaveBeenCalled()

    tracks.dispatchEvent(new Event('change'))
    await waitFor(() => expect(window.watchAlong.acknowledgeMovieMediaCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'audio-1',
        ok: true,
        audioTrackSnapshot: {
          tracks: [
            expect.objectContaining({ ordinal: 0, enabled: false }),
            expect.objectContaining({ ordinal: 1, enabled: true })
          ],
          selected: { label: 'Indonesian (5.1)', language: 'ind', ordinal: 1 }
        }
      })
    ))
  })

  it('reapplies the persisted semantic track when the detached video loads', async () => {
    vi.mocked(window.watchAlong.getMovieWindowInit).mockResolvedValue({
      sessionId: 's1',
      title: 'The Raid',
      mediaUrl: 'watchalong://media/s1/movie',
      subtitleText: null,
      currentTime: 120,
      playbackRate: 1,
      volume: 0.8,
      muted: false,
      audioTrackPreference: { label: 'Indonesian (5.1)', language: 'ind', ordinal: 1 }
    })

    render(<MovieWindowApp />)
    const video = document.querySelector('video')!
    const tracks = new FakeAudioTrackList([
      { enabled: true, label: 'English (5.1)', language: 'eng' },
      { enabled: false, label: 'Indonesian (5.1)', language: 'ind' }
    ])
    Object.defineProperty(video, 'audioTracks', { configurable: true, value: tracks })
    await screen.findByText('The Raid')

    fireEvent.loadedMetadata(video)
    expect(tracks[1]?.enabled).toBe(true)
    expect(window.watchAlong.reportMovieMediaEvent).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'loadedmetadata'
    }))

    tracks.dispatchEvent(new Event('change'))
    await waitFor(() => expect(window.watchAlong.reportMovieMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'loadedmetadata',
        audioTrackSnapshot: expect.objectContaining({
          selected: { label: 'Indonesian (5.1)', language: 'ind', ordinal: 1 }
        })
      })
    ))
  })

  it('serializes an immediate switch behind detached-window restoration', async () => {
    vi.mocked(window.watchAlong.getMovieWindowInit).mockResolvedValue({
      sessionId: 's1',
      title: 'The Raid',
      mediaUrl: 'watchalong://media/s1/movie',
      subtitleText: null,
      currentTime: 120,
      playbackRate: 1,
      volume: 0.8,
      muted: false,
      audioTrackPreference: { label: 'Indonesian (5.1)', language: 'ind', ordinal: 1 }
    })

    render(<MovieWindowApp />)
    const video = document.querySelector('video')!
    const tracks = new FakeAudioTrackList([
      { enabled: true, label: 'English (5.1)', language: 'eng' },
      { enabled: false, label: 'Indonesian (5.1)', language: 'ind' }
    ])
    Object.defineProperty(video, 'audioTracks', { configurable: true, value: tracks })
    await screen.findByText('The Raid')

    fireEvent.loadedMetadata(video)
    movieCommand?.({
      id: 'audio-after-restore',
      type: 'setAudioTrack',
      value: { label: 'English (5.1)', language: 'eng', ordinal: 0 }
    })
    expect(tracks[1]?.enabled).toBe(true)
    expect(window.watchAlong.acknowledgeMovieMediaCommand).not.toHaveBeenCalled()

    tracks.dispatchEvent(new Event('change'))
    await waitFor(() => expect(window.watchAlong.reportMovieMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'loadedmetadata' })
    ))
    await waitFor(() => expect(tracks[0]?.enabled).toBe(true))
    expect(window.watchAlong.acknowledgeMovieMediaCommand).not.toHaveBeenCalled()

    tracks.dispatchEvent(new Event('change'))
    await waitFor(() => expect(window.watchAlong.acknowledgeMovieMediaCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'audio-after-restore',
        ok: true,
        audioTrackSnapshot: expect.objectContaining({
          selected: { label: 'English (5.1)', language: 'eng', ordinal: 0 }
        })
      })
    ))
  })

  it('keeps Chromium’s detached default when a saved track is unavailable', async () => {
    vi.mocked(window.watchAlong.getMovieWindowInit).mockResolvedValue({
      sessionId: 's1',
      title: 'Changed file',
      mediaUrl: 'watchalong://media/s1/movie',
      subtitleText: null,
      currentTime: 0,
      playbackRate: 1,
      volume: 1,
      muted: false,
      audioTrackPreference: { label: 'Missing commentary', language: 'fra', ordinal: 2 }
    })

    render(<MovieWindowApp />)
    const video = document.querySelector('video')!
    const tracks = new FakeAudioTrackList([
      { enabled: true, label: 'English (5.1)', language: 'eng' },
      { enabled: false, label: 'Indonesian (5.1)', language: 'ind' }
    ])
    Object.defineProperty(video, 'audioTracks', { configurable: true, value: tracks })
    await screen.findByText('Changed file')

    fireEvent.loadedMetadata(video)
    await waitFor(() => expect(window.watchAlong.reportMovieMediaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'loadedmetadata',
        audioTrackSnapshot: expect.objectContaining({
          selected: { label: 'English (5.1)', language: 'eng', ordinal: 0 }
        })
      })
    ))
    expect(tracks[0]?.enabled).toBe(true)
    expect(tracks[1]?.enabled).toBe(false)
  })
})

class FakeAudioTrackList extends EventTarget implements BrowserAudioTrackList {
  readonly length: number
  readonly [index: number]: BrowserAudioTrack | undefined

  constructor(tracks: BrowserAudioTrack[]) {
    super()
    this.length = tracks.length
    tracks.forEach((track, index) => {
      Object.defineProperty(this, index, { enumerable: true, value: track })
    })
  }
}

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined
): void {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor)
    return
  }
  Reflect.deleteProperty(target, property)
}
