import { describe, expect, it } from 'vitest'
import { constrainOverlay, snapOverlayToCorner, snapOverlayToNearestCorner } from './pipGeometry'

describe('pipGeometry', () => {
  it('constrains the overlay to the viewport', () => {
    expect(constrainOverlay({ x: 900, y: 700, width: 320, height: 180 }, 1000, 800)).toMatchObject({
      x: 680,
      y: 620,
      width: 320,
      height: 180
    })
  })

  it('scales a fullscreen-sized overlay down for a smaller viewport', () => {
    expect(constrainOverlay({ x: 0, y: 0, width: 1120, height: 675 }, 1000, 600)).toMatchObject({
      x: 0,
      y: 0,
      width: 548,
      height: 330
    })
  })

  it('snaps to a specific corner', () => {
    expect(snapOverlayToCorner({ x: 0, y: 0, width: 320, height: 180 }, 'bottom-right', 1000, 800)).toMatchObject({
      x: 656,
      y: 596
    })
  })

  it('snaps to the nearest corner when released near it', () => {
    expect(snapOverlayToNearestCorner({ x: 30, y: 32, width: 320, height: 180 }, 1000, 800)).toMatchObject({
      x: 24,
      y: 24
    })
  })
})
