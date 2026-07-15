import type { BrowserName } from '@shared/types'
import type { PatreonExtractionResult } from './cookieExtraction'

export type StartPatreonExtraction = (
  browser: BrowserName,
  signal: AbortSignal
) => Promise<PatreonExtractionResult>

/** Owns all browser-cookie extraction work so shutdown can drain it safely. */
export class PatreonExtractionLifecycle {
  private readonly active = new Map<AbortController, Promise<PatreonExtractionResult>>()
  private disposed = false

  constructor(private readonly startExtraction: StartPatreonExtraction) {}

  extract(browser: BrowserName): Promise<PatreonExtractionResult> {
    if (this.disposed) {
      return Promise.resolve({
        ok: false,
        message: 'WatchAlong is closing. Try connecting to Patreon after reopening it.'
      })
    }

    const controller = new AbortController()
    const operation = Promise.resolve()
      .then(() => this.startExtraction(browser, controller.signal))
      .finally(() => {
        this.active.delete(controller)
      })
    this.active.set(controller, operation)
    return operation
  }

  async dispose(): Promise<void> {
    if (!this.disposed) {
      this.disposed = true
      for (const controller of this.active.keys()) controller.abort()
    }

    await Promise.allSettled([...this.active.values()])
  }
}
