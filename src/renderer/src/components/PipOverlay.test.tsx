import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PipOverlay } from './PipOverlay'

function renderOverlay(overrides: Partial<React.ComponentProps<typeof PipOverlay>> = {}): void {
  render(
    <PipOverlay
      geometry={{ x: 10, y: 10, width: 320, height: 180 }}
      videoRef={createRef<HTMLVideoElement>()}
      hidden={false}
      onChange={vi.fn()}
      onCommit={vi.fn()}
      onHide={vi.fn()}
      onPopOut={vi.fn()}
      onLoadedMetadata={vi.fn()}
      onTimeUpdate={vi.fn()}
      onVideoError={vi.fn()}
      {...overrides}
    />
  )
}

describe('PipOverlay', () => {
  it('emits geometry changes while dragging', () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    renderOverlay({ onChange, onCommit })

    const titlebar = screen.getByText('Movie').parentElement!
    fireEvent(titlebar, new MouseEvent('pointerdown', { button: 0, clientX: 10, clientY: 10, bubbles: true }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 30, clientY: 35 }))
    window.dispatchEvent(new MouseEvent('pointerup'))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ x: 30, y: 35 }))
    expect(onCommit).toHaveBeenCalled()
  })

  it('keeps the media element mounted when hidden', () => {
    renderOverlay({ hidden: true })

    expect(screen.getByLabelText('Movie picture in picture')).toHaveClass('pip-hidden')
    expect(document.querySelector('video.pip-video')).toBeInTheDocument()
  })

  it('reports errors from the movie element itself', () => {
    const onVideoError = vi.fn()
    renderOverlay({ onVideoError })

    const movie = document.querySelector('video.pip-video') as HTMLVideoElement
    fireEvent.error(movie)

    expect(onVideoError).toHaveBeenCalledWith(movie)
  })

  it('emits pop-out from the toolbar button', () => {
    const onPopOut = vi.fn()
    renderOverlay({ onPopOut })

    fireEvent.click(screen.getByLabelText('Pop out movie'))

    expect(onPopOut).toHaveBeenCalledTimes(1)
  })

  it('does not drag from local PiP toolbar buttons', () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    renderOverlay({ onChange, onCommit })

    for (const label of ['Snap movie', 'Pop out movie', 'Hide movie']) {
      fireEvent(screen.getByLabelText(label), new MouseEvent('pointerdown', {
        button: 0,
        clientX: 10,
        clientY: 10,
        bubbles: true
      }))
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 30, clientY: 35 }))
      window.dispatchEvent(new MouseEvent('pointerup'))
    }

    expect(onChange).not.toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('does not fullscreen from a local PiP movie double-click', () => {
    const requestFullscreen = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen
    })
    renderOverlay()

    fireEvent.doubleClick(document.querySelector('video.pip-video')!)

    expect(requestFullscreen).not.toHaveBeenCalled()
  })
})
