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
  return (
    <section className="session-dialog-backdrop" aria-label="Rename watchalong">
      <form
        className="session-dialog"
        onSubmit={(event) => {
          event.preventDefault()
          onConfirm()
        }}
      >
        <h1>Rename watchalong</h1>
        <p>Give this session a name that is easy to find in your local library.</p>
        <label>
          <span>Title</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => onTitleChange(event.currentTarget.value)}
          />
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

