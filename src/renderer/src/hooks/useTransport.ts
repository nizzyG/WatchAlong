import { clamp } from '@shared/numeric'
import type { LibrarySession, PlaybackRate } from '@shared/types'
import type { PlaybackHook } from './usePlayback'

interface UseTransportOptions {
  playback: PlaybackHook
  activeSession: LibrarySession | null
  session: LibrarySession
  autoSyncBusy: boolean
  canPlay: boolean
  reactionDuration: number
  persist: (patch: Partial<LibrarySession>) => Promise<LibrarySession | null>
}

export function useTransport({
  playback,
  activeSession,
  session,
  autoSyncBusy,
  canPlay,
  reactionDuration,
  persist
}: UseTransportOptions) {
  const {
    reactionVideoRef,
    controllerRef,
    positionRef,
    position,
    setPosition
  } = playback

  const togglePlayPause = (): void => {
    if (!canPlay) return
    if (playback.syncState === 'playing') controllerRef.current?.pause()
    else controllerRef.current?.play()
  }

  const seekBy = (deltaSeconds: number): void => {
    if (!canPlay) return
    controllerRef.current?.seekReaction(Math.max(0, Math.min(reactionDuration, position + deltaSeconds)))
  }

  const seekTo = (value: number): void => {
    if (!canPlay) return
    setPosition(value)
    controllerRef.current?.seekReaction(value)
  }

  const setReactionVolume = (value: number): void => {
    if (!autoSyncBusy) void persist({ reactionVolume: clamp(value, 0, 1) })
  }

  const setMovieVolume = (value: number): void => {
    if (!autoSyncBusy) void persist({ movieVolume: clamp(value, 0, 1) })
  }

  const toggleReactionMute = (): void => {
    if (activeSession && !autoSyncBusy) void persist({ isReactionMuted: !session.isReactionMuted })
  }

  const toggleMovieMute = (): void => {
    if (activeSession && !autoSyncBusy) void persist({ isMovieMuted: !session.isMovieMuted })
  }

  const setPlaybackRate = (playbackRate: PlaybackRate): void => {
    if (!autoSyncBusy) void persist({ playbackRate })
  }

  const getCurrentReactionTime = (): number => {
    const reaction = reactionVideoRef.current
    return reaction && reaction.readyState > 0 && Number.isFinite(reaction.currentTime)
      ? reaction.currentTime
      : positionRef.current
  }

  return {
    togglePlayPause,
    seekBy,
    seekTo,
    setReactionVolume,
    setMovieVolume,
    toggleReactionMute,
    toggleMovieMute,
    setPlaybackRate,
    getCurrentReactionTime
  }
}
