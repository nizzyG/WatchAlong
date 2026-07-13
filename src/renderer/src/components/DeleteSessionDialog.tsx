import { Trash2 } from 'lucide-react'

export function DeleteSessionDialog({
  sessionTitle,
  onCancel,
  onConfirm
}: {
  sessionTitle: string
  onCancel(): void
  onConfirm(): void
}): JSX.Element {
  return (
    <section className="session-dialog-backdrop" aria-label="Delete watchalong">
      <div className="session-dialog">
        <h1>Delete this watchalong?</h1>
        <p>
          {sessionTitle} will be removed from your WatchAlong library. Your movie and reaction files stay on this device.
        </p>
        <div className="session-dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
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


