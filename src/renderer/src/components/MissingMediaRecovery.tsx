import { AlertTriangle, FileVideo, Film, Trash2 } from 'lucide-react'
import type { LibrarySession, MediaRole } from '@shared/types'
import { fileName } from './appFormat'

export function MissingMediaRecovery({
  session,
  missingRoles,
  onBackToLibrary,
  onLocate,
  onRemoveSession
}: {
  session: LibrarySession
  missingRoles: MediaRole[]
  onBackToLibrary(): void
  onLocate(role: MediaRole): void
  onRemoveSession(): void
}): JSX.Element {
  return (
    <section className="missing-media-backdrop" aria-label="Missing media recovery">
      <div className="missing-media-card">
        <div className="missing-media-icon">
          <FileVideo size={34} aria-hidden />
        </div>
        <div className="missing-media-copy">
          <h1>A file for this session can&apos;t be found.</h1>
          <p>Point WatchAlong to the moved file and this session can continue from where you left off.</p>
        </div>
        <div className="missing-media-list">
          {missingRoles.map((role) => (
            <div key={role}>
              <AlertTriangle size={17} aria-hidden />
              <strong>{role === 'movie' ? 'Movie file' : 'Reaction file'}</strong>
              <span>{fileName((role === 'movie' ? session.moviePath : session.reactionPath) ?? 'Unknown')}</span>
            </div>
          ))}
        </div>
        <p className="media-format-hint">MP4 and WebM work best. MKV/AVI may not play in all cases.</p>
        <div className="missing-media-actions">
          {missingRoles.includes('movie') && (
            <button className="primary-button" type="button" onClick={() => onLocate('movie')}>
              <Film size={17} aria-hidden />
              Locate movie
            </button>
          )}
          {missingRoles.includes('reaction') && (
            <button className="primary-button" type="button" onClick={() => onLocate('reaction')}>
              <FileVideo size={17} aria-hidden />
              Locate reaction
            </button>
          )}
          <button className="secondary-button danger-button" type="button" onClick={onRemoveSession}>
            <Trash2 size={16} aria-hidden />
            Remove session
          </button>
        </div>
        <button className="link-button missing-media-library-link" type="button" onClick={onBackToLibrary}>
          Back to Library
        </button>
      </div>
    </section>
  )
}


