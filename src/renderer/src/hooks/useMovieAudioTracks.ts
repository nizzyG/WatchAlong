import { useEffect, useMemo, useRef } from 'react'
import type {
  AudioTrackPreference,
  LibrarySession,
  MovieAudioTrackSnapshot
} from '@shared/types'
import {
  inspectAudioTracks,
  matchAudioTrackPreference,
  selectAudioTrack
} from '../playback/audioTrackCapability'
import {
  EMPTY_AUDIO_TRACK_SNAPSHOT,
  snapshotAudioTracks
} from '../playback/movieAudioTrackSnapshot'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'

const AUDIO_TRACK_SWITCH_ERROR = 'WatchAlong could not switch the movie audio track. Playback was left unchanged.'

interface UseMovieAudioTracksOptions {
  playback: PlaybackHook
  sessionState: SessionHook
  activeSession: LibrarySession | null
  persist: (patch: Partial<LibrarySession>) => Promise<LibrarySession | null>
}

export function useMovieAudioTracks({
  playback,
  sessionState,
  activeSession,
  persist
}: UseMovieAudioTracksOptions) {
  const {
    movieVideoRef,
    mediaUrls,
    movieWindowActive,
    movieAudioTrackSnapshot,
    setMovieAudioTrackSnapshot,
    movieAudioTrackChanging,
    setMovieAudioTrackChanging,
    setError
  } = playback
  const { sessionRef, activeSessionIdRef } = sessionState
  const initializationGenerationRef = useRef(0)
  const selectionInFlightRef = useRef(false)
  const activeSessionId = activeSession?.id ?? null
  const preferenceKey = preferenceIdentity(activeSession?.movieAudioTrackPreference ?? null)

  useEffect(() => {
    setMovieAudioTrackSnapshot(EMPTY_AUDIO_TRACK_SNAPSHOT)
    setMovieAudioTrackChanging(false)
  }, [activeSessionId, mediaUrls.movie])

  useEffect(() => {
    if (movieWindowActive || !activeSessionId || !mediaUrls.movie) return
    const video = movieVideoRef.current
    if (!video) return

    const generation = ++initializationGenerationRef.current
    let disposed = false
    let initialization: Promise<void> | null = null
    const isCurrent = (): boolean =>
      !disposed && generation === initializationGenerationRef.current &&
      activeSessionIdRef.current === activeSessionId

    const runInitialization = async (): Promise<void> => {
      let capability = inspectAudioTracks(video)
      if (!isCurrent()) return

      const preference = sessionRef.current.id === activeSessionId
        ? sessionRef.current.movieAudioTrackPreference
        : null
      if (preference && capability.supported && capability.tracks.length > 0) {
        const result = await selectAudioTrack(video, preference)
        if (!isCurrent()) return
        if (result.status === 'selected' || result.status === 'already-selected') {
          capability = inspectAudioTracks(video)
        }
      }

      if (isCurrent()) setMovieAudioTrackSnapshot(snapshotAudioTracks(video))
    }

    const initialize = (): Promise<void> => {
      initialization ??= runInitialization()
      return initialization
    }

    const onLoadedMetadata = (): void => { void initialize() }
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    if (
      video.readyState >= HTMLMediaElement.HAVE_METADATA &&
      inspectAudioTracks(video).tracks.length > 0
    ) void initialize()

    return () => {
      disposed = true
      initializationGenerationRef.current += 1
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
    }
  }, [activeSessionId, mediaUrls.movie, movieWindowActive, preferenceKey])

  const selectableTracks = useMemo(
    () => movieAudioTrackSnapshot.tracks.length > 1 ? movieAudioTrackSnapshot.tracks : [],
    [movieAudioTrackSnapshot.tracks]
  )

  const selectMovieAudioTrack = async (preference: AudioTrackPreference): Promise<boolean> => {
    const sessionId = activeSessionIdRef.current
    if (!sessionId || selectionInFlightRef.current) return false

    selectionInFlightRef.current = true
    setMovieAudioTrackChanging(true)
    try {
      let snapshot: MovieAudioTrackSnapshot | null = null
      if (playback.movieWindowActive) {
        const result = await window.watchAlong.sendMovieMediaCommand({
          id: `audio-track-${Date.now()}`,
          type: 'setAudioTrack',
          value: preference
        })
        if (!result.ok || !result.audioTrackSnapshot) {
          setError(AUDIO_TRACK_SWITCH_ERROR)
          return false
        }
        snapshot = result.audioTrackSnapshot
      } else {
        const video = movieVideoRef.current
        if (!video) return false
        const result = await selectAudioTrack(video, preference)
        snapshot = snapshotAudioTracks(video)
        if (result.status !== 'selected' && result.status !== 'already-selected') {
          setMovieAudioTrackSnapshot(snapshot)
          setError(AUDIO_TRACK_SWITCH_ERROR)
          return false
        }
      }

      const selected = snapshot.selected
      const matched = matchAudioTrackPreference(snapshot.tracks, preference)
      if (
        !selected || !matched || !sameAudioTrack(selected, matched) ||
        activeSessionIdRef.current !== sessionId
      ) {
        setError(AUDIO_TRACK_SWITCH_ERROR)
        return false
      }

      setMovieAudioTrackSnapshot(snapshot)
      const saved = await persist({ movieAudioTrackPreference: selected })
      if (!saved || activeSessionIdRef.current !== sessionId) {
        setError('The audio changed, but WatchAlong could not remember it for this session.')
        return false
      }
      setError((current) => current === AUDIO_TRACK_SWITCH_ERROR ? null : current)
      return true
    } catch {
      setError(AUDIO_TRACK_SWITCH_ERROR)
      return false
    } finally {
      selectionInFlightRef.current = false
      setMovieAudioTrackChanging(false)
    }
  }

  return {
    movieAudioTracks: selectableTracks,
    selectedMovieAudioTrack: movieAudioTrackSnapshot.selected,
    movieAudioTrackChanging,
    selectMovieAudioTrack
  }
}

function preferenceIdentity(preference: AudioTrackPreference | null): string {
  return preference
    ? `${preference.ordinal}\u0000${preference.label}\u0000${preference.language}`
    : ''
}

function sameAudioTrack(left: AudioTrackPreference, right: AudioTrackPreference): boolean {
  return left.ordinal === right.ordinal && left.label === right.label && left.language === right.language
}
