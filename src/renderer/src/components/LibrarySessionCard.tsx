import { ImagePlus, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
  accessibleLabel,
  secondaryLabel,
  artwork = 'movie',
  reactorLabel = 'Reactor not identified',
  showReactorBadge = false,
  onOpen,
  onChoosePoster,
  onClearPoster,
  onRename,
  onDelete
}: {
  session: LibrarySession
  compact?: boolean
  primaryLabel?: string
  accessibleLabel?: string
  secondaryLabel?: string
  artwork?: 'movie' | 'reactor'
  reactorLabel?: string
  showReactorBadge?: boolean
  onOpen(): void
  onChoosePoster?(): void
  onClearPoster?(): void
  onRename?(): void
  onDelete?(): void
}): JSX.Element {
  const [actionsOpen, setActionsOpen] = useState(false)
  const [menuPlacement, setMenuPlacement] = useState<'up' | 'down'>('down')
  const actionsButtonRef = useRef<HTMLButtonElement>(null)
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  const duration = session.reactionDurationSeconds ?? 0
  const progress = duration > 0 ? Math.min(100, Math.max(0, (session.lastReactionTimeSeconds / duration) * 100)) : 0
  const showActions = Boolean(onChoosePoster || onClearPoster || onRename || onDelete)
  const actionCount = [onChoosePoster, session.moviePosterPath && onClearPoster, onRename, onDelete].filter(Boolean).length
  const displayTitle = primaryLabel || session.title || fileName(session.moviePath ?? session.reactionPath ?? 'Untitled watchalong')
  const controlLabel = accessibleLabel || displayTitle
  const movieTitle = deriveMovieIdentity(session).label
  const roundedProgress = Math.round(progress)

  const closeActions = (restoreFocus = false): void => {
    setActionsOpen(false)
    if (restoreFocus) {
      window.requestAnimationFrame(() => actionsButtonRef.current?.focus())
    }
  }

  useEffect(() => {
    if (!actionsOpen) return
    actionsMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [actionsOpen])

  const toggleActions = (): void => {
    if (actionsOpen) {
      closeActions(true)
      return
    }

    setMenuPlacement(preferredMenuPlacement(actionsButtonRef.current, actionCount))
    setActionsOpen(true)
  }

  return (
    <article className={`library-card ${compact ? 'library-card-compact' : ''}`}>
      <button className="library-card-main" type="button" aria-label={`Open ${controlLabel}`} onClick={onOpen}>
        <span className="library-card-thumbnail" aria-hidden>
          {artwork === 'reactor'
            ? <ReactorAvatar session={session} label={reactorLabel} />
            : <MoviePoster session={session} title={movieTitle} />}
          {artwork === 'movie' && showReactorBadge && (
            <span className="library-card-reactor-badge">
              <ReactorAvatar session={session} label={reactorLabel} />
            </span>
          )}
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
            ref={actionsButtonRef}
            className="icon-button library-card-menu-button"
            type="button"
            aria-label={`More actions for ${controlLabel}`}
            title={`More actions for ${controlLabel}`}
            aria-expanded={actionsOpen}
            aria-haspopup="menu"
            onClick={toggleActions}
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
              ref={actionsMenuRef}
              className={`library-card-menu library-card-menu-${menuPlacement}`}
              role="menu"
              aria-label={`Actions for ${controlLabel}`}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  closeActions(true)
                  return
                }

                moveMenuFocus(event)
              }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setActionsOpen(false)
                }
              }}
            >
              {onChoosePoster && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeActions(true)
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
                  role="menuitem"
                  onClick={() => {
                    closeActions(true)
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
                  role="menuitem"
                  onClick={() => {
                    closeActions()
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
                  role="menuitem"
                  onClick={() => {
                    closeActions()
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
        aria-label={duration > 0 ? `${controlLabel}: ${roundedProgress}% watched` : undefined}
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

function preferredMenuPlacement(trigger: HTMLButtonElement | null, actionCount: number): 'up' | 'down' {
  if (!trigger) return 'down'

  const triggerRect = trigger.getBoundingClientRect()
  const scrollportRect = trigger.closest('.library-browser')?.getBoundingClientRect()
  const topBoundary = scrollportRect?.top ?? 0
  const bottomBoundary = scrollportRect?.bottom ?? window.innerHeight
  const estimatedMenuHeight = actionCount * 44 + 30
  const roomAbove = triggerRect.top - topBoundary
  const roomBelow = bottomBoundary - triggerRect.bottom

  if (roomBelow >= estimatedMenuHeight) return 'down'
  if (roomAbove >= estimatedMenuHeight) return 'up'
  return roomAbove > roomBelow ? 'up' : 'down'
}

function moveMenuFocus(event: React.KeyboardEvent<HTMLDivElement>): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

  const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
  if (items.length === 0) return

  event.preventDefault()
  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
  if (event.key === 'Home') {
    items[0].focus()
  } else if (event.key === 'End') {
    items.at(-1)?.focus()
  } else {
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = currentIndex < 0
      ? direction > 0 ? 0 : items.length - 1
      : (currentIndex + direction + items.length) % items.length
    items[nextIndex].focus()
  }
}


