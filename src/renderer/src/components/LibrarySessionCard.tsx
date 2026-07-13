import { Film, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { LibrarySession } from '@shared/types'
import { ReactionSourceIcon, reactionSourceLabel } from './ReactionSource'
import { fileName, formatRelativeTime } from './appFormat'

export function LibrarySessionCard({
  session,
  compact,
  onOpen,
  onRename,
  onDelete
}: {
  session: LibrarySession
  compact?: boolean
  onOpen(): void
  onRename?(): void
  onDelete?(): void
}): JSX.Element {
  const [actionsOpen, setActionsOpen] = useState(false)
  const duration = session.reactionDurationSeconds ?? 0
  const progress = duration > 0 ? Math.min(100, Math.max(0, (session.lastReactionTimeSeconds / duration) * 100)) : 0
  const showActions = Boolean(onRename || onDelete)

  return (
    <article className={`library-card ${compact ? 'library-card-compact' : ''}`}>
      <button className="library-card-main" type="button" onClick={onOpen}>
        <span className="library-card-thumbnail" aria-hidden>
          <Film size={compact ? 24 : 38} />
        </span>
        <span className="library-card-copy">
          <strong>{session.title || fileName(session.moviePath ?? session.reactionPath ?? 'Untitled watchalong')}</strong>
          <small>
            <ReactionSourceIcon source={session.reactionSource} />
            {reactionSourceLabel(session.reactionSource)} / {formatRelativeTime(session.updatedAt)}
          </small>
        </span>
      </button>
      {showActions && (
        <div className="library-card-actions">
          <button
            className="icon-button library-card-menu-button"
            type="button"
            aria-label="More actions"
            title="More actions"
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
      <span className="library-card-progress" aria-hidden>
        <span style={{ width: `${progress}%` }} />
      </span>
    </article>
  )
}


