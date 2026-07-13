import { useDownloads } from './hooks/useDownloads'
import { usePlayback } from './hooks/usePlayback'
import { useSession } from './hooks/useSession'
import { useSubtitles } from './hooks/useSubtitles'
import { useWatchAlongController } from './hooks/useWatchAlongController'

export function App(): JSX.Element {
  const playback = usePlayback()
  const sessionState = useSession()
  const subtitles = useSubtitles()
  const downloads = useDownloads()

  return useWatchAlongController({ playback, sessionState, subtitles, downloads })
}
