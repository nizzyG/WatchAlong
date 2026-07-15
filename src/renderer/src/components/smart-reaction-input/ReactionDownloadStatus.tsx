import { RefreshCw, X } from 'lucide-react'
import { DownloadProgress } from '../DownloadProgress'
import type { ReactionDownloadController } from './useReactionDownload'

export function ReactionDownloadStatus({ controller }: { controller: ReactionDownloadController }): JSX.Element | null {
  const {
    cancelDownload,
    isWorking,
    progress,
    retryFailedDownload,
    retryNeedsPatreonSignIn
  } = controller

  if (!progress) return null

  return (
    <div className={`download-status download-${progress.state}`} aria-live="polite">
      <div className="download-status-header">
        <div className="download-status-copy">
          <strong>{progress.message}</strong>
          {isWorking && (
            <small>
              {progress.source === 'patreon'
                ? 'Patreon reports each step rather than one overall percentage. WatchAlong shows exactly what it is doing.'
                : 'The reaction is saved straight to your drive. Nothing passes through a WatchAlong server.'}
            </small>
          )}
        </div>
        {isWorking && (
          <button className="mini-button" type="button" onClick={() => void cancelDownload()}>
            <X size={14} aria-hidden />
            Cancel
          </button>
        )}
        {progress.state === 'failed' && (
          <button className="mini-button" type="button" onClick={retryFailedDownload}>
            <RefreshCw size={14} aria-hidden />
            {retryNeedsPatreonSignIn ? 'Sign In Again' : 'Retry Download'}
          </button>
        )}
      </div>
      {isWorking && <DownloadProgress event={progress} />}
    </div>
  )
}
