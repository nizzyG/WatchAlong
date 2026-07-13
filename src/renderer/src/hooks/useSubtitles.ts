import { useState } from 'react'
import type { SubtitleCue } from '../subtitles'

export function useSubtitles() {
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([])
  return { subtitleCues, setSubtitleCues }
}

export type SubtitlesHook = ReturnType<typeof useSubtitles>
