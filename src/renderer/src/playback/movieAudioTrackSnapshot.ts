import type { MovieAudioTrackSnapshot } from '@shared/types'
import { inspectAudioTracks, toAudioTrackPreference } from './audioTrackCapability'

const EMPTY_AUDIO_TRACK_SNAPSHOT: MovieAudioTrackSnapshot = { tracks: [], selected: null }

/** Serializes only playable metadata and selection state; native track ids never cross IPC. */
export function snapshotAudioTracks(media: HTMLMediaElement): MovieAudioTrackSnapshot {
  const capability = inspectAudioTracks(media)
  if (!capability.supported) return EMPTY_AUDIO_TRACK_SNAPSHOT

  const tracks = capability.tracks.map((track) => ({ ...track }))
  const selected = tracks.find((track) => track.enabled) ?? null
  return {
    tracks,
    selected: selected ? toAudioTrackPreference(selected) : null
  }
}
