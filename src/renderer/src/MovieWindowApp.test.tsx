import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WatchAlongApi } from '@shared/types'
import { MovieWindowApp } from './MovieWindowApp'

describe('MovieWindowApp fullscreen shortcut', () => {
  let fullscreenElement: Element | null
  let originalRequestFullscreen: PropertyDescriptor | undefined
  let originalFullscreenElement: PropertyDescriptor | undefined
  let originalExitFullscreen: PropertyDescriptor | undefined
  const requestFullscreen = vi.fn()
  const exitFullscreen = vi.fn()

  beforeEach(() => {
    fullscreenElement = null
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
      onMovieMediaCommand: vi.fn(() => vi.fn()),
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
})

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
