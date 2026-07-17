import { useId } from 'react'
import { keepFocusInDialog } from './sessionDialogFocus'

export type RenameSessionFocus = 'title' | 'reactor'

export function RenameSessionDialog({
  title,
  onTitleChange,
  onCancel,
  onConfirm
}: {
  title: string
  onTitleChange(value: string): void
  onCancel(): void
  onConfirm(): void
}): JSX.Element {
  const titleId = useId()
  const descriptionId = useId()

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
        <h1 id={titleId}>Rename watchalong</h1>
        <p id={descriptionId}>Give this movie-and-reaction pairing a title that feels natural in your library.</p>
        <label>
          <span>Title</span>
          <input
            aria-label="Title"
            autoFocus
            value={title}
            onChange={(event) => onTitleChange(event.currentTarget.value)}
          />
        </label>
        <div className="session-dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!title.trim()}>Save title</button>
        </div>
      </form>
    </section>
  )
}
