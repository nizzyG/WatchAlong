import { LogIn, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AudioTrackPreference,
  MovieWindowInit,
  RemoteMediaCommand,
  RemoteMediaEventType,
  RemoteMediaState
} from '@shared/types'
import {
  isFullscreenShortcut,
  isInteractiveShortcutTarget
} from './keyboardShortcuts'
import { useStoredCabinetTheme } from './hooks/useCabinetTheme'
import {
  selectAudioTrack,
  toAudioTrackPreference,
  type AudioTrackSelectionResult,
  type BrowserAudioTrackList
} from './playback/audioTrackCapability'
import { snapshotAudioTracks } from './playback/movieAudioTrackSnapshot'

const mediaEvents: RemoteMediaEventType[] = [
  'play',
  'pause',
  'seeking',
  'seeked',
  'waiting',
  'canplay',
  'stalled',
  'ended',
  'error',
  'timeupdate',
  'durationchange',
  'ratechange',
  'volumechange',
  'loadeddata',
  'canplaythrough'
]

export function MovieWindowApp(): JSX.Element {
  useStoredCabinetTheme()
  const windowRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [init, setInit] = useState<MovieWindowInit | null>(null)
  const [subtitleText, setSubtitleText] = useState<string | null>(null)
  const [fadingOut, setFadingOut] = useState(false)
  const audioTrackPreferenceRef = useRef<AudioTrackPreference | null>(null)
  const audioTrackQueueRef = useRef<Promise<void> | null>(null)

  const queueAudioTrackSelection = useCallback((
    video: HTMLVideoElement,
    preference: AudioTrackPreference
  ): Promise<AudioTrackSelectionResult> => {
    const previous = audioTrackQueueRef.current
    const operation = previous
      ? previous.catch(() => undefined).then(() => selectAudioTrack(video, preference))
      : selectAudioTrack(video, preference)
    const tail = operation.then(() => undefined, () => undefined)
    audioTrackQueueRef.current = tail
    void tail.then(() => {
      if (audioTrackQueueRef.current === tail) audioTrackQueueRef.current = null
    })
    return operation
  }, [])

  const toggleFullscreen = useCallback((): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
      return
    }

    const request = windowRef.current?.requestFullscreen()
    if (request) void request.catch(() => undefined)
  }, [])

  useEffect(() => {
    const unsubscribe = window.watchAlong.onMovieMediaCommand((command) => {
      void executeCommand(command, videoRef.current, {
        setInit,
        setSubtitleText,
        setFadingOut,
        setAudioTrackPreference: (preference) => { audioTrackPreferenceRef.current = preference },
        selectAudioTrack: queueAudioTrackSelection
      })
    })
    void window.watchAlong.movieWindowReady()
    return unsubscribe
  }, [queueAudioTrackSelection])

  useEffect(() => {
    let mounted = true
    void window.watchAlong.getMovieWindowInit().then((nextInit) => {
      if (!mounted || !nextInit) {
        return
      }

      setInit(nextInit)
      setSubtitleText(nextInit.subtitleText)
      audioTrackPreferenceRef.current = nextInit.audioTrackPreference
    })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !init) {
      return
    }

    if (video.src !== init.mediaUrl) {
      video.src = init.mediaUrl
    }
    audioTrackPreferenceRef.current = init.audioTrackPreference
    video.currentTime = init.currentTime
    video.playbackRate = init.playbackRate
    video.volume = init.volume
    video.muted = init.muted
  }, [init])

  useEffect(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    const sendEvent = (event: Event): void => {
      void window.watchAlong.reportMovieMediaEvent({
        type: event.type as RemoteMediaEventType,
        state: stateFromVideo(video),
        error: video.error?.message ?? undefined
      })
    }

    const sendAudioTrackEvent = (type: 'loadedmetadata' | 'audiotrackchange'): void => {
      void window.watchAlong.reportMovieMediaEvent({
        type,
        state: stateFromVideo(video),
        audioTrackSnapshot: snapshotAudioTracks(video),
        error: video.error?.message ?? undefined
      })
    }

    const onLoadedMetadata = (): void => {
      void (async () => {
        const preference = audioTrackPreferenceRef.current
        if (preference) await queueAudioTrackSelection(video, preference)
        sendAudioTrackEvent('loadedmetadata')
      })()
    }

    let audioTrackChangeQueued = false
    const onAudioTrackChange = (): void => {
      if (audioTrackChangeQueued) return
      audioTrackChangeQueued = true
      queueMicrotask(() => {
        audioTrackChangeQueued = false
        sendAudioTrackEvent('audiotrackchange')
      })
    }

    video.addEventListener('loadedmetadata', onLoadedMetadata)
    let nativeAudioTracks: BrowserAudioTrackList | null = null
    try {
      const candidate = (video as unknown as { audioTracks?: unknown }).audioTracks as BrowserAudioTrackList | undefined
      if (typeof candidate?.addEventListener === 'function' && typeof candidate.removeEventListener === 'function') {
        nativeAudioTracks = candidate
        nativeAudioTracks.addEventListener('change', onAudioTrackChange)
      }
    } catch {
      // Future Electron versions may remove the draft API. Ordinary playback
      // remains available and the main renderer will hide the selector.
    }

    for (const eventName of mediaEvents) {
      video.addEventListener(eventName, sendEvent)
    }

    return () => {
      for (const eventName of mediaEvents) {
        video.removeEventListener(eventName, sendEvent)
      }
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      nativeAudioTracks?.removeEventListener('change', onAudioTrackChange)
    }
  }, [queueAudioTrackSelection])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        !isFullscreenShortcut(event)
        || isInteractiveShortcutTarget(event.target)
      ) return

      event.preventDefault()
      if (event.repeat) return
      toggleFullscreen()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleFullscreen])

  const title = init?.title ?? 'Movie'

  return (
    <main ref={windowRef} className={`movie-window ${fadingOut ? 'movie-window-fading' : ''}`}>
      <header className="movie-window-titlebar">
        <span>{title}</span>
        <button
          className="icon-button"
          type="button"
          title="Pop movie back in"
          aria-label="Pop movie back in"
          onClick={() => void window.watchAlong.requestMovieWindowPopIn()}
        >
          <LogIn size={16} aria-hidden />
        </button>
        <button
          className="icon-button"
          type="button"
          title="Close"
          aria-label="Close"
          onClick={() => void window.watchAlong.requestMovieWindowPopIn()}
        >
          <X size={16} aria-hidden />
        </button>
      </header>
      <video ref={videoRef} className="movie-window-video" playsInline preload="metadata" onDoubleClick={toggleFullscreen} />
      {subtitleText && <div className="movie-window-subtitles">{subtitleText}</div>}
    </main>
  )
}

async function executeCommand(
  command: RemoteMediaCommand,
  video: HTMLVideoElement | null,
  setters: {
    setInit(value: MovieWindowInit | null): void
    setSubtitleText(value: string | null): void
    setFadingOut(value: boolean): void
    setAudioTrackPreference(value: AudioTrackPreference | null): void
    selectAudioTrack(video: HTMLVideoElement, preference: AudioTrackPreference): Promise<AudioTrackSelectionResult>
  }
): Promise<void> {
  if (!video) {
    await window.watchAlong.acknowledgeMovieMediaCommand({
      id: command.id,
      ok: false,
      state: emptyState(),
      error: 'Movie video is not ready.'
    })
    return
  }

  try {
    switch (command.type) {
      case 'setSource':
        setters.setInit({
          sessionId: '',
          title: command.title,
          mediaUrl: command.mediaUrl ?? '',
          subtitleText: command.subtitleText,
          currentTime: command.currentTime,
          playbackRate: command.playbackRate,
          volume: command.volume,
          muted: command.muted,
          audioTrackPreference: command.audioTrackPreference
        })
        setters.setSubtitleText(command.subtitleText)
        setters.setAudioTrackPreference(command.audioTrackPreference)
        if (video.src !== (command.mediaUrl ?? '')) {
          video.src = command.mediaUrl ?? ''
        }
        video.currentTime = command.currentTime
        video.playbackRate = command.playbackRate
        video.volume = command.volume
        video.muted = command.muted
        break
      case 'play':
        await video.play()
        break
      case 'pause':
        video.pause()
        break
      case 'setCurrentTime':
        video.currentTime = command.value
        break
      case 'setPlaybackRate':
        video.playbackRate = command.value
        break
      case 'setVolume':
        video.volume = command.value
        break
      case 'setMuted':
        video.muted = command.value
        break
      case 'setSubtitleText':
        setters.setSubtitleText(command.value)
        break
      case 'setAudioTrack': {
        const selection = await setters.selectAudioTrack(video, command.value)
        if (
          (selection.status !== 'selected' && selection.status !== 'already-selected')
          || !selection.track
        ) {
          throw new Error('The requested movie audio track is not available.')
        }
        setters.setAudioTrackPreference(toAudioTrackPreference(selection.track))
        break
      }
      case 'fadeOut':
        setters.setFadingOut(true)
        await new Promise((resolve) => window.setTimeout(resolve, 220))
        break
    }

    await window.watchAlong.acknowledgeMovieMediaCommand({
      id: command.id,
      ok: true,
      state: stateFromVideo(video),
      audioTrackSnapshot: snapshotAudioTracks(video)
    })
  } catch (error) {
    await window.watchAlong.acknowledgeMovieMediaCommand({
      id: command.id,
      ok: false,
      state: stateFromVideo(video),
      audioTrackSnapshot: snapshotAudioTracks(video),
      error: error instanceof Error ? error.message : 'Movie command failed.'
    })
  }
}

function stateFromVideo(video: HTMLVideoElement): RemoteMediaState {
  return {
    currentTime: finiteOr(video.currentTime, 0),
    duration: Number.isFinite(video.duration) ? video.duration : Number.NaN,
    paused: video.paused,
    playbackRate: finiteOr(video.playbackRate, 1),
    readyState: video.readyState,
    seeking: video.seeking,
    ended: video.ended,
    volume: finiteOr(video.volume, 1),
    muted: video.muted
  }
}

function emptyState(): RemoteMediaState {
  return {
    currentTime: 0,
    duration: Number.NaN,
    paused: true,
    playbackRate: 1,
    readyState: 0,
    seeking: false,
    ended: false,
    volume: 1,
    muted: false
  }
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}
