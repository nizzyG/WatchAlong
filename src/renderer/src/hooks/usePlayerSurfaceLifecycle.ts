import { useCallback, useEffect, useMemo } from 'react'
import type { LibrarySession } from '@shared/types'
import { getActiveSubtitleCue, hasSubtitleContentBeyondHeader, parseSubtitleText } from '../subtitles'
import type { PlaybackHook } from './usePlayback'
import type { SessionHook } from './useSession'
import type { SubtitlesHook } from './useSubtitles'

const UNSUPPORTED_SUBTITLE_FORMAT_ERROR = "This subtitle format isn't supported. Use SRT or VTT."

interface UsePlayerSurfaceLifecycleOptions {
  playback: PlaybackHook
  sessionState: SessionHook
  subtitles: SubtitlesHook
  activeSession: LibrarySession | null
}

/**
 * Owns lifecycle behavior tied to the primary player surfaces rather than to
 * transport or timing controls.
 */
export function usePlayerSurfaceLifecycle({
  playback,
  sessionState,
  subtitles,
  activeSession
}: UsePlayerSurfaceLifecycleOptions) {
  const {
    moviePosition,
    movieWindowActive,
    setError
  } = playback
  const { appView } = sessionState
  const {
    subtitleCues,
    setSubtitleCues,
    subtitlesEnabled,
    setSubtitlesEnabled
  } = subtitles
  const activeSubtitleText = useMemo(
    () => subtitlesEnabled ? getActiveSubtitleCue(subtitleCues, moviePosition)?.text ?? null : null,
    [moviePosition, subtitleCues, subtitlesEnabled]
  )

  useEffect(() => {
    let mounted = true

    void (async () => {
      setSubtitlesEnabled(true)
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
  }, [activeSession?.id, activeSession?.subtitlePath, setSubtitlesEnabled])

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
