import { useId } from 'react'
import type { LibrarySession } from '@shared/types'
import { deriveReactorIdentity } from './libraryPresentation'
import { keepFocusInDialog } from './sessionDialogFocus'

export type RenameSessionFocus = 'title' | 'reactor'

export function RenameSessionDialog({
  title,
  onTitleChange,
  reactorName,
  onReactorNameChange,
  reactorOptions,
  initialFocus = 'title',
  onCancel,
  onConfirm
}: {
  title: string
  onTitleChange(value: string): void
  reactorName: string
  onReactorNameChange(value: string): void
  reactorOptions: string[]
  initialFocus?: RenameSessionFocus
  onCancel(): void
  onConfirm(): void
}): JSX.Element {
  const titleId = useId()
  const descriptionId = useId()
  const reactorHelpId = useId()
  const selectedReactor = reactorOptions.find(
    (option) => normalizedReactorName(option) === normalizedReactorName(reactorName)
  ) ?? ''
  const editingReactor = initialFocus === 'reactor'

  return (
    <section className="session-dialog-backdrop">
      <form
        className="session-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
            return
          }
          keepFocusInDialog(event)
        }}
        onSubmit={(event) => {
          event.preventDefault()
          onConfirm()
        }}
      >
        <h1 id={titleId}>{editingReactor ? 'Edit reactor' : 'Rename watchalong'}</h1>
        <p id={descriptionId}>
          {editingReactor
            ? 'Choose a creator already in your library, or type a new name.'
            : 'Give this watchalong a clear title and keep its creator easy to find.'}
        </p>
        <label>
          <span>Title</span>
          <input
            aria-label="Title"
            autoFocus={!editingReactor}
            value={title}
            onChange={(event) => onTitleChange(event.currentTarget.value)}
          />
        </label>
        {reactorOptions.length > 0 && (
          <label>
            <span>Choose from your library</span>
            <select
              aria-label="Choose from your library"
              autoFocus={editingReactor}
              value={selectedReactor}
              onChange={(event) => {
                if (event.currentTarget.value) onReactorNameChange(event.currentTarget.value)
              }}
            >
              <option value="">Type a new reactor below</option>
              {reactorOptions.map((option) => (
                <option key={normalizedReactorName(option)} value={option}>{option}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>Reactor (optional)</span>
          <input
            aria-label="Reactor (optional)"
            aria-describedby={reactorHelpId}
            autoFocus={editingReactor && reactorOptions.length === 0}
            value={reactorName}
            maxLength={120}
            placeholder="For example, Addie Counts"
            onChange={(event) => onReactorNameChange(event.currentTarget.value)}
          />
          <small id={reactorHelpId}>Choose a familiar creator above or enter a new one here.</small>
        </label>
        <div className="session-dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={!title.trim()}>
            Save
          </button>
        </div>
      </form>
    </section>
  )
}

export function existingReactorNames(sessions: LibrarySession[]): string[] {
  const names = new Map<string, string>()
  for (const session of sessions) {
    const reactor = deriveReactorIdentity(session)
    if (!reactor.known) continue
    const key = normalizedReactorName(reactor.label)
    if (key && !names.has(key)) names.set(key, reactor.label)
  }

  return [...names.values()].sort((left, right) => left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base'
  }))
}

function normalizedReactorName(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase()
}
