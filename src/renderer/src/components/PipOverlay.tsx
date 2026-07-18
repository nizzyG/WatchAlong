import { ExternalLink, EyeOff, GripHorizontal, Magnet, Maximize2 } from 'lucide-react'
import type { RefObject } from 'react'
import type { OverlayGeometry } from '@shared/types'
import {
  constrainOverlay,
  getPipPresentationShift,
  nextPipCorner,
  snapOverlayToCorner,
  snapOverlayToNearestCorner
} from './pipGeometry'

interface PipOverlayProps {
  geometry: OverlayGeometry
  videoRef: RefObject<HTMLVideoElement>
  hidden: boolean
  onChange(geometry: OverlayGeometry): void
  onCommit(geometry: OverlayGeometry): void
  onHide(): void
  onPopOut(): void
  onLoadedMetadata(): void
  onTimeUpdate(): void
  onVideoError(video: HTMLVideoElement): void
  subtitleText?: string | null
  osdTop?: number | null
}

const MIN_WIDTH = 320
const MIN_HEIGHT = 180

export function PipOverlay({
  geometry,
  videoRef,
  hidden,
  onChange,
  onCommit,
  onHide,
  onPopOut,
  onLoadedMetadata,
  onTimeUpdate,
  onVideoError,
  subtitleText,
  osdTop = null
}: PipOverlayProps): JSX.Element {
  const presentationShift = hidden ? 0 : getPipPresentationShift(geometry, osdTop)
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

  const stopToolbarPointerDown = (event: React.PointerEvent): void => {
    event.stopPropagation()
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
      <div
        className="pip-presentation"
        data-presentation-shift={presentationShift}
        style={{ transform: `translateY(${presentationShift}px)` }}
      >
        <div className="pip-titlebar">
          <div className="pip-drag-handle" onPointerDown={beginDrag}>
            <GripHorizontal size={16} aria-hidden />
            <span>Movie</span>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Snap movie"
            aria-label="Snap movie"
            onPointerDown={stopToolbarPointerDown}
            onClick={cycleSnapCorner}
          >
            <Magnet size={16} aria-hidden />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Pop out movie"
            aria-label="Pop out movie"
            onPointerDown={stopToolbarPointerDown}
            onClick={onPopOut}
          >
            <ExternalLink size={16} aria-hidden />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Hide movie"
            aria-label="Hide movie"
            onPointerDown={stopToolbarPointerDown}
            onClick={onHide}
          >
            <EyeOff size={17} aria-hidden />
          </button>
        </div>
        <video
          ref={videoRef}
          className="pip-video"
          playsInline
          preload="metadata"
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onError={(event) => onVideoError(event.currentTarget)}
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
      </div>
    </section>
  )
}
