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
  | 'isReactionMuted'
  | 'isMovieMuted'
  | 'playbackRate'
  | 'reactorSource'
  | 'detectedMovieFps'
  | 'movieRateCorrection'
>>

const rendererWritableSessionKeys = new Set<keyof RendererSessionPatch>([
  'reactionDurationSeconds',
  'offsetSeconds',
  'lastReactionTimeSeconds',
  'overlay',
  'isPipHidden',
  'isMoviePoppedOut',
  'movieWindowGeometry',
  'reactionVolume',
  'movieVolume',
  'isReactionMuted',
  'isMovieMuted',
  'playbackRate',
  'reactorSource',
  'detectedMovieFps',
  'movieRateCorrection'
])

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
