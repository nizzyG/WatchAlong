import { LogIn, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
  MovieWindowInit,
  RemoteMediaCommand,
  RemoteMediaEventType,
  RemoteMediaState
} from '@shared/types'

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
  'loadedmetadata',
  'durationchange',
  'ratechange',
  'volumechange',
  'loadeddata',
  'canplaythrough'
]

export function MovieWindowApp(): JSX.Element {
  const windowRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [init, setInit] = useState<MovieWindowInit | null>(null)
  const [subtitleText, setSubtitleText] = useState<string | null>(null)
  const [fadingOut, setFadingOut] = useState(false)

  useEffect(() => {
    const unsubscribe = window.watchAlong.onMovieMediaCommand((command) => {
      void executeCommand(command, videoRef.current, {
        setInit,
        setSubtitleText,
        setFadingOut
      })
    })
    void window.watchAlong.movieWindowReady()
    return unsubscribe
  }, [])

  useEffect(() => {
    let mounted = true
    void window.watchAlong.getMovieWindowInit().then((nextInit) => {
      if (!mounted || !nextInit) {
        return
      }

      setInit(nextInit)
      setSubtitleText(nextInit.subtitleText)
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

    for (const eventName of mediaEvents) {
      video.addEventListener(eventName, sendEvent)
    }

    return () => {
      for (const eventName of mediaEvents) {
        video.removeEventListener(eventName, sendEvent)
      }
    }
  }, [])

  const title = init?.title ?? 'Movie'

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }

    void windowRef.current?.requestFullscreen()
  }

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
          muted: command.muted
        })
        setters.setSubtitleText(command.subtitleText)
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
      case 'fadeOut':
        setters.setFadingOut(true)
        await new Promise((resolve) => window.setTimeout(resolve, 220))
        break
    }

    await window.watchAlong.acknowledgeMovieMediaCommand({
      id: command.id,
      ok: true,
      state: stateFromVideo(video)
    })
  } catch (error) {
    await window.watchAlong.acknowledgeMovieMediaCommand({
      id: command.id,
      ok: false,
      state: stateFromVideo(video),
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
