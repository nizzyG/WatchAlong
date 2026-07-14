import { ImagePlus, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { LibrarySession } from '@shared/types'
import { ReactionSourceIcon, reactionSourceLabel } from './ReactionSource'
import { fileName, formatRelativeTime } from './appFormat'
import { deriveMovieIdentity } from './libraryPresentation'
import { MoviePoster } from './MoviePoster'
import { ReactorAvatar } from './ReactorAvatar'

export function LibrarySessionCard({
  session,
  compact,
  primaryLabel,
  secondaryLabel,
  artwork = 'movie',
  reactorLabel = 'Reactor not identified',
  onOpen,
  onChoosePoster,
  onClearPoster,
  onRename,
  onDelete
}: {
  session: LibrarySession
  compact?: boolean
  primaryLabel?: string
  secondaryLabel?: string
  artwork?: 'movie' | 'reactor'
  reactorLabel?: string
  onOpen(): void
  onChoosePoster?(): void
  onClearPoster?(): void
  onRename?(): void
  onDelete?(): void
}): JSX.Element {
  const [actionsOpen, setActionsOpen] = useState(false)
  const duration = session.reactionDurationSeconds ?? 0
  const progress = duration > 0 ? Math.min(100, Math.max(0, (session.lastReactionTimeSeconds / duration) * 100)) : 0
  const showActions = Boolean(onChoosePoster || onClearPoster || onRename || onDelete)
  const displayTitle = primaryLabel || session.title || fileName(session.moviePath ?? session.reactionPath ?? 'Untitled watchalong')
  const movieTitle = deriveMovieIdentity(session).label
  const roundedProgress = Math.round(progress)

  return (
    <article className={`library-card ${compact ? 'library-card-compact' : ''}`}>
      <button className="library-card-main" type="button" aria-label={`Open ${displayTitle}`} onClick={onOpen}>
        <span className="library-card-thumbnail" aria-hidden>
          {artwork === 'reactor'
            ? <ReactorAvatar session={session} label={reactorLabel} />
            : <MoviePoster session={session} title={movieTitle} />}
        </span>
        <span className="library-card-copy">
          <strong>{displayTitle}</strong>
          {secondaryLabel && <span className="library-card-context">{secondaryLabel}</span>}
          <small>
            <ReactionSourceIcon source={session.reactionSource} />
            {reactionSourceLabel(session.reactionSource)} · {formatRelativeTime(session.updatedAt)}
          </small>
        </span>
      </button>
      {showActions && (
        <div className="library-card-actions">
          <button
            className="icon-button library-card-menu-button"
            type="button"
            aria-label={`More actions for ${displayTitle}`}
            title={`More actions for ${displayTitle}`}
            aria-expanded={actionsOpen}
            onClick={() => setActionsOpen((current) => !current)}
            onBlur={(event) => {
              if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) {
                setActionsOpen(false)
              }
            }}
          >
            <MoreHorizontal size={16} aria-hidden />
          </button>
          {actionsOpen && (
            <div
              className="library-card-menu"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setActionsOpen(false)
                }
              }}
            >
              {onChoosePoster && (
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false)
                    onChoosePoster()
                  }}
                >
                  <ImagePlus size={14} aria-hidden />
                  Choose poster…
                </button>
              )}
              {session.moviePosterPath && onClearPoster && (
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false)
                    onClearPoster()
                  }}
                >
                  <RotateCcw size={14} aria-hidden />
                  Use automatic poster
                </button>
              )}
              {onRename && (
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false)
                    onRename()
                  }}
                >
                  <Pencil size={14} aria-hidden />
                  Rename
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false)
                    onDelete()
                  }}
                >
                  <Trash2 size={14} aria-hidden />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <span
        className="library-card-progress"
        aria-label={duration > 0 ? `${roundedProgress}% watched` : undefined}
        aria-valuemin={duration > 0 ? 0 : undefined}
        aria-valuemax={duration > 0 ? 100 : undefined}
        aria-valuenow={duration > 0 ? roundedProgress : undefined}
        role={duration > 0 ? 'progressbar' : undefined}
      >
        <span style={{ width: `${progress}%` }} />
      </span>
    </article>
  )
}


