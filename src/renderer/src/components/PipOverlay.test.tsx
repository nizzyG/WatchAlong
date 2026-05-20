import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PipOverlay } from './PipOverlay'

describe('PipOverlay', () => {
  it('emits geometry changes while dragging', () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    render(
      <PipOverlay
        geometry={{ x: 10, y: 10, width: 320, height: 180 }}
        videoRef={createRef<HTMLVideoElement>()}
        hidden={false}
        onChange={onChange}
        onCommit={onCommit}
        onHide={vi.fn()}
        onPopOut={vi.fn()}
        onPopIn={vi.fn()}
        onLoadedMetadata={vi.fn()}
        onTimeUpdate={vi.fn()}
        onVideoError={vi.fn()}
      />
    )

    const titlebar = screen.getByText('Movie').parentElement!
    fireEvent(titlebar, new MouseEvent('pointerdown', { button: 0, clientX: 10, clientY: 10, bubbles: true }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 30, clientY: 35 }))
    window.dispatchEvent(new MouseEvent('pointerup'))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ x: 30, y: 35 }))
    expect(onCommit).toHaveBeenCalled()
  })

  it('keeps the media element mounted when hidden', () => {
    render(
      <PipOverlay
        geometry={{ x: 10, y: 10, width: 320, height: 180 }}
        videoRef={createRef<HTMLVideoElement>()}
        hidden
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onHide={vi.fn()}
        onPopOut={vi.fn()}
        onPopIn={vi.fn()}
        onLoadedMetadata={vi.fn()}
        onTimeUpdate={vi.fn()}
        onVideoError={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Movie picture in picture')).toHaveClass('pip-hidden')
    expect(document.querySelector('video.pip-video')).toBeInTheDocument()
  })

  it('emits pop-out from the toolbar button', () => {
    const onPopOut = vi.fn()
    render(
      <PipOverlay
        geometry={{ x: 10, y: 10, width: 320, height: 180 }}
        videoRef={createRef<HTMLVideoElement>()}
        hidden={false}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onHide={vi.fn()}
        onPopOut={onPopOut}
        onPopIn={vi.fn()}
        onLoadedMetadata={vi.fn()}
        onTimeUpdate={vi.fn()}
        onVideoError={vi.fn()}
      />
    )

    fireEvent.click(screen.getByLabelText('Pop out movie to separate window'))

    expect(onPopOut).toHaveBeenCalledTimes(1)
  })

  it('shows a pop-in indicator without rendering local movie video when popped out', () => {
    const onPopIn = vi.fn()
    render(
      <PipOverlay
        geometry={{ x: 10, y: 10, width: 320, height: 180 }}
        videoRef={createRef<HTMLVideoElement>()}
        hidden={false}
        poppedOut
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onHide={vi.fn()}
        onPopOut={vi.fn()}
        onPopIn={onPopIn}
        onLoadedMetadata={vi.fn()}
        onTimeUpdate={vi.fn()}
        onVideoError={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Pop movie back in' })).toHaveTextContent('Movie is popped out.')
    expect(document.querySelector('video.pip-video')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pop movie back in' }))
    expect(onPopIn).toHaveBeenCalledTimes(1)
  })

  it('does not fullscreen from a local PiP movie double-click', () => {
    const requestFullscreen = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen
    })

    render(
      <PipOverlay
        geometry={{ x: 10, y: 10, width: 320, height: 180 }}
        videoRef={createRef<HTMLVideoElement>()}
        hidden={false}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onHide={vi.fn()}
        onPopOut={vi.fn()}
        onPopIn={vi.fn()}
        onLoadedMetadata={vi.fn()}
        onTimeUpdate={vi.fn()}
        onVideoError={vi.fn()}
      />
    )

    fireEvent.doubleClick(document.querySelector('video.pip-video')!)

    expect(requestFullscreen).not.toHaveBeenCalled()
  })
})
