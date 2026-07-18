import type { LibrarySession, MovieWindowSessionPatch } from '@shared/types'

export type RendererSessionPatch = Partial<Pick<
  LibrarySession,
  | 'reactionDurationSeconds'
  | 'offsetSeconds'
  | 'lastReactionTimeSeconds'
  | 'overlay'
  | 'isPipHidden'
  | 'isMoviePoppedOut'
  | 'movieWindowGeometry'
  | 'reactionVolume'
  | 'movieVolume'
  | 'movieAudioTrackPreference'
  | 'isReactionMuted'
  | 'isMovieMuted'
  | 'playbackRate'
  | 'reactorSource'
  | 'detectedMovieFps'
  | 'movieRateCorrection'
  | 'reactorName'
>>

const rendererWritableSessionKeyRecord = {
  reactionDurationSeconds: true,
  offsetSeconds: true,
  lastReactionTimeSeconds: true,
  overlay: true,
  isPipHidden: true,
  isMoviePoppedOut: true,
  movieWindowGeometry: true,
  reactionVolume: true,
  movieVolume: true,
  movieAudioTrackPreference: true,
  isReactionMuted: true,
  isMovieMuted: true,
  playbackRate: true,
  reactorSource: true,
  detectedMovieFps: true,
  movieRateCorrection: true,
  reactorName: true
} satisfies Record<keyof RendererSessionPatch, true>

const rendererWritableSessionKeys = Object.keys(
  rendererWritableSessionKeyRecord
) as Array<keyof RendererSessionPatch>

export function pickRendererSessionPatch(value: unknown): RendererSessionPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const source = value as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const key of rendererWritableSessionKeys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      patch[key] = source[key]
    }
  }

  return patch as RendererSessionPatch
}

const movieWindowSessionKeys = new Set<keyof MovieWindowSessionPatch>([
  'isMoviePoppedOut',
  'movieWindowGeometry',
  'overlay'
])

export function pickMovieWindowSessionPatch(value: unknown): MovieWindowSessionPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const source = value as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const key of movieWindowSessionKeys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      patch[key] = source[key]
    }
  }

  return patch as MovieWindowSessionPatch
}
