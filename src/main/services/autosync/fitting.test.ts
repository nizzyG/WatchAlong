import { describe, expect, it } from 'vitest'
import { fitAnchors, isConfidentFit } from './fitting'
import type { AutoSyncAnchor } from './matching'

describe('auto-sync robust fitting', () => {
  it.each([
    { rate: 1, offset: -49.25 },
    { rate: 24000 / 1001 / 24, offset: -32.5 },
    { rate: 24 / 25, offset: -203.3 },
    { rate: 25 / 24, offset: 8.4 }
  ])('recovers offset $offset and rate $rate across the runtime', ({ rate, offset }) => {
    const anchors = [100, 1300, 2700, 4300, 6000].map((reactionTime, index) => anchor(reactionTime, reactionTime * rate + offset + (index % 2 ? 0.04 : -0.03)))
    anchors.splice(2, 0, anchor(2200, 4400, 0.2))
    const fit = fitAnchors(anchors, { movieDuration: 7000 })
    expect(fit?.offsetSeconds).toBeCloseTo(offset, 1)
    expect(fit?.movieRateCorrection).toBeCloseTo(rate, 4)
    expect(fit?.residualStats.inlierCount).toBe(5)
    expect(fit && isConfidentFit(fit)).toBe(true)
  })

  it('refuses two anchors and anchors covering too little runtime', () => {
    expect(fitAnchors([anchor(0, 10), anchor(100, 110)], { movieDuration: 1000 })).toBeNull()
    expect(fitAnchors([anchor(0, 10), anchor(100, 110), anchor(200, 210)], { movieDuration: 1000 })).toBeNull()
  })

  it('refuses an implausible rate', () => {
    expect(fitAnchors([anchor(0, 0), anchor(500, 700), anchor(1000, 1400)], { movieDuration: 1000 })).toBeNull()
  })
})

function anchor(reactionTime: number, movieTime: number, confidence = 0.92): AutoSyncAnchor {
  return { reactionTime, movieTime, confidence, score: 0.08, runnerUpScore: 0.4 }
}
