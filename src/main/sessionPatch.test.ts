import { describe, expect, it } from 'vitest'
import { pickMovieWindowSessionPatch, pickRendererSessionPatch } from './sessionPatch'

describe('renderer session patch allowlist', () => {
  it('keeps playback preferences and removes privileged session fields', () => {
    expect(pickRendererSessionPatch({
      offsetSeconds: 12.5,
      movieAudioTrackPreference: { label: 'Indonesian (5.1)', language: 'ind', ordinal: 1 },
      reactorName: 'Cinema Therapy',
      reactorNameOrigin: 'metadata',
      reactorId: 'reactor-attacker-controlled',
      isPipHidden: true,
      overlay: { x: 0.4, y: 0.3, width: 0.25, height: 0.25 },
      id: 'replacement-id',
      title: 'Injected title',
      moviePath: 'C:\\Users\\user\\private.txt',
      moviePosterPath: 'C:\\Users\\user\\private.jpg',
      reactionPath: 'C:\\Users\\user\\private.txt',
      subtitlePath: 'C:\\Users\\user\\private.txt',
      timingOrigin: 'automatic',
      autoSyncConfidence: 1,
      createdAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z'
    })).toEqual({
      offsetSeconds: 12.5,
      movieAudioTrackPreference: { label: 'Indonesian (5.1)', language: 'ind', ordinal: 1 },
      reactorName: 'Cinema Therapy',
      isPipHidden: true,
      overlay: { x: 0.4, y: 0.3, width: 0.25, height: 0.25 }
    })
  })

  it('treats malformed patches as empty', () => {
    expect(pickRendererSessionPatch(null)).toEqual({})
    expect(pickRendererSessionPatch('offsetSeconds')).toEqual({})
    expect(pickRendererSessionPatch([])).toEqual({})
  })
})

describe('movie window session patch allowlist', () => {
  it('allows only pop-out state and geometry fields', () => {
    expect(pickMovieWindowSessionPatch({
      isMoviePoppedOut: true,
      movieWindowGeometry: { x: 10, y: 20, width: 400, height: 225 },
      overlay: { x: 30, y: 40, width: 320, height: 180 },
      moviePath: 'C:\\Users\\attacker\\movie.mp4',
      title: 'Changed by renderer'
    })).toEqual({
      isMoviePoppedOut: true,
      movieWindowGeometry: { x: 10, y: 20, width: 400, height: 225 },
      overlay: { x: 30, y: 40, width: 320, height: 180 }
    })
  })

  it('treats malformed patches as empty', () => {
    expect(pickMovieWindowSessionPatch(null)).toEqual({})
    expect(pickMovieWindowSessionPatch(['isMoviePoppedOut'])).toEqual({})
  })
})
