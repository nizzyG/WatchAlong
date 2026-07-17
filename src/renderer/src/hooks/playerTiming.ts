import type { PlaybackRate, ReactorSource } from '@shared/types'
import { clamp, round } from '@shared/numeric'

export const playbackRates: PlaybackRate[] = [1, 1.25, 1.5, 2]

export const reactorSourceOptions: Array<{ source: ReactorSource; label: string; summary: string }> = [
  { source: 'ntsc', label: '23.976 fps (most movies, Blu-ray, streaming)', summary: '23.976 fps' },
  { source: 'streaming', label: '24.000 fps (select streaming originals)', summary: '24.000 fps' },
  { source: 'pal', label: '25.000 fps (PAL DVD, European broadcast)', summary: '25.000 fps' }
]

export const manualMovieSourceRates = [
  { label: 'Matched', rate: 1 },
  { label: 'Stream 24 -> Blu-ray 23.976', rate: 1.001 },
  { label: 'Reverse', rate: 0.999001 }
]

const reactorSourceFps: Record<ReactorSource, number> = {
  streaming: 24,
  ntsc: 24000 / 1001,
  pal: 25
}

export function calculateMovieRateCorrection(
  detectedMovieFps: number | null,
  reactorSource: ReactorSource
): number | null {
  if (detectedMovieFps === null || !Number.isFinite(detectedMovieFps) || detectedMovieFps <= 0) {
    return null
  }

  const sourceFps = reactorSourceFps[reactorSource]
  return round(clamp(sourceFps / detectedMovieFps, 0.9, 1.1), 6)
}

export function roundSeconds(value: number): number {
  return round(value, 6)
}
