import { ImagePlus, MoreHorizontal, Pencil, RotateCcw, Trash2, UserRoundPen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { LibrarySession } from '@shared/types'
import { ReactionSourceIcon, reactionSourceLabel } from './ReactionSource'
import { fileName, formatRelativeTime } from './appFormat'
import { deriveMovieIdentity } from './libraryPresentation'
import { libraryProgress } from './libraryPlayback'
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
  openLabelPrefix = 'Open',
  onRegisterMainButton,
  onMainButtonFocus,
  onOpen,
  onChoosePoster,
  onClearPoster,
  onRename,
  onEditReactor,
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
  openLabelPrefix?: 'Open' | 'View details for'
  onRegisterMainButton?(button: HTMLButtonElement | null): void
  onMainButtonFocus?(): void
  onOpen(): void
  onChoosePoster?(): void
  onClearPoster?(): void
  onRename?(returnFocusTarget: HTMLButtonElement | null): void
  onEditReactor?(returnFocusTarget: HTMLButtonElement | null): void
  onDelete?(returnFocusTarget: HTMLButtonElement | null): void
}): JSX.Element {
  const [actionsOpen, setActionsOpen] = useState(false)
  const [menuPlacement, setMenuPlacement] = useState<'up' | 'down'>('down')
  const actionsButtonRef = useRef<HTMLButtonElement>(null)
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  const progress = libraryProgress(session)
  const showActions = Boolean(onChoosePoster || onClearPoster || onRename || onEditReactor || onDelete)
  const actionCount = [onRename, onEditReactor, onChoosePoster, session.moviePosterPath && onClearPoster, onDelete].filter(Boolean).length
  const displayTitle = primaryLabel || session.title || fileName(session.moviePath ?? session.reactionPath ?? 'Untitled watchalong')
  const controlLabel = accessibleLabel || displayTitle
  const movieTitle = deriveMovieIdentity(session).label
  const roundedProgress = Math.round(progress.percent ?? 0)

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
    <article className={`library-card ${compact ? 'library-card-compact' : ''} ${progress.hasSavedPosition ? 'library-card-in-progress' : ''}`}>
      <button
        ref={onRegisterMainButton}
        className="library-card-main"
        type="button"
        aria-label={`${openLabelPrefix} ${controlLabel}`}
        onFocus={onMainButtonFocus}
        onClick={onOpen}
      >
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
          {progress.hasSavedPosition && (
            <span className="library-card-resume-label">
              Continue · {progress.percent === null ? formatSavedPosition(session.lastReactionTimeSeconds) : `${roundedProgress}%`}
            </span>
          )}
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
            onFocus={onMainButtonFocus}
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
              {onRename && (
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    closeActions()
                    onRename(actionsButtonRef.current)
                  }}
                >
                  <Pencil size={14} aria-hidden />
                  Rename pairing
                </button>
              )}
              {onEditReactor && (
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    closeActions()
                    onEditReactor(actionsButtonRef.current)
                  }}
                >
                  <UserRoundPen size={14} aria-hidden />
                  Change reactor…
                </button>
              )}
              {onChoosePoster && (
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
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
                  tabIndex={-1}
                  onClick={() => {
                    closeActions(true)
                    onClearPoster()
                  }}
                >
                  <RotateCcw size={14} aria-hidden />
                  Use automatic poster
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    closeActions()
                    onDelete(actionsButtonRef.current)
                  }}
                >
                  <Trash2 size={14} aria-hidden />
                  Delete pairing
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <span
        className="library-card-progress"
        aria-label={progress.percent !== null ? `${controlLabel}: ${roundedProgress}% watched` : undefined}
        aria-valuemin={progress.percent !== null ? 0 : undefined}
        aria-valuemax={progress.percent !== null ? 100 : undefined}
        aria-valuenow={progress.percent !== null ? roundedProgress : undefined}
        role={progress.percent !== null ? 'progressbar' : undefined}
      >
        <span style={{ width: `${progress.percent ?? 0}%` }} />
      </span>
    </article>
  )
}

function formatSavedPosition(seconds: number): string {
  const totalMinutes = Math.max(1, Math.floor(seconds / 60))
  return `${totalMinutes} min`
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


