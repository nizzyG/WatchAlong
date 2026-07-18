import { useState } from 'react'
import type { SubtitleCue } from '../subtitles'

export function useSubtitles() {
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([])
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true)

  return {
    subtitleCues,
    setSubtitleCues,
    subtitlesEnabled,
    setSubtitlesEnabled,
    toggleSubtitles: () => setSubtitlesEnabled((enabled) => !enabled)
  }
}

export type SubtitlesHook = ReturnType<typeof useSubtitles>
