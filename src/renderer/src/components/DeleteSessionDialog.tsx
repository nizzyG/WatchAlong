import { Trash2 } from 'lucide-react'
import { useId } from 'react'
import { keepFocusInDialog } from './sessionDialogFocus'

export function DeleteSessionDialog({
  sessionTitle,
  onCancel,
  onConfirm
}: {
  sessionTitle: string
  onCancel(): void
  onConfirm(): void
}): JSX.Element {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <section className="session-dialog-backdrop">
      <div
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
      >
        <h1 id={titleId}>Delete this watchalong?</h1>
        <p id={descriptionId}>
          {sessionTitle} will be removed from your WatchAlong library. Your movie and reaction files stay on this device.
        </p>
        <div className="session-dialog-actions">
          <button autoFocus className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="secondary-button danger-button" type="button" onClick={onConfirm}>
            <Trash2 size={16} aria-hidden />
            Delete
          </button>
        </div>
      </div>
    </section>
  )
}


