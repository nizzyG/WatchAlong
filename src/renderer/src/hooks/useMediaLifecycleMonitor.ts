import { useEffect, useRef } from 'react'
import type { LibrarySession, MediaRole, RemoteMediaState } from '@shared/types'
import {
  MediaPlaybackErrorMonitor,
  mediaPlaybackErrorMessage,
  observeHtmlVideo,
  type MediaPlaybackObservation
} from '../playback/MediaPlaybackErrorMonitor'
import type { PlaybackHook } from './usePlayback'

interface UseMediaLifecycleMonitorOptions {
  playback: PlaybackHook
  activeSession: LibrarySession | null
  persist: (patch: Partial<LibrarySession>) => Promise<LibrarySession | null>
}

export function useMediaLifecycleMonitor({
  playback,
  activeSession,
  persist
}: UseMediaLifecycleMonitorOptions) {
  const {
    reactionVideoRef,
    movieVideoRef,
    controllerRef,
    positionRef,
    setupMode,
    setPosition,
    setMoviePosition,
    setSetupPositions,
    setMetadataReady,
    setDurations,
    setError,
    setSyncState
  } = playback
  const mediaRecoveryCleanupRef = useRef<Record<MediaRole, (() => void) | null>>({
    reaction: null,
    movie: null
  })
  const mediaErrorMonitorRef = useRef<MediaPlaybackErrorMonitor | null>(null)

  if (!mediaErrorMonitorRef.current) {
    mediaErrorMonitorRef.current = new MediaPlaybackErrorMonitor({
      onActionable: (role) => {
        setError(mediaPlaybackErrorMessage(role))
        setSyncState('error')
      },
      onRecovery: (role, wasDisplayed) => {
        mediaRecoveryCleanupRef.current[role]?.()
        mediaRecoveryCleanupRef.current[role] = null
        if (!wasDisplayed) return

        const message = mediaPlaybackErrorMessage(role)
        setError((current) => current === message ? null : current)
        setSyncState(controllerRef.current?.getState() ?? 'paused')
      }
    })
  }

  useEffect(() => () => {
    mediaErrorMonitorRef.current?.destroy()
    for (const role of ['reaction', 'movie'] as const) {
      mediaRecoveryCleanupRef.current[role]?.()
      mediaRecoveryCleanupRef.current[role] = null
    }
  }, [])

  const handleMetadata = (role: MediaRole): void => {
    const element = role === 'reaction' ? reactionVideoRef.current : movieVideoRef.current
    const duration = element?.duration ?? Number.NaN
    setDurations((current) => ({ ...current, [role]: duration }))
    setMetadataReady((current) => ({ ...current, [role]: true }))
    setSetupPositions((current) => ({ ...current, [role]: element?.currentTime ?? 0 }))
    if (
      role === 'reaction' && activeSession && Number.isFinite(duration) &&
      Math.abs((activeSession.reactionDurationSeconds ?? 0) - duration) > 0.5
    ) {
      void persist({ reactionDurationSeconds: duration })
    }
    if (role === 'movie') setMoviePosition(element?.currentTime ?? 0)
    if (element) handleVideoRecovery(role, element)
  }

  const handleTimeUpdate = (role: MediaRole): void => {
    const element = role === 'reaction' ? reactionVideoRef.current : movieVideoRef.current
    if (!element || element.readyState === 0 || !Number.isFinite(element.currentTime)) return

    const currentTime = element.currentTime
    if (role === 'movie') {
      setMoviePosition(currentTime)
    } else {
      // Native media time is the fallback authority when the controller loop
      // is throttled or absent (for example during window lifecycle changes).
      positionRef.current = currentTime
      setPosition(currentTime)
    }
    handleVideoRecovery(role, element)
    if (!setupMode) return
    setSetupPositions((current) => ({ ...current, [role]: currentTime }))
  }

  const handleVideoError = (role: MediaRole, source: HTMLVideoElement | RemoteMediaState): void => {
    const monitor = mediaErrorMonitorRef.current
    if (!monitor) return

    if (!(source instanceof HTMLVideoElement)) {
      const observation = observeRemoteMedia(source, true)
      monitor.reportError(role, () => observation)
      return
    }

    mediaRecoveryCleanupRef.current[role]?.()
    const recoveryEvents = ['loadeddata', 'canplay', 'canplaythrough', 'playing'] as const
    const onRecovery = (): void => {
      handleVideoRecovery(role, source)
    }
    const cleanup = (): void => {
      for (const eventName of recoveryEvents) source.removeEventListener(eventName, onRecovery)
    }
    mediaRecoveryCleanupRef.current[role] = cleanup
    for (const eventName of recoveryEvents) source.addEventListener(eventName, onRecovery)

    monitor.reportError(role, () => {
      const current = role === 'reaction' ? reactionVideoRef.current : movieVideoRef.current
      return current === source ? observeHtmlVideo(source) : null
    })
  }

  const handleVideoRecovery = (role: MediaRole, source: HTMLVideoElement | RemoteMediaState): void => {
    const observation = source instanceof HTMLVideoElement
      ? observeHtmlVideo(source)
      : observeRemoteMedia(source, false)
    if (!mediaErrorMonitorRef.current?.reportRecovery(role, observation)) return

    mediaRecoveryCleanupRef.current[role]?.()
    mediaRecoveryCleanupRef.current[role] = null
  }

  return {
    handleMetadata,
    handleTimeUpdate,
    handleVideoError,
    handleVideoRecovery
  }
}

function observeRemoteMedia(state: RemoteMediaState, hasError: boolean): MediaPlaybackObservation {
  return {
    currentTime: Number.isFinite(state.currentTime) ? state.currentTime : 0,
    readyState: state.readyState,
    ended: state.ended,
    hasError,
    source: null
  }
}
