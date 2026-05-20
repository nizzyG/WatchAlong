import { ExternalLink, EyeOff, GripHorizontal, Magnet, Maximize2 } from 'lucide-react'
import type { RefObject } from 'react'
import type { OverlayGeometry } from '@shared/types'
import { constrainOverlay, nextPipCorner, snapOverlayToCorner, snapOverlayToNearestCorner } from './pipGeometry'

interface PipOverlayProps {
  geometry: OverlayGeometry
  videoRef: RefObject<HTMLVideoElement>
  hidden: boolean
  poppedOut?: boolean
  onChange(geometry: OverlayGeometry): void
  onCommit(geometry: OverlayGeometry): void
  onHide(): void
  onPopOut(): void
  onPopIn(): void
  onLoadedMetadata(): void
  onTimeUpdate(): void
  onVideoError(): void
  subtitleText?: string | null
}

const MIN_WIDTH = 320
const MIN_HEIGHT = 180

export function PipOverlay({
  geometry,
  videoRef,
  hidden,
  poppedOut = false,
  onChange,
  onCommit,
  onHide,
  onPopOut,
  onPopIn,
  onLoadedMetadata,
  onTimeUpdate,
  onVideoError,
  subtitleText
}: PipOverlayProps): JSX.Element {
  const beginDrag = (event: React.PointerEvent): void => {
    if (event.button && event.button !== 0) {
      return
    }

    event.preventDefault()
    const start = { x: event.clientX, y: event.clientY, geometry }
    let latest = geometry

    const move = (moveEvent: PointerEvent): void => {
      const next = constrainOverlay({
        ...start.geometry,
        x: start.geometry.x + moveEvent.clientX - start.x,
        y: start.geometry.y + moveEvent.clientY - start.y
      })
      latest = next
      onChange(next)
    }

    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const snapped = snapOverlayToNearestCorner(latest)
      onChange(snapped)
      onCommit(snapped)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }

  const beginResize = (event: React.PointerEvent): void => {
    if (event.button && event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const start = { x: event.clientX, y: event.clientY, geometry }
    let latest = geometry

    const move = (moveEvent: PointerEvent): void => {
      const next = constrainOverlay({
        ...start.geometry,
        width: Math.max(MIN_WIDTH, start.geometry.width + moveEvent.clientX - start.x),
        height: Math.max(MIN_HEIGHT, start.geometry.height + moveEvent.clientY - start.y)
      })
      latest = next
      onChange(next)
    }

    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onCommit(latest)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }

  const cycleSnapCorner = (): void => {
    const corner = nextPipCorner(geometry)
    const snapped = snapOverlayToCorner(geometry, corner)
    onChange(snapped)
    onCommit(snapped)
  }

  return (
    <section
      className={`pip ${hidden ? 'pip-hidden' : ''}`}
      style={{
        transform: `translate(${geometry.x}px, ${geometry.y}px)`,
        width: geometry.width,
        height: geometry.height
      }}
      aria-label="Movie picture in picture"
      aria-hidden={hidden}
    >
      <div className="pip-titlebar" onPointerDown={beginDrag}>
        <GripHorizontal size={16} aria-hidden />
        <span>Movie</span>
        <button className="icon-button" type="button" title="Snap movie" aria-label="Snap movie" onClick={cycleSnapCorner}>
          <Magnet size={16} aria-hidden />
        </button>
        {poppedOut ? (
          <button
            className="pip-popout-status"
            type="button"
            title="Pop movie back in"
            aria-label="Pop movie back in"
            onClick={onPopIn}
          >
            Movie is popped out.
          </button>
        ) : (
          <button
            className="icon-button"
            type="button"
            title="Pop out movie to separate window."
            aria-label="Pop out movie to separate window"
            onClick={onPopOut}
          >
            <ExternalLink size={16} aria-hidden />
          </button>
        )}
        <button className="icon-button" type="button" title="Hide movie" aria-label="Hide movie" onClick={onHide}>
          <EyeOff size={17} aria-hidden />
        </button>
      </div>
      {!poppedOut && (
        <>
          <video
            ref={videoRef}
            className="pip-video"
            playsInline
            preload="metadata"
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={onTimeUpdate}
            onError={onVideoError}
          />
          {subtitleText && <div className="pip-subtitles">{subtitleText}</div>}
          <button
            className="pip-resize"
            type="button"
            title="Resize movie"
            aria-label="Resize movie"
            onPointerDown={beginResize}
          >
            <Maximize2 size={16} aria-hidden />
          </button>
        </>
      )}
    </section>
  )
}
