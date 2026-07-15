import { CirclePlay } from 'lucide-react'
import type { ReactionDownloadController } from './useReactionDownload'

export function YouTubePanel({ controller }: { controller: ReactionDownloadController }): JSX.Element {
  const { interactionBusy, setYoutubeUrl, startYouTubeDownload, validYoutubeUrl, youtubeUrl } = controller

  return (
    <div className="expanded-form">
      <label>
        <span>YouTube URL</span>
        <input
          value={youtubeUrl}
          disabled={interactionBusy}
          placeholder="https://www.youtube.com/watch?v=..."
          onChange={(event) => setYoutubeUrl(event.currentTarget.value)}
        />
      </label>
      <button
        className={`primary-button ${validYoutubeUrl && !interactionBusy ? 'pulse-ready' : ''}`}
        type="button"
        disabled={!validYoutubeUrl || interactionBusy}
        onClick={() => void startYouTubeDownload()}
      >
        <CirclePlay size={17} aria-hidden />
        Download &amp; Load
      </button>
      <small>Requires yt-dlp (bundled). No account needed.</small>
    </div>
  )
}
