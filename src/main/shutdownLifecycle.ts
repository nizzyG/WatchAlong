export interface BeforeQuitEvent {
  preventDefault(): void
}

export interface ShutdownActions {
  disposeDownloads(): void | Promise<void>
  disposePatreon(): Promise<void>
  clearPatreonTemp(): void
  quit(): void
}

/** Serializes asynchronous credential cleanup before Electron may exit. */
export class ShutdownLifecycle {
  private shutdown: Promise<void> | null = null
  private allowFinalQuit = false

  constructor(private readonly actions: ShutdownActions) {}

  handleBeforeQuit(event: BeforeQuitEvent): Promise<void> | null {
    if (this.allowFinalQuit) return null

    event.preventDefault()
    if (!this.shutdown) this.shutdown = this.run()
    return this.shutdown
  }

  private async run(): Promise<void> {
    const disposals: Promise<unknown>[] = []
    try {
      // DownloadManager clears active patreon-dl configs synchronously while
      // terminating its children, before the final global temp sweep.
      disposals.push(Promise.resolve(this.actions.disposeDownloads()))
    } catch {
      // The remaining credential cleanup must still run.
    }

    try {
      // Start this immediately too: a Firefox export must be aborted while a
      // separate download child drains, not after it.
      disposals.push(this.actions.disposePatreon())
    } catch {
      // Sweep regardless; each lifecycle owns its own credential cleanup.
    }
    await Promise.allSettled(disposals)

    try {
      this.actions.clearPatreonTemp()
    } catch {
      // Temp cleanup is best effort and retried on the next launch.
    }

    this.allowFinalQuit = true
    this.actions.quit()
  }
}
