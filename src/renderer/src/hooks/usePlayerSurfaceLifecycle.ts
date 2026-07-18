import { useCallback, useEffect, useMemo } from 'react'
import type { LibrarySession } from '@shared/types'
import { getActiveSubtitleCue, hasSubtitleContentBeyondHeader, parseSubtitleText } from '../subtitles'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'
import type { SubtitlesHook } from './useSubtitles'

const CONTROL_IDLE_DELAY_MS = 2400
const UNSUPPORTED_SUBTITLE_FORMAT_ERROR = "This subtitle format isn't supported. Use SRT or VTT."

interface UsePlayerSurfaceLifecycleOptions {
  playback: PlaybackHook
  sessionState: SessionHook
  subtitles: SubtitlesHook
  activeSession: LibrarySession | null
  shouldAutoHideControls: boolean
}

/**
 * Owns lifecycle behavior tied to the primary player surfaces rather than to
 * transport or timing controls.
 */
export function usePlayerSurfaceLifecycle({
  playback,
  sessionState,
  subtitles,
  activeSession,
  shouldAutoHideControls
}: UsePlayerSurfaceLifecycleOptions) {
  const {
    moviePosition,
    movieWindowActive,
    setControlsIdle,
    setError
  } = playback
  const { appView } = sessionState
  const { subtitleCues, setSubtitleCues } = subtitles
  const activeSubtitleText = useMemo(
    () => getActiveSubtitleCue(subtitleCues, moviePosition)?.text ?? null,
    [moviePosition, subtitleCues]
  )

  useEffect(() => {
    let mounted = true

    void (async () => {
      if (!activeSession?.subtitlePath) {
        setSubtitleCues([])
        return
      }

      const text = await window.watchAlong.getSubtitleText(activeSession.id)
      if (mounted) {
        const cues = text ? parseSubtitleText(text) : []
        setSubtitleCues(cues)
        if (text && cues.length === 0 && hasSubtitleContentBeyondHeader(text)) {
          setError(UNSUPPORTED_SUBTITLE_FORMAT_ERROR)
        }
      }
    })()

    return () => {
      mounted = false
    }
  }, [activeSession?.id, activeSession?.subtitlePath])

  useEffect(() => {
    if (!movieWindowActive) return

    void window.watchAlong.sendMovieMediaCommand({
      id: `subtitle-${Date.now()}`,
      type: 'setSubtitleText',
      value: activeSubtitleText
    })
  }, [activeSubtitleText, movieWindowActive])

  // Fullscreen belongs to the two primary application surfaces. Keep it while
  // moving between the library and player, but leave it for loading and
  // recovery screens, including when a delayed request settles after navigation.
  useEffect(() => {
    const exitFullscreenOutsidePrimaryView = (): void => {
      if (appView === 'library' || appView === 'player' || !document.fullscreenElement) return
      void document.exitFullscreen().catch(() => undefined)
    }

    exitFullscreenOutsidePrimaryView()
    document.addEventListener('fullscreenchange', exitFullscreenOutsidePrimaryView)
    return () => document.removeEventListener('fullscreenchange', exitFullscreenOutsidePrimaryView)
  }, [appView])

  useEffect(() => {
    let timer: number | undefined

    const clearIdleTimer = (): void => {
      if (timer !== undefined) {
        window.clearTimeout(timer)
        timer = undefined
      }
    }

    const markActive = (): void => {
      setControlsIdle(false)
      clearIdleTimer()
      if (shouldAutoHideControls) {
        timer = window.setTimeout(() => setControlsIdle(true), CONTROL_IDLE_DELAY_MS)
      }
    }

    markActive()
    if (!shouldAutoHideControls) return clearIdleTimer

    window.addEventListener('mousemove', markActive)
    window.addEventListener('mousedown', markActive)
    window.addEventListener('wheel', markActive, { passive: true })
    window.addEventListener('keydown', markActive)
    window.addEventListener('touchstart', markActive, { passive: true })

    return () => {
      clearIdleTimer()
      window.removeEventListener('mousemove', markActive)
      window.removeEventListener('mousedown', markActive)
      window.removeEventListener('wheel', markActive)
      window.removeEventListener('keydown', markActive)
      window.removeEventListener('touchstart', markActive)
    }
  }, [shouldAutoHideControls])

  const toggleFullscreen = useCallback((): void => {
    if (appView !== 'library' && appView !== 'player') return
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
      return
    }
    void document.documentElement.requestFullscreen().catch(() => undefined)
  }, [appView])

  return { activeSubtitleText, toggleFullscreen }
}
