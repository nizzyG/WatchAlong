export function RenameSessionDialog({
  title,
  onTitleChange,
  reactorName,
  onReactorNameChange,
  onCancel,
  onConfirm
}: {
  title: string
  onTitleChange(value: string): void
  reactorName: string
  onReactorNameChange(value: string): void
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
        <p>Give this watchalong a clear title and add the reactor so it appears on the right creator shelf.</p>
        <label>
          <span>Title</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => onTitleChange(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>Reactor (optional)</span>
          <input
            aria-label="Reactor (optional)"
            aria-describedby="rename-reactor-help"
            value={reactorName}
            maxLength={120}
            placeholder="For example, Addie Counts"
            onChange={(event) => onReactorNameChange(event.currentTarget.value)}
          />
          <small id="rename-reactor-help">Used to organize the By Reactor view.</small>
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

