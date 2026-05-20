import type { OverlayGeometry } from '@shared/types'

export type PipCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const SNAP_MARGIN = 24
const SNAP_THRESHOLD = 56
const MIN_WIDTH = 320
const MIN_HEIGHT = 180
const MAX_VIEWPORT_RATIO = 0.55

export function constrainOverlay(
  geometry: OverlayGeometry,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight
): OverlayGeometry {
  const scaled = scaleOverlayToViewport(geometry, viewportWidth, viewportHeight)
  const width = scaled.width
  const height = scaled.height
  const maxX = Math.max(0, viewportWidth - width)
  const maxY = Math.max(0, viewportHeight - height)

  return {
    x: clamp(scaled.x, 0, maxX),
    y: clamp(scaled.y, 0, maxY),
    width,
    height
  }
}

export function snapOverlayToNearestCorner(
  geometry: OverlayGeometry,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight
): OverlayGeometry {
  const constrained = constrainOverlay(geometry, viewportWidth, viewportHeight)
  const corners = getCornerGeometries(constrained, viewportWidth, viewportHeight)
  const nearest = corners
    .map((candidate) => ({
      geometry: candidate.geometry,
      distance: Math.hypot(constrained.x - candidate.geometry.x, constrained.y - candidate.geometry.y)
    }))
    .sort((a, b) => a.distance - b.distance)[0]

  return nearest && nearest.distance <= SNAP_THRESHOLD ? nearest.geometry : constrained
}

export function snapOverlayToCorner(
  geometry: OverlayGeometry,
  corner: PipCorner,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight
): OverlayGeometry {
  const constrained = constrainOverlay(geometry, viewportWidth, viewportHeight)
  return getCornerGeometries(constrained, viewportWidth, viewportHeight).find((candidate) => candidate.corner === corner)!
    .geometry
}

export function nextPipCorner(geometry: OverlayGeometry, viewportWidth = window.innerWidth, viewportHeight = window.innerHeight): PipCorner {
  const constrained = constrainOverlay(geometry, viewportWidth, viewportHeight)
  const corners = getCornerGeometries(constrained, viewportWidth, viewportHeight)
  const nearest = corners
    .map((candidate, index) => ({
      index,
      corner: candidate.corner,
      distance: Math.hypot(constrained.x - candidate.geometry.x, constrained.y - candidate.geometry.y)
    }))
    .sort((a, b) => a.distance - b.distance)[0]
  const nextIndex = ((nearest?.index ?? -1) + 1) % corners.length
  return corners[nextIndex].corner
}

function getCornerGeometries(
  geometry: OverlayGeometry,
  viewportWidth: number,
  viewportHeight: number
): Array<{ corner: PipCorner; geometry: OverlayGeometry }> {
  const right = Math.max(SNAP_MARGIN, viewportWidth - geometry.width - SNAP_MARGIN)
  const bottom = Math.max(SNAP_MARGIN, viewportHeight - geometry.height - SNAP_MARGIN)

  return [
    { corner: 'top-left', geometry: { ...geometry, x: SNAP_MARGIN, y: SNAP_MARGIN } },
    { corner: 'top-right', geometry: { ...geometry, x: right, y: SNAP_MARGIN } },
    { corner: 'bottom-right', geometry: { ...geometry, x: right, y: bottom } },
    { corner: 'bottom-left', geometry: { ...geometry, x: SNAP_MARGIN, y: bottom } }
  ]
}

function scaleOverlayToViewport(
  geometry: OverlayGeometry,
  viewportWidth: number,
  viewportHeight: number
): OverlayGeometry {
  const width = Math.max(MIN_WIDTH, geometry.width)
  const height = Math.max(MIN_HEIGHT, geometry.height)
  const maxWidth = Math.max(MIN_WIDTH, Math.min(viewportWidth - SNAP_MARGIN * 2, viewportWidth * MAX_VIEWPORT_RATIO))
  const maxHeight = Math.max(MIN_HEIGHT, Math.min(viewportHeight - SNAP_MARGIN * 2, viewportHeight * MAX_VIEWPORT_RATIO))
  const scale = Math.min(1, maxWidth / width, maxHeight / height)

  return {
    ...geometry,
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
